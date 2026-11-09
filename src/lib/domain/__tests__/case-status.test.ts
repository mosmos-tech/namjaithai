import { describe, it, expect } from "vitest";
import {
  canTransition,
  caseCompletionSchema,
  CaseStatus,
  RESCUER_NEXT_STATUS,
  type CaseTransitionMode,
} from "../case-status";

const {
  NEW,
  ACCEPTED,
  EN_ROUTE,
  ON_SITE,
  AWAITING_CONFIRMATION,
  RESOLVED,
  CANCELLED,
  DUPLICATE,
  UNREACHABLE,
} = CaseStatus;

const ALL = Object.values(CaseStatus);
const OPEN: CaseStatus[] = [NEW, ACCEPTED, EN_ROUTE, ON_SITE, AWAITING_CONFIRMATION];
const MODES: CaseTransitionMode[] = ["normal", "release", "reporterCancel", "leadClose"];

// ตารางคู่สถานะที่อนุญาต (TF-26) — pgTAP tf26_case_status_flow ใช้ตารางเดียวกัน
const STEPS = [
  [NEW, ACCEPTED],
  [ACCEPTED, EN_ROUTE],
  [EN_ROUTE, ON_SITE],
  [ON_SITE, AWAITING_CONFIRMATION],
];
function expected(from: CaseStatus, to: CaseStatus, mode: CaseTransitionMode): boolean {
  if (STEPS.some(([a, b]) => a === from && b === to)) return true;
  if (mode === "release") return to === NEW && (from === ACCEPTED || from === EN_ROUTE);
  if (mode === "reporterCancel") return to === CANCELLED && OPEN.includes(from);
  if (mode === "leadClose") {
    if (!OPEN.includes(from)) return false;
    if (to === CANCELLED || to === DUPLICATE || to === UNREACHABLE) return true;
    return to === RESOLVED && from === AWAITING_CONFIRMATION;
  }
  return false;
}

describe("canTransition — ทุกคู่สถานะ × ทุกช่องทาง ตรงกับตาราง TF-26", () => {
  for (const mode of MODES) {
    it(`ช่องทาง ${mode}: ${ALL.length * ALL.length} คู่`, () => {
      const wrong = ALL.flatMap((from) =>
        ALL.filter((to) => canTransition(from, to, mode) !== expected(from, to, mode)).map(
          (to) => `${from} → ${to}`,
        ),
      );
      expect(wrong).toEqual([]);
    });
  }
});

describe("canTransition — เส้นทางปกติ", () => {
  it("NEW → ACCEPTED ได้", () => expect(canTransition(NEW, ACCEPTED)).toBe(true));
  it("ACCEPTED → EN_ROUTE ได้", () => expect(canTransition(ACCEPTED, EN_ROUTE)).toBe(true));
  it("EN_ROUTE → ON_SITE ได้", () => expect(canTransition(EN_ROUTE, ON_SITE)).toBe(true));
  it("ON_SITE → AWAITING_CONFIRMATION ได้", () =>
    expect(canTransition(ON_SITE, AWAITING_CONFIRMATION)).toBe(true));
  it("TF-26: ON_SITE → RESOLVED ไม่ได้ (กู้ภัยปิดเคสเองไม่ได้)", () => {
    for (const mode of MODES) expect(canTransition(ON_SITE, RESOLVED, mode)).toBe(false);
  });
  it("AWAITING_CONFIRMATION → RESOLVED เฉพาะหัวหน้า/ระบบ (TF-58)", () => {
    expect(canTransition(AWAITING_CONFIRMATION, RESOLVED)).toBe(false);
    expect(canTransition(AWAITING_CONFIRMATION, RESOLVED, "leadClose")).toBe(true);
  });
});

describe("canTransition — ปล่อยเคสกลับ NEW (release_case เท่านั้น)", () => {
  it("ACCEPTED → NEW ได้ผ่าน release", () =>
    expect(canTransition(ACCEPTED, NEW, "release")).toBe(true));
  it("EN_ROUTE → NEW ได้ผ่าน release", () =>
    expect(canTransition(EN_ROUTE, NEW, "release")).toBe(true));
  it("ถอยหลังแบบปกติไม่ได้", () => {
    expect(canTransition(ACCEPTED, NEW)).toBe(false);
    expect(canTransition(ON_SITE, EN_ROUTE)).toBe(false);
    expect(canTransition(ON_SITE, NEW, "release")).toBe(false);
  });
});

