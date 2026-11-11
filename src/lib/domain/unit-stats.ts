import { INCIDENT_REGISTRY, INCIDENT_TYPE_ORDER, type IncidentType } from "./incidents";

// ── TF-57 ผลงานหน่วย: แปลงแถวจาก unit_monthly_stats / unit_daily_stats เป็นกราฟ ตัวเลขสรุป และ CSV ──

type UnitStatsCounts = {
  incident_type: string;
  helped: number;
  lead_closed: number;
  referred: number;
  released: number;
  people_helped: number;
};

/** แถวจาก view unit_monthly_stats (ไม่มีรายเคส ไม่มีเบอร์) */
export type UnitMonthlyRow = UnitStatsCounts & { month: string }; // YYYY-MM-01
/** แถวจาก view unit_daily_stats */
export type UnitDailyRow = UnitStatsCounts & { day: string }; // YYYY-MM-DD

/** หนึ่งแท่งในกราฟ = หนึ่งเดือน (ช่วง 12 เดือน) หรือหนึ่งวัน (ช่วงเดือนที่เลือก) */
export type UnitPeriodBar = {
  key: string; // YYYY-MM หรือ YYYY-MM-DD
  label: string; // ป้ายเต็มสำหรับตาราง/คำอธิบาย เช่น "ต.ค. 69" หรือ "5 ต.ค. 69"
  axisLabel: string; // ป้ายใต้แท่ง เช่น "ต.ค." หรือ "5"
  axisOnNarrow: boolean; // จอ 375px แสดงป้ายนี้ไหม (เว้นเดือน / ทุก 5 วัน)
  helpedByType: Partial<Record<IncidentType, number>>;
  helped: number;
  leadClosed: number;
  referred: number;
  released: number;
  peopleHelped: number;
};

const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const THAI_MONTHS_LONG = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** เดือนปัจจุบันตามเวลาไทย (YYYY-MM) */
export function bangkokMonth(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const total = year * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** ป้ายเดือนแบบไทย ปี พ.ศ. 2 หลัก เช่น "พ.ย. 69" */
export function thaiMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${String(year + 543).slice(-2)}`;
}

/** ชื่อเดือนเต็ม ปี พ.ศ. เช่น "ตุลาคม 2569" */
export function thaiMonthLongLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${THAI_MONTHS_LONG[m - 1]} ${year + 543}`;
}

/** ตัวเลือก "ช่วงเวลา": 12 เดือนย้อนหลัง (ใหม่ → เก่า) รวมเดือนปัจจุบัน */
export function recentMonthOptions(now: Date): { value: string; label: string }[] {
  const current = bangkokMonth(now);
  return Array.from({ length: 12 }, (_, i) => {
    const month = shiftMonth(current, -i);
    return { value: month, label: thaiMonthLongLabel(month) };
  });
}

/** ?month= ที่ใช้ได้ต้องเป็นหนึ่งใน 12 เดือนย้อนหลัง ไม่งั้นใช้ "12 เดือนล่าสุด" (null) */
export function parseMonthParam(value: unknown, now: Date): string | null {
  return typeof value === "string" && recentMonthOptions(now).some((o) => o.value === value)
    ? value
    : null;
}

