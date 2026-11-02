import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * ตัวเชื่อม Supabase สำหรับ src/proxy.ts (ทำงานก่อนทุกหน้า)
 * แยกจาก server.ts เพราะใน proxy อ่าน/เขียน cookie ผ่าน request/response ไม่ใช่ cookies() ของ next/headers
 *
 * หน้าที่หลัก: ต่ออายุ session ของ Supabase (token หมดอายุทุก 1 ชม.) แล้วเขียน cookie ใหม่กลับไป
 * ทุก response ที่ proxy ส่งออกต้องพก cookie จาก `response` ตัวนี้ไปด้วย ไม่งั้นผู้ใช้จะหลุดล็อกอิน
 */
export function createProxyClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  return { supabase, getResponse: () => response };
}
