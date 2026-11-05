import { z } from "zod";
import "./zod-locale";
import { Need, Urgency, WaterLevel } from "./enums";
import { IncidentType } from "./incidents";

/**
 * ระบบคำนวณความเร่งด่วน (TF-55) — ผู้แจ้งไม่เลือกสีเอง ระบบคิดจากคำตอบ
 *
 * ตารางกติกา (เจอข้อแรกที่ตรง ไล่จากบนลงล่าง) ตามการ์ด TF-55:
 *   แดง    มีสัญญาณอันตรายของประเภทเหตุ
 *   แดง    น้ำถึงหลังคา หรือถึงอกและออกมาเองไม่ได้
 *   แดง    มีผู้ป่วยติดเตียง และน้ำถึงเอวขึ้นไป
 *   เหลือง ออกมาเองไม่ได้ หรือมีผู้สูงอายุ เด็กเล็ก ผู้พิการ หรือผู้บาดเจ็บที่รู้สึกตัว
 *   เขียว  ออกมาเองได้ ไม่มีคนเจ็บ ต้องการแค่เสบียงหรือของ
 *
 * กติกาเพิ่มที่ตกลงกับทีม (5 พ.ย. 2569) ใช้หลังตาราง:
 *   1. น้ำท่วมแต่ไม่ตอบระดับน้ำ = ไม่ทราบ ห้ามได้เขียว (อย่างน้อยเหลือง)
 *   2. ออกเองไม่ได้ และ (น้ำถึงเอวขึ้นไป หรือมีผู้ป่วยติดเตียง/ผู้พิการกับน้ำระดับใดก็ได้)
 *      → ขึ้นจากผลตารางอย่างน้อย 1 ระดับ
 *
 * การตีความ:
 *   - ระดับน้ำในระบบรวม "เอว–หน้าอก" เป็นช่องเดียว จึงนับ "ถึงอก" = เอว–หน้าอก ขึ้นไป
 *     (เอนไปทางให้ระดับสูงไว้ก่อน ตามหลัก over-triage)
 *   - ผู้ป่วยติดเตียงนับเป็นกลุ่มเปราะบาง (เหลือง) เหมือนผู้พิการ
 *   - ขอเรืออพยพ อพยพผู้ป่วย ตัดไฟ หรือ "อื่นๆ" ไม่ใช่ "แค่เสบียงหรือของ" จึงไม่ได้เขียว
 */

export const TriageReason = {
  DANGER_SIGN: "DANGER_SIGN",
  WATER_ROOF: "WATER_ROOF",
  WATER_CHEST_TRAPPED: "WATER_CHEST_TRAPPED",
  BEDRIDDEN_DEEP_WATER: "BEDRIDDEN_DEEP_WATER",
  CANNOT_SELF_EVACUATE: "CANNOT_SELF_EVACUATE",
  VULNERABLE_PEOPLE: "VULNERABLE_PEOPLE",
  NEEDS_RESCUE: "NEEDS_RESCUE",
  SUPPLIES_ONLY: "SUPPLIES_ONLY",
  WATER_LEVEL_UNKNOWN: "WATER_LEVEL_UNKNOWN",
  TRAPPED_ESCALATED: "TRAPPED_ESCALATED",
  // เคสที่แจ้งก่อนมีระบบคำนวณ (ผู้แจ้งเลือกสีเอง) — ตั้งให้ใน migration ของ TF-55
  REPORTER_SELECTED: "REPORTER_SELECTED",
} as const;
export type TriageReason = (typeof TriageReason)[keyof typeof TriageReason];

/**
 * ข้อความเหตุผลบนแท็กที่กู้ภัยเห็น — กู้ภัยในพื้นที่ที่ยังไม่รับเคสก็เห็น
 * จึงเขียนกว้างๆ ไม่บอกว่าใครเป็นอะไร (รายละเอียดสุขภาพอยู่ใน case_sensitive_details)
 */
export const triageReasonLabel: Record<TriageReason, string> = {
  DANGER_SIGN: "มีสัญญาณอันตรายต่อชีวิต",
  WATER_ROOF: "น้ำถึงหลังคา",
  WATER_CHEST_TRAPPED: "น้ำถึงอกขึ้นไป และออกมาเองไม่ได้",
  BEDRIDDEN_DEEP_WATER: "มีผู้ป่วยติดเตียง และน้ำถึงเอวขึ้นไป",
  CANNOT_SELF_EVACUATE: "ออกมาเองไม่ได้",
  VULNERABLE_PEOPLE:
    "มีกลุ่มเปราะบาง (ผู้สูงอายุ เด็กเล็ก ผู้ป่วยติดเตียง ผู้พิการ หรือผู้บาดเจ็บ)",
  NEEDS_RESCUE: "ต้องการอพยพหรือความช่วยเหลือที่ไม่ใช่แค่สิ่งของ",
  SUPPLIES_ONLY: "ออกมาเองได้ ไม่มีคนเจ็บ ต้องการแค่สิ่งของ",
  WATER_LEVEL_UNKNOWN: "ไม่ทราบระดับน้ำ",
  TRAPPED_ESCALATED: "ออกมาเองไม่ได้ ในน้ำลึกหรือมีผู้ป่วยติดเตียง/ผู้พิการ — ปรับขึ้น 1 ระดับ",
  REPORTER_SELECTED: "ผู้แจ้งเลือกสีเอง (แจ้งก่อนมีระบบคำนวณ)",
};

