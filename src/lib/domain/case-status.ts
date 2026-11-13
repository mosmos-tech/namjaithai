import { z } from "zod";
import "./zod-locale";

export const CaseStatus = {
  NEW: "NEW",
  ACCEPTED: "ACCEPTED",
  EN_ROUTE: "EN_ROUTE",
  ON_SITE: "ON_SITE",
  // TF-26: กู้ภัยกด "ช่วยเสร็จแล้ว" รอผู้แจ้งยืนยันก่อนปิดเคส (ยืนยัน/timeout เป็นงาน TF-58)
  AWAITING_CONFIRMATION: "AWAITING_CONFIRMATION",
  RESOLVED: "RESOLVED",
  CANCELLED: "CANCELLED",
  DUPLICATE: "DUPLICATE",
  UNREACHABLE: "UNREACHABLE",
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

// สถานะปลายทาง (ปิดแล้ว เปลี่ยนต่อไม่ได้)
const TERMINAL: ReadonlySet<CaseStatus> = new Set([
  CaseStatus.RESOLVED,
  CaseStatus.CANCELLED,
  CaseStatus.DUPLICATE,
  CaseStatus.UNREACHABLE,
]);

export function isClosedCaseStatus(status: CaseStatus): boolean {
  return TERMINAL.has(status);
}

// เดินหน้าทีละขั้นเท่านั้น (ใครเปลี่ยนได้ตรวจใน RPC ไม่ใช่ที่นี่)
const NEXT_STEP: Partial<Record<CaseStatus, CaseStatus>> = {
  NEW: CaseStatus.ACCEPTED,
  ACCEPTED: CaseStatus.EN_ROUTE,
  EN_ROUTE: CaseStatus.ON_SITE,
  ON_SITE: CaseStatus.AWAITING_CONFIRMATION,
};

/**
 * ช่องทางที่เปลี่ยนสถานะ — ตรงกับตัวตั้งค่าเฉพาะ transaction ใน trigger guard_case_status_transition
 * - normal: เดินหน้าทีละขั้น (accept_case, advance_case_status)
 * - release: release_case ของ TF-25 (app.case_release) ถอยกลับ NEW ได้
 * - reporterCancel: ผู้แจ้งกดปลอดภัยแล้ว TF-14 (app.case_cancel_by_reporter) ปิดเป็น CANCELLED ได้
 * - leadClose: หัวหน้า/แอดมิน/ระบบปิดเคส (app.case_close_by_lead) — TODO(TF-31/TF-58) ยังไม่มีหน้าจอเรียก
 * - transfer: ส่งต่อเคส TF-59 (app.case_transfer) — หน่วยใหม่กดรับ → ACCEPTED, หมดเวลา → NEW
 */
export type CaseTransitionMode =
  "normal" | "release" | "reporterCancel" | "leadClose" | "reporterReopen" | "transfer";

const TEAM_HOLDING: ReadonlySet<CaseStatus> = new Set([
  CaseStatus.ACCEPTED,
  CaseStatus.EN_ROUTE,
  CaseStatus.ON_SITE,
]);

/**
 * ตรวจว่าเปลี่ยนสถานะจาก `from` → `to` ได้หรือไม่ (กติกาเดียวกับ case_status_transition_allowed ในฐานข้อมูล)
 * - ห้ามข้ามขั้นและห้ามถอยหลัง ยกเว้นปล่อยเคส (ACCEPTED/EN_ROUTE → NEW)
 * - กู้ภัยปิดเคสเองไม่ได้: ไป AWAITING_CONFIRMATION แล้วรอผู้แจ้งยืนยัน (TF-58)
 * - ปิดเคสได้เฉพาะผู้แจ้งยกเลิก (CANCELLED) หรือหัวหน้า/แอดมิน/ระบบ
 * - terminal → ไม่สามารถเปลี่ยนได้อีก
 */
export function canTransition(
  from: CaseStatus,
  to: CaseStatus,
  mode: CaseTransitionMode = "normal",
): boolean {
  if (from === to || TERMINAL.has(from)) return false;
  if (mode === "transfer") {
    return TEAM_HOLDING.has(from) && (to === CaseStatus.NEW || to === CaseStatus.ACCEPTED);
  }
  switch (to) {
    case CaseStatus.NEW:
      return (
        (mode === "reporterReopen" && from === CaseStatus.AWAITING_CONFIRMATION) ||
        (mode === "release" && (from === CaseStatus.ACCEPTED || from === CaseStatus.EN_ROUTE))
      );
    case CaseStatus.CANCELLED:
      return mode === "reporterCancel" || mode === "leadClose";
    case CaseStatus.DUPLICATE:
    case CaseStatus.UNREACHABLE:
      return mode === "leadClose";
    case CaseStatus.RESOLVED:
      // TODO(TF-58): ผู้แจ้งยืนยัน / ครบ 24 ชม. / คิวหัวหน้า
      return mode === "leadClose" && from === CaseStatus.AWAITING_CONFIRMATION;
    default:
      return NEXT_STEP[from] === to;
  }
}

// ── TF-26 อัปเดตสถานะของกู้ภัย (กติกาตรงกับ advance_case_status ในฐานข้อมูล) ──

/** สถานะที่กู้ภัยกดไปต่อได้ และข้อความบนปุ่มใหญ่ปุ่มเดียว */
export const RESCUER_NEXT_STATUS: Partial<Record<CaseStatus, { to: CaseStatus; label: string }>> = {
  ACCEPTED: { to: CaseStatus.EN_ROUTE, label: "เริ่มเดินทาง" },
  EN_ROUTE: { to: CaseStatus.ON_SITE, label: "ถึงที่เกิดเหตุ" },
  ON_SITE: { to: CaseStatus.AWAITING_CONFIRMATION, label: "ช่วยเสร็จแล้ว" },
};

/** เคสที่กู้ภัยยังถืออยู่ (แสดงในงานของฉัน) */
export const MY_TASK_STATUSES: readonly CaseStatus[] = [
  CaseStatus.ACCEPTED,
  CaseStatus.EN_ROUTE,
  CaseStatus.ON_SITE,
  CaseStatus.AWAITING_CONFIRMATION,
];

export const CaseOutcome = {
  HELPED: "HELPED",
  HOSPITAL: "HOSPITAL",
  OTHER: "OTHER",
} as const;
export type CaseOutcome = (typeof CaseOutcome)[keyof typeof CaseOutcome];

export const caseOutcomeLabel: Record<CaseOutcome, string> = {
  HELPED: "ช่วยได้",
  HOSPITAL: "พาไปโรงพยาบาล",
  OTHER: "อื่นๆ",
};

export const CASE_NOTE_MAX = 500;
export const PEOPLE_HELPED_MAX = 999;

const noteSchema = z
  .string()
  .trim()
  .max(CASE_NOTE_MAX, `โน้ตต้องไม่เกิน ${CASE_NOTE_MAX} ตัวอักษร`);

/** ข้อมูลตอนกด "ช่วยเสร็จแล้ว" — ฐานข้อมูลตรวจกติกาเดียวกันอีกชั้น */
export const caseCompletionSchema = z
  .object({
    outcome: z.enum(CaseOutcome, { error: "กรุณาเลือกผลการช่วยเหลือ" }),
    peopleHelped: z
      .number({ error: "กรุณาระบุจำนวนคนที่ช่วยได้" })
      .int("จำนวนคนต้องเป็นจำนวนเต็ม")
      .min(0, "จำนวนคนต้องไม่ติดลบ")
      .max(PEOPLE_HELPED_MAX, `จำนวนคนต้องไม่เกิน ${PEOPLE_HELPED_MAX}`),
    note: noteSchema.default(""),
  })
  .refine((value) => value.outcome !== CaseOutcome.OTHER || value.note.length > 0, {
    message: "เลือก อื่นๆ แล้วกรุณาเขียนโน้ตว่าเกิดอะไรขึ้น",
    path: ["note"],
  });

export const caseNoteSchema = noteSchema.min(1, "กรุณาพิมพ์โน้ต");

export type AdvanceCaseResult =
  { status: "UPDATED"; version: number; to: CaseStatus } | { status: "STALE"; version: number };

export function advanceCaseMessage(result: AdvanceCaseResult): string {
  return result.status === "UPDATED"
    ? result.to === CaseStatus.AWAITING_CONFIRMATION
      ? "บันทึกแล้ว รอผู้แจ้งยืนยันปิดเคส"
      : "อัปเดตสถานะแล้ว"
    : "ข้อมูลเคสเพิ่งเปลี่ยน กรุณาดูสถานะล่าสุดแล้วลองอีกครั้ง";
}
