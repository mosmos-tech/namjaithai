// บทบาทผู้ใช้ที่ล็อกอิน (ตรงกับ enum public.user_role ใน TF-04)
// ผู้เยี่ยมชมที่ไม่ล็อกอินไม่มีแถวใน users จึงไม่อยู่ในนี้
export const UserRole = {
  USER: "USER",
  RESCUER: "RESCUER",
  UNIT_LEAD: "UNIT_LEAD",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const userRoleLabel: Record<UserRole, string> = {
  USER: "ผู้ใช้ทั่วไป",
  RESCUER: "กู้ภัย",
  UNIT_LEAD: "หัวหน้าหน่วย",
  ADMIN: "แอดมิน",
};

// สถานะบัญชี (enum public.user_status) — ใช้งานได้เฉพาะ ACTIVE
export type UserStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "REJECTED";

// ── หลังล็อกอินพาไปไหน ───────────────────────────────────────────────────────
// ผู้ใช้ → เคสของฉัน, กู้ภัย → แผนที่, หัวหน้า → หน่วยของฉัน, แอดมิน → ห้องสั่งการ
const HOME_PATH: Record<UserRole, string> = {
  USER: "/my-cases",
  RESCUER: "/rescue",
  UNIT_LEAD: "/unit",
  ADMIN: "/admin",
};

export function homePathForRole(role: UserRole): string {
  return HOME_PATH[role];
}

// ── ใครเข้าหน้าไหนได้ ────────────────────────────────────────────────────────
// เรียงจากเจาะจงไปทั่วไป ตัวแรกที่ตรงชนะ
// แอดมินเข้าได้ทุกหน้าเพื่อดูภาพรวม (แต่ไม่รับเคสเอง — กติกานั้นอยู่ที่ปุ่ม/ฐานข้อมูล ไม่ใช่ที่หน้า)
const PROTECTED: { prefix: string; roles: readonly UserRole[] }[] = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/unit", roles: ["UNIT_LEAD", "ADMIN"] },
  { prefix: "/rescue", roles: ["RESCUER", "UNIT_LEAD", "ADMIN"] },
  { prefix: "/my-cases", roles: ["USER", "RESCUER", "UNIT_LEAD", "ADMIN"] },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// null = หน้าสาธารณะ ใครก็เข้าได้ไม่ต้องล็อกอิน
export function requiredRolesForPath(pathname: string): readonly UserRole[] | null {
  return PROTECTED.find((p) => matchesPrefix(pathname, p.prefix))?.roles ?? null;
}

export type AccessDecision =
  { allow: true } | { allow: false; reason: "not-signed-in" | "forbidden" | "inactive" };

export function decideAccess(
  pathname: string,
  user: { role: UserRole; status: UserStatus } | null,
): AccessDecision {
  const roles = requiredRolesForPath(pathname);
  if (!roles) return { allow: true };
  if (!user) return { allow: false, reason: "not-signed-in" };
  if (user.status !== "ACTIVE") return { allow: false, reason: "inactive" };
  if (!roles.includes(user.role)) return { allow: false, reason: "forbidden" };
  return { allow: true };
}

// ── แอดมินชุดแรก ─────────────────────────────────────────────────────────────
// SUPER_ADMIN_LINE_IDS="Uxxxx,Uyyyy" (คั่นด้วยจุลภาคหรือเว้นวรรค)
export function parseSuperAdminLineIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// ── กันลิงก์ ?next= พาออกไปเว็บอื่น (open redirect) ─────────────────────────
// รับเฉพาะ path ในเว็บเรา เช่น "/rescue" ไม่รับ "//evil.com" หรือ "https://evil.com"
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}

// หลังล็อกอิน: ถ้าเดิมจะไปหน้าไหนและมีสิทธิ์ ไปหน้านั้น ไม่งั้นไปหน้าหลักของบทบาท
export function postLoginPath(
  user: { role: UserRole; status: UserStatus },
  next: string | null | undefined,
): string {
  const target = safeNextPath(next);
  if (target && target !== "/login" && decideAccess(target, user).allow) return target;
  return homePathForRole(user.role);
}
