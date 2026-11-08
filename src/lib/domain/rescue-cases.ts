import type { CaseStatus } from "./case-status";
import { GPS_MAX_ACCEPTABLE_ACCURACY_M, LocationSource } from "./geo";

// ── รายการเคสสำหรับกู้ภัย (TF-23) — กติกาเดียวกับ list_rescue_cases() ในฐานข้อมูล ──

export const RescueCaseSort = {
  PRIORITY: "PRIORITY",
  DISTANCE: "DISTANCE",
  WAITING: "WAITING",
} as const;
export type RescueCaseSort = (typeof RescueCaseSort)[keyof typeof RescueCaseSort];

export const rescueCaseSortLabel: Record<RescueCaseSort, string> = {
  PRIORITY: "เร่งด่วนก่อน",
  DISTANCE: "ใกล้ก่อน",
  WAITING: "รอนานก่อน",
};

// สถานะที่ยังไม่ปิด (รายการเคสแสดงเฉพาะสถานะเหล่านี้) — คำสำหรับฝั่งกู้ภัย
export const openCaseStatusLabel: Partial<Record<CaseStatus, string>> = {
  NEW: "รอรับเคส",
  ACCEPTED: "รับเคสแล้ว",
  EN_ROUTE: "กำลังเดินทาง",
  ON_SITE: "ถึงจุดเกิดเหตุ",
};

// ฐานข้อมูลรับเฉพาะ 3 ค่านี้ (null = ทั้งหมด)
export const RESCUE_RADIUS_OPTIONS_M = [5000, 10000, 20000] as const;
export type RescueRadiusM = (typeof RESCUE_RADIUS_OPTIONS_M)[number];

// ฐานข้อมูลส่งกลับครั้งละไม่เกินนี้ แล้วกด "โหลดเพิ่ม"
export const RESCUE_CASE_PAGE_SIZE = 100;

// รอกดรับเกินนี้ เวลารอเปลี่ยนเป็นสีแดง
export const LONG_WAIT_MS = 60 * 60 * 1000;

/** "รอมาแล้ว 2 ชม. 15 นาที" — ใช้กับเคสที่ยังไม่มีคนรับ */
export function formatWaitDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  if (totalMinutes < 1) return "รอมาแล้วไม่ถึง 1 นาที";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `รอมาแล้ว ${minutes} นาที`;
  return minutes === 0 ? `รอมาแล้ว ${hours} ชม.` : `รอมาแล้ว ${hours} ชม. ${minutes} นาที`;
}

export function isLongWait(ms: number): boolean {
  return ms > LONG_WAIT_MS;
}

/** ระยะทาง: ไม่ถึง 1 กม. เป็นเมตร, ไม่ถึง 10 กม. ทศนิยม 1 ตำแหน่ง, ไกลกว่านั้นจำนวนเต็ม */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} ม.`;
  return `${formatKm(meters)} กม.`;
}

// toFixed ปัด 0.35 เป็น 0.3 (ทศนิยมแบบ float) จึงปัดเองด้วย Math.round
function formatKm(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? (Math.round(km * 10) / 10).toFixed(1) : String(Math.round(km));
}

// GPS คลาดเกินนี้ขึ้นป้ายเตือนบนรายการเคส (เท่ากับเกณฑ์เตือนในฟอร์ม SOS ขั้นที่ 2)
export const RESCUE_ACCURACY_WARN_M = 100;

export type LocationAccuracyWarning = {
  // danger = คลาดเกิน 1,000 ม. ต้องโทรยืนยันก่อนออก
  level: "warn" | "danger";
  text: string;
};

export const SMS_LOCATION_LABEL = "พิกัดจาก SMS";

/**
 * ป้ายเตือนพิกัดไม่แม่น (TF-23 ใช้ข้อมูลจาก TF-65)
 * พิกัดจาก GPS ดูจากค่าความคลาดเคลื่อน — ปักเอง/วางลิงก์ไม่มีค่าความคลาดเคลื่อน
 * พิกัดจาก SMS (TF-36) ขึ้นป้ายเสมอ เพราะอาจพิมพ์เองและไม่รู้ว่าแม่นแค่ไหน
 */
export function locationAccuracyWarning(
  source: string | null | undefined,
  accuracyM: number | null | undefined,
): LocationAccuracyWarning | null {
  if (source === LocationSource.SMS) return { level: "warn", text: SMS_LOCATION_LABEL };
  if (source !== LocationSource.GPS || typeof accuracyM !== "number") return null;
  if (accuracyM <= RESCUE_ACCURACY_WARN_M) return null;
  const text = `พิกัดคลาดได้ ~${formatKm(accuracyM)} กม.`;
  return accuracyM > GPS_MAX_ACCEPTABLE_ACCURACY_M
    ? { level: "danger", text: `${text} · โทรยืนยันตำแหน่งก่อนออก` }
    : { level: "warn", text };
}
