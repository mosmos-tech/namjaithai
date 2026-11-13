import type { CaseStatus } from "./case-status";
import { toCsv } from "./csv";
import { INCIDENT_REGISTRY, type IncidentType } from "./incidents";
import { openCaseStatusLabel } from "./rescue-cases";

// ── TF-38 export รายการเคสของแอดมินเป็น CSV ───────────────────────────────────
// แถวมาจาก RPC admin_case_export ซึ่งเลือกเฉพาะคอลัมน์ที่อนุญาตแล้ว (ไม่มีชื่อ เบอร์ พิกัด ที่อยู่
// ข้อความที่ผู้แจ้งพิมพ์ ข้อมูลสุขภาพ หรือ user id กู้ภัย) — ที่นี่แค่แปลงค่าเป็นภาษาไทยและทำไฟล์

/** ช่วงวันที่ยาวสุดที่ export ได้ (ตรงกับ admin_case_export ในฐานข้อมูล) */
export const CASE_EXPORT_MAX_DAYS = 366;

export type CaseExportRow = {
  case_code: string;
  created_at: string;
  incident_type: string;
  urgency: "RED" | "YELLOW" | "GREEN";
  status: CaseStatus;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  unit_name: string | null;
  closed_at: string | null;
  close_confirmation: string | null;
  reporter_locale: string;
};

const STATUS_LABEL: Record<CaseStatus, string> = {
  NEW: openCaseStatusLabel.NEW!,
  ACCEPTED: openCaseStatusLabel.ACCEPTED!,
  EN_ROUTE: openCaseStatusLabel.EN_ROUTE!,
  ON_SITE: openCaseStatusLabel.ON_SITE!,
  AWAITING_CONFIRMATION: openCaseStatusLabel.AWAITING_CONFIRMATION!,
  RESOLVED: "ช่วยเหลือสำเร็จ",
  CANCELLED: "ยกเลิก",
  DUPLICATE: "เคสซ้ำ",
  UNREACHABLE: "ติดต่อไม่ได้",
};

// สีตามหน้าสถิติ TF-33
const URGENCY_LABEL: Record<CaseExportRow["urgency"], string> = {
  RED: "แดง",
  YELLOW: "เหลือง",
  GREEN: "เขียว",
};

const CLOSE_CONFIRMATION_LABEL: Record<string, string> = {
  REPORTER_CONFIRMED: "ผู้แจ้งยืนยัน",
  LEAD_UNCONFIRMED: "หัวหน้าปิดโดยไม่ได้รับการยืนยัน",
};

// TF-63: ภาษาของฟอร์มที่ผู้แจ้งใช้
const REPORTER_LOCALE_LABEL: Record<string, string> = { th: "ไทย", en: "อังกฤษ" };

export const CASE_EXPORT_HEADER = [
  "รหัสเคส",
  "วันเวลาแจ้ง (เวลาไทย)",
  "ประเภทเหตุ",
  "ระดับความเร่งด่วน",
  "สถานะ",
  "จังหวัด",
  "อำเภอ",
  "ตำบล",
  "หน่วยที่รับ",
  "เวลาที่ปิด (เวลาไทย)",
  "วิธีปิด",
  "ภาษาผู้แจ้ง",
] as const;

/** "2026-11-13 14:30" เวลาไทย (ค.ศ. ให้ Excel เรียง/คำนวณได้) · ไม่มีค่า = ช่องว่าง */
export function exportDateTime(value: string | null): string {
  if (!value) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function caseExportCsv(rows: readonly CaseExportRow[]): string {
  return toCsv([
    [...CASE_EXPORT_HEADER],
    ...rows.map((row) => [
      row.case_code,
      exportDateTime(row.created_at),
      INCIDENT_REGISTRY[row.incident_type as IncidentType]?.label.th ?? row.incident_type,
      URGENCY_LABEL[row.urgency] ?? row.urgency,
      STATUS_LABEL[row.status] ?? row.status,
      row.province,
      row.district,
      row.subdistrict,
      row.unit_name,
      exportDateTime(row.closed_at),
      row.close_confirmation
        ? (CLOSE_CONFIRMATION_LABEL[row.close_confirmation] ?? row.close_confirmation)
        : "",
      REPORTER_LOCALE_LABEL[row.reporter_locale] ?? row.reporter_locale,
    ]),
  ]);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** รหัส error ที่ส่งกลับไปหน้าห้องสั่งการ (ส่งเป็นรหัส ไม่ส่งข้อความใน URL กันข้อความหลอก) */
export const CASE_EXPORT_ERRORS = {
  range: "กรุณาเลือกช่วงวันที่ (ตั้งแต่ และ ถึง) ให้ถูกต้องก่อนดาวน์โหลด",
  tooLong: `ดาวน์โหลดได้ครั้งละไม่เกิน ${CASE_EXPORT_MAX_DAYS} วัน`,
  incident: "ไม่มีประเภทเหตุนี้",
} as const;
export type CaseExportErrorCode = keyof typeof CASE_EXPORT_ERRORS;

export function caseExportErrorMessage(code: string): string | null {
  return code in CASE_EXPORT_ERRORS ? CASE_EXPORT_ERRORS[code as CaseExportErrorCode] : null;
}

/**
 * ตัวกรองของ export (ชุดเดียวกับฟอร์มสถิติ) — ต้องมีช่วงวันที่ ไม่เกิน CASE_EXPORT_MAX_DAYS วัน
 * ฐานข้อมูลตรวจซ้ำอีกชั้น
 */
export function parseCaseExportFilters(
  params: URLSearchParams,
):
  | { ok: true; from: string; to: string; province: string; incidentType: string }
  | { ok: false; code: CaseExportErrorCode } {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const province = (params.get("province") ?? "").trim();
  const incidentType = (params.get("incident") ?? "").trim();
  const valid = (s: string) => {
    if (!DATE.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  };
  if (!valid(from) || !valid(to) || from > to) {
    return { ok: false, code: "range" };
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > CASE_EXPORT_MAX_DAYS) {
    return { ok: false, code: "tooLong" };
  }
  if (incidentType && !(incidentType in INCIDENT_REGISTRY)) {
    return { ok: false, code: "incident" };
  }
  return { ok: true, from, to, province, incidentType };
}
