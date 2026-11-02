import { NextResponse, type NextRequest } from "next/server";
import { postLoginPath } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { upsertAppUserOnLogin } from "@/features/auth/server/app-user";
import { LOGIN_NEXT_COOKIE } from "@/features/auth/login-next-cookie";

/**
 * GET /auth/callback?code=... — LINE → Supabase → กลับมาที่นี่หลังผู้ใช้กดยืนยัน
 * 1. แลก code เป็น session (Supabase เขียน cookie ล็อกอินให้)
 * 2. สร้าง/อัปเดตแถวใน public.users (ครั้งแรกเป็นผู้ใช้ทั่วไป, SUPER_ADMIN_LINE_IDS เป็นแอดมิน)
 * 3. พาไปหน้าตามบทบาท
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
    res.cookies.delete(LOGIN_NEXT_COOKIE);
    return res;
  };

  // ผู้ใช้กด "ยกเลิก" ในหน้า LINE ได้ access_denied; error อื่น = ฝั่ง LINE/Supabase มีปัญหา
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) return fail(providerError === "access_denied" ? "cancelled" : "line");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return fail("line");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail("line");

  let appUser;
  try {
    appUser = await upsertAppUserOnLogin(data.user);
  } catch {
    await supabase.auth.signOut();
    return fail("profile");
  }

  if (appUser.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return fail("inactive");
  }

  const next = request.cookies.get(LOGIN_NEXT_COOKIE)?.value;
  const res = NextResponse.redirect(new URL(postLoginPath(appUser, next), origin));
  res.cookies.delete(LOGIN_NEXT_COOKIE);
  return res;
}
