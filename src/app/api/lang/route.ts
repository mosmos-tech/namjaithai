import { NextResponse, type NextRequest } from "next/server";
import {
  isLocale,
  isReporterPath,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  localePath,
  stripLocale,
} from "@/lib/i18n/locale";

/**
 * TF-63: ปุ่มสลับภาษา — จำภาษาใน cookie แล้วพาไปหน้าเดิมของอีกภาษา
 * รับเฉพาะ path ฝั่งผู้แจ้งในเว็บเราเอง (กัน open redirect) ไม่ตรงเงื่อนไขพาไปหน้าแรก
 */
export function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale");
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
  const [pathname, query = ""] = stripLocale(safe).path.split("?");
  const target = isLocale(locale) && isReporterPath(pathname) ? localePath(pathname, locale) : "/";
  const url = new URL(
    target + (query && target !== "/" ? `?${query}` : ""),
    request.nextUrl.origin,
  );
  const response = NextResponse.redirect(url, 303);
  if (isLocale(locale)) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
