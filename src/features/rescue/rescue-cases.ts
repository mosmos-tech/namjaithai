import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RESCUE_CASE_PAGE_SIZE,
  type CaseStatus,
  type IncidentType,
  type RescueCaseSort,
  type RescueRadiusM,
  type Urgency,
} from "../../lib/domain";

// แถวจาก list_rescue_cases() (TF-23) — ไม่มีชื่อ เบอร์ ที่อยู่ละเอียด โน้ต หรือข้อมูลสุขภาพ
type RescueCaseRpcRow = {
  id: string;
  case_code: string;
  status: CaseStatus;
  incident_type: IncidentType;
  urgency: Urgency;
  triage_reasons: string[];
  system_urgency: Urgency | null;
  urgency_override_reason: string | null;
  priority_score: number;
  created_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  location_source: string | null;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  landmark: string;
  adults: number | null;
  elderly: number | null;
  bedridden: number | null;
  children: number | null;
  pets: number | null;
  distance_m: number | null;
  sort_k1: string;
  sort_k2: string;
  sort_k3: string;
  total_count: number;
};

export type RescueCase = {
  id: string;
  caseCode: string;
  status: CaseStatus;
  // ชื่อเดียวกับคอลัมน์ เพราะ useCapabilityFilter (TF-52) กรองด้วย incident_type
  incident_type: IncidentType;
  urgency: Urgency;
  triageReasons: string[];
  systemUrgency: Urgency | null;
  overrideReason: string | null;
  createdAt: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  locationSource: string | null;
  area: string;
  landmark: string;
  people: { adults: number; elderly: number; bedridden: number; children: number; pets: number };
  distanceM: number | null;
};

// คีย์เรียงของแถวสุดท้าย ส่งกลับไปเพื่อโหลดหน้าถัดไป (keyset ไม่ใช้ OFFSET)
export type RescueCaseCursor = { k1: string; k2: string; k3: string; id: string };

export type RescueCasePage = {
  cases: RescueCase[];
  total: number;
  next: RescueCaseCursor | null;
};

export type RescueCaseQuery = {
  sort: RescueCaseSort;
  radiusM: RescueRadiusM | null;
  location: { lat: number; lng: number } | null;
  after?: RescueCaseCursor | null;
};

export async function fetchRescueCasePage(
  supabase: Pick<SupabaseClient, "rpc">,
  query: RescueCaseQuery,
): Promise<RescueCasePage> {
  const { data, error } = await supabase.rpc("list_rescue_cases", {
    p_lat: query.location?.lat ?? null,
    p_lng: query.location?.lng ?? null,
    p_radius_m: query.location ? query.radiusM : null,
    p_sort: query.sort,
    p_after_k1: query.after?.k1 ?? null,
    p_after_k2: query.after?.k2 ?? null,
    p_after_k3: query.after?.k3 ?? null,
    p_after_id: query.after?.id ?? null,
    p_limit: RESCUE_CASE_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RescueCaseRpcRow[];
  const last = rows.at(-1);
  return {
    cases: rows.map(toRescueCase),
    total: rows[0]?.total_count ?? 0,
    // ได้ครบหน้าแปลว่าอาจมีต่อ (คีย์เป็นข้อความจากฐานข้อมูล ไม่ผ่าน float จึงไม่เพี้ยน)
    next:
      last && rows.length === RESCUE_CASE_PAGE_SIZE
        ? { k1: last.sort_k1, k2: last.sort_k2, k3: last.sort_k3, id: last.id }
        : null,
  };
}

/**
 * โหลดเคสทั้งหมดทุกหน้าสำหรับแสดงบนแผนที่ (TF-22)
 * แผนที่ต้องการแสดงทุกเคสที่ตรงตัวกรอง ไม่ใช่แค่หน้าแรก
 * ดึงทีละหน้าตาม cursor keyset จนกว่า next จะเป็น null
 * ป้องกัน cursor วนซ้ำ (loop detection) และป้องกันการตัดเคสทิ้งเงียบ ๆ
 * หากดึงไม่ครบจะแสดงข้อผิดพลาดชัดเจน ไม่แสดงผลเสมือนว่าครบ
 */
export async function fetchAllRescueCases(
  supabase: Pick<SupabaseClient, "rpc">,
  query: Omit<RescueCaseQuery, "after">,
  optionsOrMaxPages?: number | { maxPages?: number },
): Promise<{ cases: RescueCase[]; total: number }> {
  const maxPages =
    typeof optionsOrMaxPages === "number"
      ? optionsOrMaxPages
      : (optionsOrMaxPages?.maxPages ?? 500);

  let allCases: RescueCase[] = [];
  let currentCursor: RescueCaseCursor | null = null;
  const seenCursors = new Set<string>();
  let total = 0;
  let page = 0;

  while (true) {
    page++;
    if (page > maxPages) {
      throw new Error(
        `ดึงข้อมูลเคสไม่ครบถ้วน (เกินขีดจำกัดความปลอดภัย ${maxPages} หน้า)`,
      );
    }

    if (currentCursor) {
      const cursorKey = `${currentCursor.k1}#${currentCursor.k2}#${currentCursor.k3}#${currentCursor.id}`;
      if (seenCursors.has(cursorKey)) {
        throw new Error(
          `พบ cursor วนซ้ำในการดึงข้อมูลเคส (id: ${currentCursor.id})`,
        );
      }
      seenCursors.add(cursorKey);
    }

    const res = await fetchRescueCasePage(supabase, {
      ...query,
      after: currentCursor,
    });

    allCases = [...allCases, ...res.cases];
    total = res.total;

    // ถ้าไม่มีหน้าถัดไป หรือหน้าล่าสุดไม่มีเคสเลย ถือว่าดึงครบถ้วนแล้ว
    if (!res.next || res.cases.length === 0) {
      break;
    }

    currentCursor = res.next;
  }

  return { cases: allCases, total };
}

function toRescueCase(row: RescueCaseRpcRow): RescueCase {
  return {
    id: row.id,
    caseCode: row.case_code,
    status: row.status,
    incident_type: row.incident_type,
    urgency: row.urgency,
    triageReasons: row.triage_reasons ?? [],
    systemUrgency: row.system_urgency,
    overrideReason: row.urgency_override_reason,
    createdAt: row.created_at,
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracy_m,
    locationSource: row.location_source,
    area: [row.subdistrict, row.district, row.province].filter(Boolean).join(" · "),
    landmark: row.landmark,
    people: {
      adults: row.adults ?? 0,
      elderly: row.elderly ?? 0,
      bedridden: row.bedridden ?? 0,
      children: row.children ?? 0,
      pets: row.pets ?? 0,
    },
    distanceM: row.distance_m,
  };
}
