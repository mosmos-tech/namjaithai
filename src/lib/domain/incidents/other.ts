import { IncidentType, type IncidentDefinition } from "./types";

export const other: IncidentDefinition = {
  code: IncidentType.OTHER,
  label: { th: "เหตุอื่นๆ" },
  icon: "CircleHelp",
  // ไม่ระบุความสามารถ = หน่วยไหนก็ช่วยได้
  capabilities: [],
  // TODO(TF-54): คำถาม สัญญาณอันตราย ความต้องการ และคำแนะนำ ต้องมาจากแหล่งทางการ
  // (สพฉ., ปภ., กรมควบคุมโรค) และมีคนตรวจก่อน ห้ามเขียนเอง — ฟอร์มยังเลือกประเภทนี้ไม่ได้จนกว่าจะเสร็จ
  questions: [],
  dangerSigns: [],
  needs: [],
  waitingAdvice: [],
};
