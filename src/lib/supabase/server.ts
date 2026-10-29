import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// ใช้อ่านข้อมูลสาธารณะที่ทุกคนเห็นเหมือนกัน (เช่น จังหวัด/อำเภอ/ตำบล) ในฟังก์ชันที่มี "use cache"
// ไม่อ่าน cookies เพราะ "use cache" ห้ามเรียก cookies() และข้อมูลแบบนี้ไม่ขึ้นกับว่าใครล็อกอิน
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// ใช้ในหน้า/โค้ดฝั่งเซิร์ฟเวอร์ (Server Component, Route Handler, Server Action)
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // เรียกจาก Server Component ตั้ง cookie ไม่ได้ ไม่เป็นไร middleware จะจัดการให้
          }
        },
      },
    },
  );
}
