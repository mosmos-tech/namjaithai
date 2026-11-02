import { NextResponse } from "next/server";
import type { z } from "zod";

// รายชื่อพื้นที่แทบไม่เปลี่ยน ให้ CDN ของ Vercel เก็บไว้ 1 วัน และใช้ของเก่าต่อได้อีก 7 วันระหว่างดึงใหม่
const LIST_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";

export function listResponse<T>(data: T) {
  return NextResponse.json(data, { headers: { "Cache-Control": LIST_CACHE } });
}

// ส่งข้อความ error ข้อแรกจาก Zod กลับไป (เป็นภาษาไทยอยู่แล้ว) พร้อม 400
export function badRequest(error: z.ZodError) {
  return NextResponse.json(
    { error: error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
    { status: 400 },
  );
}
