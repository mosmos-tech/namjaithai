import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminDb, randomPhone, uniqueTestPoint } from "./helpers/db";

/**
 * TF-36 SOS ผ่าน SMS — จำลองแอป httpSMS ยิง webhook ที่เซ็นแล้ว
 * ไม่มี HTTPSMS_API_KEY ในชุดทดสอบ จึงไม่ส่ง SMS จริง แต่ผลการตอบกลับบันทึกใน sms_inbound_messages
 */
const KEY = process.env.HTTPSMS_WEBHOOK_SIGNING_KEY ?? "";
const GATEWAY = process.env.NEXT_PUBLIC_SMS_GATEWAY_NUMBER?.trim() || "0800000036";

function signature(key = KEY) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${part({ alg: "HS256", typ: "JWT" })}.${part({ iat: now, exp: now + 300 })}`;
  return `Bearer ${unsigned}.${createHmac("sha256", key).update(unsigned).digest("base64url")}`;
}

async function sendSms(request: APIRequestContext, from: string, content: string, key = KEY) {
  const messageId = randomUUID();
  const response = await request.post("/api/sms/inbound", {
    headers: { Authorization: signature(key), "X-Event-Type": "message.phone.received" },
    data: {
      specversion: "1.0",
      type: "message.phone.received",
      id: randomUUID(),
      data: {
        message_id: messageId,
        contact: `+66${from.slice(1)}`,
        owner: `+66${GATEWAY.slice(1)}`,
        content,
      },
    },
  });
  return { response, messageId };
}

async function inbound(messageId: string) {
  const { data } = await adminDb()
    .from("sms_inbound_messages")
    .select("result, reply_kind, case_id, parse_error")
    .eq("provider_message_id", messageId)
    .single();
  return data;
}

test.describe("TF-36 SOS ผ่าน SMS", () => {
  test.beforeAll(() => {
    expect(
      KEY,
      "ต้องตั้ง HTTPSMS_WEBHOOK_SIGNING_KEY ให้ dev server (ดู docs/sms-gateway.md)",
    ).not.toBe("");
  });

  test("ข้อความถูกรูปแบบสร้างเคสได้ พิกัดจาก SMS และตอบรหัสเคส", async ({ request }) => {
    const phone = randomPhone();
    const { lat, lng } = uniqueTestPoint();
    const { response, messageId } = await sendSms(
      request,
      phone,
      `SOS FLOOD ROOF ${lat},${lng} P5 B1 E2`,
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ result: "CREATED" });

    const row = await inbound(messageId);
    expect(row).toMatchObject({ result: "CREATED", reply_kind: "CREATED" });
    const { data: item } = await adminDb()
      .from("cases")
      .select(
        "source, location_source, accuracy_m, consent_version, urgency, case_people(adults, elderly, bedridden)",
      )
      .eq("id", row!.case_id)
      .single();
    expect(item).toMatchObject({
      source: "SMS",
      location_source: "SMS",
      accuracy_m: null,
      consent_version: "SMS-2026-11-08",
      // น้ำถึงหลังคา → แดง (คำนวณที่เซิร์ฟเวอร์ ไม่ได้มาจากข้อความ)
      urgency: "RED",
    });
    expect(item?.case_people).toMatchObject({ adults: 2, elderly: 2, bedridden: 1 });
  });

  test("เบอร์เดิมส่งซ้ำ ได้รหัสเคสเดิม และบันทึกไทม์ไลน์ว่าส่ง SMS ซ้ำ", async ({ request }) => {
    const phone = randomPhone();
    const first = await sendSms(
      request,
      phone,
      `SOS ${Object.values(uniqueTestPoint()).join(",")} P2`,
    );
    const original = await inbound(first.messageId);

    const again = await sendSms(
      request,
      phone,
      `SOS ${Object.values(uniqueTestPoint()).join(",")} P2`,
    );
    expect(await again.response.json()).toMatchObject({ result: "REPEAT" });
    const repeat = await inbound(again.messageId);
    expect(repeat).toMatchObject({
      result: "REPEAT",
      reply_kind: "REPEAT",
      case_id: original!.case_id,
    });

    const { data: events } = await adminDb()
      .from("case_events")
      .select("event_type, metadata")
      .eq("case_id", original!.case_id)
      .eq("event_type", "SMS_REPEATED");
    expect(events).toEqual([{ event_type: "SMS_REPEATED", metadata: { channel: "SMS" } }]);
  });

  test("ข้อความผิดรูปแบบไม่สร้างเคส และตอบวิธีส่งที่ถูก", async ({ request }) => {
    const { response, messageId } = await sendSms(request, randomPhone(), "ช่วยด้วย น้ำท่วมบ้าน");
    expect(await response.json()).toMatchObject({ result: "INVALID" });
    expect(await inbound(messageId)).toMatchObject({
      result: "INVALID",
      reply_kind: "HELP",
      parse_error: "NOT_SOS",
      case_id: null,
    });
  });

  test("webhook ที่ไม่ได้เซ็นด้วยคีย์ของเรา ถูกปฏิเสธ", async ({ request }) => {
    const { response, messageId } = await sendSms(
      request,
      randomPhone(),
      `SOS ${Object.values(uniqueTestPoint()).join(",")}`,
      "attacker-key-attacker-key",
    );
    expect(response.status()).toBe(401);
    expect(await inbound(messageId)).toBeNull();
  });
});
