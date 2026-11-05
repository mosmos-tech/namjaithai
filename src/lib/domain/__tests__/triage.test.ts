import { describe, it, expect } from "vitest";
import { Need, Urgency, WaterLevel } from "../enums";
import { IncidentType, INCIDENT_REGISTRY } from "../incidents";
import { computeTriage, TriageReason, triageReasonLabel, type TriageInput } from "../triage";

// เคสตั้งต้น = เขียว: ออกเองได้ ไม่มีคนเจ็บ ระดับน้ำข้อเท้า–เข่า ต้องการแค่น้ำดื่ม
const base = (overrides: Partial<TriageInput> = {}): TriageInput => ({
  incidentType: IncidentType.FLOOD,
  dangerSigns: [],
  waterLevel: WaterLevel.ANKLE_KNEE,
  canSelfEvacuate: true,
  elderly: 0,
  bedridden: 0,
  children: 0,
  hasDisabled: false,
  hasInjured: false,
  needs: [Need.DRINKING_WATER],
  ...overrides,
});

describe("computeTriage — ตารางกติกา TF-55 (เจอข้อแรกที่ตรง)", () => {
  describe("แถว 1 แดง: สัญญาณอันตรายของประเภทเหตุ", () => {
    for (const sign of INCIDENT_REGISTRY.FLOOD.dangerSigns) {
      it(`${sign.label.th} → แดง`, () => {
        const r = computeTriage(base({ dangerSigns: [sign.key] }));
        expect(r.level).toBe(Urgency.RED);
        expect(r.reasons[0]).toBe(TriageReason.DANGER_SIGN);
      });
    }

    it("สัญญาณอันตรายมาก่อนแถวอื่นเสมอ แม้ออกเองได้และน้ำตื้น", () => {
      const r = computeTriage(base({ dangerSigns: ["UNCONSCIOUS"], canSelfEvacuate: true }));
      expect(r).toEqual({ level: Urgency.RED, reasons: [TriageReason.DANGER_SIGN] });
    });
  });

  describe("แถว 2 แดง: น้ำถึงหลังคา หรือถึงอกและออกมาเองไม่ได้", () => {
    it("น้ำถึงหลังคา → แดง แม้ตอบว่าออกเองได้", () => {
      const r = computeTriage(base({ waterLevel: WaterLevel.ROOF, canSelfEvacuate: true }));
      expect(r).toEqual({ level: Urgency.RED, reasons: [TriageReason.WATER_ROOF] });
    });

    for (const level of [WaterLevel.WAIST_CHEST, WaterLevel.FIRST_FLOOR]) {
      it(`น้ำ ${level} + ออกเองไม่ได้ → แดง`, () => {
        const r = computeTriage(base({ waterLevel: level, canSelfEvacuate: false }));
        expect(r).toEqual({ level: Urgency.RED, reasons: [TriageReason.WATER_CHEST_TRAPPED] });
      });
    }

    it("น้ำเอว–อก แต่ออกเองได้ → ไม่เข้าแถวนี้", () => {
      const r = computeTriage(base({ waterLevel: WaterLevel.WAIST_CHEST, canSelfEvacuate: true }));
      expect(r.level).not.toBe(Urgency.RED);
    });
  });

  describe("แถว 3 แดง: ผู้ป่วยติดเตียง และน้ำถึงเอวขึ้นไป", () => {
    it("ติดเตียง 1 คน + น้ำเอว–อก (ออกเองได้) → แดง", () => {
      const r = computeTriage(
        base({ bedridden: 1, waterLevel: WaterLevel.WAIST_CHEST, canSelfEvacuate: true }),
      );
      expect(r).toEqual({ level: Urgency.RED, reasons: [TriageReason.BEDRIDDEN_DEEP_WATER] });
    });

    it("ติดเตียง + น้ำข้อเท้า–เข่า (ออกเองได้) → ไม่แดง (เหลืองจากกลุ่มเปราะบาง)", () => {
      const r = computeTriage(base({ bedridden: 1, waterLevel: WaterLevel.ANKLE_KNEE }));
      expect(r.level).toBe(Urgency.YELLOW);
    });
  });

  describe("แถว 4 เหลือง: ออกเองไม่ได้ หรือมีกลุ่มเปราะบาง", () => {
    it("ออกเองไม่ได้ น้ำตื้น → เหลือง", () => {
      const r = computeTriage(base({ canSelfEvacuate: false }));
      expect(r).toEqual({ level: Urgency.YELLOW, reasons: [TriageReason.CANNOT_SELF_EVACUATE] });
    });

    const vulnerable: [string, Partial<TriageInput>][] = [
      ["ผู้สูงอายุ", { elderly: 1 }],
      ["เด็กเล็ก", { children: 2 }],
      ["ผู้พิการ", { hasDisabled: true }],
      ["ผู้บาดเจ็บที่รู้สึกตัว", { hasInjured: true }],
      ["ผู้ป่วยติดเตียง (น้ำตื้น)", { bedridden: 1 }],
    ];
    for (const [name, patch] of vulnerable) {
      it(`มี${name} → เหลือง`, () => {
        const r = computeTriage(base(patch));
        expect(r).toEqual({ level: Urgency.YELLOW, reasons: [TriageReason.VULNERABLE_PEOPLE] });
      });
    }

    it("ขอเรืออพยพ (ไม่ใช่แค่ของ) → เหลือง", () => {
      const r = computeTriage(base({ needs: [Need.EVACUATION_BOAT] }));
      expect(r).toEqual({ level: Urgency.YELLOW, reasons: [TriageReason.NEEDS_RESCUE] });
    });

    it("เข้าหลายเงื่อนไข เก็บเหตุผลครบทุกข้อ", () => {
      const r = computeTriage(base({ canSelfEvacuate: false, elderly: 1 }));
      expect(r.reasons).toEqual([
        TriageReason.CANNOT_SELF_EVACUATE,
        TriageReason.VULNERABLE_PEOPLE,
      ]);
    });
  });

  describe("แถว 5 เขียว: ออกเองได้ ไม่มีคนเจ็บ ต้องการแค่เสบียงหรือของ", () => {
    it("ต้องการแค่น้ำดื่ม อาหาร ยา → เขียว", () => {
      const r = computeTriage(base({ needs: [Need.DRINKING_WATER, Need.FOOD, Need.MEDICINE] }));
      expect(r).toEqual({ level: Urgency.GREEN, reasons: [TriageReason.SUPPLIES_ONLY] });
    });

    it("ยังไม่ได้เลือกสิ่งที่ต้องการ → เขียว", () => {
      expect(computeTriage(base({ needs: [] })).level).toBe(Urgency.GREEN);
    });
  });
});

