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
import {
  isReporterPath,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  localeFromAcceptLanguage,
  stripLocale,
  type Locale,
} from "@/lib/i18n/locale";

/**
 * TF-63: เลือกภาษาให้ครั้งแรกที่เปิดหน้าฝั่งผู้แจ้ง (ยังไม่มี cookie ภาษา) ตามภาษาของเบราว์เซอร์
 * - เปิดหน้าไทยแต่เบราว์เซอร์ไม่ใช่ภาษาไทย → พาไป /en/... แล้วจำไว้ใน cookie
 * - มี cookie แล้ว (เคยเลือก/เคยถูกพาไปแล้ว) → ไม่ยุ่ง ภาษาเป็นไปตามลิงก์และปุ่มสลับ
 * - เฉพาะการเปิดหน้าเว็บจริง (ไม่ใช่ prefetch / service worker ดาวน์โหลดหน้าไว้ใช้ออฟไลน์)
 * - อ่านค่าไม่ได้หรือ error ใดๆ → แสดงหน้าไทยตามปกติ ห้ามทำให้หน้า SOS เปิดไม่ได้
 */
function firstVisitLocale(request: NextRequest): { redirect?: URL; remember?: Locale } {
  try {
    if (request.method !== "GET" || request.cookies.has(LOCALE_COOKIE)) return {};
    const { locale: pathLocale, path } = stripLocale(request.nextUrl.pathname);
    if (!isReporterPath(path)) return {};
    const isPage =
      request.headers.get("sec-fetch-dest") === "document" ||
      (request.headers.get("accept") ?? "").includes("text/html");
    if (!isPage || request.headers.has("rsc") || request.headers.has("next-router-prefetch")) {
      return {};
    }
    if (pathLocale === "en") return { remember: "en" };
    const preferred = localeFromAcceptLanguage(request.headers.get("accept-language"));
    if (preferred === "th") return { remember: "th" };
    const url = request.nextUrl.clone();
    url.pathname = `/en${path}`;
    return { redirect: url, remember: "en" };
  } catch {
    return {};
  }
}

function rememberLocale(response: NextResponse, locale: Locale | undefined): NextResponse {
  if (locale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

/**
 * ทำงานก่อนทุกหน้า (Next 16 เปลี่ยนชื่อ middleware เป็น proxy)
 * 1. ต่ออายุ session ของ Supabase ให้ทุกหน้า
 * 2. กันหน้า /rescue /unit /admin /my-cases ตามบทบาท (TF-17)
 *    — หน้าเหล่านั้นเช็กสิทธิ์ซ้ำเองด้วย เพราะไม่ควรพึ่ง proxy เป็นด่านเดียว
 */
export async function proxy(request: NextRequest) {
  const language = firstVisitLocale(request);
  if (language.redirect) {
    const session = await handleSession(request);
    const redirect = NextResponse.redirect(language.redirect);
    session.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return rememberLocale(redirect, language.remember);
  }
  return rememberLocale(await handleSession(request), language.remember);
}

async function handleSession(request: NextRequest): Promise<NextResponse> {
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
    "/((?!_next/static|_next/image|api/|pwa/|sw.js|manifest.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
