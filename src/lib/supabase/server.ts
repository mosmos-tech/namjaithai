import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
