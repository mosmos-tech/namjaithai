import { GPS_REFINE_MAX_WAIT_MS, GPS_TARGET_ACCURACY_M } from "../../lib/domain";

export type GpsFix = { latitude: number; longitude: number; accuracy: number };

export type GpsRefineError = "PERMISSION_DENIED" | "POSITION_UNAVAILABLE" | "TIMEOUT";

type GeolocationLike = Pick<Geolocation, "watchPosition" | "clearWatch">;

/** ค่าใหม่ดีกว่าค่าเดิมไหม (คลาดเคลื่อนน้อยกว่า) — ค่าแย่ลงไม่ทับค่าดี ตัวเลขบนจอจึงลดลงอย่างเดียว */
export function isBetterFix(best: GpsFix | null, next: GpsFix): boolean {
  return Number.isFinite(next.accuracy) && (best === null || next.accuracy < best.accuracy);
}

/**
 * หาตำแหน่ง GPS ให้แม่นที่สุดภายในเวลาที่กำหนด (TF-67)
 * - watchPosition ความแม่นยำสูง ไม่ใช้ค่าเก่าในแคช
 * - ได้ ≤ 100 ม. รับทันที / ไม่งั้นรอ 15 วินาทีนับจากค่าแรก (หรือ error แรก) แล้วใช้ค่าที่ดีที่สุด
 *   ไม่นับเวลาที่ผู้ใช้อ่านหน้าต่างขออนุญาตตำแหน่ง
 * - ไม่อนุญาตตำแหน่ง = จบทันที; error อื่นระหว่างรอไม่ล้ม รอค่าถัดไปจนหมดเวลา
 * คืนฟังก์ชันหยุด (เรียกตอนผู้แจ้งปักเองหรือออกจากขั้นนี้ กันแบตหมด)
 */
export function startGpsRefine(params: {
  geolocation: GeolocationLike;
  onProgress: (best: GpsFix) => void;
  onDone: (best: GpsFix) => void;
  onError: (error: GpsRefineError) => void;
  targetAccuracyM?: number;
  maxWaitMs?: number;
}): () => void {
  const {
    geolocation,
    onProgress,
    onDone,
    onError,
    targetAccuracyM = GPS_TARGET_ACCURACY_M,
    maxWaitMs = GPS_REFINE_MAX_WAIT_MS,
  } = params;
  let best: GpsFix | null = null;
  let lastError: GpsRefineError = "TIMEOUT";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let watchId: number | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (watchId !== null) geolocation.clearWatch(watchId);
    if (timer !== null) clearTimeout(timer);
  };

  const finish = () => {
    const result = best;
    stop();
    if (result) onDone(result);
    else onError(lastError);
  };

  // เริ่มนับเวลาเมื่อเบราว์เซอร์ตอบครั้งแรก (ผู้ใช้กดอนุญาตแล้ว)
  const startTimer = () => {
    if (timer === null) timer = setTimeout(finish, maxWaitMs);
  };

  const id = geolocation.watchPosition(
    (position) => {
      if (stopped) return;
      startTimer();
      const fix: GpsFix = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      if (!isBetterFix(best, fix)) return;
      best = fix;
      if (fix.accuracy <= targetAccuracyM) finish();
      else onProgress(fix);
    },
    (error) => {
      if (stopped) return;
      if (error.code === error.PERMISSION_DENIED) {
        stop();
        onError("PERMISSION_DENIED");
        return;
      }
      lastError = error.code === error.TIMEOUT ? "TIMEOUT" : "POSITION_UNAVAILABLE";
      startTimer();
    },
    { enableHighAccuracy: true, maximumAge: 0 },
  );
  // ถ้าจบไปแล้วระหว่างเรียก watchPosition (callback ทำงานทันที) ต้องหยุด watch ที่เพิ่งได้ id มาด้วย
  if (stopped) geolocation.clearWatch(id);
  else watchId = id;

  return stop;
}

/** iPhone / iPad (รวม iPad ที่บอกตัวเองว่าเป็น Mac) — ใช้ขึ้นคำแนะนำเปิด "ตำแหน่งที่แม่นยำ" */
export function isIosDevice(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">) {
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}