describe("computeTriage — กติกาเพิ่ม 1: ไม่ทราบระดับน้ำ ห้ามได้เขียว", () => {
  it("ไม่ตอบระดับน้ำ ทั้งที่ทุกอย่างเป็นเขียว → เหลือง + เหตุผล ไม่ทราบระดับน้ำ", () => {
    const r = computeTriage(base({ waterLevel: undefined }));
    expect(r.level).toBe(Urgency.YELLOW);
    expect(r.reasons).toContain(TriageReason.WATER_LEVEL_UNKNOWN);
    expect(triageReasonLabel[TriageReason.WATER_LEVEL_UNKNOWN]).toBe("ไม่ทราบระดับน้ำ");
  });

  it("ไม่ตอบระดับน้ำ แต่มีสัญญาณอันตราย → ยังแดง และบอกว่าไม่ทราบระดับน้ำ", () => {
    const r = computeTriage(base({ waterLevel: undefined, dangerSigns: ["CHEST_PAIN"] }));
    expect(r.level).toBe(Urgency.RED);
    expect(r.reasons).toEqual([TriageReason.DANGER_SIGN, TriageReason.WATER_LEVEL_UNKNOWN]);
  });

  it("ประเภทเหตุอื่นที่ไม่ใช่น้ำท่วม ไม่ใช้กติกานี้", () => {
    const r = computeTriage(base({ incidentType: IncidentType.MEDICAL, waterLevel: undefined }));
    expect(r.level).toBe(Urgency.GREEN);
  });
});

describe("computeTriage — กติกาเพิ่ม 2: ออกเองไม่ได้ + น้ำลึก/ติดเตียง/พิการ ขึ้นอย่างน้อย 1 ระดับ", () => {
  it("ออกเองไม่ได้ + ผู้พิการ + น้ำข้อเท้า–เข่า: ตาราง = เหลือง → ขึ้นเป็นแดง", () => {
    const r = computeTriage(base({ canSelfEvacuate: false, hasDisabled: true }));
    expect(r.level).toBe(Urgency.RED);
    expect(r.reasons).toContain(TriageReason.TRAPPED_ESCALATED);
  });

  it("ออกเองไม่ได้ + ผู้ป่วยติดเตียง + ถูกน้ำล้อม → แดง", () => {
    const r = computeTriage(
      base({ canSelfEvacuate: false, bedridden: 1, waterLevel: WaterLevel.SURROUNDED }),
    );
    expect(r.level).toBe(Urgency.RED);
    expect(r.reasons).toContain(TriageReason.TRAPPED_ESCALATED);
  });

  it("ออกเองไม่ได้ + ผู้ป่วยติดเตียง + ไม่ทราบระดับน้ำ (น้ำระดับใดก็ได้) → แดง", () => {
    const r = computeTriage(base({ canSelfEvacuate: false, bedridden: 1, waterLevel: undefined }));
    expect(r.level).toBe(Urgency.RED);
  });

  it("ออกเองไม่ได้ + น้ำถึงเอวขึ้นไป → แดง (ตารางให้แดงอยู่แล้ว ไม่ต้องปรับซ้ำ)", () => {
    const r = computeTriage(base({ canSelfEvacuate: false, waterLevel: WaterLevel.WAIST_CHEST }));
    expect(r.level).toBe(Urgency.RED);
    expect(r.reasons).not.toContain(TriageReason.TRAPPED_ESCALATED);
  });

  it("ออกเองได้ + ผู้พิการ → ไม่ปรับขึ้น (เหลืองตามตาราง)", () => {
    const r = computeTriage(base({ canSelfEvacuate: true, hasDisabled: true }));
    expect(r.level).toBe(Urgency.YELLOW);
    expect(r.reasons).not.toContain(TriageReason.TRAPPED_ESCALATED);
  });

  it("ออกเองไม่ได้ น้ำตื้น ไม่มีกลุ่มเสี่ยง → เหลือง ไม่ปรับขึ้น", () => {
    const r = computeTriage(base({ canSelfEvacuate: false }));
    expect(r.level).toBe(Urgency.YELLOW);
  });
});

describe("triageReasonLabel", () => {
  it("ทุกเหตุผลมีข้อความภาษาไทย และไม่บอกรายละเอียดสุขภาพรายคน", () => {
    for (const code of Object.values(TriageReason)) {
      const label = triageReasonLabel[code];
      expect(label.trim()).not.toBe("");
      expect(label).not.toMatch(/หมดสติ|หายใจ|เลือด|หน้าอก/);
    }
  });
});
