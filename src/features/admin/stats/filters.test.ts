import { describe, expect, it } from "vitest";
import { parseStatsFilters } from "./filters";

describe("ตัวกรองสถิติแอดมิน", () => {
  it("รับจังหวัดและวันที่ที่ถูกต้อง", () => {
    expect(parseStatsFilters({ province: "ตราด", from: "2026-02-01", to: "2026-02-28" })).toEqual({
      province: "ตราด",
      from: "2026-02-01",
      to: "2026-02-28",
      error: null,
    });
  });
  it("แจ้งช่วงวันผิดหรือวันที่ไม่มีจริง", () => {
    expect(parseStatsFilters({ from: "2026-02-30" }).error).toBeTruthy();
    expect(parseStatsFilters({ from: "2026-03-01", to: "2026-02-01" }).error).toBeTruthy();
  });
  it("รับตัวกรองว่างและไม่รับค่าจาก query ที่เป็น array", () => {
    expect(parseStatsFilters({ province: ["ตราด", "ระยอง"] })).toEqual({
      province: "",
      from: "",
      to: "",
      error: null,
    });
  });
});
