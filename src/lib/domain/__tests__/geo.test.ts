import { describe, it, expect } from "vitest";
import { districtCodeSchema, provinceCodeSchema, reverseGeocodeQuerySchema } from "../geo";

describe("reverseGeocodeQuerySchema — พิกัดจาก URL", () => {
  it("แปลงข้อความเป็นตัวเลข", () => {
    expect(reverseGeocodeQuerySchema.parse({ lat: "13.7649", lng: "100.5383" })).toEqual({
      lat: 13.7649,
      lng: 100.5383,
    });
  });

  it("ไม่รับค่าว่าง (ต้องไม่กลายเป็น 0)", () => {
    const r = reverseGeocodeQuerySchema.safeParse({ lat: "", lng: "100.5" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("กรุณาระบุพิกัด");
  });

  it("ไม่รับข้อความที่ไม่ใช่ตัวเลข", () => {
    expect(reverseGeocodeQuerySchema.safeParse({ lat: "abc", lng: "100.5" }).success).toBe(false);
  });

  it("ไม่รับพิกัดนอกกรอบประเทศไทย", () => {
    const r = reverseGeocodeQuerySchema.safeParse({ lat: "35.68", lng: "139.69" }); // โตเกียว
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("นอกประเทศไทย");
  });
});

describe("รหัสพื้นที่", () => {
  it("รหัสจังหวัดต้อง 2 หลัก", () => {
    expect(provinceCodeSchema.parse("10")).toBe(10);
    expect(provinceCodeSchema.safeParse("1").success).toBe(false);
    expect(provinceCodeSchema.safeParse("1001").success).toBe(false);
    expect(provinceCodeSchema.safeParse("1a").success).toBe(false);
  });

  it("รหัสอำเภอต้อง 4 หลัก", () => {
    expect(districtCodeSchema.parse("1001")).toBe(1001);
    expect(districtCodeSchema.safeParse("10").success).toBe(false);
    expect(districtCodeSchema.safeParse("100101").success).toBe(false);
  });
});
