import { IncidentType, UnitCapability, type IncidentDefinition } from "./types";

export const fire: IncidentDefinition = {
  code: IncidentType.FIRE,
  label: { th: "ไฟไหม้" },
  icon: "Flame",
  capabilities: [UnitCapability.FIRE_SUPPRESSION, UnitCapability.EMS],
  // TODO(TF-54): คำถาม สัญญาณอันตราย ความต้องการ และคำแนะนำ ต้องมาจากแหล่งทางการ
  // (สพฉ., ปภ., กรมควบคุมโรค) และมีคนตรวจก่อน ห้ามเขียนเอง — ฟอร์มยังเลือกประเภทนี้ไม่ได้จนกว่าจะเสร็จ
  questions: [],
  dangerSigns: [],
  needs: [],
  waitingAdvice: [],
};
