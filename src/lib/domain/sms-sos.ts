import { WaterLevel } from "./enums";
import { latSchema, lngSchema } from "./geo";
import { IncidentType } from "./incidents";
import { THAI_PHONE_REGEX } from "./sos-schema";
import { trackPath } from "./tracking";
import { SMS_EXAMPLE, SMS_MAX_COUNT, SMS_SUPPORTED_INCIDENTS } from "./sms-format";

export * from "./sms-format";

// ── SOS ผ่าน SMS (TF-36) ────────────────────────────────────────────────────
// รูปแบบ: SOS <ประเภทเหตุ> [ระดับน้ำ] <lat>,<lng> [P5] [B1] [C0] [E2]
//   P = คนทั้งหมด · B = ผู้ป่วยติดเตียง · C = เด็กเล็ก · E = ผู้สูงอายุ (ไม่ใส่ = 0)
// ไม่มีสีความเร่งด่วนในข้อความ — เซิร์ฟเวอร์คำนวณเองด้วย computeTriage() เหมือนฟอร์มเว็บ
// ตัวอ่าน (webhook) อยู่ไฟล์นี้ ตัวสร้าง (ปุ่มบนเว็บ) อยู่ sms-format.ts — test ตรวจว่าสร้างแล้วอ่านกลับได้ตรงกัน

/** ฉบับความยินยอมของช่องทาง SMS — แยกจากฟอร์มเว็บ เพราะคนพิมพ์ SMS เองไม่เคยเห็นหน้ายินยอม */
export const SMS_CONSENT_VERSION = "SMS-2026-11-08";

export type SmsSosData = {
  incidentType: IncidentType;
  waterLevel?: WaterLevel;
  lat: number;
  lng: number;
  adults: number;
  elderly: number;
  bedridden: number;
  children: number;
};

export type SmsParseError =
  "NOT_SOS" | "BAD_FORMAT" | "NO_LOCATION" | "OUT_OF_AREA" | "UNSUPPORTED_INCIDENT";

export type SmsParseResult = { ok: true; data: SmsSosData } | { ok: false; reason: SmsParseError };

const COUNT_KEYS = { P: "total", B: "bedridden", C: "children", E: "elderly" } as const;
type CountKey = (typeof COUNT_KEYS)[keyof typeof COUNT_KEYS];

const incidentCodes = Object.values(IncidentType) as string[];
const waterLevelCodes = Object.values(WaterLevel) as string[];

/**
 * อ่านข้อความ SMS — ยอมตัวพิมพ์เล็ก/ใหญ่ ช่องว่างหลายช่อง และช่องว่างหลังจุลภาค (คนพิมพ์เอง)
 * ส่วนอื่นนอกจาก SOS และพิกัดจะเรียงลำดับไหนก็ได้ แต่ห้ามซ้ำและห้ามมีคำที่ไม่รู้จัก
 */
export function parseSmsSos(text: string): SmsParseResult {
  const tokens = text
    .trim()
    .toUpperCase()
    .replace(/\s*,\s*/g, ",")
    .split(/\s+/);
  if (tokens[0] !== "SOS") return { ok: false, reason: "NOT_SOS" };

  let incidentType: IncidentType | undefined;
  let waterLevel: WaterLevel | undefined;
  let coords: { lat: number; lng: number } | undefined;
  const counts: Partial<Record<CountKey, number>> = {};

  for (const token of tokens.slice(1)) {
    const coord = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(token);
    const count = /^([PBCE])(\d{1,2})$/.exec(token);
    if (coord && !coords) {
      coords = { lat: Number(coord[1]), lng: Number(coord[2]) };
    } else if (count) {
      const key = COUNT_KEYS[count[1] as keyof typeof COUNT_KEYS];
      if (counts[key] !== undefined) return { ok: false, reason: "BAD_FORMAT" };
      counts[key] = Math.min(Number(count[2]), SMS_MAX_COUNT);
    } else if (incidentCodes.includes(token) && !incidentType) {
      incidentType = token as IncidentType;
    } else if (waterLevelCodes.includes(token) && !waterLevel) {
      waterLevel = token as WaterLevel;
    } else {
      return { ok: false, reason: "BAD_FORMAT" };
    }
  }

  if (!coords) return { ok: false, reason: "NO_LOCATION" };
  if (!latSchema.safeParse(coords.lat).success || !lngSchema.safeParse(coords.lng).success) {
    return { ok: false, reason: "OUT_OF_AREA" };
  }

  // ไม่ใส่ประเภทเหตุ = น้ำท่วม (เหมือนฟอร์มเว็บรุ่นแรก)
  const type = incidentType ?? IncidentType.FLOOD;
  if (!SMS_SUPPORTED_INCIDENTS.includes(type)) return { ok: false, reason: "UNSUPPORTED_INCIDENT" };
  // ระดับน้ำใช้ได้กับน้ำท่วมเท่านั้น
  if (waterLevel && type !== IncidentType.FLOOD) return { ok: false, reason: "BAD_FORMAT" };

  const bedridden = counts.bedridden ?? 0;
  const children = counts.children ?? 0;
  const elderly = counts.elderly ?? 0;
  let adults = Math.max((counts.total ?? 0) - bedridden - children - elderly, 0);
  // คนที่ส่ง SMS มาเองนับเป็น 1 คนเสมอ — ไม่ปฏิเสธคำขอความช่วยเหลือเพราะลืมใส่จำนวนคน
  if (adults + bedridden + children + elderly === 0) adults = 1;

  return {
    ok: true,
    data: {
      incidentType: type,
      ...(waterLevel ? { waterLevel } : {}),
      lat: coords.lat,
      lng: coords.lng,
      adults,
      elderly,
      bedridden,
      children,
    },
  };
}

