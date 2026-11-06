import { isMembershipActive, UnitCapability } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

const known = new Set<string>(Object.values(UnitCapability));

/**
 * ความสามารถรวมของหน่วยที่ผู้ใช้สังกัดอยู่ (สมาชิกที่อนุมัติแล้วและยังไม่หมดอายุ)
 * ใช้กับตัวกรองบนรายการเคส (TF-23 + TF-52) — แอดมินที่ไม่ได้อยู่หน่วยไหนได้ค่าว่าง
 */
export async function getMyUnitCapabilities(userId: string): Promise<UnitCapability[]> {
  const db = await createClient();
  const { data: memberships, error } = await db
    .from("unit_members")
    .select("unit_id, status, expires_at, unit:units!inner(is_active)")
    .eq("user_id", userId);
  if (error) throw error;

  const unitIds = (memberships ?? [])
    .filter((m) =>
      isMembershipActive({
        status: m.status,
        expiresAt: m.expires_at,
        unitIsActive: Boolean((m.unit as { is_active?: boolean } | null)?.is_active),
      }),
    )
    .map((m) => m.unit_id as string);
  if (unitIds.length === 0) return [];

  const { data, error: capError } = await db
    .from("unit_capabilities")
    .select("capability")
    .in("unit_id", unitIds);
  if (capError) throw capError;
  return [...new Set((data ?? []).map((row) => row.capability as string))].filter(
    (c): c is UnitCapability => known.has(c),
  );
}
