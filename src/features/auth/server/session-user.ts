import type { SupabaseClient } from "@supabase/supabase-js";
import {
  effectiveUserRole,
  isMembershipActive,
  type UserRole,
  type UserStatus,
} from "../../../lib/domain";

export type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
};

export async function getSessionUserRow(supabase: SupabaseClient): Promise<UserRow | null> {
  const { data: claims } = await supabase.auth.getClaims();
  const authUserId = claims?.claims.sub;
  if (!authUserId) return null;

  const { data } = await supabase
    .from("users")
    .select("id, display_name, avatar_url, role, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle<UserRow>();
  if (!data) return null;
  if (data.role !== "RESCUER") return data;

  const { data: memberships } = await supabase
    .from("unit_members")
    .select("status, expires_at, unit:units(is_active)")
    .eq("user_id", data.id)
    .eq("status", "APPROVED");
  const hasActiveMembership = (memberships ?? []).some((m) => {
    const unitObj = Array.isArray(m.unit) ? m.unit[0] : m.unit;
    return isMembershipActive({
      status: m.status,
      expiresAt: m.expires_at,
      unitIsActive: unitObj ? Boolean(unitObj.is_active) : undefined,
    });
  });
  return { ...data, role: effectiveUserRole(data.role, hasActiveMembership) };
}
