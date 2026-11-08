import { createHmac, timingSafeEqual } from "node:crypto";
import type { InboundSms } from "../inbound";

/**
 * Adapter ของ httpSMS (https://httpsms.com) — แอป open source บนมือถือ Android
 * ที่ส่งต่อ SMS ขาเข้าของซิมในเครื่องมาที่ webhook และส่ง SMS ออกผ่าน API
 *
 * webhook: CloudEvents JSON, หัว X-Event-Type, Authorization: Bearer <JWT HS256 เซ็นด้วย signing key>
 * ส่ง SMS: POST https://api.httpsms.com/v1/messages/send หัว x-api-key
 */

export const HTTPSMS_PROVIDER = "httpsms";
export const HTTPSMS_RECEIVED_EVENT = "message.phone.received";
const SEND_URL = "https://api.httpsms.com/v1/messages/send";
// เผื่อนาฬิกาของเครื่อง/เซิร์ฟเวอร์ไม่ตรงกัน
const CLOCK_SKEW_S = 60;

function base64UrlJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** ตรวจลายเซ็น JWT HS256 จากหัว Authorization — ไม่ผ่าน = ไม่ได้มาจากเครื่อง gateway ของเรา */
export function verifyHttpSmsSignature(
  authorization: string | null,
  signingKey: string,
  now: Date = new Date(),
): boolean {
  const token = /^Bearer\s+([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(authorization?.trim() ?? "");
  if (!token || !signingKey) return false;
  const [, header, payload, signature] = token;

  const head = base64UrlJson(header);
  if (head?.alg !== "HS256") return false;

  const expected = createHmac("sha256", signingKey).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

  const claims = base64UrlJson(payload);
  if (!claims) return false;
  const nowS = now.getTime() / 1000;
  if (typeof claims.exp === "number" && claims.exp + CLOCK_SKEW_S < nowS) return false;
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) return false;
  return true;
}

/** แปลง event "ได้รับ SMS" เป็นรูปแบบกลาง · event อื่นหรือข้อมูลไม่ครบ = null */
export function parseHttpSmsEvent(body: unknown): (InboundSms & { owner: string }) | null {
  if (typeof body !== "object" || body === null) return null;
  const event = body as { type?: unknown; id?: unknown; data?: Record<string, unknown> };
  if (event.type !== HTTPSMS_RECEIVED_EVENT || typeof event.data !== "object" || !event.data) {
    return null;
  }
  const { message_id: messageId, contact, content, owner } = event.data;
  const id = typeof messageId === "string" && messageId ? messageId : event.id;
  if (
    typeof id !== "string" ||
    !id ||
    id.length > 128 ||
    typeof contact !== "string" ||
    typeof content !== "string" ||
    typeof owner !== "string"
  ) {
    return null;
  }
  return { provider: HTTPSMS_PROVIDER, messageId: id, from: contact, body: content, owner };
}

/** เบอร์ไทย 0812345678 → +66812345678 (httpSMS ใช้รูปแบบสากล) */
export function toE164Thai(phone: string): string {
  const digits = phone.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+")) return digits;
  return digits.startsWith("0") ? `+66${digits.slice(1)}` : `+${digits}`;
}

export async function sendHttpSms(input: {
  apiKey: string;
  from: string;
  to: string;
  content: string;
  fetcher?: typeof fetch;
}): Promise<boolean> {
  try {
    const response = await (input.fetcher ?? fetch)(SEND_URL, {
      method: "POST",
      headers: { "x-api-key": input.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: toE164Thai(input.from),
        to: toE164Thai(input.to),
        content: input.content,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
