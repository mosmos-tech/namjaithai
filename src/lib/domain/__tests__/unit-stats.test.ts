import { describe, expect, it } from "vitest";
import {
  bangkokMonth,
  daysOfMonth,
  incidentTypesIn,
  lastTwelveMonths,
  monthRange,
  parseMonthParam,
  recentMonthOptions,
  thaiMonthLabel,
  unitStatsCsv,
  unitTotals,
  type UnitDailyRow,
  type UnitMonthlyRow,
} from "../unit-stats";

const counts = {
  incident_type: "FLOOD",
  helped: 0,
  lead_closed: 0,
  referred: 0,
  released: 0,
  people_helped: 0,
};
const row = (partial: Partial<UnitMonthlyRow>): UnitMonthlyRow => ({
  month: "2026-11-01",
  ...counts,
  ...partial,
});
const dayRow = (partial: Partial<UnitDailyRow>): UnitDailyRow => ({
  day: "2026-10-01",
  ...counts,
  ...partial,
});

// 30 พ.ย. 2026 19:00 UTC = 1 ธ.ค. 2026 02:00 เวลาไทย
const NOW = new Date("2026-11-30T19:00:00Z");

describe("TF-57 สถิติผลงานหน่วย", () => {
  it("เดือนปัจจุบันตามเวลาไทย และป้ายเดือนเป็น พ.ศ.", () => {
    expect(bangkokMonth(NOW)).toBe("2026-12");
    expect(thaiMonthLabel("2026-12")).toBe("ธ.ค. 69");
    expect(thaiMonthLabel("2026-01")).toBe("ม.ค. 69");
  });

  it("12 เดือนล่าสุดเรียงเก่า → ใหม่ เดือนว่างเป็น 0 แยกตามประเภท และจอแคบแสดงป้ายเว้นเดือน", () => {
    const bars = lastTwelveMonths(
      [
        row({ month: "2026-12-01", helped: 2, people_helped: 5 }),
        row({ month: "2026-12-01", incident_type: "FIRE", helped: 1, lead_closed: 1 }),
        row({ month: "2025-12-01", helped: 9 }), // เก่ากว่า 12 เดือน ไม่แสดง
      ],
      NOW,
    );
    expect(bars).toHaveLength(12);
    expect(bars[0].key).toBe("2026-01");
    expect(bars[11]).toMatchObject({
      key: "2026-12",
      label: "ธ.ค. 69",
      axisLabel: "ธ.ค.",
      axisOnNarrow: true,
      helped: 3,
      leadClosed: 1,
      peopleHelped: 5,
      helpedByType: { FLOOD: 2, FIRE: 1 },
    });
    expect(bars[5].helped).toBe(0);
    expect(bars.filter((bar) => bar.axisOnNarrow)).toHaveLength(6);
    expect(incidentTypesIn(bars)).toEqual(["FLOOD", "FIRE"]);
  });

  it("เลือกเดือน: วันที่ 1 ถึงวันสุดท้าย วันละแท่ง วันว่างเป็น 0 จอแคบแสดงเลขวัน 1, 5, 10, ...", () => {
    const bars = daysOfMonth(
      [
        dayRow({ day: "2026-10-05", helped: 2 }),
        dayRow({ day: "2026-10-05", incident_type: "MEDICAL", helped: 1 }),
        dayRow({ day: "2026-10-31", helped: 1, released: 1 }),
        dayRow({ day: "2026-11-01", helped: 7 }), // คนละเดือน ไม่นับ
      ],
      "2026-10",
    );
    expect(bars).toHaveLength(31);
    expect(bars[4]).toMatchObject({
      key: "2026-10-05",
      label: "5 ต.ค. 69",
      axisLabel: "5",
      helped: 3,
      helpedByType: { FLOOD: 2, MEDICAL: 1 },
    });
    expect(bars[1].helped).toBe(0);
    expect(bars.at(-1)).toMatchObject({ key: "2026-10-31", helped: 1, released: 1 });
    expect(bars.filter((bar) => bar.axisOnNarrow).map((bar) => bar.axisLabel)).toEqual([
      "1 ต.ค.",
      "5",
      "10",
      "15",
      "20",
      "25",
      "30",
    ]);
    expect(daysOfMonth([], "2028-02")).toHaveLength(29); // ปีอธิกสุรทิน
    expect(monthRange("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28", days: 28 });
  });

  it("ตัวเลือกช่วงเวลา 12 เดือนย้อนหลัง และ ?month= นอกช่วงใช้ 12 เดือนล่าสุด", () => {
    const options = recentMonthOptions(NOW);
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ value: "2026-12", label: "ธันวาคม 2569" });
    expect(options.at(-1)?.value).toBe("2026-01");
    expect(parseMonthParam("2026-10", NOW)).toBe("2026-10");
    expect(parseMonthParam("2025-12", NOW)).toBeNull();
    expect(parseMonthParam("2026-13", NOW)).toBeNull();
    expect(parseMonthParam(["2026-10"], NOW)).toBeNull();
    expect(parseMonthParam(undefined, NOW)).toBeNull();
  });

  it("ตัวเลขสรุป: ช่วยสำเร็จเดือนนี้ / ทั้งหมด / จำนวนคน (ไม่รวมปิดโดยหัวหน้า)", () => {
    expect(
      unitTotals(
        [
          row({ month: "2026-12-01", helped: 2, lead_closed: 3, people_helped: 4 }),
          row({ month: "2026-06-01", helped: 5, people_helped: 6 }),
        ],
        NOW,
      ),
    ).toEqual({ helpedThisMonth: 2, helpedAll: 7, peopleHelped: 10 });
  });

  it("CSV ตรงกับแท่งของช่วงที่เลือก มี BOM ภาษาไทย และ escape เครื่องหมายคำพูด", () => {
    const bars = daysOfMonth(
      [
        dayRow({ day: "2026-10-01", helped: 2, lead_closed: 1, released: 1, people_helped: 3 }),
        dayRow({ day: "2026-10-01", incident_type: "FIRE", helped: 1 }),
      ],
      "2026-10",
    );
    const csv = unitStatsCsv('หน่วย "ทดสอบ", เขต 1', bars, "day");
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(32); // หัว + 31 วัน
    expect(lines[0]).toBe(
      "หน่วย,วันที่,ช่วยสำเร็จ (ผู้แจ้งยืนยัน),ปิดโดยหัวหน้า (ไม่ได้รับการยืนยัน),ส่งต่อ,ปล่อยเคส,จำนวนคนที่ช่วยได้,ช่วยสำเร็จ: น้ำท่วม,ช่วยสำเร็จ: ไฟไหม้",
    );
    expect(lines[1]).toBe('"หน่วย ""ทดสอบ"", เขต 1",2026-10-01,3,1,0,1,3,2,1');
    expect(lines[2]).toBe('"หน่วย ""ทดสอบ"", เขต 1",2026-10-02,0,0,0,0,0,0,0');

    const monthly = unitStatsCsv("หน่วย", lastTwelveMonths([row({ helped: 1 })], NOW), "month");
    expect(monthly.split("\r\n")[0]).toContain(",เดือน,");
    expect(monthly.trimEnd().split("\r\n")).toHaveLength(13);
  });
});