/** เบอร์ผู้ส่งจากผู้ให้บริการ (+66 / 66 / 0) → 0812345678 · ไม่ใช่เบอร์ไทย = null */
export function normalizeThaiPhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+66")) digits = `0${digits.slice(3)}`;
  else if (/^66\d{8,9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return THAI_PHONE_REGEX.test(digits) ? digits : null;
}

// ── ข้อความตอบกลับ ─────────────────────────────────────────────────────────
// SMS ไปอยู่ในเครื่องของคนอื่นได้ (ยืมโทรศัพท์ส่ง) จึงใส่แค่รหัสเคสและลิงก์ ไม่มีชื่อ/พิกัด

const HEADER = "น้ำใจไทย SOS:";
const HOTLINES = "โทร 1669 / 1784";

export type SmsReplyKind =
  "CREATED" | "REPEAT" | "HELP" | "UNSUPPORTED_INCIDENT" | "RATE_LIMITED" | "ERROR";

export function formatSmsReply(
  kind: SmsReplyKind,
  input: { origin: string; caseCode?: string; trackingToken?: string },
): string {
  const url = (path: string) => new URL(path, input.origin).href;
  switch (kind) {
    case "CREATED":
      return [
        `${HEADER} รับเรื่องแล้ว รหัสเคส ${input.caseCode}`,
        `ติดตาม ${url(trackPath(input.caseCode!, input.trackingToken!))}`,
        `ข้อมูลของคุณใช้เพื่อช่วยเหลือเท่านั้น อ่าน ${url("/privacy")}`,
      ].join("\n");
    case "REPEAT":
      return [
        `${HEADER} เบอร์นี้มีเคส ${input.caseCode} เปิดอยู่แล้ว ไม่ต้องส่งซ้ำ`,
        `ติดตามที่ ${url("/track")} (รหัสเคส + เบอร์ 4 ตัวท้าย)`,
        `ถ้าอาการแย่ลง ${HOTLINES}`,
      ].join("\n");
    case "HELP":
      return [
        `${HEADER} อ่านข้อความไม่ได้ ส่งแบบนี้`,
        SMS_EXAMPLE,
        "พิกัด lat,lng · P=คนทั้งหมด B=ติดเตียง C=เด็กเล็ก E=ผู้สูงอายุ",
        `ด่วน ${HOTLINES}`,
      ].join("\n");
    case "UNSUPPORTED_INCIDENT":
      return `${HEADER} ตอนนี้แจ้งทาง SMS ได้เฉพาะน้ำท่วม (SOS FLOOD ...) เหตุอื่นโทร 1669 / 191 / 199`;
    case "RATE_LIMITED":
      return `${HEADER} เบอร์นี้ส่งคำขอบ่อยเกินไป กรุณารอสักครู่ หรือ${HOTLINES}`;
    case "ERROR":
      return `${HEADER} ระบบรับเรื่องไม่ได้ชั่วคราว กรุณา${HOTLINES}`;
  }
}