export interface TriageInput {
  incidentType: IncidentType;
  /** key ของสัญญาณอันตรายที่ผู้แจ้งติ๊ก (ว่าง = ไม่มี) */
  dangerSigns: readonly string[];
  /** ไม่ส่งมา = ไม่ทราบระดับน้ำ */
  waterLevel?: WaterLevel;
  canSelfEvacuate: boolean;
  elderly: number;
  bedridden: number;
  children: number;
  hasDisabled: boolean;
  hasInjured: boolean;
  needs: readonly Need[];
}

export interface TriageResult {
  level: Urgency;
  reasons: TriageReason[];
}

// น้ำถึงเอวขึ้นไป (ใช้ทั้ง "ถึงอก" และ "ถึงเอวขึ้นไป" เพราะระบบรวมเอว–หน้าอกเป็นช่องเดียว)
const DEEP_WATER: readonly WaterLevel[] = [
  WaterLevel.WAIST_CHEST,
  WaterLevel.FIRST_FLOOR,
  WaterLevel.ROOF,
];

// "เสบียงหรือของ" — ต้องการแค่กลุ่มนี้ถึงจะได้เขียว
const SUPPLY_NEEDS: readonly Need[] = [
  Need.DRINKING_WATER,
  Need.FOOD,
  Need.MEDICINE,
  Need.BABY_SUPPLIES,
  Need.FLASHLIGHT_POWER,
  Need.LIFE_JACKET,
  Need.PET_FOOD,
];

const LEVEL_ORDER: readonly Urgency[] = [Urgency.GREEN, Urgency.YELLOW, Urgency.RED];
const rank = (level: Urgency) => LEVEL_ORDER.indexOf(level);
const higher = (a: Urgency, b: Urgency) => (rank(a) >= rank(b) ? a : b);
const oneUp = (level: Urgency) => LEVEL_ORDER[Math.min(rank(level) + 1, LEVEL_ORDER.length - 1)];

// ตารางกติกา: คืนผลของแถวแรกที่ตรง
function applyTable(input: TriageInput, isFlood: boolean): TriageResult {
  const deep = isFlood && input.waterLevel !== undefined && DEEP_WATER.includes(input.waterLevel);

  if (input.dangerSigns.length > 0) {
    return { level: Urgency.RED, reasons: [TriageReason.DANGER_SIGN] };
  }
  if (isFlood && input.waterLevel === WaterLevel.ROOF) {
    return { level: Urgency.RED, reasons: [TriageReason.WATER_ROOF] };
  }
  if (deep && !input.canSelfEvacuate) {
    return { level: Urgency.RED, reasons: [TriageReason.WATER_CHEST_TRAPPED] };
  }
  if (deep && input.bedridden > 0) {
    return { level: Urgency.RED, reasons: [TriageReason.BEDRIDDEN_DEEP_WATER] };
  }

  const yellow: TriageReason[] = [];
  if (!input.canSelfEvacuate) yellow.push(TriageReason.CANNOT_SELF_EVACUATE);
  if (
    input.elderly > 0 ||
    input.children > 0 ||
    input.bedridden > 0 ||
    input.hasDisabled ||
    input.hasInjured
  ) {
    yellow.push(TriageReason.VULNERABLE_PEOPLE);
  }
  if (input.needs.some((need) => !SUPPLY_NEEDS.includes(need))) {
    yellow.push(TriageReason.NEEDS_RESCUE);
  }
  if (yellow.length > 0) return { level: Urgency.YELLOW, reasons: yellow };

  return { level: Urgency.GREEN, reasons: [TriageReason.SUPPLIES_ONLY] };
}

export function computeTriage(input: TriageInput): TriageResult {
  const isFlood = input.incidentType === IncidentType.FLOOD;
  const table = applyTable(input, isFlood);
  let level = table.level;
  const reasons = [...table.reasons];

  // กติกาเพิ่ม 1: น้ำท่วมแต่ไม่ทราบระดับน้ำ → ห้ามเขียว
  if (isFlood && input.waterLevel === undefined) {
    level = higher(level, Urgency.YELLOW);
    reasons.push(TriageReason.WATER_LEVEL_UNKNOWN);
  }

  // กติกาเพิ่ม 2: ออกเองไม่ได้ ในน้ำลึก หรือมีผู้ป่วยติดเตียง/ผู้พิการ (น้ำระดับใดก็ได้ รวมไม่ทราบ)
  const deep = input.waterLevel !== undefined && DEEP_WATER.includes(input.waterLevel);
  const trappedAtRisk =
    isFlood && !input.canSelfEvacuate && (deep || input.bedridden > 0 || input.hasDisabled);
  if (trappedAtRisk) {
    const escalated = higher(level, oneUp(table.level));
    if (escalated !== level) {
      level = escalated;
      reasons.push(TriageReason.TRAPPED_ESCALATED);
    }
  }

  return { level, reasons };
}

// ── กู้ภัยปรับระดับเอง ──────────────────────────────────────────────────────
// ต้องใส่เหตุผลเสมอ (บันทึกใน audit_logs) และส่ง version ที่เห็นอยู่มา กันทับการแก้ของคนอื่น
export const triageOverrideSchema = z.object({
  caseId: z.uuid({ error: "รหัสเคสไม่ถูกต้อง" }),
  urgency: z.enum(Object.values(Urgency) as [Urgency, ...Urgency[]], {
    error: "กรุณาเลือกระดับความเร่งด่วน",
  }),
  reason: z
    .string({ error: "กรุณาระบุเหตุผลที่ปรับระดับ" })
    .trim()
    .min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร")
    .max(300, "เหตุผลต้องไม่เกิน 300 ตัวอักษร"),
  expectedVersion: z.number().int().positive(),
});
export type TriageOverrideInput = z.infer<typeof triageOverrideSchema>;
