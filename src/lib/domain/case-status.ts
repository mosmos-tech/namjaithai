export const CaseStatus = {
  NEW: "NEW",
  ACCEPTED: "ACCEPTED",
  EN_ROUTE: "EN_ROUTE",
  ON_SITE: "ON_SITE",
  RESOLVED: "RESOLVED",
  CANCELLED: "CANCELLED",
  DUPLICATE: "DUPLICATE",
  UNREACHABLE: "UNREACHABLE",
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

// สถานะปลายทาง (ปิดแล้ว เปลี่ยนต่อไม่ได้)
const TERMINAL: ReadonlySet<CaseStatus> = new Set([
  CaseStatus.RESOLVED,
  CaseStatus.CANCELLED,
  CaseStatus.DUPLICATE,
  CaseStatus.UNREACHABLE,
]);

// สถานะที่ปิดเคสได้จากทุกสถานะที่ไม่ใช่ terminal
const CLOSE_TRANSITIONS: ReadonlySet<CaseStatus> = new Set([
  CaseStatus.CANCELLED,
  CaseStatus.DUPLICATE,
  CaseStatus.UNREACHABLE,
]);

// เส้นทางปกติ: เดินหน้าและถอยกลับ NEW ได้
const FORWARD: Record<CaseStatus, CaseStatus[]> = {
  NEW: [CaseStatus.ACCEPTED],
  ACCEPTED: [CaseStatus.EN_ROUTE, CaseStatus.NEW],
  EN_ROUTE: [CaseStatus.ON_SITE, CaseStatus.NEW],
  ON_SITE: [CaseStatus.RESOLVED],
  RESOLVED: [],
  CANCELLED: [],
  DUPLICATE: [],
  UNREACHABLE: [],
};

/**
 * ตรวจว่าเปลี่ยนสถานะจาก `from` → `to` ได้หรือไม่
 * - ห้ามข้ามขั้น เช่น NEW → ON_SITE
 * - ปิดเคส (CANCELLED/DUPLICATE/UNREACHABLE) ได้จากทุกสถานะที่ยังเปิดอยู่
 * - terminal → ไม่สามารถเปลี่ยนได้อีก
 */
export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  if (TERMINAL.has(from)) return false;
  if (CLOSE_TRANSITIONS.has(to)) return true;
  return FORWARD[from].includes(to);
}
