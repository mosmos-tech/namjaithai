import {
  formatSmsReply,
  normalizeThaiPhone,
  parseSmsSos,
  type SmsReplyKind,
  type SmsSosData,
} from "../../lib/domain";
import type { CreateSosCaseResult } from "../sos/server/create-case";

/**
 * ตัวจัดการ SMS SOS กลาง (TF-36) — ไม่ผูกกับผู้ให้บริการ
 * adapter ของแต่ละเจ้า (providers/) ตรวจลายเซ็นและแปลงข้อมูลเป็น InboundSms ก่อนส่งเข้ามา
 *
 * ขั้นตอน: บันทึกข้อความ (กันซ้ำ) → อ่านรูปแบบ → สร้างเคสด้วยกติกาเดียวกับฟอร์มเว็บ
 *         → บันทึกผล (ฐานข้อมูลตัดสินว่าควรตอบไหม) → ตอบกลับ
 */

export type InboundSms = {
  provider: string;
  messageId: string;
  from: string;
  body: string;
};

export type SmsResult =
  "CREATED" | "REPEAT" | "INVALID" | "UNSUPPORTED_INCIDENT" | "RATE_LIMITED" | "ERROR";

export interface SmsInboundClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export type CreateSmsCase = (input: {
  rawBody: Record<string, unknown>;
  idempotencyKey: string;
}) => Promise<CreateSosCaseResult>;

export type SmsReplySender = (to: string, text: string) => Promise<boolean>;

/** ช่องที่ SMS ไม่มี เติมให้ผ่านกติกา sosSchema ตัวเดียวกับเว็บ */
export function smsCaseBody(data: SmsSosData, phone: string): Record<string, unknown> {
  return {
    incidentType: data.incidentType,
    ...(data.waterLevel ? { waterLevel: data.waterLevel } : {}),
    dangerSigns: [],
    // ถือว่าออกเองไม่ได้ไว้ก่อน (over-triage) — คนที่ส่ง SOS มาทาง SMS ส่วนใหญ่ติดอยู่
    canSelfEvacuate: false,
    lat: data.lat,
    lng: data.lng,
    landmark: "แจ้งทาง SMS",
    adults: data.adults,
    elderly: data.elderly,
    bedridden: data.bedridden,
    children: data.children,
    pets: 0,
    hasDisabled: false,
    hasInjured: false,
    needs: [],
    name: "ผู้แจ้งทาง SMS",
    phone,
    // ผ่าน sosSchema เท่านั้น: ฐานข้อมูลบันทึกความยินยอมฉบับ SMS และไม่บันทึกความยินยอมข้อมูลสุขภาพ
    consent: true,
    healthConsent: true,
  };
}

export async function handleInboundSms(input: {
  message: InboundSms;
  db: SmsInboundClient;
  createCase: CreateSmsCase;
  sendReply: SmsReplySender;
  origin: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { message, db } = input;
  const phone = normalizeThaiPhone(message.from);
  // เบอร์ที่ไม่ใช่เบอร์ไทย (เช่น SMS โฆษณาจากเครือข่าย) ไม่ตอบ กันวนลูปกับระบบอัตโนมัติ
  if (!phone) return { status: 200, body: { ignored: "sender" } };

  const recorded = await db.rpc("record_sms_inbound", {
    p_provider: message.provider,
    p_message_id: message.messageId,
    p_phone: phone,
  });
  const row = (recorded.data as { id: string; handled: boolean }[] | null)?.[0];
  if (recorded.error || !row) return { status: 500, body: { error: "บันทึก SMS ไม่สำเร็จ" } };
  if (row.handled) return { status: 200, body: { duplicate: true } };

  let result: SmsResult;
  let reply: SmsReplyKind;
  let caseId: string | null = null;
  let caseCode: string | undefined;
  let trackingToken: string | undefined;
  let parseError: string | null = null;

  const parsed = parseSmsSos(message.body);
  if (!parsed.ok) {
    result = parsed.reason === "UNSUPPORTED_INCIDENT" ? "UNSUPPORTED_INCIDENT" : "INVALID";
    reply = parsed.reason === "UNSUPPORTED_INCIDENT" ? "UNSUPPORTED_INCIDENT" : "HELP";
    parseError = parsed.reason;
  } else {
    const idempotencyKey = `sms:${message.provider}:${message.messageId}`;
    const rawBody = smsCaseBody(parsed.data, phone);
    let created = await input.createCase({ rawBody, idempotencyKey });
    // พบเคสใกล้กันแต่เป็นเบอร์อื่น: SMS ถามผู้แจ้งไม่ได้ จึงสร้างเคสใหม่ (ระบบติดป้าย "อาจซ้ำ" ให้แอดมินเอง)
    if (
      created.status === 409 &&
      created.body.candidate.matchReason !== "SAME_PHONE" &&
      created.body.candidate.matchReason !== "BOTH"
    ) {
      created = await input.createCase({
        rawBody: { ...rawBody, duplicateAction: "CREATE_NEW" },
        idempotencyKey,
      });
    }

    if (created.status === 200 || created.status === 201) {
      result = "CREATED";
      reply = "CREATED";
      caseId = created.body.caseId;
      caseCode = created.body.caseCode;
      trackingToken = created.body.trackingToken;
    } else if (created.status === 409) {
      // เบอร์เดิมมีเคสเปิดอยู่: ตอบรหัสเคสเดิม ไม่สร้างเคสใหม่
      result = "REPEAT";
      reply = "REPEAT";
      caseId = created.body.candidate.caseId;
      caseCode = created.body.candidate.caseCode;
    } else if (created.status === 429) {
      result = "RATE_LIMITED";
      reply = "RATE_LIMITED";
    } else if (created.status === 400) {
      result = "INVALID";
      reply = "HELP";
      parseError = "REJECTED";
    } else {
      result = "ERROR";
      reply = "ERROR";
    }
  }

  const finished = await db.rpc("finish_sms_inbound", {
    p_id: row.id,
    p_result: result,
    p_case_id: caseId,
    p_lat: parsed.ok ? parsed.data.lat : null,
    p_lng: parsed.ok ? parsed.data.lng : null,
    p_parse_error: parseError,
    p_reply_kind: reply,
  });
  if (finished.error) return { status: 500, body: { error: "บันทึกผล SMS ไม่สำเร็จ" } };

  let replied = false;
  if (finished.data === true) {
    replied = await input.sendReply(
      message.from,
      formatSmsReply(reply, { origin: input.origin, caseCode, trackingToken }),
    );
  }
  return { status: 200, body: { result, replied } };
}
