import { IncidentType, UnitCapability, type IncidentDefinition } from "./types";

export const roadAccident: IncidentDefinition = {
  code: IncidentType.ROAD_ACCIDENT,
  label: { th: "อุบัติเหตุทางถนน" },
  icon: "CarFront",
  capabilities: [UnitCapability.EMS, UnitCapability.EXTRICATION],
  // TODO(TF-54): คำถาม สัญญาณอันตราย ความต้องการ และคำแนะนำ ต้องมาจากแหล่งทางการ
  // (สพฉ., ปภ., กรมควบคุมโรค) และมีคนตรวจก่อน ห้ามเขียนเอง — ฟอร์มยังเลือกประเภทนี้ไม่ได้จนกว่าจะเสร็จ
  questions: [],
  dangerSigns: [],
  needs: [],
  waitingAdvice: [],
};
