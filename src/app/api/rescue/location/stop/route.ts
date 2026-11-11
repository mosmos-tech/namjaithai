import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/rescue/location/stop — TF-28 หยุดแชร์ตำแหน่ง (ลบแถวของตัวเอง)
 * หน้าเว็บส่งด้วย navigator.sendBeacon ตอนปิดแท็บ/รีเฟรช (ส่ง cookie ไปด้วย) — ไม่ล็อกอินก็ตอบ 204 เฉยๆ
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.rpc("stop_sharing_location");
  return new NextResponse(null, { status: 204 });
}
