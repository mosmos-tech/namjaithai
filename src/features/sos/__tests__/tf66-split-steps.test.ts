import { describe, expect, it, vi } from "vitest";
import { IncidentType, Need, WaterLevel } from "../../../lib/domain";
import {
  LEGACY_SOS_DRAFT_STORAGE_KEY,
  SOS_DRAFT_STORAGE_KEY,
  applyIncidentTypeToDraft,
  createInitialSosDraft,
  loadSosDraft,
  migrateLegacySosDraft,
  submitSosDraft,
  validateStep1Draft,
  type SosDraft,
} from "../draft-storage";
import {
  ENABLED_INCIDENTS_STORAGE_KEY,
  parseEnabledIncidents,
  readCachedEnabledIncidents,
} from "../enabled-incidents";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

// ร่างที่กรอกครบถึงขั้น 5 (ตำแหน่ง ติดต่อ ยินยอม)
function completeDraft(patch: Partial<SosDraft> = {}): SosDraft {
  return {
    ...createInitialSosDraft(),
    currentStep: 5,
    atScene: true,
    dangerSigns: [],
    canSelfEvacuate: true,
    lat: 13.75,
    lng: 100.5,
    accuracyM: 10,
    landmark: "หน้าวัด",
    name: "สมชาย ใจดี",
    phone: "0812345678",
    consent: true,
    healthConsent: true,
    ...patch,
  };
}

async function sentBody(draft: SosDraft): Promise<Record<string, unknown>> {
  const fetchImpl = vi.fn<typeof fetch>(async () =>
    Response.json({ caseCode: "FL-TEST-0001", trackingToken: "a".repeat(32) }, { status: 201 }),
  );
  const result = await submitSosDraft({
    draft,
    storage: createMemoryStorage(),
    inFlightRef: { current: false },
    fetchImpl,
    generateIdempotencyKey: () => "tf66-key",
  });
  expect(result.status, JSON.stringify(result)).toBe("submitted");
  return JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
}

describe("TF-66: ย้อนกลับไปเปลี่ยนประเภทเหตุ", () => {
  it("คำตอบเฉพาะประเภทเดิม (details, hasInjured) ถูกล้างและไม่ถูกส่งไปกับเคส", async () => {
    const road = applyIncidentTypeToDraft(createInitialSosDraft(), IncidentType.ROAD_ACCIDENT);
    const answered: SosDraft = {
      ...road,
      details: { injuredCount: 2, vehicleTypes: ["MOTORCYCLE"], isTrapped: true },
      hasInjured: true,
      needs: [Need.MEDICINE, Need.OTHER],
      otherDetail: "ต้องการเครื่องตัดถ่าง",
    };

    const fire = applyIncidentTypeToDraft(answered, IncidentType.FIRE);
    expect(fire.details).toEqual({});
    expect(fire.hasInjured).toBe(false);

    const body = await sentBody(
      completeDraft({
        incidentType: fire.incidentType,
        hasInjured: fire.hasInjured,
        needs: fire.needs,
        otherDetail: fire.otherDetail,
        details: { ...fire.details, fireLocation: "HOUSE", isTrappedInSmoke: false },
      }),
    );
    expect(body.incidentType).toBe(IncidentType.FIRE);
    expect(body.details).toEqual({ fireLocation: "HOUSE", isTrappedInSmoke: false });
    expect(body.hasInjured).toBe(false);
    expect(JSON.stringify(body)).not.toContain("injuredCount");
    expect(JSON.stringify(body)).not.toContain("MOTORCYCLE");
  });

  it("เปลี่ยนจากน้ำท่วมเป็นประเภทอื่น ระดับน้ำและสัญญาณอันตรายเฉพาะน้ำท่วมหายไป", async () => {
    const flood: SosDraft = {
      ...createInitialSosDraft(),
      incidentType: IncidentType.FLOOD,
      waterLevel: WaterLevel.WAIST_CHEST,
      dangerSigns: ["UNCONSCIOUS", "PERSON_IN_WATER"],
      details: { waterLevel: WaterLevel.WAIST_CHEST },
      needs: [Need.EVACUATION_BOAT, Need.OTHER],
      otherDetail: "เรือเล็ก",
    };
    const medical = applyIncidentTypeToDraft(flood, IncidentType.MEDICAL);
    expect(medical.waterLevel).toBeUndefined();
    expect(medical.dangerSigns).toEqual(["UNCONSCIOUS"]);
    expect(medical.needs).not.toContain(Need.EVACUATION_BOAT);
    expect(medical.needs).toContain(Need.OTHER);

    const body = await sentBody(
      completeDraft({
        incidentType: medical.incidentType,
        waterLevel: medical.waterLevel,
        dangerSigns: medical.dangerSigns,
        needs: medical.needs,
        otherDetail: medical.otherDetail,
        details: { symptomGroup: "CHEST_HEART", patientCount: 1, hasChronicCondition: false },
      }),
    );
    expect(body.waterLevel).toBeUndefined();
    expect(JSON.stringify(body.details)).not.toContain("waterLevel");
  });

  it("เลือกประเภทเดิมซ้ำ ไม่ล้างคำตอบ", () => {
    const draft: SosDraft = {
      ...createInitialSosDraft(),
      incidentType: IncidentType.FIRE,
      details: { fireLocation: "HOUSE" },
    };
    expect(applyIncidentTypeToDraft(draft, IncidentType.FIRE)).toBe(draft);
  });
});

