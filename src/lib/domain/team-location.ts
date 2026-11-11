// ── TF-28 แชร์ตำแหน่งกู้ภัย (โหมดปฏิบัติงาน): กติกาส่งตำแหน่งและการแสดงหมุดทีม ──

/** ขยับเกินเท่านี้ (เมตร) จึงส่งใหม่ */
export const TEAM_LOCATION_MIN_MOVE_M = 20;
/** ส่งไม่ถี่กว่านี้ */
export const TEAM_LOCATION_MIN_INTERVAL_MS = 15_000;
/** ไม่ขยับแต่ส่งยืนยันว่ายังเปิดโหมดอยู่ทุกเท่านี้ — ไม่งั้นคนที่ยืนนิ่งจะกลายเป็นหมุดจางหลัง 2 นาที */
export const TEAM_LOCATION_HEARTBEAT_MS = 60_000;
/** ค่าที่คลาดเกินนี้ไม่ส่ง (ตรงกับ share_my_location ในฐานข้อมูล) */
export const TEAM_LOCATION_MAX_ACCURACY_M = 1_000;
/** ไม่อัปเดตเกินนี้ แสดงหมุดสีจาง */
export const TEAM_LOCATION_STALE_MS = 2 * 60_000;
/** ไม่อัปเดตเกินนี้ ไม่แสดง (ฐานข้อมูลก็ไม่ส่งมาให้) */
export const TEAM_LOCATION_HIDE_MS = 15 * 60_000;

/** หน้าที่เปิดโหมดปฏิบัติงานได้ — สลับระหว่างหน้าเหล่านี้ยังส่งต่อ ออกไปหน้าอื่นหยุด */
export const LOCATION_SHARING_PATHS = ["/rescue/map", "/rescue/my-tasks"] as const;

export function isLocationSharingPath(pathname: string | null | undefined): boolean {
  return LOCATION_SHARING_PATHS.some((path) => pathname === path);
}

export type LocationFix = { lat: number; lng: number; accuracyM: number };
export type SentLocation = LocationFix & { sentAt: number };

/** ระยะทางบนพื้นโลก (เมตร) แบบ haversine */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type SendDecision =
  { send: true } | { send: false; reason: "INACCURATE" | "TOO_SOON" | "NOT_MOVED" };

/**
 * ควรส่งค่านี้ไหม — best คือค่าที่แม่นที่สุดของรอบนี้ (เลือกด้วย isBetterFix ของ TF-67)
 * ครั้งแรกส่งทันที · ต่อจากนั้นต้องห่างจากครั้งก่อน ≥ 15 วินาที และขยับเกิน 20 ม.
 * (ยืนนิ่งนานเกิน 60 วินาทีส่งค่าเดิมซ้ำ ให้คนอื่นรู้ว่ายังเปิดโหมดอยู่)
 */
export function decideLocationSend(
  best: LocationFix,
  lastSent: SentLocation | null,
  now: number,
): SendDecision {
  if (!Number.isFinite(best.accuracyM) || best.accuracyM > TEAM_LOCATION_MAX_ACCURACY_M) {
    return { send: false, reason: "INACCURATE" };
  }
  if (!lastSent) return { send: true };
  if (now - lastSent.sentAt < TEAM_LOCATION_MIN_INTERVAL_MS)
    return { send: false, reason: "TOO_SOON" };
  if (
    distanceMeters(lastSent, best) <= TEAM_LOCATION_MIN_MOVE_M &&
    now - lastSent.sentAt < TEAM_LOCATION_HEARTBEAT_MS
  ) {
    return { send: false, reason: "NOT_MOVED" };
  }
  return { send: true };
}

export type TeamPinState = "fresh" | "stale" | "hidden";

/** สถานะหมุดทีมตามเวลาที่อัปเดตล่าสุด */
export function teamPinState(recordedAt: string | Date, now: number): TeamPinState {
  const age = now - new Date(recordedAt).getTime();
  if (age > TEAM_LOCATION_HIDE_MS) return "hidden";
  if (age > TEAM_LOCATION_STALE_MS) return "stale";
  return "fresh";
}

/** "อัปเดตเมื่อสักครู่" / "อัปเดต 3 นาทีที่แล้ว" */
export function teamPinAgeLabel(recordedAt: string | Date, now: number): string {
  const minutes = Math.floor((now - new Date(recordedAt).getTime()) / 60_000);
  return minutes < 1 ? "อัปเดตเมื่อสักครู่" : `อัปเดต ${minutes} นาทีที่แล้ว`;
}
