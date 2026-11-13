// ── CSV สำหรับดาวน์โหลด (TF-38 รวมจากของ TF-57) ────────────────────────────────
// - ใส่ BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน, ขึ้นบรรทัดด้วย CRLF
// - ครอบด้วย " เมื่อมีคอมมา ขึ้นบรรทัดใหม่ หรือ " (และ " ข้างในเขียนซ้ำเป็น "")
// - กันสูตร Excel (CSV injection): ข้อความที่ขึ้นต้นด้วย = + - @ tab หรือ CR ใส่ ' นำหน้า
//   ตัวเลข (number) ไม่ต้องกัน — เลขติดลบยังเป็นตัวเลขให้ Excel คำนวณได้

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
