import { describe, expect, it } from "vitest";
import {
  dailyAxisLabels,
  dailyHelpedBars,
  filterUnits,
  groupUnitsByProvince,
  organizationsOf,
  parseUnitDirectoryParams,
  thaiFullPeriodLabel,
  toPublicUnit,
  unitMatchesQuery,
  type PublicUnitRow,
} from "@/lib/domain";

const row = (overrides: Partial<PublicUnitRow>): PublicUnitRow => ({
  id: "u1",
  organization_name: "มูลนิธิสายน้ำ",
  branch_name: "ศูนย์บางเขน",
  district: "บางเขน",
  province: "กรุงเทพมหานคร",
  capabilities: ["BOAT"],
  source: "ADMIN",
  in_service: true,
  hotline: null,
  helped_total: 5,
  ...overrides,
});

describe("toPublicUnit", () => {
  it("ชื่อเต็ม องค์กร · ศูนย์ (อำเภอ จังหวัด)", () => {
    expect(toPublicUnit(row({})).label).toBe("มูลนิธิสายน้ำ · ศูนย์บางเขน (บางเขน กรุงเทพมหานคร)");
  });

  it("หน่วย OSM ที่ยังไม่เปิดใช้ = ยังไม่ได้ใช้ระบบ · หน่วย DEMO ไม่ใช่", () => {
    expect(toPublicUnit(row({ source: "OSM", in_service: false })).notInService).toBe(true);
    expect(toPublicUnit(row({ source: "OSM", in_service: true })).notInService).toBe(false);
    const demo = toPublicUnit(row({ source: "DEMO", in_service: false }));
    expect(demo.notInService).toBe(false);
    expect(demo.isDemo).toBe(true);
  });

  it("ตัดความสามารถที่ไม่รู้จักทิ้ง", () => {
    expect(toPublicUnit(row({ capabilities: ["BOAT", "TELEPORT"] })).capabilities).toEqual([
      "BOAT",
    ]);
  });
});

describe("parseUnitDirectoryParams", () => {
  it("อ่านค่าที่ถูกต้องจาก URL", () => {
    expect(
      parseUnitDirectoryParams({
        province: "10",
        district: "1005",
        org: "มูลนิธิสายน้ำ",
        cap: "EMS",
        q: " บางเขน ",
        page: "2",
      }),
    ).toEqual({
      provinceCode: 10,
      districtCode: 1005,
      organization: "มูลนิธิสายน้ำ",
      capability: "EMS",
      query: "บางเขน",
      page: 2,
    });
  });

  it("ค่าแปลกๆ ใช้ค่าเริ่มต้น และอำเภอต้องมีจังหวัดก่อน", () => {
    expect(
      parseUnitDirectoryParams({ province: "abc", district: "1005", cap: "X", page: "-1" }),
    ).toEqual({
      provinceCode: null,
      districtCode: null,
      organization: null,
      capability: null,
      query: "",
      page: 1,
    });
  });
});

describe("filterUnits", () => {
  const units = [
    row({ id: "a" }),
    row({ id: "b", district: "ลาดพร้าว", branch_name: "ศูนย์ลาดพร้าว", capabilities: ["EMS"] }),
    row({ id: "c", province: "เชียงใหม่", district: "เมืองเชียงใหม่", organization_name: null }),
  ].map(toPublicUnit);
  const ids = (list: { id: string }[]) => list.map((unit) => unit.id);

  it("กรองจังหวัด อำเภอ องค์กร ความสามารถ", () => {
    expect(ids(filterUnits(units, { province: "กรุงเทพมหานคร" }))).toEqual(["a", "b"]);
    expect(ids(filterUnits(units, { province: "กรุงเทพมหานคร", district: "ลาดพร้าว" }))).toEqual([
      "b",
    ]);
    expect(ids(filterUnits(units, { organization: "มูลนิธิสายน้ำ" }))).toEqual(["a", "b"]);
    expect(ids(filterUnits(units, { capability: "BOAT" }))).toEqual(["a", "c"]);
  });

  it("ค้นด้วยชื่อหลายคำ ไม่สนช่องว่าง/ตัวพิมพ์", () => {
    expect(ids(filterUnits(units, { query: "สายน้ำ  ลาดพร้าว" }))).toEqual(["b"]);
    expect(unitMatchesQuery("Rescue Team (เมือง)", "rescue")).toBe(true);
  });

  it("องค์กรไม่ซ้ำ เรียงตามตัวอักษร", () => {
    expect(organizationsOf(units)).toEqual(["มูลนิธิสายน้ำ"]);
  });
});

describe("groupUnitsByProvince", () => {
  it("จัดกลุ่มตามจังหวัด เรียงจังหวัด ในกลุ่มคงลำดับเดิม", () => {
    const groups = groupUnitsByProvince([
      { id: "1", province: "เชียงใหม่" },
      { id: "2", province: "กรุงเทพมหานคร" },
      { id: "3", province: "เชียงใหม่" },
    ]);
    expect(groups.map((group) => group.province)).toEqual(["กรุงเทพมหานคร", "เชียงใหม่"]);
    expect(groups[1].units.map((unit) => unit.id)).toEqual(["1", "3"]);
  });
});

describe("dailyHelpedBars", () => {
  it("วันละแท่ง ป้ายวันที่ไทย จอแคบแสดงทุก 5 แท่งนับจากวันล่าสุด", () => {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 9, 13 + i));
      return { day: date.toISOString().slice(0, 10), helped: i % 3, lead_closed: i % 2 };
    });
    const bars = dailyHelpedBars(rows);
    expect(bars).toHaveLength(30);
    expect(bars[0]).toMatchObject({ key: "2026-10-13", label: "13 ต.ค. 69", axisLabel: "13 ต.ค." });
    expect(bars.at(-1)).toMatchObject({ key: "2026-11-11", axisLabel: "11", axisOnNarrow: true });
    // ป้ายแรกและวันขึ้นเดือนใหม่มีชื่อเดือน · เลขวันที่ใกล้ป้ายมีชื่อเดือนถูกซ่อน
    expect(bars.filter((bar) => bar.axisOnNarrow).map((bar) => bar.axisLabel)).toEqual([
      "13 ต.ค.",
      "22",
      "27",
      "1 พ.ย.",
      "6",
      "11",
    ]);
    expect(bars.filter((bar) => !bar.axisOnWide).map((bar) => bar.axisLabel)).toEqual([
      "14",
      "31",
      "2",
    ]);
    expect(bars[1]).toMatchObject({ helped: 1, leadClosed: 1 });
  });
});

describe("ป้ายกราฟรายวัน", () => {
  it("แถบตัวเลขใช้ปี พ.ศ. เต็ม", () => {
    expect(thaiFullPeriodLabel("2026-10-21")).toBe("21 ต.ค. 2569");
    expect(thaiFullPeriodLabel("2026-10")).toBe("ต.ค. 2569");
  });

  it("เดือนใหม่เริ่มใกล้ป้ายแรก: ซ่อนป้ายแรก ให้ป้ายเดือนใหม่แสดง", () => {
    const keys = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
    const axis = dailyAxisLabels(keys, () => true);
    expect(axis.map((item) => item.axisLabel)).toEqual(["30 ต.ค.", "31", "1 พ.ย.", "2", "3"]);
    expect(axis[0]).toMatchObject({ axisOnNarrow: false, axisOnWide: false });
    expect(axis[2]).toMatchObject({ axisOnNarrow: true, axisOnWide: true });
  });
});
