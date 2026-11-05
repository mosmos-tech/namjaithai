import { NextResponse, type NextRequest } from "next/server";
import {
  decideAccess,
  effectiveUserRole,
  homePathForRole,
  isMembershipActive,
  requiredRolesForPath,
  type UserRole,
  type UserStatus,
} from "@/lib/domain";
import { createProxyClient } from "@/lib/supabase/proxy";

/**
 * ทำงานก่อนทุกหน้า (Next 16 เปลี่ยนชื่อ middleware เป็น proxy)
 * 1. ต่ออายุ session ของ Supabase ให้ทุกหน้า
 * 2. กันหน้า /rescue /unit /admin /my-cases ตามบทบาท (TF-17)
 *    — หน้าเหล่านั้นเช็กสิทธิ์ซ้ำเองด้วย เพราะไม่ควรพึ่ง proxy เป็นด่านเดียว
 */
export async function proxy(request: NextRequest) {
  const { supabase, getResponse } = createProxyClient(request);

  // getClaims ตรวจลายเซ็น JWT และต่ออายุ token ถ้าใกล้หมด (ต้องเรียกทุกครั้ง แม้หน้าสาธารณะ)
  const { data: claims } = await supabase.auth.getClaims();
  const authUserId = claims?.claims.sub ?? null;

  const { pathname } = request.nextUrl;
  if (!requiredRolesForPath(pathname)) return getResponse();

  let appUser: { role: UserRole; status: UserStatus } | null = null;
  if (authUserId) {
    const { data } = await supabase
      .from("users")
      .select("id, role, status")
      .eq("auth_user_id", authUserId)
      .maybeSingle<{ id: string; role: UserRole; status: UserStatus }>();
    if (data) {
      let role = data.role;
      if (role === "RESCUER") {
        const { data: memberships } = await supabase
          .from("unit_members")
          .select("status, expires_at, unit:units(is_active)")
          .eq("user_id", data.id)
          .eq("status", "APPROVED");
        const hasActiveMembership = (memberships ?? []).some((m) =>
          isMembershipActive({
            status: m.status,
            expiresAt: m.expires_at,
            unitIsActive: (m.unit as unknown as { is_active?: boolean } | null)?.is_active,
          }),
        );
        role = effectiveUserRole(role, hasActiveMembership);
      }
      appUser = { role, status: data.status };
    }
  }

  const decision = decideAccess(pathname, appUser);
  if (decision.allow) return getResponse();

  const url = request.nextUrl.clone();
  url.search = "";
  if (decision.reason === "forbidden" && appUser) {
    // ล็อกอินแล้วแต่ไม่มีสิทธิ์หน้านี้ → กลับหน้าหลักของบทบาทตัวเอง
    url.pathname = homePathForRole(appUser.role);
    url.searchParams.set("denied", "1");
  } else {
    url.pathname = "/login";
    if (decision.reason === "inactive") url.searchParams.set("error", "inactive");
    else url.searchParams.set("next", pathname);
  }

  // พก cookie ที่เพิ่งต่ออายุไปด้วย
  const redirect = NextResponse.redirect(url);
  getResponse()
    .cookies.getAll()
    .forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export const config = {
  // ไม่ต้องทำงานกับไฟล์ static, รูป, API (API เช็กสิทธิ์เอง)
  matcher: [
    "/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
