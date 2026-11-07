import { canUnitHandle, UnitCapability, type IncidentType } from "../../lib/domain";

// TF-34: เคสแดงหนึ่งเคสแจ้งได้ไม่เกิน 10 คน ไม่เกินหน่วยละ 2 คน (โควตา LINE ฟรีมีจำกัด)
export const RED_ALERT_MAX_RECIPIENTS = 10;
export const RED_ALERT_MAX_PER_UNIT = 2;

export type RedAlertCandidate = { unit_id: string; capabilities: string[]; user_id: string };

const known = new Set<string>(Object.values(UnitCapability));

/**
 * คัดผู้รับแจ้งเคสแดงจากรายชื่อที่ฐานข้อมูลส่งมา (เรียงตามลำดับที่ต้องการแล้ว)
 * ส่งเฉพาะหน่วยที่ canUnitHandle() ผ่าน ยกเว้นหน่วยที่ยังไม่ได้ตั้งความสามารถเลย = รับแจ้งทุกประเภท
 * (ข้อยกเว้นนี้ใช้เฉพาะการแจ้งเตือน — ตัวกรองหน้ารายการเคสยังใช้ canUnitHandle() ตามเดิม)
 */
export function selectRedAlertRecipients(
  incidentType: IncidentType,
  candidates: readonly RedAlertCandidate[],
  limits = { max: RED_ALERT_MAX_RECIPIENTS, perUnit: RED_ALERT_MAX_PER_UNIT },
): string[] {
  const perUnit = new Map<string, number>();
  const picked: string[] = [];
  for (const candidate of candidates) {
    if (picked.length >= limits.max) break;
    if (picked.includes(candidate.user_id)) continue;
    const capabilities = candidate.capabilities.filter((c): c is UnitCapability => known.has(c));
    const notConfigured = candidate.capabilities.length === 0;
    if (!notConfigured && !canUnitHandle(incidentType, capabilities)) continue;
    const used = perUnit.get(candidate.unit_id) ?? 0;
    if (used >= limits.perUnit) continue;
    perUnit.set(candidate.unit_id, used + 1);
    picked.push(candidate.user_id);
  }
  return picked;
}

/** หน่วยที่ยังไม่ได้ตั้งความสามารถเลย (ไม่มีแถวใน unit_capabilities) — ใช้ขึ้นแถบเตือนบนหน้า /unit */
export function unitsWithoutCapabilities<T extends { id: string }>(
  units: readonly T[],
  capabilityRows: readonly { unit_id: string }[],
): T[] {
  const configured = new Set(capabilityRows.map((row) => row.unit_id));
  return units.filter((unit) => !configured.has(unit.id));
}
