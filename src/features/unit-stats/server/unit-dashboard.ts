import { createClient } from "@/lib/supabase/server";
import {
  daysOfMonth,
  lastTwelveMonths,
  monthRange,
  unitDisplayName,
  type UnitDailyRow,
  type UnitMonthlyRow,
  type UnitPeriodBar,
} from "@/lib/domain";
import type { AppUser } from "@/features/auth/server/app-user";

export type DashboardUnit = { id: string; label: string; isDemo: boolean };

type UnitRow = {
  id: string;
  name: string;
  branch_name: string | null;
  district: string | null;
  province: string;
  source: string;
  organizations: { name: string } | null;
};

const UNIT_FIELDS = "id, name, branch_name, district, province, source, organizations(name)";

function toDashboardUnit(unit: UnitRow): DashboardUnit {
  return {
    id: unit.id,
    label: unitDisplayName({ ...unit, organization: unit.organizations?.name }),
    isDemo: unit.source === "DEMO",
  };
}

/**
 * หน่วยที่ผู้ใช้ดูผลงานได้ (TF-57): สมาชิก/หัวหน้า = หน่วยที่ตัวเองอยู่ · แอดมิน = ทุกหน่วยที่ใช้งาน + หน่วยตัวอย่าง
 * ตัวเลขจริงกรองซ้ำใน view unit_daily_stats อีกชั้น — ที่นี่แค่ทำตัวเลือก
 */
export async function listDashboardUnits(user: AppUser): Promise<DashboardUnit[]> {
  const supabase = await createClient();
  if (user.role === "ADMIN") {
    const { data } = await supabase
      .from("units")
      .select(UNIT_FIELDS)
      // หน่วยตัวอย่าง (DEMO) ปิดใช้งานไว้แต่มีกราฟจาก seed ให้ดู · หน่วย OSM ที่ยังไม่ใช้ระบบไม่ต้องแสดง
      .or("is_active.eq.true,source.eq.DEMO")
      .order("province")
      .order("name")
      .returns<UnitRow[]>();
    return (data ?? []).map(toDashboardUnit);
  }
  const { data } = await supabase
    .from("unit_members")
    .select(`units!inner(${UNIT_FIELDS})`)
    .eq("user_id", user.id)
    .eq("status", "APPROVED")
    .returns<{ units: UnitRow }[]>();
  return (data ?? []).map((row) => toDashboardUnit(row.units));
}

/** สถิติรายเดือนของหน่วย (ผ่าน view ที่กรองสิทธิ์แล้ว) */
export async function loadUnitMonthlyStats(unitId: string): Promise<UnitMonthlyRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("unit_monthly_stats")
    .select("month, incident_type, helped, lead_closed, referred, released, people_helped")
    .eq("unit_id", unitId)
    .order("month")
    .returns<UnitMonthlyRow[]>();
  return data ?? [];
}

/** เคสที่หน่วยกำลังช่วยอยู่ตอนนี้ (รับแล้ว ถึงรอผู้แจ้งยืนยัน) */
export async function countActiveCases(unitId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("assigned_unit_id", unitId)
    .in("status", ["ACCEPTED", "EN_ROUTE", "ON_SITE", "AWAITING_CONFIRMATION"]);
  return count ?? 0;
}

/** สถิติรายวันของเดือนที่เลือก (unit_daily_stats ที่กรองสิทธิ์แล้ว) */
export async function loadUnitDailyStats(unitId: string, month: string): Promise<UnitDailyRow[]> {
  const { first, last } = monthRange(month);
  const supabase = await createClient();
  const { data } = await supabase
    .from("unit_daily_stats")
    .select("day, incident_type, helped, lead_closed, referred, released, people_helped")
    .eq("unit_id", unitId)
    .gte("day", first)
    .lte("day", last)
    .order("day")
    .returns<UnitDailyRow[]>();
  return data ?? [];
}

/**
 * แท่งกราฟของช่วงที่เลือก — ใช้ร่วมกันระหว่างหน้า dashboard (กราฟ + ตาราง) และ CSV ให้ตัวเลขตรงกันเสมอ
 * month = null → 12 เดือนล่าสุด (รายเดือน) · "YYYY-MM" → รายวันของเดือนนั้น
 */
export async function loadPeriodBars(
  unitId: string,
  month: string | null,
  monthlyRows?: UnitMonthlyRow[],
): Promise<UnitPeriodBar[]> {
  return month
    ? daysOfMonth(await loadUnitDailyStats(unitId, month), month)
    : lastTwelveMonths(monthlyRows ?? (await loadUnitMonthlyStats(unitId)), new Date());
}
