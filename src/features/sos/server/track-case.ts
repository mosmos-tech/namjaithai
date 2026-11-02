import {
  caseCodeSchema,
  phoneLast4Schema,
  trackingTokenSchema,
  type TrackedCase,
} from "../../../lib/domain";
import { extractClientIp } from "./create-case";

/**
 * อินเทอร์เฟซขั้นต่ำของ Supabase client ที่ใช้เรียก RPC get_case_tracking
 * แยกไว้เหมือน create-case.ts เพื่อส่ง mock เข้ามาทดสอบด้วย Vitest ได้
 */
export interface TrackCaseRpcClient {
  rpc(
    fn: "get_case_tracking",
    args: {
      p_case_code: string;
      p_phone_last4: string | null;
      p_tracking_token: string | null;
      p_client_ip: string | null;
    },
  ): PromiseLike<{
    data: TrackedCase | null;
    error: { code?: string; message: string; hint?: string | null } | null;
  }>;
}

export type TrackCaseResult =
  | { status: 200; body: TrackedCase; headers: Record<string, string> }
  | { status: 400 | 404 | 500; body: { error: string }; headers: Record<string, string> }
  | {
      status: 429;
      body: { error: string; retryAfterSeconds: number };
      headers: Record<string, string>;
    };

// สถานะเคสเปลี่ยนตลอด ห้าม CDN หรือเบราว์เซอร์เก็บคำตอบไว้
const NO_STORE = { "Cache-Control": "no-store" };

const NOT_FOUND = "ไม่พบเคสนี้ ตรวจสอบรหัสเคสและเบอร์โทร 4 ตัวท้ายอีกครั้ง";

/**
 * ดึงข้อมูลติดตามเคส ยืนยันด้วยอย่างใดอย่างหนึ่ง:
 * - { trackingToken } จากลิงก์ที่แชร์ / หน้าส่งสำเร็จ
 * - { phoneLast4 } ที่ผู้แจ้งพิมพ์เองที่หน้า /track
 */
export async function handleTrackCase(params: {
  caseCode: string;
  proof: { trackingToken: string } | { phoneLast4: string };
  headers: Headers;
  supabase: TrackCaseRpcClient;
}): Promise<TrackCaseResult> {
  const { proof, headers, supabase } = params;

  const code = caseCodeSchema.safeParse(params.caseCode);
  if (!code.success) {
    return { status: 400, body: { error: code.error.issues[0].message }, headers: NO_STORE };
  }

  const parsed =
    "trackingToken" in proof
      ? trackingTokenSchema.safeParse(proof.trackingToken)
      : phoneLast4Schema.safeParse(proof.phoneLast4);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.issues[0].message }, headers: NO_STORE };
  }
  const token = "trackingToken" in proof ? parsed.data : null;
  const last4 = "phoneLast4" in proof ? parsed.data : null;

  const { data, error } = await supabase.rpc("get_case_tracking", {
    p_case_code: code.data,
    p_phone_last4: last4,
    p_tracking_token: token,
    p_client_ip: extractClientIp(headers),
  });

  if (error) {
    // ใส่ผิดเกิน 10 ครั้งใน 15 นาที (SOS29 จาก get_case_tracking)
    if (error.code === "SOS29") {
      const retryAfterSeconds = Math.max(1, Number.parseInt(error.hint ?? "900", 10) || 900);
      return {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(retryAfterSeconds) },
        body: {
          error: `ใส่ข้อมูลผิดหลายครั้งเกินไป กรุณารอ ${Math.ceil(retryAfterSeconds / 60)} นาทีแล้วลองใหม่ หรือโทร 1669 / 1784`,
          retryAfterSeconds,
        },
      };
    }
    return {
      status: 500,
      body: { error: "ดึงข้อมูลเคสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      headers: NO_STORE,
    };
  }

  if (!data) {
    return { status: 404, body: { error: NOT_FOUND }, headers: NO_STORE };
  }

  return { status: 200, body: data, headers: NO_STORE };
}
