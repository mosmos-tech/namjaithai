import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBetterFix, isIosDevice, startGpsRefine, type GpsFix } from "../gps-refine";

// geolocation ปลอม: ส่งค่า/ error เข้า watchPosition ได้เองตามจังหวะที่ test ต้องการ
function fakeGeolocation() {
  let success: PositionCallback | null = null;
  let failure: PositionErrorCallback | null = null;
  const geolocation = {
    watchPosition: vi.fn(
      // options ตรวจผ่าน mock.calls[0][2]
      (ok: PositionCallback, err?: PositionErrorCallback | null, options?: PositionOptions) => {
        void options;
        success = ok;
        failure = err ?? null;
        return 7;
      },
    ),
    clearWatch: vi.fn(),
  };
  return {
    geolocation,
    fix(accuracy: number, latitude = 13.75, longitude = 100.5) {
      success?.({ coords: { latitude, longitude, accuracy } } as GeolocationPosition);
    },
    fail(code: 1 | 2 | 3) {
      failure?.({
        code,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "",
      } as GeolocationPositionError);
    },
  };
}

function start(geo: ReturnType<typeof fakeGeolocation>) {
  const onProgress = vi.fn<(best: GpsFix) => void>();
  const onDone = vi.fn<(best: GpsFix) => void>();
  const onError = vi.fn();
  const stop = startGpsRefine({ geolocation: geo.geolocation, onProgress, onDone, onError });
  return { stop, onProgress, onDone, onError };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TF-67 เลือกค่าพิกัดที่แม่นที่สุด", () => {
  it("ขอความแม่นยำสูงและไม่ใช้ค่าเก่าในแคช", () => {
    const geo = fakeGeolocation();
    start(geo);
    expect(geo.geolocation.watchPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
    });
  });

  it("ค่าแรก 3000 ม. ตามด้วย 25 ม. → รับ 25 ม. ทันทีแล้วหยุด watch", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    geo.fix(3000);
    expect(r.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ accuracy: 3000 }));
    expect(r.onDone).not.toHaveBeenCalled();
    geo.fix(25);
    expect(r.onDone).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 25 }));
    expect(geo.geolocation.clearWatch).toHaveBeenCalledWith(7);
  });

  it("ค่าที่แย่ลงไม่ทับค่าที่ดีกว่า", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    geo.fix(800);
    geo.fix(2000);
    expect(r.onProgress).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(r.onDone).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 800 }));
  });

  it("ไม่ถึง 100 ม. ภายใน 15 วินาที → ใช้ค่าที่ดีที่สุดที่ได้", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    geo.fix(5000);
    vi.advanceTimersByTime(5_000);
    geo.fix(1600);
    vi.advanceTimersByTime(9_999);
    expect(r.onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(r.onDone).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 1600 }));
    expect(geo.geolocation.clearWatch).toHaveBeenCalled();
  });

  it("ปรับข้อ 1: นับ 15 วินาทีจากค่าแรก ไม่ใช่ตอนกดปุ่ม (เวลาอ่านหน้าต่างขออนุญาตไม่นับ)", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    // ผู้ใช้อ่านหน้าต่างขออนุญาต 60 วินาที ยังไม่มีค่าเข้ามา → ต้องยังไม่จบ
    vi.advanceTimersByTime(60_000);
    expect(r.onDone).not.toHaveBeenCalled();
    expect(r.onError).not.toHaveBeenCalled();
    geo.fix(1500);
    vi.advanceTimersByTime(14_999);
    expect(r.onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(r.onDone).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 1500 }));
  });

  it("ปรับข้อ 1: error แรกก็เริ่มนับ และ error ชั่วคราวไม่ทำให้ล้ม", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    vi.advanceTimersByTime(30_000);
    geo.fail(3);
    expect(r.onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    geo.fix(900);
    vi.advanceTimersByTime(5_000);
    expect(r.onDone).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 900 }));
  });

  it("ครบเวลาแต่ไม่ได้ค่าเลย → แจ้ง error ล่าสุด", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    geo.fail(2);
    vi.advanceTimersByTime(15_000);
    expect(r.onError).toHaveBeenCalledWith("POSITION_UNAVAILABLE");
    expect(r.onDone).not.toHaveBeenCalled();
  });

  it("ไม่อนุญาตตำแหน่ง → จบทันที", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    geo.fail(1);
    expect(r.onError).toHaveBeenCalledWith("PERMISSION_DENIED");
    expect(geo.geolocation.clearWatch).toHaveBeenCalled();
  });

  it("หยุดจากภายนอก (ปักเอง/ออกจากขั้นนี้) แล้วไม่มี callback ตามมา", () => {
    const geo = fakeGeolocation();
    const r = start(geo);
    geo.fix(3000);
    r.stop();
    expect(geo.geolocation.clearWatch).toHaveBeenCalledWith(7);
    geo.fix(20);
    vi.advanceTimersByTime(20_000);
    expect(r.onDone).not.toHaveBeenCalled();
    expect(r.onProgress).toHaveBeenCalledTimes(1);
  });

  it("callback ทำงานทันทีระหว่างเรียก watchPosition ก็ยังหยุด watch ได้", () => {
    const geolocation = {
      watchPosition: vi.fn((ok: PositionCallback) => {
        ok({ coords: { latitude: 1, longitude: 1, accuracy: 10 } } as GeolocationPosition);
        return 9;
      }),
      clearWatch: vi.fn(),
    };
    const onDone = vi.fn();
    startGpsRefine({ geolocation, onProgress: vi.fn(), onDone, onError: vi.fn() });
    expect(onDone).toHaveBeenCalled();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(9);
  });

  it("isBetterFix", () => {
    expect(isBetterFix(null, { latitude: 0, longitude: 0, accuracy: 50 })).toBe(true);
    const best = { latitude: 0, longitude: 0, accuracy: 50 };
    expect(isBetterFix(best, { ...best, accuracy: 60 })).toBe(false);
    expect(isBetterFix(best, { ...best, accuracy: Number.NaN })).toBe(false);
  });

  it("isIosDevice: iPhone และ iPad ที่บอกตัวเองว่าเป็น Mac", () => {
    expect(
      isIosDevice({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Macintosh)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Macintosh)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    expect(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Linux; Android 14)",
        platform: "Linux",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });
});
