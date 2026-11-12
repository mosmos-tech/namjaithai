import { z } from "zod";
import "./zod-locale";
import { CaseStatus } from "./case-status";
import {
  canUnitHandle,
  INCIDENT_REGISTRY,
  UNIT_CAPABILITY_LABELS,
  UnitCapability,
  type IncidentType,
} from "./incidents";

// ── ส่งต่อเคสให้หน่วยอื่น (TF-59) — กติกาตรงกับ request_transfer() / accept_transfer() ในฐานข้อมูล ──

/** ส่งต่อได้เฉพาะตอนทีมถือเคสอยู่ (ฐานข้อมูลเช็กซ้ำใน rls.can_request_transfer) */
export const TRANSFERABLE_CASE_STATUSES: readonly CaseStatus[] = [
  CaseStatus.ACCEPTED,
  CaseStatus.EN_ROUTE,
  CaseStatus.ON_SITE,
];

/** ไม่มีหน่วยกดรับภายในเวลานี้ → เคสกลับเข้าคิว NEW พร้อมแท็กความสามารถ (pg_cron) */
export const CASE_TRANSFER_TIMEOUT_MINUTES = 15;

export const CASE_TRANSFER_REASON_MIN = 5;
export const CASE_TRANSFER_REASON_MAX = 300;

/** ข้อความที่ผู้แจ้งเห็นระหว่างส่งต่อ — ไม่บอกชื่อหน่วยปลายทางจนกว่าจะรับ */
export const REPORTER_TRANSFER_TEXT = "กำลังส่งต่อให้ทีมที่มีอุปกรณ์";

/** ฟอร์มขอส่งต่อ — ใช้ทั้งฟอร์มและ server action (ฐานข้อมูลเช็กซ้ำอีกชั้น) */
export const caseTransferRequestSchema = z.object({
  capabilities: z
    .array(z.enum(UnitCapability))
    .min(1, "กรุณาเลือกอุปกรณ์หรือความสามารถที่ขาดอย่างน้อย 1 อย่าง")
    .transform((list) => [...new Set(list)]),
  reason: z
    .string({ error: "กรุณาระบุเหตุผลที่ส่งต่อ" })
    .trim()
    .min(CASE_TRANSFER_REASON_MIN, `กรุณาระบุเหตุผลอย่างน้อย ${CASE_TRANSFER_REASON_MIN} ตัวอักษร`)
    .max(CASE_TRANSFER_REASON_MAX, `เหตุผลต้องไม่เกิน ${CASE_TRANSFER_REASON_MAX} ตัวอักษร`),
});

export function canTransferStatus(status: CaseStatus): boolean {
  return TRANSFERABLE_CASE_STATUSES.includes(status);
}

/**
 * ความสามารถที่เหตุนี้ต้องใช้แต่หน่วยไม่มี (ใช้เป็นคำแนะนำบนฟอร์ม ไม่เลือกให้อัตโนมัติ)
 * หน่วยผ่าน canUnitHandle() แล้ว = ไม่มีคำแนะนำ (อาจขาดอย่างอื่นที่ทะเบียนเหตุไม่ได้ระบุ)
 */
export function suggestedMissingCapabilities(
  incidentType: IncidentType,
  unitCapabilities: readonly UnitCapability[],
): UnitCapability[] {
  if (canUnitHandle(incidentType, unitCapabilities)) return [];
  return INCIDENT_REGISTRY[incidentType].capabilities.filter((c) => !unitCapabilities.includes(c));
}

export function capabilityListText(capabilities: readonly string[]): string {
  return capabilities.map((c) => UNIT_CAPABILITY_LABELS[c as UnitCapability] ?? c).join(", ");
}

/** ระยะจากหน่วยถึงเคส — หน่วยที่ไม่มีพิกัดใช้จุดกลางอำเภอ/จังหวัด จึงบอกว่าโดยประมาณ */
export function transferDistanceText(distanceM: number | null, isApproximate: boolean): string {
  if (distanceM === null) return "ไม่ทราบระยะทาง";
  const text =
    distanceM < 1000
      ? `${Math.max(0, Math.round(distanceM / 10) * 10)} ม.`
      : `${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} กม.`;
  return isApproximate ? `ประมาณ ${text} (โดยประมาณ จากจุดกลางอำเภอ/จังหวัด)` : text;
}

export type TransferOption = {
  unit_id: string;
  unit_name: string;
  province: string;
  district: string | null;
  distance_m: number | null;
  is_approximate: boolean;
};

export type PendingTransfer = {
  id: string;
  fromUnitName: string;
  toUnitName: string;
  missingCapabilities: UnitCapability[];
  reason: string;
  expiresAt: string;
};

export type IncomingTransfer = {
  transfer_id: string;
  case_id: string;
  case_code: string;
  case_version: number;
  case_status: CaseStatus;
  incident_type: IncidentType;
  urgency: "RED" | "YELLOW" | "GREEN";
  province: string | null;
  district: string | null;
  landmark: string;
  from_unit_name: string;
  to_unit_name: string;
  missing_capabilities: UnitCapability[];
  reason: string;
  expires_at: string;
  created_at: string;
};

export type RequestTransferResult =
  | { status: "REQUESTED"; transferId: string; expiresAt: string }
  | { status: "ALREADY_PENDING" }
  | { status: "STALE"; version: number };

export type AcceptTransferResult =
  | { status: "ACCEPTED"; caseId: string; version: number }
  | { status: "LIMIT"; max: number }
  | { status: "NOT_PENDING"; transferStatus: string | null }
  | { status: "STALE"; version: number };

export type CancelTransferResult =
  { status: "CANCELLED" } | { status: "NOT_PENDING"; transferStatus: string | null };

export function requestTransferMessage(result: RequestTransferResult): string {
  switch (result.status) {
    case "REQUESTED":
      return `ส่งคำขอแล้ว รอหน่วยปลายทางกดรับภายใน ${CASE_TRANSFER_TIMEOUT_MINUTES} นาที ระหว่างนี้คุณยังดูแลเคสนี้อยู่`;
    case "ALREADY_PENDING":
      return "เคสนี้มีคำขอส่งต่อที่รออยู่แล้ว";
    case "STALE":
      return "ข้อมูลเคสเพิ่งเปลี่ยน กรุณาดูรายละเอียดอีกครั้งแล้วส่งใหม่";
  }
}

export function acceptTransferMessage(result: AcceptTransferResult): string {
  switch (result.status) {
    case "ACCEPTED":
      return "รับเคสส่งต่อแล้ว";
    case "LIMIT":
      return `คุณถือเคสอยู่ ${result.max} เคสแล้ว ปิดหรือปล่อยเคสเดิมก่อน`;
    case "NOT_PENDING":
      return result.transferStatus === "accepted"
        ? "มีคนในหน่วยรับเคสนี้ไปแล้ว"
        : "คำขอนี้หมดเวลาหรือถูกยกเลิกแล้ว";
    case "STALE":
      return "ข้อมูลเคสเพิ่งเปลี่ยน กรุณาดูรายละเอียดอีกครั้งแล้วกดรับใหม่";
  }
}

export function cancelTransferMessage(result: CancelTransferResult): string {
  return result.status === "CANCELLED"
    ? "ยกเลิกคำขอส่งต่อแล้ว เคสยังอยู่กับหน่วยของคุณ"
    : "คำขอนี้ไม่ได้รออยู่แล้ว (มีคนรับ หมดเวลา หรือถูกยกเลิก)";
}
