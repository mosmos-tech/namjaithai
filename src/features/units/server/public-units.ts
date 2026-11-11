import { cacheLife } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import {
  dailyHelpedBars,
  toPublicUnit,
  type DailyHelpedBar,
  type PublicDailyHelpedRow,
  type PublicUnit,
  type PublicUnitProfileRow,
  type PublicUnitRow,
} from "@/lib/domain";

// TF-61: ข้อมูลหน้า /units อ่านผ่าน RPC สาธารณะเท่านั้น (anon อ่านตารางตรงไม่ได้)
// ใครก็เปิดได้ จึงแคชผล 60 วินาที (preset "minutes": revalidate 1 นาที) ไม่ให้ทุกคนที่เปิดหน้าไปถามฐานข้อมูล

export async function listPublicUnits(): Promise<PublicUnit[]> {
  "use cache";
  cacheLife("minutes");
  const { data, error } = await createPublicClient().rpc("public_unit_directory");
  if (error) throw error;
  return ((data ?? []) as PublicUnitRow[]).map(toPublicUnit);
}

export type PublicUnitProfile = PublicUnit & {
  leadClosedTotal: number;
  helped30d: number;
  leadClosed30d: number;
  peopleHelped: number;
  activeCount: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** null = ไม่มีหน่วยนี้หรือไม่แสดงต่อสาธารณะ (หน่วยที่แอดมินปิดใช้งาน) */
export async function getPublicUnitProfile(id: string): Promise<PublicUnitProfile | null> {
  "use cache";
  cacheLife("minutes");
  if (!UUID.test(id)) return null;
  const { data, error } = await createPublicClient()
    .rpc("public_unit_profile", { p_unit_id: id })
    .maybeSingle<PublicUnitProfileRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    ...toPublicUnit(data),
    leadClosedTotal: data.lead_closed_total,
    helped30d: data.helped_30d,
    leadClosed30d: data.lead_closed_30d,
    peopleHelped: data.people_helped,
    activeCount: data.active_count,
  };
}

/** กราฟ 30 วันล่าสุด จาก public_unit_daily_helped ของ TF-57 */
export async function getPublicDailyHelped(id: string): Promise<DailyHelpedBar[]> {
  "use cache";
  cacheLife("minutes");
  const { data, error } = await createPublicClient().rpc("public_unit_daily_helped", {
    p_unit_id: id,
    p_days: 30,
  });
  if (error) throw error;
  return dailyHelpedBars((data ?? []) as PublicDailyHelpedRow[]);
}