/** วันแรกและวันสุดท้ายของเดือน (YYYY-MM-DD) */
export function monthRange(month: string): { first: string; last: string; days: number } {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(days).padStart(2, "0")}`, days };
}

function emptyBar(
  key: string,
  label: string,
  axisLabel: string,
  axisOnNarrow: boolean,
): UnitPeriodBar {
  return {
    key,
    label,
    axisLabel,
    axisOnNarrow,
    helpedByType: {},
    helped: 0,
    leadClosed: 0,
    referred: 0,
    released: 0,
    peopleHelped: 0,
  };
}

function addCounts(bar: UnitPeriodBar | undefined, row: UnitStatsCounts) {
  if (!bar) return;
  const type = row.incident_type as IncidentType;
  if (row.helped > 0) bar.helpedByType[type] = (bar.helpedByType[type] ?? 0) + row.helped;
  bar.helped += row.helped;
  bar.leadClosed += row.lead_closed;
  bar.referred += row.referred;
  bar.released += row.released;
  bar.peopleHelped += row.people_helped;
}

/** 12 เดือนล่าสุด (เก่า → ใหม่) เดือนที่ไม่มีข้อมูลเป็น 0 · จอแคบแสดงป้ายเว้นเดือน (เดือนล่าสุดแสดงเสมอ) */
export function lastTwelveMonths(rows: readonly UnitMonthlyRow[], now: Date): UnitPeriodBar[] {
  const current = bangkokMonth(now);
  const bars = Array.from({ length: 12 }, (_, i) => {
    const month = shiftMonth(current, i - 11);
    return emptyBar(
      month,
      thaiMonthLabel(month),
      THAI_MONTHS[Number(month.slice(5)) - 1],
      i % 2 === 1,
    );
  });
  const byKey = new Map(bars.map((bar) => [bar.key, bar]));
  for (const row of rows) addCounts(byKey.get(row.month.slice(0, 7)), row);
  return bars;
}

/** วันที่ 1 ถึงวันสุดท้ายของเดือน วันละแท่ง วันที่ไม่มีเคสเป็น 0 · จอแคบแสดงเลขวัน 1, 5, 10, ... */
export function daysOfMonth(rows: readonly UnitDailyRow[], month: string): UnitPeriodBar[] {
  const { days } = monthRange(month);
  const short = thaiMonthLabel(month);
  const bars = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    return emptyBar(
      `${month}-${String(day).padStart(2, "0")}`,
      `${day} ${short}`,
      String(day),
      day === 1 || day % 5 === 0,
    );
  });
  const byKey = new Map(bars.map((bar) => [bar.key, bar]));
  for (const row of rows) addCounts(byKey.get(row.day.slice(0, 10)), row);
  return bars;
}

/** ตัวเลข 3 ช่องจากสถิติ (ช่อง "กำลังช่วย" ดึงสดจากเคสที่หน่วยถืออยู่) */
export function unitTotals(rows: readonly UnitMonthlyRow[], now: Date) {
  const current = bangkokMonth(now);
  return rows.reduce(
    (totals, row) => ({
      helpedThisMonth: totals.helpedThisMonth + (row.month.startsWith(current) ? row.helped : 0),
      helpedAll: totals.helpedAll + row.helped,
      peopleHelped: totals.peopleHelped + row.people_helped,
    }),
    { helpedThisMonth: 0, helpedAll: 0, peopleHelped: 0 },
  );
}

/** ประเภทเหตุที่มีผลงานในช่วงนี้ เรียงตามลำดับทะเบียน (สีผูกกับประเภท ไม่ใช่ลำดับ) */
export function incidentTypesIn(bars: readonly UnitPeriodBar[]): IncidentType[] {
  return INCIDENT_TYPE_ORDER.filter((type) => bars.some((b) => (b.helpedByType[type] ?? 0) > 0));
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV ของช่วงที่เลือก (ชุดเดียวกับกราฟและตาราง) — ใส่ BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน
 * คอลัมน์ประเภทเหตุนับเฉพาะช่วยสำเร็จ (ผู้แจ้งยืนยัน)
 */
export function unitStatsCsv(
  unitLabel: string,
  bars: readonly UnitPeriodBar[],
  period: "month" | "day",
): string {
  const types = incidentTypesIn(bars);
  const header = [
    "หน่วย",
    period === "month" ? "เดือน" : "วันที่",
    "ช่วยสำเร็จ (ผู้แจ้งยืนยัน)",
    "ปิดโดยหัวหน้า (ไม่ได้รับการยืนยัน)",
    "ส่งต่อ",
    "ปล่อยเคส",
    "จำนวนคนที่ช่วยได้",
    ...types.map((type) => `ช่วยสำเร็จ: ${INCIDENT_REGISTRY[type].label.th}`),
  ];
  const lines = bars.map((bar) => [
    unitLabel,
    bar.key,
    bar.helped,
    bar.leadClosed,
    bar.referred,
    bar.released,
    bar.peopleHelped,
    ...types.map((type) => bar.helpedByType[type] ?? 0),
  ]);
  return `﻿${[header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** ชื่อหน่วยแบบเต็ม "องค์กร · ศูนย์ (อำเภอ จังหวัด)" — หน่วยชื่อเดียวกันต่างเขตแยกกันได้ */
export function unitDisplayName(unit: {
  name: string;
  branch_name?: string | null;
  district?: string | null;
  province: string;
  organization?: string | null;
}): string {
  const branch = unit.branch_name?.trim() || unit.name;
  const head =
    unit.organization && unit.organization !== branch ? `${unit.organization} · ${branch}` : branch;
  return `${head} (${[unit.district, unit.province].filter(Boolean).join(" ")})`;
}