describe("canTransition — ปิดเคส", () => {
  it("กู้ภัยปิดเคสเองไม่ได้ (ช่องทางปกติ)", () => {
    for (const from of OPEN) {
      for (const to of [RESOLVED, CANCELLED, DUPLICATE, UNREACHABLE]) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });
  it("ผู้แจ้งกดปลอดภัยแล้ว: ยกเลิกได้จากทุกสถานะที่ยังเปิด", () => {
    for (const from of OPEN) expect(canTransition(from, CANCELLED, "reporterCancel")).toBe(true);
    expect(canTransition(NEW, UNREACHABLE, "reporterCancel")).toBe(false);
  });
  it("หัวหน้า/ระบบปิดเป็น DUPLICATE / UNREACHABLE ได้", () => {
    expect(canTransition(ACCEPTED, DUPLICATE, "leadClose")).toBe(true);
    expect(canTransition(EN_ROUTE, UNREACHABLE, "leadClose")).toBe(true);
  });
});

describe("canTransition — ห้ามข้ามขั้น", () => {
  it("NEW → ON_SITE ไม่ได้", () => expect(canTransition(NEW, ON_SITE)).toBe(false));
  it("NEW → EN_ROUTE ไม่ได้", () => expect(canTransition(NEW, EN_ROUTE)).toBe(false));
  it("NEW → RESOLVED ไม่ได้", () => expect(canTransition(NEW, RESOLVED)).toBe(false));
  it("ACCEPTED → ON_SITE ไม่ได้", () => expect(canTransition(ACCEPTED, ON_SITE)).toBe(false));
  it("EN_ROUTE → AWAITING_CONFIRMATION ไม่ได้", () =>
    expect(canTransition(EN_ROUTE, AWAITING_CONFIRMATION)).toBe(false));
});

describe("canTransition — terminal state", () => {
  it("ปิดแล้วเปลี่ยนต่อไม่ได้ทุกช่องทาง", () => {
    for (const from of [RESOLVED, CANCELLED, DUPLICATE, UNREACHABLE]) {
      for (const to of ALL) {
        for (const mode of MODES) expect(canTransition(from, to, mode)).toBe(false);
      }
    }
  });
});

describe("TF-26 ปุ่มสถานะถัดไปของกู้ภัย", () => {
  it("ปุ่มเดียวต่อสถานะ ไปทีละขั้น และปุ่มสุดท้ายคือ ช่วยเสร็จแล้ว", () => {
    expect(RESCUER_NEXT_STATUS.ACCEPTED).toEqual({ to: EN_ROUTE, label: "เริ่มเดินทาง" });
    expect(RESCUER_NEXT_STATUS.EN_ROUTE).toEqual({ to: ON_SITE, label: "ถึงที่เกิดเหตุ" });
    expect(RESCUER_NEXT_STATUS.ON_SITE).toEqual({
      to: AWAITING_CONFIRMATION,
      label: "ช่วยเสร็จแล้ว",
    });
    expect(RESCUER_NEXT_STATUS.AWAITING_CONFIRMATION).toBeUndefined();
    for (const [from, next] of Object.entries(RESCUER_NEXT_STATUS)) {
      expect(canTransition(from as CaseStatus, next!.to)).toBe(true);
    }
  });

  it("ช่วยเสร็จแล้วต้องมีผลและจำนวนคน เลือก อื่นๆ ต้องมีโน้ต", () => {
    expect(caseCompletionSchema.safeParse({ outcome: "HELPED", peopleHelped: 3 }).success).toBe(
      true,
    );
    expect(caseCompletionSchema.safeParse({ peopleHelped: 3 }).success).toBe(false);
    expect(caseCompletionSchema.safeParse({ outcome: "HELPED" }).success).toBe(false);
    expect(caseCompletionSchema.safeParse({ outcome: "HELPED", peopleHelped: -1 }).success).toBe(
      false,
    );
    expect(caseCompletionSchema.safeParse({ outcome: "OTHER", peopleHelped: 0 }).success).toBe(
      false,
    );
    expect(
      caseCompletionSchema.safeParse({ outcome: "OTHER", peopleHelped: 0, note: "ส่งต่อ อบต." })
        .success,
    ).toBe(true);
  });
});
