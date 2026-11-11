import { describe, expect, it } from "vitest";
import { dailyHelpedBars, daysOfMonth } from "@/lib/domain";
import { dailyHelpedChartData, incidentChartData } from "../chart-data";

describe("ข้อมูลกราฟผลงานหน่วย (ใช้ร่วม /unit/dashboard และ /units/[id])", () => {
  it("dashboard: series = ประเภทเหตุที่มีผลงานเท่านั้น ตารางคอลัมน์ครบเหมือนเดิม", () => {
    const bars = daysOfMonth(
      [
        {
          day: "2026-10-05",
          incident_type: "FLOOD",
          helped: 2,
          lead_closed: 1,
          referred: 0,
          released: 1,
          people_helped: 4,
        },
      ],
      "2026-10",
    );
    const data = incidentChartData(bars, "day");
    expect(data.series.map((item) => item.label)).toEqual(["น้ำท่วม"]);
    expect(data.bars[4].values).toEqual([2]);
    expect(data.table.periodHeader).toBe("วันที่");
    expect(data.table.columns).toEqual([
      "ช่วยสำเร็จ",
      "น้ำท่วม",
      "ปิดโดยหัวหน้า",
      "ส่งต่อ",
      "ปล่อยเคส",
      "คนที่ช่วยได้",
    ]);
    expect(data.table.rows[4]).toEqual([2, 2, 1, 0, 1, 4]);
  });

  it("หน้าสาธารณะ: 2 สี ผู้แจ้งยืนยัน (ล่าง) / หัวหน้าปิด (บน)", () => {
    const data = dailyHelpedChartData(
      dailyHelpedBars([{ day: "2026-11-11", helped: 3, lead_closed: 1 }]),
    );
    expect(data.series.map((item) => item.label)).toEqual(["ผู้แจ้งยืนยัน", "หัวหน้าปิด"]);
    expect(new Set(data.series.map((item) => item.color)).size).toBe(2);
    expect(data.bars[0].values).toEqual([3, 1]);
    expect(data.table.rows[0]).toEqual([3, 1]);
  });
});
