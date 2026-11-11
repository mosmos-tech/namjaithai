import { decideLocationSend, TEAM_LOCATION_MIN_INTERVAL_MS, type SentLocation } from "@/lib/domain";
import { isBetterFix, type GpsFix } from "@/features/sos/gps-refine";

/**
 * TF-28 ตัวส่งตำแหน่งของโหมดปฏิบัติงาน (ไม่ผูกกับ React — ทดสอบด้วย fake geolocation/timer ได้)
 * - watchPosition ความแม่นยำสูง เก็บค่าที่แม่นที่สุดของรอบ 15 วินาที (isBetterFix ของ TF-67)
 * - ส่งตาม decideLocationSend: ครั้งแรกทันที, ขยับเกิน 20 ม. และไม่ถี่กว่า 15 วินาที, คลาดเกิน 1 กม. ไม่ส่ง
 * - Wake Lock กันจอดับ (ขอใหม่ทุกครั้งที่กลับมาที่หน้า) ไม่รองรับ = บอกให้เปิดจอค้างไว้
 * - stop(): หยุด watch/timer/wake lock แล้วสั่งลบแถวในฐานข้อมูล (ไม่เก็บพิกัดสุดท้าย)
 */

export type SharingError = "PERMISSION_DENIED" | "POSITION_UNAVAILABLE" | "NOT_ALLOWED";
export type WakeLockState = "active" | "unsupported" | null;

export type SharingStatus = {
  active: boolean;
  error: SharingError | null;
  wakeLock: WakeLockState;
  /** ค่าล่าสุดคลาดเกิน 1 กม. ยังไม่ได้ส่ง */
  inaccurate: boolean;
  lastSentAt: number | null;
};

export const SHARING_OFF: SharingStatus = {
  active: false,
  error: null,
  wakeLock: null,
  inaccurate: false,
  lastSentAt: null,
};

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

export type LocationSharingDeps = {
  geolocation: Pick<Geolocation, "watchPosition" | "clearWatch">;
  wakeLock: WakeLockLike | undefined;
  /** บันทึกตำแหน่ง — คืน "NOT_ALLOWED" ถ้าเซิร์ฟเวอร์ไม่ยอม (ไม่มีหน่วย) */
  send: (fix: {
    lat: number;
    lng: number;
    accuracyM: number;
  }) => Promise<"SAVED" | "TOO_SOON" | "NOT_ALLOWED">;
  /** ลบแถวของตัวเอง */
  stopRemote: () => Promise<void>;
  onStatus: (status: SharingStatus) => void;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
};

export type LocationSharing = {
  start: () => void;
  stop: () => Promise<void>;
  /** หน้ากลับมาแสดง: ขอ wake lock ใหม่ (เบราว์เซอร์ปล่อยเองตอนสลับแอป) */
  handleVisible: () => void;
  isActive: () => boolean;
};

export function createLocationSharing(deps: LocationSharingDeps): LocationSharing {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearTimer = deps.clearInterval ?? ((id: unknown) => clearInterval(id as number));

  let status: SharingStatus = SHARING_OFF;
  let watchId: number | null = null;
  let timer: unknown = null;
  let wakeSentinel: WakeLockSentinelLike | null = null;
  let best: (GpsFix & { at: number }) | null = null;
  // ค่าล่าสุดที่ได้ (ไว้ส่งยืนยันตอนยืนนิ่ง หลังส่งไปแล้ว best ถูกล้าง)
  let latest: (GpsFix & { at: number }) | null = null;
  let lastSent: SentLocation | null = null;
  let sending = false;

  const update = (patch: Partial<SharingStatus>) => {
    status = { ...status, ...patch };
    deps.onStatus(status);
  };

  async function requestWakeLock() {
    if (!deps.wakeLock) {
      update({ wakeLock: "unsupported" });
      return;
    }
    try {
      const sentinel = await deps.wakeLock.request("screen");
      if (!status.active) {
        void sentinel.release();
        return;
      }
      wakeSentinel = sentinel;
      update({ wakeLock: "active" });
    } catch {
      // เบราว์เซอร์ปฏิเสธ (เช่น ประหยัดแบต) — ผลเหมือนไม่รองรับ ผู้ใช้ต้องเปิดจอค้างเอง
      update({ wakeLock: "unsupported" });
    }
  }

  async function evaluate() {
    const candidate = best ?? latest;
    if (!status.active || !candidate || sending) return;
    const fix = {
      lat: candidate.latitude,
      lng: candidate.longitude,
      accuracyM: candidate.accuracy,
    };
    const decision = decideLocationSend(fix, lastSent, now());
    update({ inaccurate: !decision.send && decision.reason === "INACCURATE" });
    if (!decision.send) return;
    sending = true;
    try {
      const result = await deps.send(fix);
      if (!status.active) return;
      if (result === "NOT_ALLOWED") {
        update({ error: "NOT_ALLOWED" });
        await stop();
        return;
      }
      const sentAt = now();
      lastSent = { ...fix, sentAt };
      best = null;
      update({ lastSentAt: sentAt });
    } catch {
      // เน็ตหลุด: ไม่ถือว่าส่งแล้ว รอบหน้าลองใหม่
    } finally {
      sending = false;
    }
  }

  function start() {
    if (status.active) return;
    best = null;
    latest = null;
    lastSent = null;
    update({ ...SHARING_OFF, active: true });
    void requestWakeLock();
    watchId = deps.geolocation.watchPosition(
      (position) => {
        if (!status.active) return;
        const fix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          at: now(),
        };
        // ค่าที่แม่นที่สุดของรอบนี้ — ค่าที่เก่ากว่า 1 รอบทิ้ง (คนขยับไปแล้ว)
        latest = fix;
        if (!best || now() - best.at >= TEAM_LOCATION_MIN_INTERVAL_MS || isBetterFix(best, fix)) {
          best = fix;
        }
        void evaluate();
      },
      (error) => {
        if (!status.active) return;
        if (error.code === error.PERMISSION_DENIED) {
          update({ error: "PERMISSION_DENIED" });
          void stop();
        } else {
          update({ error: "POSITION_UNAVAILABLE" });
        }
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    // ยืนนิ่ง watchPosition อาจไม่ส่งค่าใหม่ — ตรวจทุกรอบเพื่อส่งยืนยันว่ายังเปิดโหมดอยู่
    timer = setTimer(() => void evaluate(), TEAM_LOCATION_MIN_INTERVAL_MS);
  }

  async function stop() {
    const wasActive = status.active;
    if (watchId !== null) deps.geolocation.clearWatch(watchId);
    watchId = null;
    if (timer !== null) clearTimer(timer);
    timer = null;
    const sentinel = wakeSentinel;
    wakeSentinel = null;
    if (sentinel) void sentinel.release().catch(() => undefined);
    best = null;
    latest = null;
    lastSent = null;
    update({ ...SHARING_OFF, error: status.error });
    if (wasActive) await deps.stopRemote().catch(() => undefined);
  }

  return {
    start,
    stop,
    handleVisible: () => {
      // เบราว์เซอร์ปล่อย wake lock เองตอนสลับแอป/จอดับ — ขอใหม่ทุกครั้งที่กลับมา
      if (!status.active || !deps.wakeLock) return;
      const old = wakeSentinel;
      wakeSentinel = null;
      if (old) void old.release().catch(() => undefined);
      void requestWakeLock();
    },
    isActive: () => status.active,
  };
}
