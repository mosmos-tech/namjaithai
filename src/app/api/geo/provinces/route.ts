import { connection } from "next/server";
import { listProvinces } from "@/features/geo/queries";
import { listResponse } from "@/features/geo/http";

// GET /api/geo/provinces → จังหวัดทั้งหมด เรียงตามชื่อไทย
export async function GET() {
  // ไม่ให้ build ดึงข้อมูลล่วงหน้า เพราะตอน build (CI/Vercel) ไม่มีฐานข้อมูลให้ต่อ
  await connection();
  return listResponse(await listProvinces());
}
