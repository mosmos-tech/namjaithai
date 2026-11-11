import { describe, expect, it, vi } from "vitest";
import { createLocationSharing, type SharingStatus } from "../location-sharing";

/** geolocation/wake lock/timer ปลอม ให้ทดสอบตัวส่งตำแหน่งได้โดยไม่ต้องใช้เบราว์เซอร์ (TF-28) */
function setup(
  options: { wakeLock?: boolean; sendResult?: "SAVED" | "TOO_SOON" | "NOT_ALLOWED" } = {},
) {
  let clock = 0;
  let onPosition: PositionCallback = () => {};
  let onError: PositionErrorCallback | null | undefined = null;
  let tick: (() => void) | null = null;
  const release = vi.fn(async () => {});
  const geolocation = {
    watchPosition: vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
      onPosition = success;
      onError = error;
      return 7;
    }),
    clearWatch: vi.fn(),
  };
  const send = vi.fn(async () => options.sendResult ?? ("SAVED" as const));
  const stopRemote = vi.fn(async () => {});
  const statuses: SharingStatus[] = [];
  const sharing = createLocationSharing({
    geolocation,
    wakeLock:
      options.wakeLock === false ? undefined : { request: vi.fn(async () => ({ release })) },
    send,
    stopRemote,
    onStatus: (status) => statuses.push(status),
    now: () => clock,
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });
  const fix = (lat: number, accuracy = 20) =>
    onPosition({ coords: { latitude: lat, longitude: 100.773, accuracy } } as GeolocationPosition);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    sharing,
    geolocation,
    send,
    stopRemote,
    release,
    statuses,
    fix,
    flush,
    advance: (ms: number) => (clock += ms),
    tick: () => tick?.(),
    error: (code: number) =>
      onError?.({
        code,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError),
    last: () => statuses.at(-1)!,
  };
}

describe("TF-28 ตัวส่งตำแหน่ง (โหมดปฏิบัติงาน)", () => {
  it("ค่าแรกส่งทันที ค่าถัดไปภายใน 15 วินาทีไม่ส่ง ครบ 15 วินาทีและขยับเกิน 20 ม. จึงส่ง", async () => {
    const t = setup();
    t.sharing.start();
    t.fix(18.7756);
    await t.flush();
    expect(t.send).toHaveBeenCalledTimes(1);
    t.advance(5_000);
    t.fix(18.7766); // ~110 ม.
    await t.flush();
    expect(t.send).toHaveBeenCalledTimes(1);
    t.advance(10_000);
    t.fix(18.7767);
    await t.flush();
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.last().lastSentAt).toBe(15_000);
  });

  it("ในรอบเดียวกันส่งค่าที่แม่นที่สุด (isBetterFix ของ TF-67)", async () => {
    const t = setup();
    t.sharing.start();
    t.fix(18.7756);
    await t.flush();
    t.advance(3_000);
    t.fix(18.78, 300);
    t.advance(3_000);
    t.fix(18.7801, 15); // แม่นกว่า
    t.advance(3_000);
    t.fix(18.7802, 200); // แย่กว่า ไม่ทับ
    t.advance(6_000);
    t.tick();
    await t.flush();
    expect(t.send).toHaveBeenLastCalledWith({ lat: 18.7801, lng: 100.773, accuracyM: 15 });
  });

  it("คลาดเกิน 1,000 ม. ไม่ส่ง และบอกผู้ใช้", async () => {
    const t = setup();
    t.sharing.start();
    t.fix(18.7756, 3000);
    await t.flush();
    expect(t.send).not.toHaveBeenCalled();
    expect(t.last().inaccurate).toBe(true);
  });

  it("ปิดโหมด: หยุด watch/timer/wake lock แล้วลบแถวในฐานข้อมูล", async () => {
    const t = setup();
    t.sharing.start();
    t.fix(18.7756);
    await t.flush();
    await t.sharing.stop();
    expect(t.geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(t.release).toHaveBeenCalled();
    expect(t.stopRemote).toHaveBeenCalledTimes(1);
    expect(t.last().active).toBe(false);
    // ค่าที่มาช้าหลังปิดแล้วไม่ถูกส่ง
    t.advance(60_000);
    t.fix(18.79);
    await t.flush();
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("ไม่ได้เปิดโหมดอยู่ ปิดซ้ำไม่เรียกฐานข้อมูล", async () => {
    const t = setup();
    await t.sharing.stop();
    expect(t.stopRemote).not.toHaveBeenCalled();
  });

  it("เบราว์เซอร์ไม่มี Wake Lock: บอกให้เปิดจอค้างไว้ แต่ยังส่งตำแหน่งได้", async () => {
    const t = setup({ wakeLock: false });
    t.sharing.start();
    await t.flush();
    expect(t.last().wakeLock).toBe("unsupported");
    t.fix(18.7756);
    await t.flush();
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("ไม่อนุญาตตำแหน่ง → หยุดพร้อมบอกเหตุผล", async () => {
    const t = setup();
    t.sharing.start();
    t.error(1);
    await t.flush();
    expect(t.last()).toMatchObject({ active: false, error: "PERMISSION_DENIED" });
    expect(t.geolocation.clearWatch).toHaveBeenCalled();
  });

  it("เซิร์ฟเวอร์ไม่ยอม (ไม่มีหน่วย) → หยุด", async () => {
    const t = setup({ sendResult: "NOT_ALLOWED" });
    t.sharing.start();
    t.fix(18.7756);
    await t.flush();
    await t.flush();
    expect(t.last()).toMatchObject({ active: false, error: "NOT_ALLOWED" });
  });
});
