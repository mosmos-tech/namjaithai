import { createAdminClient } from "@/lib/supabase/admin";
import { handleTrackCase, type TrackCaseRpcClient } from "@/features/sos/server/track-case";

/**
 * POST /api/track  { caseCode, phoneLast4 }
 * ใช้ตอนผู้แจ้งพิมพ์รหัสเคส + เบอร์ 4 ตัวท้ายเองที่หน้า /track
 * ใช้ POST เพื่อไม่ให้ 4 ตัวท้ายไปค้างใน URL / ประวัติเบราว์เซอร์ / log
 * ตอบ trackingToken กลับไปด้วย หน้าเว็บจะใช้ token ดึงข้อมูลรอบต่อๆ ไป
 */
export async function POST(request: Request): Promise<Response> {
  let body: { caseCode?: unknown; phoneLast4?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "รูปแบบ JSON ในคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const result = await handleTrackCase({
    caseCode: typeof body.caseCode === "string" ? body.caseCode : "",
    proof: { phoneLast4: typeof body.phoneLast4 === "string" ? body.phoneLast4 : "" },
    headers: request.headers,
    supabase: createAdminClient() as unknown as TrackCaseRpcClient,
  });
  return Response.json(result.body, { status: result.status, headers: result.headers });
}
