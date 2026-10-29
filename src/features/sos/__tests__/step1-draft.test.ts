import { describe, it, expect } from "vitest";
import { Urgency, WaterLevel } from "../../../lib/domain";
import {
  SOS_STEPS,
  createInitialSosDraft,
  validateStep1Draft,
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

describe("TF-08: ฟอร์ม SOS ขั้น 1 ความเร่งด่วนและระดับน้ำ", () => {
  it("เกณฑ์ข้อ 1: เลือกความเร่งด่วนและระดับน้ำครบถ้วนแล้วผ่านการตรวจสอบเพื่อไปขั้นถัดไปได้", () => {
    const check = validateStep1Draft({
      urgency: Urgency.RED,
      waterLevel: WaterLevel.CHEST,
    });

    expect(check.valid).toBe(true);
    expect(check.errors.urgency).toBeUndefined();
    expect(check.errors.waterLevel).toBeUndefined();
    expect(check.errors.missingSummary).toEqual([]);
  });

  it("เกณฑ์ข้อ 2: ไม่เลือกแล้วกดถัดไป มีข้อความบอกว่าขาดอะไรอย่างชัดเจน", () => {
    // ไม่เลือกทั้ง 2 อย่าง
    const bothMissing = validateStep1Draft({
      urgency: undefined,
      waterLevel: undefined,
    });
    expect(bothMissing.valid).toBe(false);
    expect(bothMissing.errors.urgency).toContain("กรุณาเลือกระดับความเร่งด่วน");
    expect(bothMissing.errors.waterLevel).toContain("กรุณาเลือกระดับน้ำปัจจุบัน");
    expect(bothMissing.errors.missingSummary).toEqual([
      "ระดับความเร่งด่วน",
      "ระดับน้ำปัจจุบัน",
    ]);

    // เลือกแต่ความเร่งด่วน ขาดระดับน้ำ
    const waterMissing = validateStep1Draft({
      urgency: Urgency.YELLOW,
      waterLevel: undefined,
    });
    expect(waterMissing.valid).toBe(false);
    expect(waterMissing.errors.urgency).toBeUndefined();
    expect(waterMissing.errors.waterLevel).toContain("กรุณาเลือกระดับน้ำปัจจุบัน");
    expect(waterMissing.errors.missingSummary).toEqual(["ระดับน้ำปัจจุบัน"]);

    // เลือกแต่ระดับน้ำ ขาดความเร่งด่วน
    const urgencyMissing = validateStep1Draft({
      urgency: undefined,
      waterLevel: WaterLevel.WAIST,
    });
    expect(urgencyMissing.valid).toBe(false);
    expect(urgencyMissing.errors.urgency).toContain("กรุณาเลือกระดับความเร่งด่วน");
    expect(urgencyMissing.errors.waterLevel).toBeUndefined();
    expect(urgencyMissing.errors.missingSummary).toEqual(["ระดับความเร่งด่วน"]);
  });

  it('เกณฑ์ข้อ 3: โครงฟอร์ม 5 ขั้นและข้อความ "ขั้นที่ X จาก 5" ถูกต้องทุกขั้น', () => {
    expect(SOS_STEPS).toHaveLength(5);
    expect(SOS_STEPS.map((s) => s.shortLabel)).toEqual([
      "ความเร่งด่วน",
      "ตำแหน่ง",
      "ผู้ติดค้าง",
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

  it("เกณฑ์ข้อ 4: บันทึกร่างทุกครั้งที่กรอก เมื่อปิดหน้าแล้วเปิดใหม่ ค่าที่กรอกยังอยู่ครบ", () => {
    const storage = createMemoryStorage();
    const draft = {
      ...createInitialSosDraft(),
      currentStep: 2 as SosStepNumber,
      urgency: Urgency.GREEN,
      waterLevel: WaterLevel.KNEE,
    };

    saveSosDraft(draft, storage);

    const restored = loadSosDraft(storage);
    expect(restored.urgency).toBe(Urgency.GREEN);
    expect(restored.waterLevel).toBe(WaterLevel.KNEE);
    expect(restored.currentStep).toBe(2);
    expect(restored.updatedAt).toBeDefined();

    // เมื่อล้างร่างแล้วต้องกลับเป็นค่าเริ่มต้น
    clearSosDraft(storage);
    const afterClear = loadSosDraft(storage);
    expect(afterClear.urgency).toBeUndefined();
    expect(afterClear.waterLevel).toBeUndefined();
    expect(afterClear.currentStep).toBe(1);
  });
});
