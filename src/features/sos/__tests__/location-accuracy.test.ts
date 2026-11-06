import { describe, expect, it, vi } from "vitest";
import {
  ADDRESS_REQUIRED_FOR_INACCURATE_GPS_MESSAGE,
  CaseStatus,
  GPS_MAX_ACCEPTABLE_ACCURACY_M,
  INACCURATE_LOCATION_MESSAGE,
  LocationSource,
  Need,
  accuracyForLocationSource,
  isInaccurateGps,
  sosSchema,
} from "../../../lib/domain";
import {
  applyGpsPositionToDraft,
  applyManualPinToDraft,
  createInitialSosDraft,
  getGpsStatusMessage,
  validateStep2Draft,
} from "../draft-storage";
import { circleBounds, circlePolygon, distanceM } from "../map-geometry";
import { handleCreateSosCase, type SosCaseRpcClient } from "../server/create-case";

// TF-65: GPS จาก MacBook ได้ ±16238 ม. แต่ระบบปักหมุดให้เหมือนถูก
const MACBOOK_GPS = { latitude: 13.7563, longitude: 100.5018, accuracy: 16238 };
const PIN = { lat: 13.7601, lng: 100.4935 };

const basePayload = {
  consent: true,
  healthConsent: true,
  dangerSigns: [],
  canSelfEvacuate: false,
  lat: 13.7563,
  lng: 100.5018,
  landmark: "บ้านไม้สองชั้น หน้าวัด",
  adults: 1,
  elderly: 0,
  bedridden: 0,
  children: 0,
  pets: 0,
  needs: [Need.EVACUATION_BOAT],
  name: "ทดสอบ",
  phone: "0812345678",
};

function rpcMock() {
  const rpc = vi.fn<SosCaseRpcClient["rpc"]>(async () => ({
    data: [
      {
        case_id: "00000000-0000-4000-8000-000000000001",
        case_code: "FL-2611-0001",
        tracking_token: "tok_0000000000000000000000000001",
        status: CaseStatus.NEW,
        created_at: "2026-11-06T13:00:00.000Z",
        replayed: false,
      },
    ],
    error: null,
  }));
  return { supabase: { rpc } satisfies SosCaseRpcClient, rpc };
}

function submit(body: Record<string, unknown>, supabase: SosCaseRpcClient) {
  return handleCreateSosCase({
    rawBody: body,
    headers: new Headers({ "Idempotency-Key": crypto.randomUUID() }),
    supabase,
    now: new Date("2026-11-06T13:00:00.000Z"),
  });
}

describe("TF-65 กติกากลาง", () => {
  it("เกิน 1000 ม. ถือว่าไม่แม่น เท่ากับ 1000 ยังใช้ได้", () => {
    expect(isInaccurateGps(GPS_MAX_ACCEPTABLE_ACCURACY_M)).toBe(false);
    expect(isInaccurateGps(GPS_MAX_ACCEPTABLE_ACCURACY_M + 1)).toBe(true);
    expect(isInaccurateGps(undefined)).toBe(false);
  });

  it("ข้อ 2: ปักเองและวางลิงก์ไม่มีค่าความคลาดเคลื่อน (null) ส่วน GPS คงค่าเดิม", () => {
    expect(accuracyForLocationSource(LocationSource.MANUAL_PIN, 500)).toBeUndefined();
    expect(accuracyForLocationSource(LocationSource.GMAPS_LINK, 500)).toBeUndefined();
    expect(accuracyForLocationSource(LocationSource.GPS, 500)).toBe(500);
    // ร่างรุ่นก่อน TF-65 ไม่มีวิธีได้พิกัด → คงค่าเดิม
    expect(accuracyForLocationSource(undefined, 500)).toBe(500);
  });

  it("sosSchema: GPS เกิน 1000 ม. ผ่านเฉพาะเมื่อมีที่อยู่", () => {
    const inaccurate = {
      ...basePayload,
      accuracyM: 16238,
      locationSource: LocationSource.GPS,
    };
    const without = sosSchema.safeParse(inaccurate);
    expect(without.success).toBe(false);
    expect(without.error?.issues[0]).toMatchObject({
      path: ["addressLine"],
      message: ADDRESS_REQUIRED_FOR_INACCURATE_GPS_MESSAGE,
    });
    // ช่องว่างล้วนไม่นับเป็นที่อยู่
    expect(sosSchema.safeParse({ ...inaccurate, addressLine: "   " }).success).toBe(false);
    expect(sosSchema.safeParse({ ...inaccurate, addressLine: "99/1 หมู่ 3" }).success).toBe(true);
  });
});

