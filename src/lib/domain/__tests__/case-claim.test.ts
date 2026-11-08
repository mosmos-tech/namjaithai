import { describe, expect, it } from "vitest";
import { acceptCaseMessage, caseReleaseReasonSchema, RESCUER_MAX_ACTIVE_CASES } from "..";

describe("TF-25 รับเคส", () => {
  it("คนกดช้าเห็นแค่ชื่อหน่วยที่รับไปแล้ว", () => {
    expect(acceptCaseMessage({ status: "TAKEN", unitName: "กู้ภัยบางพลี" })).toBe(
      "หน่วย กู้ภัยบางพลี รับเคสนี้ไปแล้ว",
    );
    expect(acceptCaseMessage({ status: "TAKEN", unitName: null })).toBe("เคสนี้มีทีมรับไปแล้ว");
  });

  it("ถือครบเพดานแล้วบอกให้ปิดหรือปล่อยเคสเดิมก่อน", () => {
    expect(RESCUER_MAX_ACTIVE_CASES).toBe(2);
    expect(acceptCaseMessage({ status: "LIMIT", max: 2 })).toContain("2 เคส");
  });
});

describe("TF-25 เหตุผลปล่อยเคส", () => {
  it("ตัดช่องว่างแล้วต้องยาว 3–300 ตัวอักษร", () => {
    expect(caseReleaseReasonSchema.parse("  เรือเสีย  ")).toBe("เรือเสีย");
    expect(caseReleaseReasonSchema.safeParse("   ").success).toBe(false);
    expect(caseReleaseReasonSchema.safeParse("ab").success).toBe(false);
    expect(caseReleaseReasonSchema.safeParse("ก".repeat(301)).success).toBe(false);
  });
});
