import { describe, expect, it, vi } from "vitest";
import { handleInboundSms, type CreateSmsCase, type InboundSms } from "../inbound";
import type { CreateSosCaseResult } from "../../sos/server/create-case";

const message: InboundSms = {
  provider: "httpsms",
  messageId: "msg-1",
  from: "+66812345678",
  body: "SOS FLOOD ROOF 13.75,100.50 P5 B1 C0 E2",
};

const created: CreateSosCaseResult = {
  status: 201,
  body: {
    caseId: "11111111-1111-4111-8111-111111111111",
    caseCode: "FL-2611-0001",
    trackingToken: "a".repeat(32),
    status: "NEW",
    createdAt: "2026-11-08T03:00:00Z",
    replayed: false,
  },
};

function duplicate(matchReason: "SAME_PHONE" | "BOTH" | "NEARBY_50M"): CreateSosCaseResult {
  return {
    status: 409,
    body: {
      code: "DUPLICATE_CANDIDATE",
      error: "พบเคสซ้ำ",
      candidate: {
        caseId: "22222222-2222-4222-8222-222222222222",
        caseCode: "FL-2611-0002",
        status: "NEW",
        createdAt: "2026-11-08T02:00:00Z",
        matchReason,
        distanceM: 10,
      },
      options: ["UPDATE_EXISTING", "CREATE_NEW"],
      optionLabels: { UPDATE_EXISTING: "อัปเดต", CREATE_NEW: "สร้างใหม่" },
    },
  };
}

function setup(opts: { results?: CreateSosCaseResult[]; handled?: boolean; allowReply?: boolean }) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const db = {
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "record_sms_inbound") {
        return { data: [{ id: "row-1", handled: opts.handled ?? false }], error: null };
      }
      return { data: opts.allowReply ?? true, error: null };
    }),
  };
  const results = [...(opts.results ?? [created])];
  const createCase = vi.fn<CreateSmsCase>(async () => results.shift()!);
  const sendReply = vi.fn(async () => true);
  const run = () =>
    handleInboundSms({ message, db, createCase, sendReply, origin: "https://example.test" });
  const finish = () => calls.find((c) => c.name === "finish_sms_inbound")?.args;
  return { db, createCase, sendReply, run, finish };
}

describe("TF-36 รับ SMS SOS", () => {
  it("ข้อความถูกรูปแบบ สร้างเคสด้วยกติกาเดียวกับเว็บ และตอบรหัสเคส + /privacy", async () => {
    const t = setup({});
    const result = await t.run();
    expect(result).toEqual({ status: 200, body: { result: "CREATED", replied: true } });

    const { rawBody, idempotencyKey } = t.createCase.mock.calls[0][0];
    expect(idempotencyKey).toBe("sms:httpsms:msg-1");
    expect(rawBody).toMatchObject({
      incidentType: "FLOOD",
      waterLevel: "ROOF",
      phone: "0812345678",
      adults: 2,
      elderly: 2,
      bedridden: 1,
      canSelfEvacuate: false,
      dangerSigns: [],
    });
    // ไม่มีสี: ระดับคำนวณที่เซิร์ฟเวอร์
    expect(rawBody).not.toHaveProperty("urgency");

    expect(t.finish()).toMatchObject({
      p_result: "CREATED",
      p_case_id: created.status === 201 ? created.body.caseId : null,
      p_reply_kind: "CREATED",
      p_lat: 13.75,
    });
    const [to, text] = t.sendReply.mock.calls[0] as unknown as [string, string];
    expect(to).toBe("+66812345678");
    expect(text).toContain("FL-2611-0001");
    expect(text).toContain("https://example.test/privacy");
  });

  it("ข้อความผิดรูปแบบ ไม่สร้างเคส และตอบวิธีส่งที่ถูก", async () => {
    const t = setup({});
    message.body = "ช่วยด้วยค่ะ";
    try {
      await expect(t.run()).resolves.toMatchObject({ body: { result: "INVALID" } });
    } finally {
      message.body = "SOS FLOOD ROOF 13.75,100.50 P5 B1 C0 E2";
    }
    expect(t.createCase).not.toHaveBeenCalled();
    expect(t.finish()).toMatchObject({ p_parse_error: "NOT_SOS", p_reply_kind: "HELP" });
    expect(t.sendReply.mock.calls[0][1]).toContain("SOS FLOOD 13.75,100.50");
  });

  it("เบอร์เดิมมีเคสเปิดอยู่: ตอบรหัสเคสเดิม ไม่สร้างเคสใหม่", async () => {
    const t = setup({ results: [duplicate("SAME_PHONE")] });
    await expect(t.run()).resolves.toMatchObject({ body: { result: "REPEAT" } });
    expect(t.createCase).toHaveBeenCalledTimes(1);
    expect(t.finish()).toMatchObject({
      p_result: "REPEAT",
      p_case_id: "22222222-2222-4222-8222-222222222222",
      p_reply_kind: "REPEAT",
    });
    expect(t.sendReply.mock.calls[0][1]).toContain("FL-2611-0002");
  });

  it("เคสใกล้กันแต่คนละเบอร์: สร้างเคสใหม่ (ระบบติดป้ายอาจซ้ำให้แอดมิน)", async () => {
    const t = setup({ results: [duplicate("NEARBY_50M"), created] });
    await expect(t.run()).resolves.toMatchObject({ body: { result: "CREATED" } });
    expect(t.createCase.mock.calls[1][0].rawBody).toMatchObject({ duplicateAction: "CREATE_NEW" });
  });

  it("ผู้ให้บริการส่งข้อความเดิมซ้ำ ไม่สร้างเคสและไม่ตอบซ้ำ", async () => {
    const t = setup({ handled: true });
    await expect(t.run()).resolves.toEqual({ status: 200, body: { duplicate: true } });
    expect(t.createCase).not.toHaveBeenCalled();
    expect(t.sendReply).not.toHaveBeenCalled();
  });

  it("ฐานข้อมูลบอกว่าตอบไปแล้วใน 10 นาที: ไม่ส่ง SMS (กันวนลูป/เปลืองเงิน)", async () => {
    const t = setup({ allowReply: false });
    message.body = "hello";
    try {
      await expect(t.run()).resolves.toMatchObject({ body: { replied: false } });
    } finally {
      message.body = "SOS FLOOD ROOF 13.75,100.50 P5 B1 C0 E2";
    }
    expect(t.sendReply).not.toHaveBeenCalled();
  });

  it("เบอร์ที่ไม่ใช่เบอร์ไทย ไม่บันทึกและไม่ตอบ", async () => {
    const t = setup({});
    message.from = "AIS";
    try {
      await expect(t.run()).resolves.toMatchObject({ body: { ignored: "sender" } });
    } finally {
      message.from = "+66812345678";
    }
    expect(t.db.rpc).not.toHaveBeenCalled();
  });

  it("ส่งบ่อยเกิน / ระบบขัดข้อง ตอบให้โทรสายด่วน", async () => {
    const limited = setup({
      results: [{ status: 429, body: { error: "x", retryAfterSeconds: 60 }, headers: {} }],
    });
    await expect(limited.run()).resolves.toMatchObject({ body: { result: "RATE_LIMITED" } });
    expect(limited.sendReply.mock.calls[0][1]).toContain("1669");

    const broken = setup({ results: [{ status: 500, body: { error: "x" } }] });
    await expect(broken.run()).resolves.toMatchObject({ body: { result: "ERROR" } });
    expect(broken.sendReply.mock.calls[0][1]).toContain("1669");
  });
});
