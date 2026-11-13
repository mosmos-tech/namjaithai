import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../csv";
import { daysOfMonth, lastTwelveMonths, unitStatsCsv } from "../unit-stats";

describe("TF-38 ฟังก์ชันสร้าง CSV กลาง", () => {
  it("มี BOM ให้ Excel อ่านภาษาไทย และขึ้นบรรทัดด้วย CRLF", () => {
    const csv = toCsv([
      ["รหัสเคส", "จังหวัด"],
      ["FL-2611-0001", "น่าน"],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe("﻿รหัสเคส,จังหวัด\r\nFL-2611-0001,น่าน\r\n");
  });

  it("escape คอมมา ขึ้นบรรทัดใหม่ และเครื่องหมายคำพูด", () => {
    expect(csvCell("หน่วย ก, เขต 1")).toBe('"หน่วย ก, เขต 1"');
    expect(csvCell("บรรทัด1\nบรรทัด2")).toBe('"บรรทัด1\nบรรทัด2"');
    expect(csvCell("บรรทัด1\r\nบรรทัด2")).toBe('"บรรทัด1\r\nบรรทัด2"');
    expect(csvCell('หน่วย "ทดสอบ"')).toBe('"หน่วย ""ทดสอบ"""');
    expect(csvCell("ธรรมดา")).toBe("ธรรมดา");
  });

  it("กันสูตร Excel: ข้อความขึ้นต้นด้วย = + - @ tab CR ใส่ ' นำหน้า", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+66812345678")).toBe("'+66812345678");
    expect(csvCell("-1+2")).toBe("'-1+2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell("\r=1")).toBe('"\'\r=1"');
    // อยู่กลางข้อความไม่เป็นสูตร ไม่ต้องกัน
    expect(csvCell("ก=ข")).toBe("ก=ข");
  });

  it("ตัวเลขไม่ถูกกัน (เลขติดลบยังเป็นตัวเลข) และค่าว่างเป็นช่องว่าง", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

// ── TF-57 ย้ายมาใช้ฟังก์ชันกลาง: หัวคอลัมน์และข้อมูลต้องเหมือนเดิมทุกตัวอักษร ──
// ตัวสร้าง CSV เดิมของ TF-57 (คัดจากก่อน TF-38) ใช้เป็นค่าอ้างอิง
function legacyCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function legacyFromCurrent(current: string): string[][] {
  // แยกไฟล์ใหม่กลับเป็นช่อง แล้วประกอบใหม่ด้วยวิธีเดิม เพื่อเทียบทั้งไฟล์
  return current
    .slice(1)
    .trimEnd()
    .split("\r\n")
    .map((line) => line.split(","));
}

describe("TF-38 CSV ของ TF-57 (/unit/dashboard/csv) เหมือนเดิมหลังย้ายมาใช้ฟังก์ชันกลาง", () => {
  const counts = { helped: 0, lead_closed: 0, referred: 0, released: 0, people_helped: 0 };

  it("รายวัน: หัวคอลัมน์และทุกแถวตรงกับของเดิม", () => {
    const bars = daysOfMonth(
      [
        {
          day: "2026-10-01",
          incident_type: "FLOOD",
          ...counts,
          helped: 2,
          lead_closed: 1,
          released: 1,
          people_helped: 3,
        },
        { day: "2026-10-01", incident_type: "FIRE", ...counts, helped: 1 },
        { day: "2026-10-15", incident_type: "FLOOD", ...counts, referred: 2 },
      ],
      "2026-10",
    );
    const csv = unitStatsCsv("มูลนิธิ ก · ศูนย์ ข (เมืองน่าน น่าน)", bars, "day");
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "หน่วย,วันที่,ช่วยสำเร็จ (ผู้แจ้งยืนยัน),ปิดโดยหัวหน้า (ไม่ได้รับการยืนยัน),ส่งต่อ,ปล่อยเคส,จำนวนคนที่ช่วยได้,ช่วยสำเร็จ: น้ำท่วม,ช่วยสำเร็จ: ไฟไหม้",
    );
    const expected = [
      [
        "หน่วย",
        "วันที่",
        "ช่วยสำเร็จ (ผู้แจ้งยืนยัน)",
        "ปิดโดยหัวหน้า (ไม่ได้รับการยืนยัน)",
        "ส่งต่อ",
        "ปล่อยเคส",
        "จำนวนคนที่ช่วยได้",
        "ช่วยสำเร็จ: น้ำท่วม",
        "ช่วยสำเร็จ: ไฟไหม้",
      ],
      ...bars.map((bar) => [
        "มูลนิธิ ก · ศูนย์ ข (เมืองน่าน น่าน)",
        bar.key,
        bar.helped,
        bar.leadClosed,
        bar.referred,
        bar.released,
        bar.peopleHelped,
        bar.helpedByType.FLOOD ?? 0,
        bar.helpedByType.FIRE ?? 0,
      ]),
    ];
    const legacy = `﻿${expected.map((line) => line.map(legacyCsvCell).join(",")).join("\r\n")}\r\n`;
    expect(csv).toBe(legacy);
    expect(legacyFromCurrent(csv)).toHaveLength(32);
  });

  it("รายเดือน 12 เดือน: ตรงกับของเดิม", () => {
    const bars = lastTwelveMonths(
      [{ month: "2026-11-01", incident_type: "FLOOD", ...counts, helped: 4, people_helped: 9 }],
      new Date("2026-11-30T19:00:00Z"),
    );
    const csv = unitStatsCsv("หน่วย", bars, "month");
    const legacy = `﻿${[
      [
        "หน่วย",
        "เดือน",
        "ช่วยสำเร็จ (ผู้แจ้งยืนยัน)",
        "ปิดโดยหัวหน้า (ไม่ได้รับการยืนยัน)",
        "ส่งต่อ",
        "ปล่อยเคส",
        "จำนวนคนที่ช่วยได้",
        "ช่วยสำเร็จ: น้ำท่วม",
      ],
      ...bars.map((bar) => [
        "หน่วย",
        bar.key,
        bar.helped,
        bar.leadClosed,
        bar.referred,
        bar.released,
        bar.peopleHelped,
        bar.helpedByType.FLOOD ?? 0,
      ]),
    ]
      .map((line) => line.map(legacyCsvCell).join(","))
      .join("\r\n")}\r\n`;
    expect(csv).toBe(legacy);
  });

  it("ต่างจากเดิมเฉพาะชื่อหน่วยที่ขึ้นต้นเหมือนสูตร Excel (ใส่ ' นำหน้า)", () => {
    const bars = daysOfMonth([], "2026-10");
    const csv = unitStatsCsv("=cmd|' /C calc'!A0", bars, "day");
    expect(csv.split("\r\n")[1].startsWith("'=cmd|' /C calc'!A0,2026-10-01,")).toBe(true);
  });
});
