import { describe, expect, it } from "vitest";
import {
  acceptTransferMessage,
  canTransferStatus,
  canTransition,
  capabilityListText,
  CASE_TRANSFER_TIMEOUT_MINUTES,
  caseTransferRequestSchema,
  CaseStatus,
  formatTransferExpiredLine,
  IncidentType,
  requestTransferMessage,
  suggestedMissingCapabilities,
  timelineLabel,
  transferDistanceText,
  UNIT_CAPABILITY_LABELS,
  UnitCapability,
} from "..";
import { selectRedAlertRecipients } from "../../../features/notifications/red-alert";

describe("TF-72 ชื่อความสามารถหน่วย", () => {
  it("มีชื่อไทยครบทุกความสามารถ ที่เดียวใช้ทั้งโปรเจกต์", () => {
    expect(Object.keys(UNIT_CAPABILITY_LABELS).sort()).toEqual(
      Object.values(UnitCapability).sort(),
    );
    expect(UNIT_CAPABILITY_LABELS.WATER_RESCUE).toBe("กู้ภัยทางน้ำ");
  });

  it("รวมรายการเป็นข้อความเดียว", () => {
    expect(capabilityListText(["BOAT", "EMS"])).toBe("เรือ, การแพทย์ฉุกเฉิน");
  });
});

describe("TF-59 ฟอร์มขอส่งต่อ", () => {
  it("ต้องเลือกสิ่งที่ขาดอย่างน้อย 1 อย่าง และเหตุผล 5–300 ตัวอักษร", () => {
    expect(
      caseTransferRequestSchema.parse({ capabilities: ["BOAT", "BOAT"], reason: "  น้ำสูงมาก  " }),
    ).toEqual({ capabilities: ["BOAT"], reason: "น้ำสูงมาก" });
    expect(
      caseTransferRequestSchema.safeParse({ capabilities: [], reason: "น้ำสูงมาก" }).success,
    ).toBe(false);
    expect(
      caseTransferRequestSchema.safeParse({ capabilities: ["BOAT"], reason: "สั้น" }).success,
    ).toBe(false);
    expect(
      caseTransferRequestSchema.safeParse({ capabilities: ["TANK"], reason: "น้ำสูงมาก" }).success,
    ).toBe(false);
    expect(
      caseTransferRequestSchema.safeParse({ capabilities: ["BOAT"], reason: "ก".repeat(301) })
        .success,
    ).toBe(false);
  });

  it("ส่งต่อได้เฉพาะตอนทีมถือเคส", () => {
    expect(canTransferStatus(CaseStatus.ACCEPTED)).toBe(true);
    expect(canTransferStatus(CaseStatus.ON_SITE)).toBe(true);
    expect(canTransferStatus(CaseStatus.NEW)).toBe(false);
    expect(canTransferStatus(CaseStatus.AWAITING_CONFIRMATION)).toBe(false);
  });

  it("แนะนำสิ่งที่ขาดจาก canUnitHandle และทะเบียนเหตุ (ไม่เขียนรายการซ้ำ)", () => {
    expect(suggestedMissingCapabilities(IncidentType.FLOOD, [UnitCapability.EMS])).toEqual([
      UnitCapability.BOAT,
      UnitCapability.WATER_RESCUE,
      UnitCapability.EVACUATION,
    ]);
    expect(suggestedMissingCapabilities(IncidentType.FLOOD, [UnitCapability.BOAT])).toEqual([]);
    expect(suggestedMissingCapabilities(IncidentType.OTHER, [])).toEqual([]);
  });
});

describe("TF-59 ระยะทางในรายชื่อหน่วยที่แนะนำ", () => {
  it("บอกว่าโดยประมาณเมื่อหน่วยไม่มีพิกัด", () => {
    expect(transferDistanceText(850, false)).toBe("850 ม.");
    expect(transferDistanceText(2345, false)).toBe("2.3 กม.");
    expect(transferDistanceText(104_600, true)).toBe(
      "ประมาณ 105 กม. (โดยประมาณ จากจุดกลางอำเภอ/จังหวัด)",
    );
    expect(transferDistanceText(null, true)).toBe("ไม่ทราบระยะทาง");
  });
});

