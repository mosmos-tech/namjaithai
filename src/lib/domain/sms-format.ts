import type { WaterLevel } from "./enums";
import { IncidentType } from "./incidents/types";

// ── ตัวสร้างข้อความ SMS SOS (TF-36) ─────────────────────────────────────────
// แยกจาก sms-sos.ts (ตัวอ่าน) เพราะปุ่มบนหน้าออฟไลน์ใช้ไฟล์นี้ — ไม่ดึง zod เข้า bundle ของหน้าแรก
// รูปแบบดูที่ sms-sos.ts

/**
 * ประเภทเหตุที่แจ้งทาง SMS ได้ — เหตุอื่นมีคำถามบังคับที่ SMS ถามไม่ได้ (เช่น ไฟไหม้ที่ไหน)
 * TODO(TF-54): เพิ่มประเภทอื่นเมื่อเปิดใช้และตกลงค่าเริ่มต้นของคำถามบังคับแล้ว
 */
export const SMS_SUPPORTED_INCIDENTS: readonly IncidentType[] = [IncidentType.FLOOD];

export const SMS_EXAMPLE = "SOS FLOOD 13.75,100.50 P5 B1 C0 E2";

export const SMS_MAX_COUNT = 99;

/** สร้างข้อความ SMS จากร่างฟอร์ม — ใส่เฉพาะจำนวนที่มากกว่า 0 (P ใส่เสมอ) */
export function formatSmsSos(input: {
  incidentType?: IncidentType;
  waterLevel?: WaterLevel;
  lat: number;
  lng: number;
  adults?: number;
  elderly?: number;
  bedridden?: number;
  children?: number;
}): string {
  const elderly = input.elderly ?? 0;
  const bedridden = input.bedridden ?? 0;
  const children = input.children ?? 0;
  const total = (input.adults ?? 0) + elderly + bedridden + children;
  return [
    "SOS",
    input.incidentType ?? IncidentType.FLOOD,
    input.waterLevel,
    `${input.lat.toFixed(5)},${input.lng.toFixed(5)}`,
    `P${Math.min(Math.max(total, 1), SMS_MAX_COUNT)}`,
    bedridden > 0 ? `B${Math.min(bedridden, SMS_MAX_COUNT)}` : undefined,
    children > 0 ? `C${Math.min(children, SMS_MAX_COUNT)}` : undefined,
    elderly > 0 ? `E${Math.min(elderly, SMS_MAX_COUNT)}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

/** ลิงก์เปิดแอปข้อความพร้อมเบอร์และข้อความ (ใช้ได้ทั้ง Android และ iOS 8 ขึ้นไป) */
export function smsHref(number: string, body: string): string {
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}

export interface SmsSosLinkInput {
  lat?: number;
  lng?: number;
  phone?: string;
  landmark?: string;
  incidentType?: IncidentType;
  waterLevel?: WaterLevel;
  adults?: number;
  elderly?: number;
  bedridden?: number;
  children?: number;
}

/**
 * สร้างลิงก์ปุ่ม "ส่งทาง SMS" — มี gateway และเป็นประเภทเหตุที่รองรับจะสร้างรูปแบบที่ระบบอ่านได้อัตโนมัติ
 * มิฉะนั้นสร้างข้อความฉุกเฉินทั่วไปพร้อมพิกัดให้ผู้แจ้งส่งต่อให้ญาติหรือผู้ช่วยเหลือ
 */
export function buildSosSmsLink(
  input: SmsSosLinkInput,
  gatewayNumber: string = "",
): { href: string; toSystem: boolean } {
  const gateway = gatewayNumber.trim();
  const located = typeof input.lat === "number" && typeof input.lng === "number";
  if (
    gateway &&
    located &&
    SMS_SUPPORTED_INCIDENTS.includes(input.incidentType ?? IncidentType.FLOOD)
  ) {
    return {
      href: smsHref(gateway, formatSmsSos({ ...input, lat: input.lat!, lng: input.lng! })),
      toSystem: true,
    };
  }
  const text = located
    ? `ขอความช่วยเหลือฉุกเฉิน พิกัด ${input.lat},${input.lng} จุดสังเกต ${input.landmark ?? ""} โทรกลับ ${input.phone ?? ""}`
    : "ขอความช่วยเหลือฉุกเฉิน กรุณาติดต่อกลับ";
  return { href: `sms:?body=${encodeURIComponent(text)}`, toSystem: false };
}

/** แปลง JSON body ที่คิวเก็บไว้เป็นลิงก์ SMS (กัน JSON พังแล้วสลับเป็นข้อความทั่วไป) */
export function buildSosSmsLinkFromJson(
  rawBody: string | undefined,
  gatewayNumber: string = "",
): { href: string; toSystem: boolean } {
  let body: SmsSosLinkInput = {};
  try {
    body = JSON.parse(rawBody ?? "{}") as SmsSosLinkInput;
  } catch {
    /* Use the generic message. */
  }
  return buildSosSmsLink(body, gatewayNumber);
}
