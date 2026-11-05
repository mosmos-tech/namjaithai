import { z } from "zod";
import { formatThaiDate } from "./thai-date";
import type { UserRole } from "./roles";

// สถานะสมาชิกในหน่วยกู้ภัย (ตรงกับ enum public.unit_member_status ในฐานข้อมูล)
export const UnitMemberStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;
export type UnitMemberStatus = (typeof UnitMemberStatus)[keyof typeof UnitMemberStatus];

export const unitMemberStatusLabel: Record<UnitMemberStatus, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  SUSPENDED: "ระงับสิทธิ์",
};

// การตัดสินใจของหัวหน้าหน่วย/แอดมินในคิวอนุมัติและจัดการสมาชิก (TF-20)
export const MemberReviewDecision = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;
export type MemberReviewDecision =
  (typeof MemberReviewDecision)[keyof typeof MemberReviewDecision];

export const memberReviewActionAuditCode: Record<MemberReviewDecision, string> = {
  APPROVED: "MEMBER_APPROVED",
  REJECTED: "MEMBER_REJECTED",
  SUSPENDED: "MEMBER_SUSPENDED",
};

// สิทธิ์กู้ภัยที่ได้รับอนุมัติมีอายุ 90 วันตามเกณฑ์ผ่าน TF-20
export const MEMBER_APPROVAL_TTL_DAYS = 90;
export const MEMBER_APPROVAL_TTL_MS = MEMBER_APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000;

export function computeMemberExpiresAt(approvedAt: Date = new Date()): Date {
  return new Date(approvedAt.getTime() + MEMBER_APPROVAL_TTL_MS);
}

/**
 * ตรวจว่าสมาชิกภาพของกู้ภัยในหน่วยยังใช้งานได้อยู่หรือไม่
 * - ต้องได้รับอนุมัติ (APPROVED)
 * - หน่วยต้องเปิดใช้งานอยู่ (unitIsActive !== false)
 * - ต้องยังไม่หมดอายุ 90 วัน (expiresAt > now)
 */
export function isMembershipActive(
  member: {
    status: UnitMemberStatus | string;
    expiresAt?: string | Date | null;
    unitIsActive?: boolean;
  },
  nowMs: number = Date.now(),
): boolean {
  if (member.status !== UnitMemberStatus.APPROVED) return false;
  if (member.unitIsActive === false) return false;
  if (member.expiresAt == null) return true;
  const expiresMs =
    member.expiresAt instanceof Date
      ? member.expiresAt.getTime()
      : Date.parse(member.expiresAt);
  return Number.isFinite(expiresMs) && expiresMs > nowMs;
}

/**
 * คำนวณบทบาทที่ใช้งานได้จริงของบัญชี:
 * - กู้ภัย (RESCUER) ต้องมีสมาชิกภาพที่ APPROVED และยังไม่หมดอายุอย่างน้อย 1 หน่วย จึงจะเข้า /rescue ได้
 * - หากยังรออนุมัติ (PENDING) ถูกปฏิเสธ (REJECTED) ถูกระงับ (SUSPENDED) หรือครบ 90 วันแล้ว
 *   จะถือเป็นผู้ใช้ทั่วไป (USER) ทันที
 */
export function effectiveUserRole(
  role: UserRole,
  hasActiveRescuerMembership: boolean,
): UserRole {
  if (role === "RESCUER" && !hasActiveRescuerMembership) {
    return "USER";
  }
  return role;
}

export const memberReviewSchema = z.object({
  unitId: z.string().uuid("รหัสหน่วยไม่ถูกต้อง"),
  memberIds: z
    .array(z.string().uuid("รหัสสมาชิกไม่ถูกต้อง"))
    .min(1, "กรุณาเลือกสมาชิกอย่างน้อย 1 คน")
    .max(100, "เลือกสมาชิกได้ไม่เกินครั้งละ 100 คน")
    .transform((ids) => [...new Set(ids)]),
  decision: z.enum([
    MemberReviewDecision.APPROVED,
    MemberReviewDecision.REJECTED,
    MemberReviewDecision.SUSPENDED,
  ]),
});

export type MemberReviewInput = z.infer<typeof memberReviewSchema>;

export function formatMemberLineNotification(input: {
  unitName: string;
  decision: MemberReviewDecision;
  expiresAt?: string | Date | null;
  origin: string;
}): string {
  const header = `น้ำใจไทย SOS · ${input.unitName}`;
  if (input.decision === MemberReviewDecision.APPROVED) {
    const expiryNote = input.expiresAt
      ? ` (สิทธิ์ใช้งาน 90 วัน ถึง ${formatThaiDate(input.expiresAt)})`
      : " (สิทธิ์ใช้งาน 90 วัน)";
    return [
      header,
      `คำขอเข้าร่วมทีมกู้ภัยได้รับการอนุมัติแล้ว${expiryNote}`,
      new URL("/rescue", input.origin).href,
    ].join("\n");
  }
  if (input.decision === MemberReviewDecision.REJECTED) {
    return [
      header,
      "คำขอเข้าร่วมทีมกู้ภัยไม่ได้รับการอนุมัติ จึงไม่สามารถเข้าหน้าปฏิบัติการกู้ภัยได้",
    ].join("\n");
  }
  return [
    header,
    "สิทธิ์สมาชิกทีมกู้ภัยของคุณถูกระงับแล้ว จึงไม่สามารถเข้าหน้าปฏิบัติการกู้ภัยได้",
  ].join("\n");
}
