import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole, UserStatus } from "@/lib/domain";

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
  return data;
}
