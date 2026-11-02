import { describe, it, expect, vi } from "vitest";
import {
  handleCreateSosCase,
  extractClientIp,
  resolveIdempotencyKey,
  type SosCaseRpcClient,
  type CreateSosCaseRpcRow,
} from "../server/create-case";
import { Urgency, WaterLevel, Need, CaseStatus } from "../../../lib/domain";

const validPayload = {
  urgency: Urgency.RED,
  waterLevel: WaterLevel.WAIST_CHEST,
  lat: 13.7563,
  lng: 100.5018,
  accuracyM: 15,
  province: "กรุงเทพมหานคร",
  district: "พระนคร",
  subdistrict: "พระบรมมหาราชวัง",
  landmark: "บ้านไม้สองชั้น หน้าวัดพระแก้ว",
  adults: 2,
  elderly: 1,
  bedridden: 1,
  children: 0,
  pets: 1,
  needs: [Need.EVACUATION_BOAT, Need.MEDICINE],
  name: "สมชาย ใจดี",
  phone: "081-234-5678",
  lineId: "somchai_sos",
  notes: "น้ำขึ้นเร็วมาก ต้องการเรือด่วน",
};

function createInMemoryRpcMock() {
  const store = new Map<string, CreateSosCaseRpcRow>();
  let seq = 0;

  const rpc = vi.fn<SosCaseRpcClient["rpc"]>(async (_fn, args) => {
    const existing = store.get(args.p_idempotency_key);
    if (existing) {
      return {
        data: [{ ...existing, replayed: true }],
        error: null,
      };
    }

    seq += 1;
    const created: CreateSosCaseRpcRow = {
      case_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
      case_code: `FL-2610-${String(seq).padStart(4, "0")}`,
      tracking_token: `tok_${String(seq).padStart(28, "0")}`,
      status: CaseStatus.NEW,
      created_at: "2026-10-29T13:00:00.000Z",
      replayed: false,
    };
    store.set(args.p_idempotency_key, created);

    return {
      data: [created],
      error: null,
    };
  });

  return { supabase: { rpc } satisfies SosCaseRpcClient, rpc, store };
}

