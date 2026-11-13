import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  parseHttpSmsEvent,
  sendHttpSms,
  toE164Thai,
  verifyHttpSmsSignature,
} from "../providers/httpsms";

const KEY = "test-signing-key-1234567890";

function jwt(claims: Record<string, unknown>, key = KEY, alg = "HS256") {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${part({ alg, typ: "JWT" })}.${part(claims)}`;
  const signature = createHmac("sha256", key).update(unsigned).digest("base64url");
  return `Bearer ${unsigned}.${signature}`;
}

describe("TF-36 httpSMS: ตรวจลายเซ็น webhook", () => {
  const now = new Date("2026-11-08T03:00:00Z");
  const nowS = now.getTime() / 1000;

  it("ลายเซ็นถูกต้องผ่าน", () => {
    expect(verifyHttpSmsSignature(jwt({ exp: nowS + 600 }), KEY, now)).toBe(true);
  });

  it("คีย์ผิด / หมดอายุ / ไม่ใช่ HS256 / ไม่มีหัว ไม่ผ่าน", () => {
    expect(verifyHttpSmsSignature(jwt({}, "wrong-key-wrong-key"), KEY, now)).toBe(false);
    expect(verifyHttpSmsSignature(jwt({ exp: nowS - 600 }), KEY, now)).toBe(false);
    expect(verifyHttpSmsSignature(jwt({}, KEY, "none"), KEY, now)).toBe(false);
    expect(verifyHttpSmsSignature(null, KEY, now)).toBe(false);
    expect(verifyHttpSmsSignature(jwt({}), "", now)).toBe(false);
  });
});

describe("TF-36 httpSMS: แปลง event", () => {
  const event = {
    type: "message.phone.received",
    id: "evt-1",
    data: {
      message_id: "msg-1",
      contact: "+66812345678",
      content: "SOS FLOOD 13.75,100.50 P2",
      owner: "+66800000000",
    },
  };

  it("event ได้รับ SMS แปลงเป็นรูปแบบกลาง", () => {
    expect(parseHttpSmsEvent(event)).toEqual({
      provider: "httpsms",
      messageId: "msg-1",
      from: "+66812345678",
      body: "SOS FLOOD 13.75,100.50 P2",
      owner: "+66800000000",
    });
  });

  it("event อื่นหรือข้อมูลไม่ครบ = null", () => {
    expect(parseHttpSmsEvent({ ...event, type: "message.phone.sent" })).toBeNull();
    expect(parseHttpSmsEvent({ ...event, data: { ...event.data, contact: 1 } })).toBeNull();
    expect(parseHttpSmsEvent("x")).toBeNull();
  });
});

describe("TF-36 httpSMS: ส่ง SMS ตอบกลับ", () => {
  it("ส่งด้วย x-api-key และเบอร์รูปแบบสากล", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const ok = await sendHttpSms({
      apiKey: "api-key",
      from: "0800000000",
      to: "+66812345678",
      content: "สวัสดี",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.httpsms.com/v1/messages/send");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("api-key");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "+66800000000",
      to: "+66812345678",
      content: "สวัสดี",
    });
  });

  it("ส่งไม่สำเร็จคืน false ไม่โยน error", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      sendHttpSms({
        apiKey: "k",
        from: "0800000000",
        to: "0812345678",
        content: "x",
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).resolves.toBe(false);
    expect(toE164Thai("0812345678")).toBe("+66812345678");
  });
});
