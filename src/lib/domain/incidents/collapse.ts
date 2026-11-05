import { IncidentType, UnitCapability, type IncidentDefinition } from "./types";

export const collapse: IncidentDefinition = {
  code: IncidentType.COLLAPSE,
  label: { th: "อาคารถล่ม / ติดใต้ซาก" },
  icon: "Building2",
  capabilities: [UnitCapability.EXTRICATION, UnitCapability.EMS],
  // TODO(TF-54): คำถาม สัญญาณอันตราย ความต้องการ และคำแนะนำ ต้องมาจากแหล่งทางการ
  // (สพฉ., ปภ., กรมควบคุมโรค) และมีคนตรวจก่อน ห้ามเขียนเอง — ฟอร์มยังเลือกประเภทนี้ไม่ได้จนกว่าจะเสร็จ
  questions: [],
  dangerSigns: [],
  needs: [],
  waitingAdvice: [],
};
