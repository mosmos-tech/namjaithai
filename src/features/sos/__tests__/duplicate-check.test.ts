import { describe, it, expect, vi } from "vitest";
import {
  CaseStatus,
  DuplicateAction,
  DuplicateMatchReason,
  Need,
  Urgency,
  WaterLevel,
  calculateDistanceMeters,
  findDuplicateCandidate,
  formatAdminDuplicateNotice,
  type ExistingCaseForDuplicateCheck,
} from "../../../lib/domain";
import {
  handleCreateSosCase,
  type CreateSosCaseRpcRow,
  type SosCaseRpcClient,
} from "../server/create-case";

const baseIncomingPayload = {
  urgency: Urgency.RED,
  waterLevel: WaterLevel.ROOF,
  lat: 13.7563,
  lng: 100.5018,
  accuracyM: 12,
  province: "กรุงเทพมหานคร",
  district: "พระนคร",
  subdistrict: "พระบรมมหาราชวัง",
  landmark: "บ้านหลังคาสีแดง ตรงข้ามศาลาวัด",
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

/**
 * จำลองการทำงานของฟังก์ชันฐานข้อมูล create_sos_case พร้อมกติกาตรวจเคสซ้ำ TF-16
 */
function createDuplicateAwareRpcMock(
  initialCases: ExistingCaseForDuplicateCheck[],
  now: Date = new Date("2026-10-30T10:00:00.000Z"),
) {
  const cases = [...initialCases];
  let seq = cases.length;

  const rpc = vi.fn<SosCaseRpcClient["rpc"]>(async (_fn, args) => {
    const payload = args.p_payload;
    const duplicateAction = payload.duplicateAction ?? DuplicateAction.ASK;

    const candidate = findDuplicateCandidate(
      {
        phone: payload.phone,
        lat: payload.lat,
        lng: payload.lng,
      },
      cases,
      now,
    );

    // 1. ถ้าพบเคสซ้ำและยังไม่ได้เลือก (ASK) -> โยน SOS49 ให้หน้าเว็บถามผู้แจ้ง
    if (candidate && duplicateAction === DuplicateAction.ASK) {
      return {
        data: null,
        error: {
          code: "SOS49",
          message: "duplicate case candidate detected",
          details: JSON.stringify(candidate),
        },
      };
    }

    // 2. ถ้าผู้แจ้งเลือก "อัปเดตเคสเดิม" (UPDATE_EXISTING)
    if (candidate && duplicateAction === DuplicateAction.UPDATE_EXISTING) {
      const updatedRow: CreateSosCaseRpcRow = {
        case_id: candidate.caseId,
        case_code: candidate.caseCode,
        tracking_token: "tok_existing_case_0040",
        status: candidate.status,
        created_at: candidate.createdAt,
        replayed: false,
        updated_existing: true,
        is_potential_duplicate: false,
        duplicate_of_case_id: null,
        duplicate_of_case_code: null,
        duplicate_distance_m: candidate.distanceM,
      };
      return {
        data: [updatedRow],
        error: null,
      };
    }

    // 3. ถ้าผู้แจ้งเลือก "สร้างใหม่" (CREATE_NEW) หรือไม่มีเคสซ้ำ
    seq += 1;
    const isPotentialDuplicate = Boolean(candidate);
    const createdRow: CreateSosCaseRpcRow = {
      case_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
      case_code: `FL-2610-${String(40 + seq).padStart(4, "0")}`,
      tracking_token: `tok_${String(seq).padStart(28, "0")}`,
      status: CaseStatus.NEW,
      created_at: now.toISOString(),
      replayed: false,
      updated_existing: false,
      is_potential_duplicate: isPotentialDuplicate,
      duplicate_of_case_id: candidate?.caseId ?? null,
      duplicate_of_case_code: candidate?.caseCode ?? null,
      duplicate_distance_m: candidate?.distanceM ?? null,
    };

    return {
      data: [createdRow],
      error: null,
    };
  });

  return { supabase: { rpc } satisfies SosCaseRpcClient, rpc };
}

describe("TF-16: ตรวจเคสซ้ำ (Duplicate Case Check)", () => {
  const now = new Date("2026-10-30T10:00:00.000Z");

  it('เกณฑ์ข้อ 1: เบอร์โทรซ้ำกับเคสที่เปิดอยู่ จะตอบ 409 พร้อมตัวเลือก "อัปเดตเคสเดิม" หรือ "สร้างใหม่"', async () => {
    const existingSamePhoneCase: ExistingCaseForDuplicateCheck = {
      caseId: "11111111-1111-4111-8111-111111111111",
      caseCode: "FL-2610-0040",
      status: CaseStatus.ACCEPTED,
      urgency: Urgency.YELLOW,
      waterLevel: WaterLevel.FIRST_FLOOR,
      // อยู่ห่างออกไป ~500 เมตร แต่ใช้เบอร์เดียวกันและเคสยังเปิดอยู่
      lat: 13.7608,
      lng: 100.5018,
      phone: "0812345678",
      createdAt: "2026-10-29T05:00:00.000Z",
    };

    const { supabase } = createDuplicateAwareRpcMock([existingSamePhoneCase], now);

    const res = await handleCreateSosCase({
      rawBody: baseIncomingPayload,
      headers: new Headers({ "Idempotency-Key": "idem-dup-phone-ask" }),
      supabase,
      now,
    });

    expect(res.status).toBe(409);
    if (res.status !== 409) throw new Error("Expected 409");

    expect(res.body.code).toBe("DUPLICATE_CANDIDATE");
    expect(res.body.candidate.caseCode).toBe("FL-2610-0040");
    expect(res.body.candidate.matchReason).toBe(DuplicateMatchReason.SAME_PHONE);
    expect(res.body.options).toEqual(["UPDATE_EXISTING", "CREATE_NEW"]);
    expect(res.body.optionLabels).toEqual({
      UPDATE_EXISTING: "อัปเดตเคสเดิม",
      CREATE_NEW: "สร้างใหม่",
    });
  });

  it("เกณฑ์ข้อ 1 (ต่อ): มีเคสเปิดอยู่ห่างไม่ถึง 50 ม. ภายใน 24 ชม. (แม้คนละเบอร์) จะถามผู้แจ้งว่าเป็นการอัปเดตเคสเดิมหรือไม่", async () => {
    // ขยับละติจูด ~0.00027 องศา ≈ ห่างประมาณ 30 เมตร (< 50 ม.)
    const nearbyLat = 13.7563 + 0.00027;
    const distance = calculateDistanceMeters(
      13.7563,
      100.5018,
      nearbyLat,
      100.5018,
    );
    expect(distance).toBeGreaterThan(25);
    expect(distance).toBeLessThan(35);

    const existingNearbyCase: ExistingCaseForDuplicateCheck = {
      caseId: "22222222-2222-4222-8222-222222222222",
      caseCode: "FL-2610-0040",
      status: CaseStatus.NEW,
      urgency: Urgency.RED,
      waterLevel: WaterLevel.ROOF,
      lat: nearbyLat,
      lng: 100.5018,
      phone: "0899998888", // คนละเบอร์ (เช่น คนในบ้านเดียวกันช่วยกดแจ้ง)
      createdAt: "2026-10-30T08:30:00.000Z", // แจ้งเมื่อ 1.5 ชม. ก่อน (ภายใน 24 ชม.)
    };

    const { supabase } = createDuplicateAwareRpcMock([existingNearbyCase], now);

    const res = await handleCreateSosCase({
      rawBody: baseIncomingPayload,
      headers: new Headers({ "Idempotency-Key": "idem-dup-nearby-ask" }),
      supabase,
      now,
    });

    expect(res.status).toBe(409);
    if (res.status !== 409) throw new Error("Expected 409");

    expect(res.body.code).toBe("DUPLICATE_CANDIDATE");
    expect(res.body.candidate.caseCode).toBe("FL-2610-0040");
    expect(res.body.candidate.matchReason).toBe(DuplicateMatchReason.NEARBY_50M);
    expect(res.body.candidate.distanceM).toBeCloseTo(30, 0);
    expect(res.body.optionLabels).toEqual({
      UPDATE_EXISTING: "อัปเดตเคสเดิม",
      CREATE_NEW: "สร้างใหม่",
    });
  });

  it('เกณฑ์ข้อ 1 (ต่อ): เมื่อผู้แจ้งเลือก "อัปเดตเคสเดิม" (UPDATE_EXISTING) จะอัปเดตเคสเดิมและคืนรหัสเคสเดิม', async () => {
    const existingCase: ExistingCaseForDuplicateCheck = {
      caseId: "11111111-1111-4111-8111-111111111111",
      caseCode: "FL-2610-0040",
      status: CaseStatus.NEW,
      urgency: Urgency.YELLOW,
      waterLevel: WaterLevel.WAIST_CHEST,
      lat: 13.7563,
      lng: 100.5018,
      phone: "0812345678",
      createdAt: "2026-10-30T09:00:00.000Z",
    };

    const { supabase } = createDuplicateAwareRpcMock([existingCase], now);

    const res = await handleCreateSosCase({
      rawBody: {
        ...baseIncomingPayload,
        duplicateAction: DuplicateAction.UPDATE_EXISTING,
        targetCaseId: existingCase.caseId,
      },
      headers: new Headers({ "Idempotency-Key": "idem-dup-update-existing" }),
      supabase,
      now,
    });

    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error("Expected 200");

    expect(res.body.caseId).toBe(existingCase.caseId);
    expect(res.body.caseCode).toBe("FL-2610-0040");
    expect(res.body.updatedExisting).toBe(true);
    expect(res.body.isPotentialDuplicate).toBe(false);
  });

  it('เกณฑ์ข้อ 2: เมื่อเลือก "สร้างใหม่" (CREATE_NEW) เคสที่ใกล้กันจะถูกทำเครื่องหมายให้แอดมินเห็น (isPotentialDuplicate = true)', async () => {
    // ห่าง ~30 เมตร ภายใน 24 ชม.
    const existingNearbyCase: ExistingCaseForDuplicateCheck = {
      caseId: "22222222-2222-4222-8222-222222222222",
      caseCode: "FL-2610-0040",
      status: CaseStatus.NEW,
      urgency: Urgency.RED,
      waterLevel: WaterLevel.ROOF,
      lat: 13.7563 + 0.00027,
      lng: 100.5018,
      phone: "0899998888",
      createdAt: "2026-10-30T08:30:00.000Z",
    };

    const { supabase } = createDuplicateAwareRpcMock([existingNearbyCase], now);

    const res = await handleCreateSosCase({
      rawBody: {
        ...baseIncomingPayload,
        duplicateAction: DuplicateAction.CREATE_NEW,
      },
      headers: new Headers({ "Idempotency-Key": "idem-dup-create-new" }),
      supabase,
      now,
    });

    expect(res.status).toBe(201);
    if (res.status !== 201) throw new Error("Expected 201");

    expect(res.body.caseCode).toBe("FL-2610-0042");
    expect(res.body.isPotentialDuplicate).toBe(true);
    expect(res.body.duplicateOfCaseId).toBe(existingNearbyCase.caseId);
    expect(res.body.duplicateOfCaseCode).toBe("FL-2610-0040");
    expect(res.body.duplicateDistanceM).toBeCloseTo(30, 0);
    // ข้อความทำเครื่องหมายให้แอดมินเห็นตามดีไซน์ Figma G2 (node 13:943)
    expect(res.body.adminDuplicateNotice).toBe("อาจซ้ำกับ FL-2610-0040 (ห่าง 30 ม.)");
    expect(formatAdminDuplicateNotice("FL-2610-0040", 30.1)).toBe(
      "อาจซ้ำกับ FL-2610-0040 (ห่าง 30 ม.)",
    );
  });

  it("ไม่ถือว่าซ้ำ: ถ้าเคสเดิมปิดไปแล้ว (RESOLVED/CANCELLED) หรือคนละเบอร์ที่ห่างตั้งแต่ 50 ม. ขึ้นไป หรือเกิน 24 ชม.", () => {
    const nonMatchingCases: ExistingCaseForDuplicateCheck[] = [
      // 1. เบอร์เดียวกันแต่ช่วยเหลือเสร็จแล้ว (RESOLVED)
      {
        caseId: "33333333-3333-4333-8333-333333333333",
        caseCode: "FL-2610-0010",
        status: CaseStatus.RESOLVED,
        urgency: Urgency.RED,
        lat: 13.7563,
        lng: 100.5018,
        phone: "0812345678",
        createdAt: "2026-10-30T09:00:00.000Z",
      },
      // 2. คนละเบอร์ อยู่ใกล้ 20 ม. แต่แจ้งเกิน 24 ชั่วโมงไปแล้ว (26 ชม. ก่อน)
      {
        caseId: "44444444-4444-4444-8444-444444444444",
        caseCode: "FL-2610-0011",
        status: CaseStatus.NEW,
        urgency: Urgency.YELLOW,
        lat: 13.7563 + 0.00018,
        lng: 100.5018,
        phone: "0822223333",
        createdAt: "2026-10-29T08:00:00.000Z",
      },
      // 3. คนละเบอร์ แจ้งเมื่อ 1 ชม. ก่อน แต่อยู่ห่าง ~80 เมตร (>= 50 ม.)
      {
        caseId: "55555555-5555-4555-8555-555555555555",
        caseCode: "FL-2610-0012",
        status: CaseStatus.NEW,
        urgency: Urgency.GREEN,
        lat: 13.7563 + 0.00075,
        lng: 100.5018,
        phone: "0833334444",
        createdAt: "2026-10-30T09:00:00.000Z",
      },
    ];

    const match = findDuplicateCandidate(
      {
        phone: "081-234-5678",
        lat: 13.7563,
        lng: 100.5018,
      },
      nonMatchingCases,
      now,
    );

    expect(match).toBeNull();
  });
});
