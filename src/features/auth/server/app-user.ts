import { connection } from "next/server";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { parseSuperAdminLineIds, type UserRole, type UserStatus } from "@/lib/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { lineProfileFromAuthUser, roleOnLogin } from "../line-identity";

// แถวใน public.users ที่หน้าเว็บใช้
export type AppUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
};

type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
};

const toAppUser = (r: UserRow): AppUser => ({
  id: r.id,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  role: r.role,
  status: r.status,
});

/**
 * เรียกตอนล็อกอิน LINE สำเร็จ (/auth/callback): สร้างหรืออัปเดตแถวใน public.users
 * ใช้ admin client เพราะผู้ใช้เขียนตาราง users เองไม่ได้ (กันตั้ง role ให้ตัวเอง)
 */
export async function upsertAppUserOnLogin(authUser: User): Promise<AppUser> {
  const profile = lineProfileFromAuthUser(authUser);
  if (!profile) throw new Error("ไม่พบ LINE user ID ในข้อมูลล็อกอิน");

  const admin = createAdminClient();
  const { data: existing, error: findError } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_user_id", authUser.id)
    .maybeSingle<{ id: string; role: UserRole }>();
  if (findError) throw findError;

  const role = roleOnLogin(
    existing?.role ?? null,
    profile.lineUserId,
    parseSuperAdminLineIds(process.env.SUPER_ADMIN_LINE_IDS),
  );

  // อัปเดตชื่อ/รูปตาม LINE ทุกครั้งที่ล็อกอิน (ผู้ใช้เปลี่ยนชื่อใน LINE ได้)
  const { data, error } = await admin
    .from("users")
    .upsert(
      {
        auth_user_id: authUser.id,
        line_user_id: profile.lineUserId,
        display_name: profile.displayName,
        avatar_url: profile.avatarUrl,
        role,
      },
      { onConflict: "auth_user_id" },
    )
    .select("id, display_name, avatar_url, role, status")
    .single<UserRow>();
  if (error) throw error;
  return toAppUser(data);
}

/**
 * ผู้ใช้ที่ล็อกอินอยู่ตอนนี้ (null = ยังไม่ล็อกอิน หรือยังไม่มีแถวใน users)
 * อ่านผ่าน RLS "users can read own row" จึงเห็นแค่ของตัวเอง
 * ใช้ในหน้าที่ต้องล็อกอินเพื่อเช็กสิทธิ์ซ้ำอีกชั้น ไม่พึ่ง proxy อย่างเดียว
 */
// cache: เรียกหลายที่ในหน้าเดียวกัน (เช่น หน้า login) ถามฐานข้อมูลครั้งเดียวต่อ request
export const getCurrentAppUser = cache(async (): Promise<AppUser | null> => {
  // ผู้ใช้ต่างกันทุก request ห้าม prerender — และ getClaims เช็กวันหมดอายุ token ด้วย Date.now()
  await connection();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const authUserId = claims?.claims.sub;
  if (!authUserId) return null;

  const { data } = await supabase
    .from("users")
    .select("id, display_name, avatar_url, role, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle<UserRow>();
  return data ? toAppUser(data) : null;
});
