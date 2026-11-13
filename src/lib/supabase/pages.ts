import { createServerClient } from "@supabase/ssr";
import type { IncomingMessage } from "node:http";

// ใช้ใน getServerSideProps ของ Pages Router (ตอนนี้มีหน้าเดียวคือหน้าแรก src/pages/index.tsx — TF-41)
// Pages Router เรียก cookies() จาก next/headers ไม่ได้ จึงอ่านจาก req โดยตรง
// ไม่เขียน cookie กลับ เพราะ proxy ต่ออายุ session และส่ง cookie ใหม่มากับคำขอนี้แล้ว
export function createPagesClient(
  req: IncomingMessage & { cookies: Partial<Record<string, string>> },
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () =>
          Object.entries(req.cookies).flatMap(([name, value]) =>
            value === undefined ? [] : [{ name, value }],
          ),
        setAll() {},
      },
    },
  );
}
