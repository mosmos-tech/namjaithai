import { z } from "zod";
import "./zod-locale";

// ── รับเคสและปล่อยเคส (TF-25) — กติกาตรงกับ accept_case() / release_case() ในฐานข้อมูล ──

/** กู้ภัยถือเคสที่ยังไม่ปิดพร้อมกันได้ไม่เกินนี้ */
export const RESCUER_MAX_ACTIVE_CASES = 2;

export const CASE_RELEASE_REASON_MIN = 3;
export const CASE_RELEASE_REASON_MAX = 300;

/** เหตุผลตอนปล่อยเคส — ใช้ทั้งฟอร์มและ server action (ฐานข้อมูลเช็กความยาวเดียวกันอีกชั้น) */
export const caseReleaseReasonSchema = z
  .string({ error: "กรุณาระบุเหตุผลที่ปล่อยเคส" })
  .trim()
  .min(CASE_RELEASE_REASON_MIN, `กรุณาระบุเหตุผลอย่างน้อย ${CASE_RELEASE_REASON_MIN} ตัวอักษร`)
  .max(CASE_RELEASE_REASON_MAX, `เหตุผลต้องไม่เกิน ${CASE_RELEASE_REASON_MAX} ตัวอักษร`);

export type AcceptCaseResult =
  | { status: "ACCEPTED"; version: number }
  | { status: "TAKEN"; unitName: string | null }
  | { status: "LIMIT"; max: number }
  | { status: "STALE"; version: number };

export type ReleaseCaseResult =
  { status: "RELEASED"; version: number } | { status: "STALE"; version: number };

/** ข้อความที่กู้ภัยเห็นหลังกดรับ (คนกดช้าเห็นแค่ชื่อหน่วย ไม่มีชื่อคน) */
export function acceptCaseMessage(result: AcceptCaseResult): string {
  switch (result.status) {
    case "ACCEPTED":
      return "รับเคสแล้ว";
    case "TAKEN":
      return result.unitName ? `หน่วย ${result.unitName} รับเคสนี้ไปแล้ว` : "เคสนี้มีทีมรับไปแล้ว";
    case "LIMIT":
      return `คุณถือเคสอยู่ ${result.max} เคสแล้ว ปิดหรือปล่อยเคสเดิมก่อน`;
    case "STALE":
      return "ข้อมูลเคสเพิ่งเปลี่ยน กรุณาดูรายละเอียดอีกครั้งแล้วกดรับใหม่";
  }
}
