export const Urgency = {
  RED: "RED",
  YELLOW: "YELLOW",
  GREEN: "GREEN",
} as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];

export const urgencyLabel: Record<Urgency, string> = {
  RED: "วิกฤต",
  YELLOW: "เร่งด่วน",
  GREEN: "ทั่วไป",
};

// ระดับน้ำ 5 แบบ (เรียงจากน้อยไปมาก)
export const WaterLevel = {
  ANKLE: "ANKLE",
  KNEE: "KNEE",
  WAIST: "WAIST",
  CHEST: "CHEST",
  ROOF: "ROOF",
} as const;
export type WaterLevel = (typeof WaterLevel)[keyof typeof WaterLevel];

export const waterLevelLabel: Record<WaterLevel, string> = {
  ANKLE: "ถึงข้อเท้า",
  KNEE: "ถึงเข่า",
  WAIST: "ถึงเอว",
  CHEST: "ถึงอก",
  ROOF: "ท่วมถึงหลังคา",
};

// ลำดับระดับน้ำจากน้อยไปมาก — ใช้ใน priorityScore
export const WATER_LEVEL_ORDER: WaterLevel[] = [
  WaterLevel.ANKLE,
  WaterLevel.KNEE,
  WaterLevel.WAIST,
  WaterLevel.CHEST,
  WaterLevel.ROOF,
];

// สิ่งที่ต้องการ — ตรงกับดีไซน์ Figma
export const Need = {
  EVACUATION_BOAT: "EVACUATION_BOAT",
  EVACUATE_BEDRIDDEN: "EVACUATE_BEDRIDDEN",
  DRINKING_WATER: "DRINKING_WATER",
  FOOD: "FOOD",
  MEDICINE: "MEDICINE",
  BABY_SUPPLIES: "BABY_SUPPLIES",
  FLASHLIGHT_POWER: "FLASHLIGHT_POWER",
  LIFE_JACKET: "LIFE_JACKET",
  PET_FOOD: "PET_FOOD",
  CUT_POWER: "CUT_POWER",
  OTHER: "OTHER",
} as const;
export type Need = (typeof Need)[keyof typeof Need];

export const needLabel: Record<Need, string> = {
  EVACUATION_BOAT: "เรืออพยพด่วน",
  EVACUATE_BEDRIDDEN: "อพยพผู้ป่วยติดเตียง/คนชรา",
  DRINKING_WATER: "น้ำดื่มสะอาด",
  FOOD: "อาหาร/ข้าวกล่อง",
  MEDICINE: "ยารักษาโรค/ปฐมพยาบาล",
  BABY_SUPPLIES: "ผ้าอ้อม/นมผง",
  FLASHLIGHT_POWER: "ไฟฉาย/พาวเวอร์แบงก์",
  LIFE_JACKET: "เสื้อชูชีพ/เชือก",
  PET_FOOD: "อาหารสัตว์เลี้ยง",
  CUT_POWER: "ตัดไฟด่วน (ไฟรั่ว)",
  OTHER: "อื่นๆ (พิมพ์เอง)",
};
