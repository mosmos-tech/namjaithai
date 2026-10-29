import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * สร้าง Supabase client สำหรับงานฝั่งเซิร์ฟเวอร์ที่ต้องใช้สิทธิ์ระดับระบบ (service_role)
 * เช่น การเรียกฟังก์ชัน create_sos_case() ที่ไม่อนุญาตให้เบราว์เซอร์เรียกตรงๆ
 *
 * คำเตือน: ห้ามเรียกใช้ในฝั่งเบราว์เซอร์ ("use client") เด็ดขาด เพราะใช้ SUPABASE_SECRET_KEY
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() ห้ามเรียกใช้ในฝั่งเบราว์เซอร์");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "ไม่พบค่า NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SECRET_KEY ใน environment",
    );
  }

  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
