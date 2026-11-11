import { UnitCapability } from "./incidents";
import {
  dailyAxisLabels,
  thaiMonthLabel,
  unitDisplayName,
  type DailyAxisLabel,
} from "./unit-stats";

// ── TF-61 หน้าสาธารณะ /units: แปลงแถวจาก RPC public_unit_directory / public_unit_profile ──

/** แถวจาก public_unit_directory() — คอลัมน์ชุดนี้เท่านั้น (pgTAP ตรวจ) */
export type PublicUnitRow = {
  id: string;
  organization_name: string | null;
  branch_name: string;
  district: string | null;
  province: string;
  capabilities: string[];
  source: string;
  in_service: boolean;
  hotline: string | null;
  helped_total: number;
};

/** แถวจาก public_unit_profile(id): รายชื่อ + ตัวเลขสรุป */
export type PublicUnitProfileRow = PublicUnitRow & {
  lead_closed_total: number;
  helped_30d: number;
  lead_closed_30d: number;
  people_helped: number;
  active_count: number;
};

export type UnitSource = "DEMO" | "OSM" | "ADMIN";

export type PublicUnit = {
  id: string;
  label: string; // "องค์กร · ศูนย์ (อำเภอ จังหวัด)"
  organization: string | null;
  district: string | null;
  province: string;
  capabilities: UnitCapability[];
  source: UnitSource;
  /** หน่วยจริงจาก OSM ที่ยังไม่ได้ใช้ระบบ: ไม่มีกราฟ ไม่มีตัวเลข */
  notInService: boolean;
  isDemo: boolean;
  hotline: string | null;
  helpedTotal: number;
};

export const UNIT_CAPABILITY_LABELS: Record<UnitCapability, string> = {
  BOAT: "เรือ",
  EMS: "การแพทย์ฉุกเฉิน",
  FIRE_SUPPRESSION: "ดับเพลิง",
  EXTRICATION: "ตัดถ่าง",
  WATER_RESCUE: "กู้ภัยทางน้ำ",
  ANIMAL_CAPTURE: "จับสัตว์",
  EVACUATION: "อพยพ",
};

const isCapability = (value: unknown): value is UnitCapability =>
  typeof value === "string" && value in UnitCapability;

export function toPublicUnit(row: PublicUnitRow): PublicUnit {
  const source: UnitSource = row.source === "DEMO" || row.source === "OSM" ? row.source : "ADMIN";
  return {
    id: row.id,
    label: unitDisplayName({
      name: row.branch_name,
      branch_name: row.branch_name,
      district: row.district,
      province: row.province,
      organization: row.organization_name,
    }),
    organization: row.organization_name,
    district: row.district,
    province: row.province,
    capabilities: row.capabilities.filter(isCapability),
    source,
    notInService: source === "OSM" && !row.in_service,
    isDemo: source === "DEMO",
    hotline: row.hotline,
    helpedTotal: row.helped_total,
  };
}

/** ตัวกรองของหน้า /units — จังหวัด/อำเภอเป็นชื่อภาษาไทย (หน้าเว็บแปลงจากรหัสของ TF-05 ให้แล้ว) */
export type UnitDirectoryFilters = {
  province?: string;
  district?: string;
  organization?: string;
  capability?: UnitCapability;
  query?: string;
};

/** ค่าจาก URL ที่ใช้ได้ (?province=รหัส&district=รหัส&org=ชื่อ&cap=BOAT&q=คำค้น&page=2) */
export type UnitDirectoryParams = {
  provinceCode: number | null;
  districtCode: number | null;
  organization: string | null;
  capability: UnitCapability | null;
  query: string;
  page: number;
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const areaCode = (value: string) => (/^\d{1,6}$/.test(value) ? Number(value) : null);

export function parseUnitDirectoryParams(
  params: Record<string, string | string[] | undefined>,
): UnitDirectoryParams {
  const provinceCode = areaCode(first(params.province));
  const cap = first(params.cap);
  const page = Number(first(params.page));
  return {
    provinceCode,
    // อำเภอใช้ได้เมื่อเลือกจังหวัดแล้วเท่านั้น
    districtCode: provinceCode === null ? null : areaCode(first(params.district)),
    organization: first(params.org).slice(0, 200) || null,
    capability: isCapability(cap) ? cap : null,
    query: first(params.q).slice(0, 100),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

// ค้นชื่อไม่สนตัวพิมพ์และช่องว่างซ้ำ
const normalize = (text: string) => text.toLocaleLowerCase("th-TH").replace(/\s+/g, " ").trim();

/** หน่วยตรงกับคำค้นไหม (ค้นทั้งชื่อองค์กร ศูนย์ อำเภอ จังหวัด) — ใช้ทั้งหน้า /units และตัวเลือกหน่วย */
export function unitMatchesQuery(label: string, query: string): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  const text = normalize(label);
  return words.every((word) => text.includes(word));
}

export function filterUnits(units: readonly PublicUnit[], filters: UnitDirectoryFilters) {
  return units.filter(
    (unit) =>
      (!filters.province || unit.province === filters.province) &&
      (!filters.district || unit.district === filters.district) &&
      (!filters.organization || unit.organization === filters.organization) &&
      (!filters.capability || unit.capabilities.includes(filters.capability)) &&
      (!filters.query || unitMatchesQuery(unit.label, filters.query)),
  );
}

/** ชื่อองค์กรที่มีในรายชื่อ เรียงตามตัวอักษรไทย */
export function organizationsOf(units: readonly PublicUnit[]): string[] {
  const names = new Set(units.flatMap((unit) => (unit.organization ? [unit.organization] : [])));
  return [...names].sort((a, b) => a.localeCompare(b, "th"));
}

/** จัดกลุ่มตามจังหวัด (เรียงจังหวัดตามตัวอักษร ในกลุ่มคงลำดับเดิม) */
export function groupUnitsByProvince<T extends { province: string }>(
  units: readonly T[],
): { province: string; units: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const unit of units) {
    const list = groups.get(unit.province) ?? [];
    list.push(unit);
    groups.set(unit.province, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "th"))
    .map(([province, list]) => ({ province, units: list }));
}

/** แถวจาก public_unit_daily_helped() ของ TF-57 */
export type PublicDailyHelpedRow = { day: string; helped: number; lead_closed: number };

/** หนึ่งแท่งของกราฟสาธารณะ 30 วัน: ผู้แจ้งยืนยัน / หัวหน้าปิด */
export type DailyHelpedBar = DailyAxisLabel & {
  key: string; // YYYY-MM-DD
  label: string; // "15 พ.ย. 69"
  helped: number;
  leadClosed: number;
};

/**
 * แท่งรายวันจาก RPC (RPC เติมวันที่ไม่มีเคสเป็น 0 ให้แล้ว เรียงเก่า → ใหม่)
 * ป้ายแกนตาม dailyAxisLabels — จอแคบแสดงเลขวันทุก 5 แท่งนับถอยจากวันล่าสุด
 */
export function dailyHelpedBars(rows: readonly PublicDailyHelpedRow[]): DailyHelpedBar[] {
  const keys = rows.map((row) => row.day.slice(0, 10));
  const last = keys.length - 1;
  const axis = dailyAxisLabels(keys, (index) => (last - index) % 5 === 0);
  return rows.map((row, index) => ({
    key: keys[index],
    label: `${Number(keys[index].slice(8, 10))} ${thaiMonthLabel(keys[index].slice(0, 7))}`,
    ...axis[index],
    helped: row.helped,
    leadClosed: row.lead_closed,
  }));
}
