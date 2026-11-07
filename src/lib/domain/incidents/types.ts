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

export interface QuestionCondition {
  /** key ของคำถามอื่นที่คำถามนี้ขึ้นอยู่กับ */
  key: string;
  /** ค่าที่ตรงกับเงื่อนไขเพื่อให้คำถามนี้แสดง (ค่าเดี่ยว หรือ array ของค่าที่ยอมรับ) */
  value: string | boolean | number | readonly (string | boolean | number)[];
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
  /** เงื่อนไขในการแสดงคำถามย่อยนี้ (ถ้ามี) */
  dependsOn?: QuestionCondition;
}

export type IncidentQuestion =
  | (QuestionBase & {
      kind: "choice";
      options: { value: string; label: LocalizedText }[];
      /** true = ผู้ใช้เลือกได้มากกว่า 1 ตัวเลือก (เก็บเป็น string[]) */
      multiple?: boolean;
    })
  | (QuestionBase & { kind: "number"; min: number; max: number })
  | (QuestionBase & { kind: "boolean" })
  | (QuestionBase & { kind: "text"; maxLength: number; placeholder?: LocalizedText });

/**
 * ตรวจว่าคำถามนี้ควรแสดงในแบบฟอร์มหรือไม่ ตามเงื่อนไข dependsOn และคำตอบที่มี
 */
export function isQuestionVisible(
  q: IncidentQuestion,
  answers: Record<string, unknown>,
): boolean {
  if (!q.dependsOn) return true;
  const target = answers[q.dependsOn.key];
  if (target === undefined || target === null) return false;

  const expected = q.dependsOn.value;
  if (Array.isArray(expected)) {
    if (Array.isArray(target)) {
      return expected.some((v) => target.includes(v));
    }
    return expected.includes(target as string | boolean | number);
  }

  if (Array.isArray(target)) {
    return target.includes(expected);
  }

  return target === expected;
}

/** สัญญาณอันตราย — ผู้แจ้งตอบว่าใช่แล้วขึ้นแถบโทรสายด่วนทันที (TF-50) */
export interface DangerSign {
  key: string;
  label: LocalizedText;
  /** ที่มาของข้อมูล (แหล่งทางการ) — TF-54 บังคับให้มีทุกข้อ */
  source: string;
}

/** ที่มาของสัญญาณอันตรายชุดแรก: ตารางกติกาในการ์ด TF-55 (อ้างอิง CBD สพฉ. ในเอกสารสถาปัตยกรรม) */
export const TF55_TRIAGE_TABLE_SOURCE =
  "ตารางกติกา TF-55 (เอกสารสถาปัตยกรรม อ้างอิง CBD สพฉ.) — รอตรวจกับต้นฉบับใน TF-54";

/**
 * สัญญาณอันตรายที่ใช้กับทุกประเภทเหตุ (คู่มือปฏิบัติการแจ้งเหตุ 1669 สพฉ.)
 * แต่ละประเภทเหตุเพิ่มสัญญาณเฉพาะของตัวเองต่อท้าย เช่น น้ำท่วม = มีคนอยู่ในน้ำ
 */
export const UNIVERSAL_DANGER_SIGNS: readonly DangerSign[] = [
  {
    key: "UNCONSCIOUS",
    label: { th: "มีคนหมดสติ" },
    source: "https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf",
  },
  {
    key: "ABNORMAL_BREATHING",
    label: { th: "มีคนหายใจผิดปกติ" },
    source: "https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf",
  },
  {
    key: "SEVERE_BLEEDING",
    label: { th: "มีคนเลือดออกมาก" },
    source: "https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf",
  },
  {
    key: "CHEST_PAIN",
    label: { th: "มีคนเจ็บหน้าอก" },
    source: "https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf",
  },
];

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
  // TF-55 & TF-51: คำตอบเรื่องสุขภาพที่ใช้คำนวณระดับและคำถามเฉพาะประเภท เก็บใน case_sensitive_details เท่านั้น
  "dangerSigns",
  "hasDisabled",
  "hasInjured",
  "injuredCount",
  "symptomGroup",
  "hasChronicCondition",
  "hasBittenOrStung",
] as const;
