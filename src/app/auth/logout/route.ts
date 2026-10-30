import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /auth/logout — ปุ่มออกจากระบบ (ใช้ POST กันเว็บอื่นแอบพาออกจากระบบด้วยลิงก์/รูป)
 * 303 ให้เบราว์เซอร์เปิดหน้าแรกด้วย GET
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
}
