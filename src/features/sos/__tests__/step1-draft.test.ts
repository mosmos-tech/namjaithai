import { describe, it, expect } from "vitest";
import { IncidentType, WaterLevel } from "../../../lib/domain";
import {
  SOS_STEPS,
  createInitialSosDraft,
  parseIncidentTypeParam,
  validateStep1Draft,
  validateStep2Draft,
  migrateLegacySosDraft,
  saveSosDraft,
  loadSosDraft,
  clearSosDraft,
  formatStepProgressText,
  type SosStepNumber,
} from "../draft-storage";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

// TF-66: คำถามอันตรายย้ายไปขั้นที่ 2 (รายละเอียดเหตุ) ตรวจพร้อมจำนวนคน — ใส่จำนวนคนเริ่มต้นไว้ให้
const people = { adults: 1, elderly: 0, bedridden: 0, children: 0, pets: 0 };

describe("TF-08 / TF-55 / TF-66: คำถามอันตรายในขั้น 2 (ไม่มีการเลือกสี)", () => {
  it("ตอบสัญญาณอันตราย + ออกเองได้ไหม ครบแล้วผ่าน (ระดับน้ำไม่บังคับ)", () => {
    const check = validateStep2Draft({
      ...people,
      dangerSigns: [],
      canSelfEvacuate: false,
      waterLevel: undefined,
    });
    expect(check.valid).toBe(true);
    expect(check.errors.missingSummary).toEqual([]);

    const withSigns = validateStep2Draft({
      ...people,
      dangerSigns: ["UNCONSCIOUS", "PERSON_IN_WATER"],
      canSelfEvacuate: true,
      waterLevel: WaterLevel.WAIST_CHEST,
    });
    expect(withSigns.valid).toBe(true);
  });

  it("ยังไม่ตอบแล้วกดถัดไป มีข้อความบอกว่าขาดอะไรอย่างชัดเจน", () => {
    const nothing = validateStep2Draft({
      ...people,
      dangerSigns: undefined,
      canSelfEvacuate: undefined,
      waterLevel: undefined,
    });
    expect(nothing.valid).toBe(false);
    expect(nothing.errors.dangerSigns).toBe('กรุณาเลือกข้อที่ตรง หรือกด "ไม่มีข้อใดเลย"');
    expect(nothing.errors.canSelfEvacuate).toBe("กรุณาตอบว่าออกจากที่นั่นเองได้ไหม");
    expect(nothing.errors.missingSummary).toEqual(["สัญญาณอันตราย", "ออกเองได้ไหม"]);

    // ตอบ "ไม่มีข้อใดเลย" แล้ว แต่ยังไม่ตอบเรื่องออกเองได้ไหม
    const noEvacuate = validateStep2Draft({
      ...people,
      dangerSigns: [],
      canSelfEvacuate: undefined,
    });
    expect(noEvacuate.valid).toBe(false);
    expect(noEvacuate.errors.dangerSigns).toBeUndefined();
    expect(noEvacuate.errors.missingSummary).toEqual(["ออกเองได้ไหม"]);
  });

  it("สัญญาณอันตรายที่ไม่มีในทะเบียนไม่ผ่าน", () => {
    const check = validateStep2Draft({
      ...people,
      dangerSigns: ["ALIEN_ATTACK"],
      canSelfEvacuate: true,
    });
    expect(check.valid).toBe(false);
  });

  it('โครงฟอร์ม 5 ขั้นและข้อความ "ขั้นที่ X จาก 5" ถูกต้องทุกขั้น', () => {
    expect(SOS_STEPS).toHaveLength(5);
    expect(SOS_STEPS.map((s) => s.shortLabel)).toEqual([
      "ประเภทเหตุ",
      "รายละเอียด",
      "ตำแหน่ง",
      "สิ่งที่ต้องการ",
      "ข้อมูลติดต่อ",
    ]);

    const steps: SosStepNumber[] = [1, 2, 3, 4, 5];
    expect(steps.map((s) => formatStepProgressText(s))).toEqual([
      "ขั้นที่ 1 จาก 5",
      "ขั้นที่ 2 จาก 5",
      "ขั้นที่ 3 จาก 5",
      "ขั้นที่ 4 จาก 5",
      "ขั้นที่ 5 จาก 5",
    ]);
  });

  it("บันทึกร่างทุกครั้งที่กรอก เมื่อปิดหน้าแล้วเปิดใหม่ ค่าที่กรอกยังอยู่ครบ", () => {
    const storage = createMemoryStorage();
    const draft = {
      ...createInitialSosDraft(),
      currentStep: 2 as SosStepNumber,
      dangerSigns: ["CHEST_PAIN"],
      canSelfEvacuate: false,
      waterLevel: WaterLevel.ANKLE_KNEE,
      hasInjured: true,
    };

    saveSosDraft(draft, storage);

    const restored = loadSosDraft(storage);
    expect(restored.dangerSigns).toEqual(["CHEST_PAIN"]);
    expect(restored.canSelfEvacuate).toBe(false);
    expect(restored.waterLevel).toBe(WaterLevel.ANKLE_KNEE);
    expect(restored.hasInjured).toBe(true);
    expect(restored.currentStep).toBe(2);
    expect(restored.updatedAt).toBeDefined();

    clearSosDraft(storage);
    const afterClear = loadSosDraft(storage);
    expect(afterClear.dangerSigns).toBeUndefined();
    expect(afterClear.canSelfEvacuate).toBeUndefined();
    expect(afterClear.currentStep).toBe(1);
  });

  it("ร่างรุ่นเก่าที่มีแต่ urgency (ก่อน TF-55) กลับไปตอบคำถามอันตรายใหม่ และไม่พก urgency ไปต่อ", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "namjaithai-sos-draft-v1",
      JSON.stringify({ ...createInitialSosDraft(), currentStep: 3, urgency: "GREEN" }),
    );
    migrateLegacySosDraft(storage);
    const restored = loadSosDraft(storage) as unknown as Record<string, unknown>;
    // ขั้น 3 เก่า (ผู้ติดค้าง) = ขั้น 2 ใหม่ ซึ่งยังไม่ได้ตอบสัญญาณอันตราย
    expect(restored.currentStep).toBe(2);
    expect(restored.urgency).toBeUndefined();
  });

  it("TF-50: ตอบว่าไม่ได้อยู่ที่จุดเกิดเหตุ (atScene = false) ไม่ผ่านการตรวจ และกลับขั้น 1 เสมอ", () => {
    const check = validateStep1Draft({
      incidentType: IncidentType.FLOOD,
      atScene: false,
    });
    expect(check.valid).toBe(false);
    expect(check.errors.atScene).toContain("แจ้งแทนคนอื่นไม่ได้");
    expect(check.errors.missingSummary).toContain("อยู่ที่จุดเกิดเหตุ");

    const storage = createMemoryStorage();
    saveSosDraft(
      {
        ...createInitialSosDraft(),
        currentStep: 3,
        incidentType: IncidentType.FLOOD,
        atScene: false,
        dangerSigns: [],
        canSelfEvacuate: true,
      },
      storage,
    );
    const restored = loadSosDraft(storage);
    expect(restored.atScene).toBe(false);
    expect(restored.currentStep).toBe(1);
  });

  it("TF-50: อ่านพารามิเตอร์ ?type=FLOOD จาก URL เพื่อเลือกประเภทเหตุไว้ให้", () => {
    expect(parseIncidentTypeParam("?type=FLOOD")).toBe(IncidentType.FLOOD);
    expect(parseIncidentTypeParam("?type=flood")).toBe(IncidentType.FLOOD);
    expect(parseIncidentTypeParam("type=FIRE")).toBe(IncidentType.FIRE);
    expect(parseIncidentTypeParam("?type=UNKNOWN")).toBeUndefined();
    expect(parseIncidentTypeParam("")).toBeUndefined();
    expect(parseIncidentTypeParam(null)).toBeUndefined();
  });
});
