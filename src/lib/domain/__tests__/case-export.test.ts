import { describe, expect, it } from "vitest";
import {
  CASE_EXPORT_HEADER,
  caseExportCsv,
  caseExportErrorMessage,
  exportDateTime,
  parseCaseExportFilters,
  type CaseExportRow,
} from "../case-export";

const row = (partial: Partial<CaseExportRow> = {}): CaseExportRow => ({
  case_code: "FL-2611-0001",
  created_at: "2026-11-13T07:30:00Z",
  incident_type: "FLOOD",
  urgency: "RED",
  status: "RESOLVED",
  province: "น่าน",
  district: "เมืองน่าน",
  subdistrict: "ในเวียง",
  unit_name: "หน่วย ก",
  closed_at: "2026-11-13T09:05:00Z",
  close_confirmation: "REPORTER_CONFIRMED",
  reporter_locale: "th",
  ...partial,
});

describe("TF-38 CSV รายการเคสของแอดมิน", () => {
  it("หัวคอลัมน์ภาษาไทย มี BOM และไม่มีคอลัมน์ข้อมูลส่วนตัว", () => {
    const csv = caseExportCsv([row()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).trimEnd().split("\r\n");
    expect(header).toBe(
      "รหัสเคส,วันเวลาแจ้ง (เวลาไทย),ประเภทเหตุ,ระดับความเร่งด่วน,สถานะ,จังหวัด,อำเภอ,ตำบล,หน่วยที่รับ,เวลาที่ปิด (เวลาไทย),วิธีปิด,ภาษาผู้แจ้ง",
    );
    expect(line).toBe(
      "FL-2611-0001,2026-11-13 14:30,น้ำท่วม,แดง,ช่วยเหลือสำเร็จ,น่าน,เมืองน่าน,ในเวียง,หน่วย ก,2026-11-13 16:05,ผู้แจ้งยืนยัน,ไทย",
    );
    for (const forbidden of ["ชื่อ", "เบอร์", "พิกัด", "ที่อยู่", "โน้ต"]) {
      expect(CASE_EXPORT_HEADER.join(","), forbidden).not.toContain(forbidden);
    }
  });

  it("เคสที่ยังไม่ปิด ช่องเวลาปิดและวิธีปิดว่าง หน่วยว่างได้ · ผู้แจ้งใช้ภาษาอังกฤษ", () => {
    const line = caseExportCsv([
      row({
        status: "NEW",
        urgency: "GREEN",
        closed_at: null,
        close_confirmation: null,
        unit_name: null,
        reporter_locale: "en",
      }),
    ])
      .slice(1)
      .trimEnd()
      .split("\r\n")[1];
    expect(line).toBe(
      "FL-2611-0001,2026-11-13 14:30,น้ำท่วม,เขียว,รอรับเคส,น่าน,เมืองน่าน,ในเวียง,,,,อังกฤษ",
    );
  });

  it("ชื่อหน่วยที่มีคอมมา/เครื่องหมายคำพูด escape ถูก และชื่อที่ขึ้นต้นเหมือนสูตร Excel ถูกกัน", () => {
    const lines = caseExportCsv([
      row({ unit_name: 'หน่วย "ก", เขต 1' }),
      row({ unit_name: '=HYPERLINK("http://evil")' }),
    ])
      .slice(1)
      .trimEnd()
      .split("\r\n");
    expect(lines[1]).toContain(',"หน่วย ""ก"", เขต 1",');
    expect(lines[2]).toContain(',"\'=HYPERLINK(""http://evil"")",');
  });

  it("เวลาไทยข้ามวันถูก (UTC 17:00 = เที่ยงคืนวันถัดไป)", () => {
    expect(exportDateTime("2026-11-12T17:00:00Z")).toBe("2026-11-13 00:00");
    expect(exportDateTime(null)).toBe("");
  });
});

describe("TF-38 ตัวกรองของ export", () => {
  const params = (q: Record<string, string>) => new URLSearchParams(q);

  it("ต้องมีช่วงวันที่ที่ถูกต้อง", () => {
    expect(parseCaseExportFilters(params({}))).toEqual({ ok: false, code: "range" });
    expect(parseCaseExportFilters(params({ from: "2026-02-30", to: "2026-03-01" }))).toEqual({
      ok: false,
      code: "range",
    });
    expect(parseCaseExportFilters(params({ from: "2026-03-02", to: "2026-03-01" }))).toEqual({
      ok: false,
      code: "range",
    });
  });

  it("ไม่เกิน 366 วัน (นับรวมวันแรกและวันสุดท้าย)", () => {
    expect(parseCaseExportFilters(params({ from: "2024-01-01", to: "2024-12-31" })).ok).toBe(true);
    expect(parseCaseExportFilters(params({ from: "2024-01-01", to: "2025-01-01" }))).toEqual({
      ok: false,
      code: "tooLong",
    });
  });

  it("รับจังหวัดและประเภทเหตุ ปฏิเสธประเภทที่ไม่มี", () => {
    expect(
      parseCaseExportFilters(
        params({ from: "2026-11-01", to: "2026-11-30", province: " น่าน ", incident: "FIRE" }),
      ),
    ).toEqual({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-30",
      province: "น่าน",
      incidentType: "FIRE",
    });
    expect(
      parseCaseExportFilters(params({ from: "2026-11-01", to: "2026-11-30", incident: "TANK" })),
    ).toEqual({ ok: false, code: "incident" });
  });

  it("ข้อความ error มาจากรหัสที่กำหนดเท่านั้น (ข้อความแปลกใน URL ไม่แสดง)", () => {
    expect(caseExportErrorMessage("tooLong")).toBe("ดาวน์โหลดได้ครั้งละไม่เกิน 366 วัน");
    expect(caseExportErrorMessage("ข้อความหลอก โทรหาเบอร์นี้")).toBeNull();
    expect(caseExportErrorMessage("")).toBeNull();
  });
});
