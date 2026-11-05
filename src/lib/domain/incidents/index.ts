import { animal } from "./animal";
import { collapse } from "./collapse";
import { fire } from "./fire";
import { flood } from "./flood";
import { medical } from "./medical";
import { other } from "./other";
import { roadAccident } from "./road-accident";
import { IncidentType, type IncidentDefinition } from "./types";
import { waterRescue } from "./water-rescue";

export * from "./types";
export { FLOOD_DURING_TIPS } from "./flood";

/**
 * ทะเบียนประเภทเหตุ (TF-49) — ที่เดียวที่บอกว่าแต่ละเหตุถามอะไร ต้องใช้ทีมแบบไหน และแนะนำอะไร
 * ฟอร์ม SOS, API, คะแนนความเร่งด่วน และตัวกรองของกู้ภัยอ่านจากที่นี่ ห้ามเขียนรายการซ้ำที่อื่น
 *
 * ประเภทไหนเปิดให้ผู้แจ้งเลือกได้ ดูที่ incident_types.is_enabled ในฐานข้อมูล
 * (ตอนนี้เปิดแค่ FLOOD จนกว่าเนื้อหาของประเภทอื่นจะผ่านการตรวจใน TF-54)
 */
export const INCIDENT_REGISTRY: Record<IncidentType, IncidentDefinition> = {
  FLOOD: flood,
  FIRE: fire,
  ROAD_ACCIDENT: roadAccident,
  MEDICAL: medical,
  WATER_RESCUE: waterRescue,
  COLLAPSE: collapse,
  ANIMAL: animal,
  OTHER: other,
};

/** ลำดับที่แสดงในกริดเลือกประเภท (OTHER อยู่ท้ายเสมอ) — ตรงกับ incident_types.sort_order */
export const INCIDENT_TYPE_ORDER: IncidentType[] = Object.values(IncidentType);
