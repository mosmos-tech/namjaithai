import { describe, it, expect } from "vitest";
import { CaseStatus } from "../case-status";
import {
  caseCodeSchema,
  isClosedStatus,
  lineShareText,
  lineShareUrl,
  phoneLast4Schema,
  reporterStatusView,
  timelineLabel,
  trackPath,
} from "../tracking";
import { formatThaiDate, formatThaiTime } from "../thai-date";

const ALL_STATUSES = Object.values(CaseStatus);
// สถานะที่ยืนยันแล้วว่ามีทีมรับเคส
const ACCEPTED_STATUSES: CaseStatus[] = ["ACCEPTED", "EN_ROUTE", "ON_SITE", "RESOLVED"];

describe("reporterStatusView — คำว่า 'ทีมกำลังมา' เฉพาะเมื่อมีคนรับเคสแล้ว", () => {
  it.each(ALL_STATUSES.filter((s) => !ACCEPTED_STATUSES.includes(s)))(
    "%s ต้องไม่บอกว่าทีมกำลังมา",
    (status) => {
      const view = reporterStatusView(status);
      const text = `${view.badge} ${view.title} ${view.description}`;
      expect(text).not.toMatch(/กำลังมา/);
    },
  );

  it("EN_ROUTE บอกว่าทีมกำลังมา", () => {
    expect(reporterStatusView("EN_ROUTE").title).toContain("กำลังมา");
  });

  it("NEW รอทีมรับเคส และแถบขั้นกำลังอยู่ที่ 'ทีมรับเคส'", () => {
    const view = reporterStatusView("NEW");
    expect(view.badge).toBe("รอทีมรับเคส");
    expect(view.progress).toEqual({ done: 1, active: true });
  });

  it("แถบขั้นเดินหน้าเรื่อยๆ ตามสถานะ", () => {
    const done = (["NEW", "ACCEPTED", "EN_ROUTE", "ON_SITE", "RESOLVED"] as CaseStatus[]).map(
      (s) => reporterStatusView(s).progress!.done,
    );
    expect(done).toEqual([...done].sort((a, b) => a - b));
    expect(done.at(-1)).toBe(5);
  });

  it("เคสที่ปิดแบบไม่สำเร็จไม่โชว์แถบขั้น", () => {
    for (const s of ["CANCELLED", "DUPLICATE", "UNREACHABLE"] as CaseStatus[]) {
      expect(reporterStatusView(s).progress).toBeNull();
    }
  });
});

describe("isClosedStatus — หยุดดึงข้อมูลเมื่อเคสปิด", () => {
  it("เคสที่ยังเปิดอยู่ต้องดึงต่อ", () => {
    for (const s of ["NEW", "ACCEPTED", "EN_ROUTE", "ON_SITE"] as CaseStatus[]) {
      expect(isClosedStatus(s)).toBe(false);
    }
  });
  it("เคสที่ปิดแล้วหยุดดึง", () => {
    for (const s of ["RESOLVED", "CANCELLED", "DUPLICATE", "UNREACHABLE"] as CaseStatus[]) {
      expect(isClosedStatus(s)).toBe(true);
    }
  });
});

describe("timelineLabel", () => {
  it("STATUS_CHANGED ใช้ข้อความตามสถานะปลายทาง", () => {
    expect(timelineLabel("STATUS_CHANGED", "EN_ROUTE")).toBe("ทีมออกเดินทาง");
    expect(timelineLabel("STATUS_CHANGED", "ON_SITE")).toBe("ทีมถึงจุดของคุณ");
  });
  it("เหตุการณ์อื่นมีข้อความภาษาไทย", () => {
    expect(timelineLabel("CREATED", "NEW")).toBe("รับแจ้งเคสแล้ว");
  });
});

describe("caseCodeSchema / phoneLast4Schema", () => {
  it("รับตัวพิมพ์เล็กและช่องว่าง แล้วแปลงเป็นตัวใหญ่", () => {
    expect(caseCodeSchema.parse("  fl-2610-0042 ")).toBe("FL-2610-0042");
  });
  it("รับเลขรันเกิน 4 หลัก", () => {
    expect(caseCodeSchema.parse("FL-2610-10000")).toBe("FL-2610-10000");
  });
  it("ไม่รับรูปแบบอื่น", () => {
    expect(caseCodeSchema.safeParse("TF-2410-0153").success).toBe(false);
    expect(caseCodeSchema.safeParse("FL-26100042").success).toBe(false);
  });
  it("4 ตัวท้ายต้องเป็นตัวเลข 4 หลัก", () => {
    expect(phoneLast4Schema.parse("5678")).toBe("5678");
    expect(phoneLast4Schema.safeParse("567").success).toBe(false);
    expect(phoneLast4Schema.safeParse("56a8").success).toBe(false);
  });
});

describe("ลิงก์ติดตามและแชร์ LINE", () => {
  const token = "4ebf5c94233c857205aae26d170b628f";

  it("trackPath ใส่รหัสเคสและ token", () => {
    expect(trackPath("FL-2610-0042", token)).toBe(`/track/FL-2610-0042?t=${token}`);
  });

  it("ข้อความแชร์มีรหัสเคสและลิงก์ติดตาม", () => {
    const url = `https://namjaithai.vercel.app${trackPath("FL-2610-0042", token)}`;
    const text = lineShareText("FL-2610-0042", url);
    expect(text).toContain("FL-2610-0042");
    expect(text).toContain(url);
  });

  it("lineShareUrl เข้ารหัสข้อความไทยและขึ้นบรรทัดใหม่ได้", () => {
    const url = new URL(lineShareUrl("สวัสดี\nบรรทัดสอง"));
    expect(url.origin + url.pathname).toBe("https://line.me/R/share");
    expect(url.searchParams.get("text")).toBe("สวัสดี\nบรรทัดสอง");
  });
});

describe("วันเวลาไทย", () => {
  // 07:48 UTC = 14:48 เวลาไทย
  const d = new Date("2026-10-30T07:48:00Z");
  it("ปีเป็น พ.ศ.", () => {
    expect(formatThaiDate(d)).toBe("30 ต.ค. 2569");
  });
  it("เวลาเป็นเวลาไทยแบบ 24 ชม.", () => {
    expect(formatThaiTime(d)).toBe("14:48 น.");
  });
});
