import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// TF-70: trigger แจ้ง LINE ตัดสินจาก is_demo ตอน insert — seed ต้องตั้ง is_demo ใน INSERT เดียวกัน
// (insert แล้วค่อย update จะหลุดเข้าคิวแจ้งเตือนจริง และฐานข้อมูลห้ามเปลี่ยน is_demo ภายหลังอยู่แล้ว)
const seedDir = path.join(process.cwd(), "supabase/seeds");
const seeds = readdirSync(seedDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => ({ file, sql: readFileSync(path.join(seedDir, file), "utf8") }));

function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

describe("TF-70 seed เคสตัวอย่าง", () => {
  it("ทุก INSERT เข้า public.cases ตั้ง is_demo ในคำสั่งเดียวกัน", () => {
    const inserts = seeds.flatMap(({ file, sql }) =>
      statements(sql)
        .filter((statement) => /insert\s+into\s+public\.cases\s*\(/i.test(statement))
        .map((statement) => ({ file, statement })),
    );
    expect(inserts.length).toBeGreaterThan(0);
    for (const { file, statement } of inserts) {
      const columns = /insert\s+into\s+public\.cases\s*\(([^)]*)\)/i.exec(statement)![1];
      expect(
        columns.split(",").map((c) => c.trim()),
        file,
      ).toContain("is_demo");
    }
  });

  it("ไม่มี seed ไหน update is_demo ทีหลัง", () => {
    for (const { file, sql } of seeds) {
      expect(sql, file).not.toMatch(/update\s+public\.cases\s+set[^;]*is_demo/i);
    }
  });
});
