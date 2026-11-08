import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatWaitDuration,
  isLongWait,
  locationAccuracyWarning,
  LocationSource,
} from "..";

const min = 60_000;

describe("TF-23 เวลารอ", () => {
  it("แสดงชั่วโมงและนาทีตามการ์ด", () => {
    expect(formatWaitDuration(135 * min)).toBe("รอมาแล้ว 2 ชม. 15 นาที");
    expect(formatWaitDuration(45 * min)).toBe("รอมาแล้ว 45 นาที");
    expect(formatWaitDuration(120 * min)).toBe("รอมาแล้ว 2 ชม.");
    expect(formatWaitDuration(30_000)).toBe("รอมาแล้วไม่ถึง 1 นาที");
    expect(formatWaitDuration(-5 * min)).toBe("รอมาแล้วไม่ถึง 1 นาที");
  });

  it("เกิน 1 ชม. ถือว่ารอนาน (เปลี่ยนสี)", () => {
    expect(isLongWait(60 * min)).toBe(false);
    expect(isLongWait(61 * min)).toBe(true);
  });
});

describe("TF-23 ระยะทาง", () => {
  it("เมตร / กม. ทศนิยม / กม. จำนวนเต็ม", () => {
    expect(formatDistance(850)).toBe("850 ม.");
    expect(formatDistance(3240)).toBe("3.2 กม.");
    expect(formatDistance(15600)).toBe("16 กม.");
  });
});

describe("TF-23 ป้ายพิกัดไม่แม่น (ข้อมูลจาก TF-65)", () => {
  it("GPS คลาดไม่เกิน 100 ม. ไม่มีป้าย", () => {
    expect(locationAccuracyWarning(LocationSource.GPS, 100)).toBeNull();
  });

  it("GPS คลาดเกิน 100 ม. ป้ายเตือน", () => {
    expect(locationAccuracyWarning(LocationSource.GPS, 350)).toEqual({
      level: "warn",
      text: "พิกัดคลาดได้ ~0.4 กม.",
    });
  });

  it("GPS คลาดเกิน 1,000 ม. ป้ายเด่นพร้อมบอกให้โทรยืนยัน", () => {
    expect(locationAccuracyWarning(LocationSource.GPS, 16238)).toEqual({
      level: "danger",
      text: "พิกัดคลาดได้ ~16 กม. · โทรยืนยันตำแหน่งก่อนออก",
    });
    expect(locationAccuracyWarning(LocationSource.GPS, 1001)?.level).toBe("danger");
  });

  it("ปักเอง / วางลิงก์ / ไม่มีค่า ไม่มีป้าย", () => {
    expect(locationAccuracyWarning(LocationSource.MANUAL_PIN, 5000)).toBeNull();
    expect(locationAccuracyWarning(LocationSource.GMAPS_LINK, 5000)).toBeNull();
    expect(locationAccuracyWarning(LocationSource.GPS, null)).toBeNull();
    expect(locationAccuracyWarning(null, 5000)).toBeNull();
  });

  it("TF-36 พิกัดจาก SMS ขึ้นป้ายเสมอ แม้ไม่มีค่าความคลาดเคลื่อน", () => {
    expect(locationAccuracyWarning(LocationSource.SMS, null)).toEqual({
      level: "warn",
      text: "พิกัดจาก SMS",
    });
  });
});
