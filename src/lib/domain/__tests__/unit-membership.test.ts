import { describe, expect, it } from "vitest";
import {
  computeMemberExpiresAt,
  effectiveUserRole,
  formatMemberLineNotification,
  isMembershipActive,
  MEMBER_APPROVAL_TTL_DAYS,
  memberReviewSchema,
} from "../unit-membership";

describe("TF-20 unit-membership domain rules", () => {
  it("กำหนดอายุสิทธิ์ 90 วันนับจากเวลาที่อนุมัติ", () => {
    const start = new Date("2026-11-05T00:00:00.000Z");
    const expires = computeMemberExpiresAt(start);
    const diffDays = (expires.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(MEMBER_APPROVAL_TTL_DAYS);
    expect(diffDays).toBe(90);
  });

  it("ตรวจสถานะสมาชิกที่ยังใช้งานได้และหมดอายุครบ 90 วัน", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    expect(
      isMembershipActive(
        { status: "APPROVED", expiresAt: "2027-02-03T12:00:00.000Z", unitIsActive: true },
        now,
      ),
    ).toBe(true);
    expect(
      isMembershipActive(
        { status: "APPROVED", expiresAt: "2026-11-05T11:59:59.000Z", unitIsActive: true },
        now,
      ),
    ).toBe(false);
    expect(
      isMembershipActive(
        { status: "PENDING", expiresAt: "2027-02-03T12:00:00.000Z", unitIsActive: true },
        now,
      ),
    ).toBe(false);
    expect(
      isMembershipActive(
        { status: "REJECTED", expiresAt: "2027-02-03T12:00:00.000Z", unitIsActive: true },
        now,
      ),
    ).toBe(false);
    expect(
      isMembershipActive(
        { status: "SUSPENDED", expiresAt: "2027-02-03T12:00:00.000Z", unitIsActive: true },
        now,
      ),
    ).toBe(false);
    expect(
      isMembershipActive(
        { status: "APPROVED", expiresAt: "2027-02-03T12:00:00.000Z", unitIsActive: false },
        now,
      ),
    ).toBe(false);
  });

  it("ลดบทบาทกู้ภัยที่ยังไม่อนุมัติ/ถูกระงับ/หมดอายุให้เป็น USER ทันที", () => {
    expect(effectiveUserRole("RESCUER", false)).toBe("USER");
    expect(effectiveUserRole("RESCUER", true)).toBe("RESCUER");
    expect(effectiveUserRole("UNIT_LEAD", false)).toBe("UNIT_LEAD");
    expect(effectiveUserRole("ADMIN", false)).toBe("ADMIN");
  });

  it("ตรวจคำขออนุมัติ/ปฏิเสธ/ระงับสมาชิกทั้งทีละคนและหลายคน พร้อมตัดรหัสซ้ำ", () => {
    const u1 = "11111111-1111-4111-8111-111111111111";
    const m1 = "22222222-2222-4222-8222-222222222221";
    const m2 = "22222222-2222-4222-8222-222222222222";
    const parsed = memberReviewSchema.safeParse({
      unitId: u1,
      memberIds: [m1, m2, m1],
      decision: "APPROVED",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.memberIds).toEqual([m1, m2]);
    }
    expect(
      memberReviewSchema.safeParse({
        unitId: u1,
        memberIds: [],
        decision: "APPROVED",
      }).success,
    ).toBe(false);
  });

  it("สร้างข้อความแจ้งผลทาง LINE สำหรับอนุมัติ ปฏิเสธ และระงับ", () => {
    const approvedText = formatMemberLineNotification({
      unitName: "หน่วยกู้ภัยบางนา",
      decision: "APPROVED",
      expiresAt: "2027-02-03T05:00:00.000Z",
      origin: "https://example.test",
    });
    expect(approvedText).toContain("หน่วยกู้ภัยบางนา");
    expect(approvedText).toContain("90 วัน");
    expect(approvedText).toContain("https://example.test/rescue");

    const rejectedText = formatMemberLineNotification({
      unitName: "หน่วยกู้ภัยบางนา",
      decision: "REJECTED",
      origin: "https://example.test",
    });
    expect(rejectedText).toContain("ไม่ได้รับการอนุมัติ");

    const suspendedText = formatMemberLineNotification({
      unitName: "หน่วยกู้ภัยบางนา",
      decision: "SUSPENDED",
      origin: "https://example.test",
    });
    expect(suspendedText).toContain("ถูกระงับแล้ว");
  });
});
