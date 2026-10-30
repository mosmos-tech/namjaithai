import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { LINE_PROVIDER } from "@/features/auth/line-identity";
import { LOGIN_NEXT_COOKIE, LOGIN_NEXT_COOKIE_OPTIONS } from "@/features/auth/login-next-cookie";

/**
 * GET /auth/line?next=/rescue — ปุ่ม "เข้าสู่ระบบด้วย LINE" ลิงก์มาที่นี่
 * เริ่มล็อกอินฝั่งเซิร์ฟเวอร์ (PKCE: Supabase เก็บ code verifier ไว้ใน cookie) แล้วพาไปหน้า LINE
 * ทำฝั่งเซิร์ฟเวอร์เพื่อให้ปุ่มเป็นลิงก์ธรรมดา กดได้แม้ JavaScript ยังโหลดไม่เสร็จ
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: LINE_PROVIDER,
    options: {
      redirectTo: new URL("/auth/callback", request.nextUrl.origin).href,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/login?error=line", request.nextUrl.origin));
  }

  const response = NextResponse.redirect(data.url);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (next) response.cookies.set(LOGIN_NEXT_COOKIE, next, LOGIN_NEXT_COOKIE_OPTIONS);
  else response.cookies.delete(LOGIN_NEXT_COOKIE);
  return response;
}
