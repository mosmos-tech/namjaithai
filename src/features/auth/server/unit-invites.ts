import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "./app-user";

export type InviteUnit = { id: string; name: string };

export async function manageableUnits(user: AppUser): Promise<InviteUnit[]> {
  const admin = createAdminClient();
  if (user.role === "ADMIN") {
    const { data, error } = await admin.from("units").select("id, name").eq("is_active", true).order("name");
    if (error) throw error;
    return data ?? [];
  }
  if (user.role !== "UNIT_LEAD") return [];

  const { data: memberships, error: membershipError } = await admin
    .from("unit_members")
    .select("unit_id")
    .eq("user_id", user.id)
    .eq("role_in_unit", "LEAD")
    .eq("status", "APPROVED");
  if (membershipError) throw membershipError;
  const ids = [...new Set((memberships ?? []).map((membership) => membership.unit_id))];
  if (!ids.length) return [];
  const { data, error } = await admin.from("units").select("id, name").in("id", ids).eq("is_active", true).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function isValidInvite(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invites")
    .select("id, max_uses, used_count, expires_at, is_active, unit:units!inner(is_active)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data || !data.is_active || data.used_count >= data.max_uses) return false;
  if (Date.parse(data.expires_at) <= Date.now()) return false;
  const unit = data.unit as unknown as { is_active: boolean };
  return unit.is_active;
}
