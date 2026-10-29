import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleCreateSosCase,
  type SosCaseRpcClient,
} from "@/features/sos/server/create-case";

/**
 * POST /api/cases
 * รับข้อมูลจากฟอร์มแจ้งขอความช่วยเหลือ SOS 5 ขั้น:
 * 1. ตรวจสอบข้อมูลด้วย sosSchema (ตอบ 400 พร้อมรายชื่อช่องที่ผิดเมื่อข้อมูลไม่ครบ/ผิดรูปแบบ)
 * 2. คำนวณคะแนนความเร่งด่วนด้วย priorityScore()
 * 3. บันทึกทุกตารางในครั้งเดียวผ่านฟังก์ชันฐานข้อมูล create_sos_case()
 * 4. ป้องกันการส่งซ้ำด้วยหัวข้อมูล Idempotency-Key และจำกัดจำนวนครั้งต่อเบอร์โทร/IP
 */
export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      {
        error: "รูปแบบ JSON ในคำขอไม่ถูกต้อง",
        fieldErrors: {},
        formErrors: ["รูปแบบ JSON ในคำขอไม่ถูกต้อง"],
        fields: [],
      },
      { status: 400 },
    );
  }

  let supabase: SosCaseRpcClient;
  try {
    supabase = createAdminClient() as unknown as SosCaseRpcClient;
  } catch {
    return Response.json(
      {
        error: "ระบบฐานข้อมูลยังตั้งค่าไม่สมบูรณ์ กรุณาตรวจสอบ SUPABASE_SECRET_KEY",
      },
      { status: 500 },
    );
  }

  const result = await handleCreateSosCase({
    rawBody,
    headers: request.headers,
    supabase,
  });

  return Response.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
