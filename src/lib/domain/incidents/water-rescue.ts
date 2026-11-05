import { IncidentType, UnitCapability, type IncidentDefinition } from "./types";

export const waterRescue: IncidentDefinition = {
  code: IncidentType.WATER_RESCUE,
  label: { th: "ตกน้ำ / จมน้ำ" },
  icon: "LifeBuoy",
  capabilities: [UnitCapability.WATER_RESCUE, UnitCapability.BOAT, UnitCapability.EMS],
  // TODO(TF-54): คำถาม สัญญาณอันตราย ความต้องการ และคำแนะนำ ต้องมาจากแหล่งทางการ
  // (สพฉ., ปภ., กรมควบคุมโรค) และมีคนตรวจก่อน ห้ามเขียนเอง — ฟอร์มยังเลือกประเภทนี้ไม่ได้จนกว่าจะเสร็จ
  questions: [],
  dangerSigns: [],
  needs: [],
  waitingAdvice: [],
};