describe("TF-65 ร่างฟอร์มขั้นที่ 2", () => {
  it("GPS เกิน 1000 ม. เก็บพิกัดไว้ แต่ไปขั้นถัดไปไม่ได้จนกว่าจะปักเองหรือเลือกส่งพร้อมที่อยู่", () => {
    const draft = {
      ...applyGpsPositionToDraft(createInitialSosDraft(), MACBOOK_GPS),
      landmark: "หน้าวัด",
    };
    expect(draft).toMatchObject({ accuracyM: 16238, locationSource: LocationSource.GPS });

    const check = validateStep2Draft(draft);
    expect(check.valid).toBe(false);
    expect(check.errors.location).toBe(INACCURATE_LOCATION_MESSAGE);
  });

  it("กด 'ส่งพร้อมที่อยู่แทน' แล้วต้องกรอกที่อยู่ก่อนถึงจะผ่าน", () => {
    const draft = {
      ...applyGpsPositionToDraft(createInitialSosDraft(), MACBOOK_GPS),
      landmark: "หน้าวัด",
      addressFallback: true,
    };
    const noAddress = validateStep2Draft(draft);
    expect(noAddress.valid).toBe(false);
    expect(noAddress.errors.location).toBeUndefined();
    expect(noAddress.errors.addressLine).toBe(ADDRESS_REQUIRED_FOR_INACCURATE_GPS_MESSAGE);

    expect(validateStep2Draft({ ...draft, addressLine: "99/1 หมู่ 3" }).valid).toBe(true);
  });

  it("ข้อ 2: ปักเองหรือวางลิงก์หลัง GPS ไม่แม่น ล้าง accuracy และผ่านได้ทันที", () => {
    const gps = { ...applyGpsPositionToDraft(createInitialSosDraft(), MACBOOK_GPS), landmark: "x" };

    const pinned = applyManualPinToDraft(gps, PIN);
    expect(pinned).toMatchObject({
      accuracyM: undefined,
      locationSource: LocationSource.MANUAL_PIN,
    });
    expect(validateStep2Draft(pinned).valid).toBe(true);

    const linked = applyManualPinToDraft(gps, PIN, LocationSource.GMAPS_LINK);
    expect(linked).toMatchObject({
      accuracyM: undefined,
      locationSource: LocationSource.GMAPS_LINK,
    });
    expect(validateStep2Draft(linked).valid).toBe(true);
  });

  it("แถบสถานะเป็นสีแดงพร้อมข้อความตามการ์ด เมื่อ GPS เกิน 1000 ม.", () => {
    const banner = getGpsStatusMessage({ lat: 13.75, lng: 100.5, accuracyM: 16238 });
    expect(banner?.tone).toBe("error");
    expect(banner?.mobileText).toBe(INACCURATE_LOCATION_MESSAGE);
    expect(banner?.desktopText).toContain("16,238");
  });
});

describe("TF-65 API สร้างเคส", () => {
  it("GPS เกิน 1000 ม. ไม่มีที่อยู่ ตอบ 400 และไม่เรียกฐานข้อมูล", async () => {
    const { supabase, rpc } = rpcMock();
    const result = await submit(
      { ...basePayload, accuracyM: 16238, locationSource: LocationSource.GPS },
      supabase,
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ fields: ["addressLine"] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("GPS เกิน 1000 ม. มีที่อยู่ ส่งได้ เก็บ GPS + accuracy เดิม + ที่อยู่", async () => {
    const { supabase, rpc } = rpcMock();
    const result = await submit(
      {
        ...basePayload,
        accuracyM: 16238,
        locationSource: LocationSource.GPS,
        addressLine: " 99/1 หมู่ 3 ",
      },
      supabase,
    );
    expect(result.status).toBe(201);
    expect(rpc.mock.calls[0][1].p_payload).toMatchObject({
      accuracyM: 16238,
      locationSource: LocationSource.GPS,
      addressLine: "99/1 หมู่ 3",
    });
  });

  it("ข้อ 2: ปักเอง/วางลิงก์แต่ส่ง accuracyM ติดมา เซิร์ฟเวอร์ตัดทิ้งเป็น null ก่อนบันทึก", async () => {
    for (const source of [LocationSource.MANUAL_PIN, LocationSource.GMAPS_LINK]) {
      const { supabase, rpc } = rpcMock();
      const result = await submit(
        { ...basePayload, accuracyM: 16238, locationSource: source },
        supabase,
      );
      expect(result.status).toBe(201);
      const payload = rpc.mock.calls[0][1].p_payload;
      expect(payload.locationSource).toBe(source);
      expect(payload.accuracyM).toBeUndefined();
    }
  });
});

describe("TF-65 วงความคลาดเคลื่อนบนแผนที่", () => {
  it("ทุกจุดบนวงห่างจากศูนย์กลางเท่ากับ accuracy จริง", () => {
    const center = { lat: 13.7563, lng: 100.5018 };
    for (const radius of [30, 1000, 16238]) {
      for (const [lng, lat] of circlePolygon(center, radius, 16)) {
        expect(distanceM(center, { lat, lng })).toBeCloseTo(radius, 0);
      }
    }
  });

  it("กรอบสำหรับซูมครอบวงทั้งวง", () => {
    const center = { lat: 13.7563, lng: 100.5018 };
    const b = circleBounds(center, 16238);
    expect(distanceM(center, { lat: b.north, lng: center.lng })).toBeCloseTo(16238, 0);
    expect(distanceM(center, { lat: center.lat, lng: b.east })).toBeCloseTo(16238, -1);
  });
});
