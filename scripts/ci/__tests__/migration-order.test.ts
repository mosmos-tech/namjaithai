import { describe, expect, it } from "vitest";
import { checkMigrationOrder, migrationStamp } from "../migration-order.ts";

const base = [
  { name: "20261108162922_tf60_osm_units.sql", blob: "a" },
  { name: "20261110082602_tf57_unit_stats.sql", blob: "b" },
];

describe("ตรวจลำดับ migration ใน PR", () => {
  it("อ่าน timestamp จากชื่อไฟล์", () => {
    expect(migrationStamp("20261110082602_tf57_unit_stats.sql")).toBe("20261110082602");
    expect(migrationStamp("tf57.sql")).toBeNull();
  });

  it("ไฟล์ใหม่ที่ timestamp ใหม่กว่าตัวล่าสุดใน base ผ่าน", () => {
    const result = checkMigrationOrder(base, [
      ...base,
      { name: "20261111000000_tf32_audit.sql", blob: "c" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.latestBase).toBe("20261110082602");
  });

  it("ไฟล์ใหม่ที่เก่ากว่าหรือเท่ากับตัวล่าสุดใน base ไม่ผ่าน (แบบที่เกิดกับ TF-27)", () => {
    const result = checkMigrationOrder(base, [
      ...base,
      { name: "20261108000000_tf27_realtime_cases.sql", blob: "c" },
      { name: "20261110082602_same_stamp.sql", blob: "d" },
    ]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain("ไม่ใหม่กว่า migration ล่าสุดใน base (20261110082602)");
    expect(result.errors.some((error) => error.includes("timestamp ซ้ำ"))).toBe(true);
  });

  it("แค่เปลี่ยนชื่อไฟล์เดิม (เนื้อหาเหมือนกัน) ไม่นับเป็นของใหม่", () => {
    const result = checkMigrationOrder(
      [...base, { name: "20261108000000_tf27_realtime_cases.sql", blob: "r" }],
      [...base, { name: "20261108162923_tf27_realtime_cases.sql", blob: "r" }],
    );
    expect(result.errors).toEqual([]);
    expect(result.renamed).toEqual(["20261108162923_tf27_realtime_cases.sql"]);
  });

  it("ชื่อไฟล์ผิดรูปแบบไม่ผ่าน", () => {
    expect(
      checkMigrationOrder(base, [...base, { name: "fix.sql", blob: "x" }]).errors,
    ).toHaveLength(1);
  });
});
