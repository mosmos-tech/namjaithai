import { createBrowserClient } from "@supabase/ssr";

// ใช้ในคอมโพเนนต์ฝั่งเบราว์เซอร์ ("use client")
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