describe("handleCreateSosCase (TF-12)", () => {
  it("เกณฑ์ข้อ 1: ส่งข้อมูลครบถ้วน ตอบ 201 พร้อมรหัสเคส (FL-YYMM-NNNN) และ trackingToken", async () => {
    const { supabase, rpc } = createInMemoryRpcMock();
    const headers = new Headers({
      "Idempotency-Key": "idem-key-001",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    });

    const result = await handleCreateSosCase({
      rawBody: validPayload,
      headers,
      supabase,
      now: new Date("2026-10-29T13:00:00.000Z"),
    });

    expect(result.status).toBe(201);
    if (result.status !== 201) throw new Error("Expected 201");

    expect(result.body.caseCode).toBe("FL-2610-0001");
    expect(result.body.trackingToken).toBe("tok_0000000000000000000000000001");
    expect(result.body.status).toBe(CaseStatus.NEW);
    expect(result.body.replayed).toBe(false);
    // คะแนนความเร่งด่วน: RED (10000) + WAIST_CHEST (2*5=10) + bedridden (1*5=5) + elderly (1*2=2) = 10017
    expect(result.body.priorityScore).toBe(10017);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1].p_payload.phone).toBe("0812345678");
    expect(rpc.mock.calls[0]?.[1].p_client_ip).toBe("203.0.113.10");
  });

  it("เกณฑ์ข้อ 2: ส่งซ้ำด้วย Idempotency-Key เดิม ไม่เกิดเคสใหม่ และได้รหัสเคสเดิมกลับมา (status 200)", async () => {
    const { supabase, store } = createInMemoryRpcMock();
    const headers = new Headers({ "Idempotency-Key": "idem-duplicate-key" });

    const first = await handleCreateSosCase({
      rawBody: validPayload,
      headers,
      supabase,
    });
    const second = await handleCreateSosCase({
      rawBody: validPayload,
      headers,
      supabase,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    if (first.status !== 201 || second.status !== 200) {
      throw new Error("Unexpected status");
    }

    expect(second.body.caseId).toBe(first.body.caseId);
    expect(second.body.caseCode).toBe(first.body.caseCode);
    expect(second.body.trackingToken).toBe(first.body.trackingToken);
    expect(second.body.replayed).toBe(true);
    expect(store.size).toBe(1);
  });

  it("เกณฑ์ข้อ 3: ข้อมูลไม่ครบ ตอบ 400 พร้อมระบุรายชื่อช่องที่ผิดใน fieldErrors และ fields", async () => {
    const { supabase, rpc } = createInMemoryRpcMock();

    const result = await handleCreateSosCase({
      rawBody: {
        urgency: Urgency.RED,
        // ขาด lat, lng, landmark, จำนวนคน, ชื่อ, เบอร์โทร (waterLevel ไม่บังคับ)
      },
      headers: new Headers({ "Idempotency-Key": "idem-invalid-001" }),
      supabase,
    });

    expect(result.status).toBe(400);
    if (result.status !== 400) throw new Error("Expected 400");

    expect(result.body.fields).toEqual(
      expect.arrayContaining(["lat", "lng", "landmark", "name", "phone"]),
    );
    expect(result.body.fieldErrors.waterLevel).toBeUndefined();
    expect(result.body.fieldErrors.landmark).toBeDefined();
    expect(result.body.fieldErrors.phone).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("เกณฑ์ข้อ 3 (ต่อ): จำนวนคนรวมเป็น 0 หรือเลือก OTHER แต่ไม่ระบุรายละเอียด ตอบ 400 พร้อมบอกช่องที่ผิด", async () => {
    const { supabase } = createInMemoryRpcMock();

    const result = await handleCreateSosCase({
      rawBody: {
        ...validPayload,
        adults: 0,
        elderly: 0,
        bedridden: 0,
        children: 0,
        needs: [Need.OTHER],
        otherDetail: "   ",
        phone: "12345",
      },
      headers: new Headers(),
      supabase,
    });

    expect(result.status).toBe(400);
    if (result.status !== 400) throw new Error("Expected 400");

    expect(result.body.fieldErrors.adults).toContain("ต้องมีผู้ติดค้างอย่างน้อย 1 คน");
    expect(result.body.fieldErrors.otherDetail).toContain(
      "กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ",
    );
    expect(result.body.fieldErrors.phone).toBeDefined();
  });

  it("ส่งหัว Idempotency-Key เป็นค่าว่าง ตอบ 400 พร้อมระบุช่อง Idempotency-Key", async () => {
    const { supabase } = createInMemoryRpcMock();

    const result = await handleCreateSosCase({
      rawBody: validPayload,
      headers: new Headers({ "Idempotency-Key": "   " }),
      supabase,
    });

    expect(result.status).toBe(400);
    if (result.status !== 400) throw new Error("Expected 400");
    expect(result.body.fields).toContain("Idempotency-Key");
  });

  it("ส่งถี่เกินกำหนด (SOS29) ตอบ 429 พร้อมหัว Retry-After", async () => {
    const supabase: SosCaseRpcClient = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "SOS29",
          message: "rate limit exceeded for phone",
          details: "phone",
          hint: "1800",
        },
      })),
    };

    const result = await handleCreateSosCase({
      rawBody: validPayload,
      headers: new Headers({ "Idempotency-Key": "idem-rate-limit" }),
      supabase,
    });

    expect(result.status).toBe(429);
    if (result.status !== 429) throw new Error("Expected 429");
    expect(result.headers["Retry-After"]).toBe("1800");
    expect(result.body.retryAfterSeconds).toBe(1800);
    expect(result.body.error).toContain("1669");
  });
});

describe("extractClientIp & resolveIdempotencyKey helpers", () => {
  it("ดึง IP ตัวแรกจาก x-forwarded-for หรือถอยไปใช้ x-real-ip", () => {
    expect(
      extractClientIp(new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" })),
    ).toBe("198.51.100.7");
    expect(extractClientIp(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
    expect(extractClientIp(new Headers())).toBeNull();
  });

  it("สร้าง UUID อัตโนมัติเมื่อไม่ได้ส่งหัว Idempotency-Key มา", () => {
    const res = resolveIdempotencyKey(new Headers());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
  });
});
