import { Urgency, WaterLevel, WATER_LEVEL_ORDER } from "./enums";

export interface PriorityInput {
  urgency: Urgency;
  waterLevel?: WaterLevel; // ไม่บังคับ (มือถือไม่ได้ถาม) ไม่ระบุ = ไม่มีโบนัสระดับน้ำ
  bedridden: number; // ผู้ป่วยติดเตียง
  elderly: number;   // ผู้สูงอายุ
  children: number;  // เด็กเล็ก
  createdAt: Date;   // เวลาที่แจ้งเคส
}

// คะแนนฐาน — เว้นช่องห่าง 10x เพื่อรับประกัน RED > YELLOW > GREEN แม้บวกโบนัสเต็ม
const BASE_SCORE: Record<Urgency, number> = {
  [Urgency.RED]: 10000,
  [Urgency.YELLOW]: 1000,
  [Urgency.GREEN]: 100,
};

// โบนัสคนกลุ่มเปราะบาง (ต่อคน)
const BEDRIDDEN_BONUS = 5;
const ELDERLY_BONUS = 2;
const CHILD_BONUS = 3;

// โบนัสระดับน้ำ (index ใน WATER_LEVEL_ORDER × 5)
const WATER_LEVEL_BONUS_PER_STEP = 5;

// โบนัสเวลารอ: 1 คะแนน ต่อ 10 นาที
const WAIT_BONUS_PER_10_MIN = 1;

// เพดานโบนัสรวม: ต้องน้อยกว่าช่องว่างระหว่างสีที่แคบที่สุด (GREEN→YELLOW = 900)
// GREEN_MAX = 100 + 899 = 999 < 1000 (YELLOW_MIN) ✓
// YELLOW_MAX = 1000 + 899 = 1899 < 10000 (RED_MIN) ✓
const MAX_BONUS = 899;

export function priorityScore(input: PriorityInput, now: Date = new Date()): number {
  const waterIndex = input.waterLevel ? WATER_LEVEL_ORDER.indexOf(input.waterLevel) : 0;
  const waterBonus = waterIndex * WATER_LEVEL_BONUS_PER_STEP;

  const waitMinutes = Math.max(0, (now.getTime() - input.createdAt.getTime()) / 60_000);
  const waitBonus = Math.floor(waitMinutes / 10) * WAIT_BONUS_PER_10_MIN;

  const rawBonus =
    input.bedridden * BEDRIDDEN_BONUS +
    input.elderly * ELDERLY_BONUS +
    input.children * CHILD_BONUS +
    waterBonus +
    waitBonus;

  return BASE_SCORE[input.urgency] + Math.min(rawBonus, MAX_BONUS);
}
