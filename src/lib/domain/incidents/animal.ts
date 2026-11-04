import { IncidentType, UnitCapability, type IncidentDefinition } from "./types";

export const animal: IncidentDefinition = {
  code: IncidentType.ANIMAL,
  label: { th: "สัตว์อันตราย" },
  icon: "PawPrint",
  capabilities: [UnitCapability.ANIMAL_CAPTURE],
  // TODO(TF-54): คำถาม สัญญาณอันตราย ความต้องการ และคำแนะนำ ต้องมาจากแหล่งทางการ
  // (สพฉ., ปภ., กรมควบคุมโรค) และมีคนตรวจก่อน ห้ามเขียนเอง — ฟอร์มยังเลือกประเภทนี้ไม่ได้จนกว่าจะเสร็จ
  questions: [],
  dangerSigns: [],
  needs: [],
  waitingAdvice: [],
};
