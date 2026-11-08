import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeThaiPhone } from "@/lib/domain";
import { handleCreateSosCase, type SosCaseRpcClient } from "@/features/sos/server/create-case";
import { handleInboundSms, type SmsInboundClient } from "@/features/sms/inbound";
import {
  parseHttpSmsEvent,
  sendHttpSms,
  verifyHttpSmsSignature,
} from "@/features/sms/providers/httpsms";
import { smsConfigFromEnv } from "@/features/sms/server/sms-config";

const MAX_BODY_BYTES = 16_000;
const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/sms/inbound — webhook ของแอป httpSMS บนมือถือ gateway (TF-36)
 * รับ SMS "SOS ..." แล้วสร้างเคสด้วยกติกาเดียวกับฟอร์มเว็บ และตอบรหัสเคสกลับทาง SMS
 */
export async function POST(request: Request): Promise<Response> {
  const config = smsConfigFromEnv();
  if (!config.signingKey) {
    return Response.json(
      { error: "ยังไม่ได้ตั้งค่า SMS gateway" },
      { status: 503, headers: noStore },
    );
  }
  if (!verifyHttpSmsSignature(request.headers.get("authorization"), config.signingKey)) {
    return Response.json({ error: "ลายเซ็นไม่ถูกต้อง" }, { status: 401, headers: noStore });
  }

  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    return Response.json({ error: "ข้อมูลใหญ่เกินกำหนด" }, { status: 413, headers: noStore });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400, headers: noStore });
  }

  const message = parseHttpSmsEvent(body);
  // event อื่นของ httpSMS (เช่น ส่งสำเร็จ) ตอบ 200 เฉยๆ ไม่ให้ผู้ให้บริการส่งซ้ำ
  if (!message) return Response.json({ ignored: "event" }, { headers: noStore });
  if (config.gatewayPhone && normalizeThaiPhone(message.owner) !== config.gatewayPhone) {
    return Response.json(
      { error: "ไม่ใช่เครื่อง gateway ของระบบ" },
      { status: 403, headers: noStore },
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json({ error: "ระบบยังไม่พร้อม" }, { status: 503, headers: noStore });
  }

  const result = await handleInboundSms({
    message,
    db: admin as unknown as SmsInboundClient,
    origin: config.baseUrl ?? new URL(request.url).origin,
    createCase: ({ rawBody, idempotencyKey }) =>
      handleCreateSosCase({
        rawBody,
        headers: new Headers({ "Idempotency-Key": idempotencyKey }),
        supabase: admin as unknown as SosCaseRpcClient,
        channel: "SMS",
      }),
    // ไม่มี API key (เช่นในเครื่อง/E2E) = ไม่ส่ง SMS จริง แต่ผลยังบันทึกใน sms_inbound_messages
    sendReply: (to, content) =>
      config.apiKey && config.gatewayPhone
        ? sendHttpSms({ apiKey: config.apiKey, from: config.gatewayPhone, to, content })
        : Promise.resolve(false),
  });
  return Response.json(result.body, { status: result.status, headers: noStore });
}
