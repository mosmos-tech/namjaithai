import type { Need } from "../enums";

/**
 * ประเภทเหตุ 8 แบบ (TF-49) — รหัสต้องตรงกับตาราง incident_types ในฐานข้อมูล
 * (test ใน __tests__/incidents.test.ts เทียบกับ migration ให้อัตโนมัติ)
 */
export const IncidentType = {
  FLOOD: "FLOOD",
  FIRE: "FIRE",
  ROAD_ACCIDENT: "ROAD_ACCIDENT",
  MEDICAL: "MEDICAL",
  WATER_RESCUE: "WATER_RESCUE",
  COLLAPSE: "COLLAPSE",
  ANIMAL: "ANIMAL",
  OTHER: "OTHER",
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];

/** ความสามารถของหน่วยกู้ภัย — ใช้ร่วมกับตาราง unit_capabilities ของ TF-52 */
export const UnitCapability = {
  BOAT: "BOAT",
  EMS: "EMS",
  FIRE_SUPPRESSION: "FIRE_SUPPRESSION",
  EXTRICATION: "EXTRICATION",
  WATER_RESCUE: "WATER_RESCUE",
  ANIMAL_CAPTURE: "ANIMAL_CAPTURE",
  EVACUATION: "EVACUATION",
} as const;
export type UnitCapability = (typeof UnitCapability)[keyof typeof UnitCapability];

/**
 * ข้อความ 2 ภาษา: ใส่ th ก่อน, en เติมทีหลังตอนทำฟอร์มภาษาอังกฤษ (TF-63)
 */
export interface LocalizedText {
  th: string;
  en?: string;
}

interface QuestionBase {
  /** ชื่อ key ใน cases.details (หรือ case_sensitive_details ถ้า sensitive) */
  key: string;
  label: LocalizedText;
  required: boolean;
  /**
   * true = ข้อมูลสุขภาพ ต้องเก็บใน case_sensitive_details เท่านั้น
   * (เห็นเฉพาะกู้ภัยที่รับเคส หัวหน้าหน่วยนั้น และแอดมิน) ห้ามลง cases.details
   */
  sensitive?: boolean;
}

export type IncidentQuestion =
  | (QuestionBase & {
      kind: "choice";
      options: { value: string; label: LocalizedText }[];
    })
  | (QuestionBase & { kind: "number"; min: number; max: number })
  | (QuestionBase & { kind: "boolean" });

/** สัญญาณอันตราย — ผู้แจ้งตอบว่าใช่แล้วขึ้นแถบโทรสายด่วนทันที (TF-50) */
export interface DangerSign {
  key: string;
  label: LocalizedText;
  /** ที่มาของข้อมูล (แหล่งทางการ) — TF-54 บังคับให้มีทุกข้อ */
  source: string;
}

/** คำแนะนำระหว่างรอทีม (TF-53) */
export interface WaitingAdvice {
  text: LocalizedText;
  source: string;
}

export interface IncidentDefinition {
  code: IncidentType;
  label: LocalizedText;
  /** ชื่อไอคอนใน lucide-react (เช่น "Waves") — เก็บเป็นชื่อเพื่อให้โค้ดกลางไม่ต้อง import React */
  icon: string;
  /** ความสามารถทีมที่เหมาะกับเหตุนี้ (TF-52 canUnitHandle) — ว่าง = หน่วยไหนก็ช่วยได้ */
  capabilities: UnitCapability[];
  questions: IncidentQuestion[];
  dangerSigns: DangerSign[];
  needs: Need[];
  waitingAdvice: WaitingAdvice[];
}

/**
 * key ที่ห้ามอยู่ใน cases.details (ชื่อ เบอร์ ที่อยู่ละเอียด ข้อมูลสุขภาพ)
 * ฐานข้อมูลมี check constraint รายการเดียวกัน — แก้ต้องแก้ทั้งสองที่
 */
export const FORBIDDEN_DETAIL_KEYS = [
  "name",
  "phone",
  "lineId",
  "detailedAddress",
  "health",
] as const;
