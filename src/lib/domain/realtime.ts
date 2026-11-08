import { UserRole } from "./roles";

// ── TF-27: อัปเดตแบบเรียลไทม์สำหรับฝั่งกู้ภัย/แอดมิน ──────────────────────

/** รอบดึงข้อมูลสำรองเมื่อ Realtime ใช้งานไม่ได้ / โควตาเต็ม / ถูกปิด (15 วินาที) */
export const RESCUE_POLL_INTERVAL_MS = 15_000;

/** คูลดาวน์รวม event postgres_changes ที่มาติดๆ กัน (event แรกยิงทันทีใน 0ms, event ถัดไปใน 250ms ถูกรวมเป็นรอบเดียว) */
export const RESCUE_REALTIME_DEBOUNCE_MS = 250;

/** เวลารอสูงสุดของการเชื่อมต่อ Realtime รอบแรก ก่อนสลับเข้าโหมดดึงข้อมูลสำรอง */
export const RESCUE_REALTIME_CONNECT_TIMEOUT_MS = 15_000;

const DISABLED_FLAG_VALUES = new Set(["false", "0", "off", "no"]);

/**
 * อนุญาตให้เชื่อมต่อ Supabase Realtime เฉพาะฝั่งกู้ภัยและแอดมินเท่านั้น
 * ผู้แจ้ง (USER) และผู้ไม่ล็อกอิน (null/undefined) ต้องไม่เปิด WebSocket Realtime เลย เพื่อไม่แย่งโควตา
 */
export function canUseRealtime(role: UserRole | null | undefined): boolean {
  return role === UserRole.RESCUER || role === UserRole.UNIT_LEAD || role === UserRole.ADMIN;
}

/**
 * ตรวจ kill switch จาก NEXT_PUBLIC_REALTIME_ENABLED (ค่าเริ่มต้น = เปิดใช้งาน)
 * หากตั้งเป็น "false" / "0" / "off" / "no" จะไม่เปิด Realtime WebSocket ทั้งระบบและใช้การดึงทุก 15 วิแทน
 */
export function isRealtimeEnabled(raw = process.env.NEXT_PUBLIC_REALTIME_ENABLED): boolean {
  if (!raw) return true;
  return !DISABLED_FLAG_VALUES.has(raw.trim().toLowerCase());
}
