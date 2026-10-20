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
  ABOVE_HEAD: "ABOVE_HEAD",
} as const;
export type WaterLevel = (typeof WaterLevel)[keyof typeof WaterLevel];

export const waterLevelLabel: Record<WaterLevel, string> = {
  ANKLE: "ถึงข้อเท้า",
  KNEE: "ถึงเข่า",
  WAIST: "ถึงเอว",
  CHEST: "ถึงอก",
  ABOVE_HEAD: "สูงกว่าหัว",
};

// สิ่งที่ต้องการ 10 อย่าง + OTHER
export const Need = {
  BOAT: "BOAT",
  FOOD_WATER: "FOOD_WATER",
  MEDICINE: "MEDICINE",
  WHEELCHAIR_EQUIPMENT: "WHEELCHAIR_EQUIPMENT",
  POWER_GENERATOR: "POWER_GENERATOR",
  BABY_SUPPLIES: "BABY_SUPPLIES",
  PET_RESCUE: "PET_RESCUE",
  CLOTHES: "CLOTHES",
  PSYCHOLOGICAL_SUPPORT: "PSYCHOLOGICAL_SUPPORT",
  COMMUNICATION: "COMMUNICATION",
  OTHER: "OTHER",
} as const;
export type Need = (typeof Need)[keyof typeof Need];

export const needLabel: Record<Need, string> = {
  BOAT: "เรือ/ยานพาหนะ",
  FOOD_WATER: "อาหารและน้ำดื่ม",
  MEDICINE: "ยาและอุปกรณ์การแพทย์",
  WHEELCHAIR_EQUIPMENT: "อุปกรณ์ช่วยเหลือผู้พิการ",
  POWER_GENERATOR: "เครื่องปั่นไฟ",
  BABY_SUPPLIES: "ของใช้เด็กอ่อน",
  PET_RESCUE: "ช่วยเหลือสัตว์เลี้ยง",
  CLOTHES: "เสื้อผ้า",
  PSYCHOLOGICAL_SUPPORT: "การดูแลด้านจิตใจ",
  COMMUNICATION: "อุปกรณ์สื่อสาร",
  OTHER: "อื่นๆ (ระบุ)",
};
