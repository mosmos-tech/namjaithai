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

// ระดับน้ำรอบตัวผู้แจ้ง 5 แบบ ตาม Figma (B1 · SOS step 1) — ไม่บังคับกรอก (หน้าจอมือถือไม่ได้ถาม)
export const WaterLevel = {
  ROOF: "ROOF",
  FIRST_FLOOR: "FIRST_FLOOR",
  WAIST_CHEST: "WAIST_CHEST",
  ANKLE_KNEE: "ANKLE_KNEE",
  SURROUNDED: "SURROUNDED",
} as const;
export type WaterLevel = (typeof WaterLevel)[keyof typeof WaterLevel];

export const waterLevelLabel: Record<WaterLevel, string> = {
  ROOF: "บนหลังคา / ดาดฟ้า",
  FIRST_FLOOR: "ท่วมชั้น 1 (อยู่ชั้น 2)",
  WAIST_CHEST: "ระดับเอว–หน้าอก",
  ANKLE_KNEE: "ระดับข้อเท้า–เข่า",
  SURROUNDED: "ถูกน้ำล้อม / ตัดขาด",
};

/** TF-63: ฟอร์มภาษาอังกฤษ — key ชุดเดียวกับ waterLevelLabel (ขาด key แล้ว typecheck ล้ม) */
export const waterLevelLabelEn: Record<WaterLevel, string> = {
  ROOF: "On the roof / rooftop",
  FIRST_FLOOR: "Ground floor flooded (I'm upstairs)",
  WAIST_CHEST: "Waist to chest deep",
  ANKLE_KNEE: "Ankle to knee deep",
  SURROUNDED: "Surrounded by water / cut off",
};

// ลำดับที่แสดงบนหน้าจอ (ตาม Figma)
export const WATER_LEVEL_DISPLAY_ORDER: WaterLevel[] = [
  WaterLevel.ROOF,
  WaterLevel.FIRST_FLOOR,
  WaterLevel.WAIST_CHEST,
  WaterLevel.ANKLE_KNEE,
  WaterLevel.SURROUNDED,
];

// ลำดับความรุนแรงจากน้อยไปมาก — ใช้ใน priorityScore
// ถูกน้ำล้อม/ตัดขาด: น้ำอาจยังไม่สูง แต่ออกเองไม่ได้ จึงหนักกว่าข้อเท้า–เข่า แต่เบากว่าเอว–หน้าอก
export const WATER_LEVEL_ORDER: WaterLevel[] = [
  WaterLevel.ANKLE_KNEE,
  WaterLevel.SURROUNDED,
  WaterLevel.WAIST_CHEST,
  WaterLevel.FIRST_FLOOR,
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

/** TF-63: ฟอร์มภาษาอังกฤษ — key ชุดเดียวกับ needLabel */
export const needLabelEn: Record<Need, string> = {
  EVACUATION_BOAT: "Urgent evacuation boat",
  EVACUATE_BEDRIDDEN: "Evacuate bedridden / elderly people",
  DRINKING_WATER: "Clean drinking water",
  FOOD: "Food / meal boxes",
  MEDICINE: "Medicine / first aid",
  BABY_SUPPLIES: "Diapers / baby formula",
  FLASHLIGHT_POWER: "Flashlight / power bank",
  LIFE_JACKET: "Life jacket / rope",
  PET_FOOD: "Pet food",
  CUT_POWER: "Cut the power urgently (electric leak)",
  OTHER: "Other (type it in)",
};
