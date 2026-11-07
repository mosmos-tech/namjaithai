import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runLineNotifications } from "@/features/notifications/line-worker";
import { lineWorkerConfigFromEnv } from "@/features/notifications/server/line-config";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { handleCreateSosCase, type SosCaseRpcClient } from "@/features/sos/server/create-case";

/**
 * POST /api/cases
 * รับข้อมูลจากฟอร์มแจ้งขอความช่วยเหลือ SOS 5 ขั้น:
 * 1. ตรวจสอบข้อมูลด้วย sosSchema (ตอบ 400 พร้อมรายชื่อช่องที่ผิดเมื่อข้อมูลไม่ครบ/ผิดรูปแบบ)
 * 2. คำนวณระดับด้วย computeTriage() (TF-55) แล้วคำนวณคะแนนจัดลำดับด้วย priorityScore()
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
    // Ownership is derived from the verified session, never from request JSON.
    reporterUserId: await getCurrentAppUser().then((user) =>
      user?.status === "ACTIVE" ? user.id : null,
    ),
  });

  // TF-34: ปลุก worker LINE หลังตอบผู้แจ้งแล้ว ให้เคสแดงถึงกู้ภัยในไม่กี่วินาที
  // ไม่อยู่ในเส้นทางส่ง SOS — ล้มก็ไม่กระทบผู้แจ้ง และ pg_cron จะเก็บตกทุกนาที
  if (result.status === 201 && process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN) {
    after(async () => {
      try {
        await runLineNotifications(lineWorkerConfigFromEnv(new URL(request.url).origin));
      } catch {
        // ไม่ต้องทำอะไร: งานยังอยู่ในคิว
      }
    });
  }

  return Response.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
