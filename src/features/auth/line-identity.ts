import type { User } from "@supabase/supabase-js";
import { UserRole } from "../../lib/domain";

// ชื่อ provider ของ LINE ที่ลงทะเบียนไว้ใน Supabase (scripts/auth/setup-line-provider.mjs)
export const LINE_PROVIDER = "custom:line";

export type LineProfile = {
  lineUserId: string;
  displayName: string;
  avatarUrl: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * ดึง LINE user ID / ชื่อ / รูป จาก user ของ Supabase หลังล็อกอิน LINE
 * Supabase เก็บ claim จาก id_token ของ LINE (sub = LINE user ID, name, picture)
 * ไว้ใน identity ของ provider และใน user_metadata — อ่านจาก identity ก่อนเพราะผูกกับ provider ชัดเจน
 */
export function lineProfileFromAuthUser(
  user: Pick<User, "identities" | "user_metadata">,
): LineProfile | null {
  const identity = user.identities?.find((i) => i.provider === LINE_PROVIDER);
  const data = { ...user.user_metadata, ...identity?.identity_data };

  const lineUserId = str(data.sub) ?? str(data.provider_id) ?? str(identity?.id);
  if (!lineUserId) return null;

  return {
    lineUserId,
    displayName: str(data.name) ?? str(data.full_name) ?? "ผู้ใช้ LINE",
    avatarUrl: str(data.picture) ?? str(data.avatar_url),
  };
}

/**
 * บทบาทตอนล็อกอิน
 * - ครั้งแรก: ผู้ใช้ทั่วไป (ไม่มีหน้าสมัครกู้ภัยบนเว็บ กู้ภัยได้สิทธิ์ผ่านลิงก์ในกลุ่ม LINE ของหน่วย TF-19)
 * - LINE ID อยู่ใน SUPER_ADMIN_LINE_IDS: เป็นแอดมินเสมอ
 * - คนเดิม: คงบทบาทเดิม (ไม่ลดสิทธิ์ใครอัตโนมัติ ถ้าเอาออกจาก SUPER_ADMIN_LINE_IDS ต้องปรับเองที่ห้องแอดมิน)
 */
export function roleOnLogin(
  existingRole: UserRole | null,
  lineUserId: string,
  superAdminLineIds: ReadonlySet<string>,
): UserRole {
  if (superAdminLineIds.has(lineUserId)) return UserRole.ADMIN;
  return existingRole ?? UserRole.USER;
}