describe("TF-66: ประเภทเหตุที่เปิดรับแจ้ง", () => {
  it("ขั้น 1 ไม่ผ่านถ้าประเภทที่เลือก (หรือน้ำท่วมที่เป็นค่าเริ่มต้น) ถูกแอดมินปิด", () => {
    const enabled = [IncidentType.FLOOD, IncidentType.FIRE];
    expect(validateStep1Draft({ incidentType: IncidentType.FIRE }, enabled).valid).toBe(true);
    expect(validateStep1Draft({ incidentType: IncidentType.ANIMAL }, enabled).valid).toBe(false);
    expect(validateStep1Draft({}, [IncidentType.FIRE]).errors.incidentType).toBe(
      "กรุณาเลือกประเภทเหตุ",
    );
    // ยังไม่รู้รายการ (ออฟไลน์) ไม่ตรวจ — เซิร์ฟเวอร์ตรวจซ้ำตอนส่ง
    expect(validateStep1Draft({ incidentType: IncidentType.ANIMAL }).valid).toBe(true);
  });

  it("อ่านรายการจากฐานข้อมูล/ในเครื่อง เรียงตามกริดและตัดรหัสแปลกทิ้ง", () => {
    expect(parseEnabledIncidents(["OTHER", "FLOOD", "NOPE", 3])).toEqual([
      IncidentType.FLOOD,
      IncidentType.OTHER,
    ]);
    expect(parseEnabledIncidents("FLOOD")).toBeNull();

    const storage = createMemoryStorage();
    expect(readCachedEnabledIncidents(storage)).toBeNull();
    storage.setItem(ENABLED_INCIDENTS_STORAGE_KEY, "{broken");
    expect(readCachedEnabledIncidents(storage)).toBeNull();
    storage.setItem(ENABLED_INCIDENTS_STORAGE_KEY, JSON.stringify(["FIRE", "FLOOD"]));
    expect(readCachedEnabledIncidents(storage)).toEqual([IncidentType.FLOOD, IncidentType.FIRE]);
  });
});

describe("TF-66: ร่างที่บันทึกจากเวอร์ชันก่อนแยกขั้น (คีย์ v1)", () => {
  it("ขั้นตำแหน่งเดิม (2) ย้ายไปขั้น 3 ใหม่ ค่าทุกช่องอยู่ครบ และลบคีย์เก่า", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      LEGACY_SOS_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...createInitialSosDraft(),
        currentStep: 2,
        incidentType: IncidentType.FLOOD,
        atScene: true,
        dangerSigns: ["CHEST_PAIN"],
        canSelfEvacuate: false,
        waterLevel: WaterLevel.ANKLE_KNEE,
        adults: 3,
      }),
    );

    migrateLegacySosDraft(storage);

    expect(storage.map.has(LEGACY_SOS_DRAFT_STORAGE_KEY)).toBe(false);
    expect(storage.map.has(SOS_DRAFT_STORAGE_KEY)).toBe(true);
    const draft = loadSosDraft(storage);
    expect(draft.currentStep).toBe(3);
    expect(draft.dangerSigns).toEqual(["CHEST_PAIN"]);
    expect(draft.canSelfEvacuate).toBe(false);
    expect(draft.waterLevel).toBe(WaterLevel.ANKLE_KNEE);
    expect(draft.adults).toBe(3);
  });

  it("เคยอยู่ขั้น 4 แต่ยังไม่ได้ตอบคำถามที่ย้ายมาขั้น 2 กลับไปขั้น 2", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      LEGACY_SOS_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...createInitialSosDraft(),
        currentStep: 4,
        incidentType: IncidentType.ROAD_ACCIDENT,
        atScene: true,
        dangerSigns: [],
        canSelfEvacuate: true,
        details: {},
        lat: 13.75,
        lng: 100.5,
        landmark: "หน้าวัด",
      }),
    );
    migrateLegacySosDraft(storage);
    expect(loadSosDraft(storage).currentStep).toBe(2);
  });

  it("JSON เสีย: ล้างร่างเก่าทิ้ง เริ่มฟอร์มใหม่โดยหน้าไม่พัง", () => {
    const storage = createMemoryStorage();
    storage.setItem(LEGACY_SOS_DRAFT_STORAGE_KEY, "{not json");
    expect(() => migrateLegacySosDraft(storage)).not.toThrow();
    expect(storage.map.size).toBe(0);
    expect(loadSosDraft(storage)).toEqual(createInitialSosDraft());
  });

  it("มีร่าง v2 อยู่แล้ว ใช้ v2 และทิ้ง v1", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SOS_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...createInitialSosDraft(), name: "ใหม่" }),
    );
    storage.setItem(
      LEGACY_SOS_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...createInitialSosDraft(), name: "เก่า" }),
    );
    migrateLegacySosDraft(storage);
    expect(storage.map.has(LEGACY_SOS_DRAFT_STORAGE_KEY)).toBe(false);
    expect(loadSosDraft(storage).name).toBe("ใหม่");
  });
});