describe("TF-59 ข้อความผลลัพธ์", () => {
  it("บอกว่าหน่วยเดิมยังดูแลเคสระหว่างรอ", () => {
    expect(
      requestTransferMessage({ status: "REQUESTED", transferId: "t", expiresAt: "x" }),
    ).toContain(`${CASE_TRANSFER_TIMEOUT_MINUTES} นาที`);
    expect(requestTransferMessage({ status: "ALREADY_PENDING" })).toContain("รออยู่แล้ว");
  });

  it("กดรับช้ากว่าคนอื่น / หมดเวลา", () => {
    expect(acceptTransferMessage({ status: "NOT_PENDING", transferStatus: "accepted" })).toBe(
      "มีคนในหน่วยรับเคสนี้ไปแล้ว",
    );
    expect(acceptTransferMessage({ status: "NOT_PENDING", transferStatus: "expired" })).toContain(
      "หมดเวลา",
    );
    expect(acceptTransferMessage({ status: "LIMIT", max: 2 })).toContain("2 เคส");
  });
});

describe("TF-59 สถานะเคส (ตรงกับ guard_case_status_transition)", () => {
  it("ส่งต่อ: หน่วยใหม่รับ → ACCEPTED, หมดเวลา → NEW จากสถานะที่ทีมถืออยู่เท่านั้น", () => {
    expect(canTransition(CaseStatus.ON_SITE, CaseStatus.ACCEPTED, "transfer")).toBe(true);
    expect(canTransition(CaseStatus.EN_ROUTE, CaseStatus.NEW, "transfer")).toBe(true);
    expect(canTransition(CaseStatus.ON_SITE, CaseStatus.NEW, "transfer")).toBe(true);
    expect(canTransition(CaseStatus.AWAITING_CONFIRMATION, CaseStatus.NEW, "transfer")).toBe(false);
    expect(canTransition(CaseStatus.ON_SITE, CaseStatus.NEW)).toBe(false);
  });
});

describe("TF-59 ผู้แจ้งไม่เห็นชื่อหน่วยระหว่างส่งต่อ", () => {
  it("ไทม์ไลน์ใช้ข้อความกลาง", () => {
    expect(timelineLabel("TRANSFER_REQUESTED", CaseStatus.EN_ROUTE)).toBe(
      "กำลังส่งต่อให้ทีมที่มีอุปกรณ์",
    );
    expect(timelineLabel("TRANSFER_ACCEPTED", CaseStatus.ACCEPTED)).toBe(
      "ทีมที่มีอุปกรณ์รับเคสแล้ว",
    );
    expect(timelineLabel("TRANSFER_EXPIRED", CaseStatus.NEW)).toBe("กำลังหาทีมที่มีอุปกรณ์");
  });
});

describe("TF-59 LINE ถึงหัวหน้าหน่วยเดิมตอนหมดเวลา", () => {
  it("ลิงก์ไปหน้าเคสของกู้ภัย ไม่มีลิงก์ติดตามของผู้แจ้ง", () => {
    const text = formatTransferExpiredLine({
      caseCode: "NJT-0001",
      caseId: "11111111-1111-4111-8111-111111111111",
      incidentType: "FLOOD",
      district: "เมืองน่าน",
      province: "น่าน",
      origin: "https://example.test",
    });
    expect(text).toContain("เคส NJT-0001");
    expect(text).toContain(`${CASE_TRANSFER_TIMEOUT_MINUTES} นาที`);
    expect(text).toContain(
      "https://example.test/rescue/cases/11111111-1111-4111-8111-111111111111",
    );
    expect(text).not.toContain("/track/");
  });
});

describe("TF-59 แจ้งเตือนเคสแดงซ้ำหลังส่งต่อไม่สำเร็จ", () => {
  const candidates = [
    { unit_id: "u-boat", capabilities: ["BOAT"], user_id: "a" },
    { unit_id: "u-ems", capabilities: ["EMS"], user_id: "b" },
    { unit_id: "u-none", capabilities: [], user_id: "c" },
    { unit_id: "u-both", capabilities: ["BOAT", "EXTRICATION"], user_id: "d" },
  ];

  it("มีแท็ก: ส่งเฉพาะหน่วยที่มีครบทุกอย่างในแท็ก (ไม่ใช้ข้อยกเว้นหน่วยที่ยังไม่ตั้งค่า)", () => {
    expect(selectRedAlertRecipients(IncidentType.FLOOD, candidates, undefined, ["BOAT"])).toEqual([
      "a",
      "d",
    ]);
    // ตัดถ่างไม่ผ่าน canUnitHandle(FLOOD) แต่เป็นสิ่งที่เคสนี้ต้องใช้จริง
    expect(
      selectRedAlertRecipients(IncidentType.FLOOD, candidates, undefined, ["EXTRICATION"]),
    ).toEqual(["d"]);
  });

  it("ไม่มีแท็ก: กติกาเดิมตามประเภทเหตุ", () => {
    expect(selectRedAlertRecipients(IncidentType.FLOOD, candidates)).toEqual(["a", "c", "d"]);
  });
});
