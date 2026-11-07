import { describe, it, expect, vi } from "vitest";
import { IncidentType, Need, WaterLevel } from "../../../lib/domain";
import {
  SOS_DRAFT_STORAGE_KEY,
  createInitialSosDraft,
  loadSosDraft,
  saveSosDraft,
  submitSosDraft,
  validateStep2Draft,
  validateStep3Draft,
  validateStep4Draft,
  validateStep5Draft,
  getTotalPeopleCount,
} from "../draft-storage";
import {
  compressImageForSos,
  calculateScaledDimensions,
  MAX_PHOTO_BYTES,
  MAX_SOS_PHOTOS,
} from "../image-compression";
import { PEOPLE_GROUPS } from "../components/Step3People";
import { NEED_OPTIONS, getNeedOptionsForIncident } from "../components/Step4Needs";

describe("TF-11: ฟอร์ม SOS ขั้น 3–5 (ผู้ติดค้าง สิ่งที่ต้องการ ข้อมูลติดต่อ)", () => {
  it("เกณฑ์ข้อ 1: จำนวนคนรวมต้องมีอย่างน้อย 1 คน (สัตว์เลี้ยงไม่นับรวมเป็นจำนวนคน)", () => {
    // ไม่มีคนเลย มีแต่สัตว์เลี้ยง -> ไม่ผ่าน
    const zeroHumans = validateStep3Draft({
      adults: 0,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 3,
    });
    expect(zeroHumans.valid).toBe(false);
    expect(zeroHumans.totalPeople).toBe(0);
    expect(zeroHumans.errors.totalPeople).toContain("อย่างน้อย 1 คน");

    // มีผู้สูงอายุ 1 คน แม้ผู้ใหญ่เป็น 0 -> ผ่าน
    const oneElderly = validateStep3Draft({
      adults: 0,
      elderly: 1,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(oneElderly.valid).toBe(true);
    expect(oneElderly.totalPeople).toBe(1);

    // มีหลายกลุ่มรวมกัน -> คำนวณจำนวนคนถูกต้อง
    expect(
      getTotalPeopleCount({
        adults: 2,
        elderly: 1,
        bedridden: 1,
        children: 2,
      }),
    ).toBe(6);
  });

  it("เกณฑ์ข้อ 2: ตัวนับผู้ติดค้างครบทั้ง 5 กลุ่ม และทุกกลุ่มมีไอคอนกำกับ", () => {
    expect(PEOPLE_GROUPS.map((g) => g.key)).toEqual([
      "adults",
      "elderly",
      "bedridden",
      "children",
      "pets",
    ]);

    for (const group of PEOPLE_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.icon).toBeTruthy();
    }
  });

  it('เกณฑ์ข้อ 3: สิ่งที่ต้องการมี 10 อย่าง + "อื่นๆ" และเมื่อเลือก "อื่นๆ" ต้องพิมพ์ไม่เกิน 200 ตัวอักษร', () => {
    expect(NEED_OPTIONS).toHaveLength(11);
    expect(NEED_OPTIONS.some((item) => item.value === Need.OTHER)).toBe(true);

    // ไม่ได้เลือก "อื่นๆ" -> ไม่ต้องพิมพ์ก็ผ่าน
    const withoutOther = validateStep4Draft({
      needs: [Need.DRINKING_WATER, Need.FOOD],
      otherDetail: "",
    });
    expect(withoutOther.valid).toBe(true);

    // เลือก "อื่นๆ" แต่ไม่พิมพ์หรือพิมพ์ช่องว่างเปล่า -> ไม่ผ่าน
    const emptyOther = validateStep4Draft({
      needs: [Need.OTHER],
      otherDetail: "   ",
    });
    expect(emptyOther.valid).toBe(false);
    expect(emptyOther.errors.otherDetail).toContain("กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ");

    // เลือก "อื่นๆ" และพิมพ์เกิน 200 ตัวอักษร -> ไม่ผ่าน
    const tooLongOther = validateStep4Draft({
      needs: [Need.OTHER],
      otherDetail: "ก".repeat(201),
    });
    expect(tooLongOther.valid).toBe(false);
    expect(tooLongOther.errors.otherDetail).toContain("200 ตัวอักษร");

    // เลือก "อื่นๆ" และพิมพ์รายละเอียดถูกต้อง -> ผ่าน
    const validOther = validateStep4Draft({
      needs: [Need.MEDICINE, Need.OTHER],
      otherDetail: "ต้องการอินซูลินแช่เย็นและเครื่องวัดน้ำตาล",
    });
    expect(validOther.valid).toBe(true);
  });

  it("เกณฑ์ข้อ 4: เบอร์โทรศัพท์ตรวจรูปแบบเบอร์ไทย (รองรับขีดคั่น และปฏิเสธเบอร์ผิดรูปแบบ)", () => {
    // เบอร์มือถือไทยมีขีดคั่น -> ผ่าน และแปลงเป็นตัวเลขล้วน 10 หลัก
    const validMobile = validateStep5Draft({
      name: "สมหญิง ใจดี",
      phone: "081-234-5678",
      lineId: "somying_line",
      notes: "อยู่ชั้น 2",
      consent: true,
      healthConsent: true,
      photos: [],
    });
    expect(validMobile.valid).toBe(true);
    expect(validMobile.normalizedPhone).toBe("0812345678");

    // เบอร์บ้าน 02 (9 หลัก) -> ผ่าน
    const validLandline = validateStep5Draft({
      name: "สมชาย ใจดี",
      phone: "02-123-4567",
      lineId: "",
      notes: "",
      consent: true,
      healthConsent: true,
      photos: [],
    });
    expect(validLandline.valid).toBe(true);
    expect(validLandline.normalizedPhone).toBe("021234567");

    // เบอร์ผิดรูปแบบ (เช่น ขึ้นต้นด้วย 01 หรือสั้นเกินไป) -> ไม่ผ่าน
    const invalidPhone = validateStep5Draft({
      name: "สมชาย ใจดี",
      phone: "0123456789",
      lineId: "",
      notes: "",
      consent: true,
      healthConsent: true,
      photos: [],
    });
    expect(invalidPhone.valid).toBe(false);
    expect(invalidPhone.errors.phone).toContain("เบอร์โทรศัพท์ไทย");

    // ไม่กรอกชื่อ -> ไม่ผ่าน
    const missingName = validateStep5Draft({
      name: "   ",
      phone: "0891234567",
      lineId: "",
      notes: "",
      consent: true,
      healthConsent: true,
      photos: [],
    });
    expect(missingName.valid).toBe(false);
    expect(missingName.errors.name).toContain("ชื่อ");
  });

  it("เกณฑ์ข้อ 5: รูปภาพถูกบีบอัดให้เหลือไม่เกิน 500 KB ก่อนอัปโหลด และจำกัดไม่เกิน 3 รูป", async () => {
    expect(MAX_SOS_PHOTOS).toBe(3);
    expect(MAX_PHOTO_BYTES).toBe(500 * 1024);

    // ตรวจการย่อขนาดภาพรักษาสัดส่วน
    expect(calculateScaledDimensions(4000, 3000, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });

    // จำลองไฟล์รูปขนาดใหญ่ 1.8 MB (1,887,436 bytes)
    const largeBuffer = new Uint8Array(1_887_436);
    largeBuffer.fill(120);
    const largeBlob = new Blob([largeBuffer], { type: "image/png" });
    Object.defineProperty(largeBlob, "name", { value: "flood-house.png" });

    const compressed = await compressImageForSos(largeBlob);
    expect(compressed.originalBytes).toBe(1_887_436);
    expect(compressed.compressedBytes).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    expect(compressed.compressedBytes).toBeGreaterThan(0);
    expect(compressed.mimeType).toBe("image/jpeg");
    expect(compressed.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("การส่งฟอร์มข้อ 1: ถ้ายังไม่มีตำแหน่งหรือจุดสังเกตในขั้นที่ 2 ต้องตอบ error ไม่ขึ้นข้อความสำเร็จสีเขียว", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const check2 = validateStep2Draft({
      lat: undefined,
      lng: undefined,
      landmark: "",
    });
    expect(check2.valid).toBe(false);

    const draftWithoutLocation = {
      ...createInitialSosDraft(),
      consent: true,
      healthConsent: true,
      currentStep: 5 as const,
      dangerSigns: [],
      canSelfEvacuate: false,
      waterLevel: WaterLevel.WAIST_CHEST,
      lat: undefined,
      lng: undefined,
      landmark: "",
      adults: 2,
      name: "สมชาย ใจดี",
      phone: "081-234-5678",
    };

    const result = await submitSosDraft({
      draft: draftWithoutLocation,
      fetchImpl: fetchMock,
    });

    expect(result.status).toBe("invalid_step");
    if (result.status !== "invalid_step" || result.step !== 2) {
      throw new Error("Expected invalid_step for step 2");
    }
    expect(result.error).toContain("ยังส่งคำขอไม่ได้");
    expect(result.error).toContain("ขั้นที่ 2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("การส่งฟอร์มข้อ 2: กดส่งสองครั้งพร้อมกันไม่ยิงซ้ำ และถ้าลองส่งซ้ำในร่างเดิมจะใช้ Idempotency-Key ตัวเดิม", async () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };

    let resolveFirstFetch!: (res: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirstFetch = resolve;
        }),
    );

    const fullDraft = {
      ...createInitialSosDraft(),
      consent: true,
      healthConsent: true,
      currentStep: 5 as const,
      dangerSigns: [],
      canSelfEvacuate: false,
      waterLevel: WaterLevel.WAIST_CHEST,
      lat: 13.7563,
      lng: 100.5018,
      landmark: "บ้านสองชั้นสีฟ้า หน้าวัด",
      adults: 2,
      name: "สมชาย ใจดี",
      phone: "081-234-5678",
    };

    const inFlightRef = { current: false };
    let keySeq = 0;
    const generateKey = () => `idem-fixed-${++keySeq}`;

    // กดส่งครั้งที่ 1 และกดซ้ำครั้งที่ 2 ทันทีขณะครั้งที่ 1 ยังไม่เสร็จ
    const firstPromise = submitSosDraft({
      draft: fullDraft,
      storage,
      inFlightRef,
      fetchImpl: fetchMock,
      generateIdempotencyKey: generateKey,
    });
    const secondPromise = submitSosDraft({
      draft: fullDraft,
      storage,
      inFlightRef,
      fetchImpl: fetchMock,
      generateIdempotencyKey: generateKey,
    });

    const secondResult = await secondPromise;
    expect(secondResult.status).toBe("duplicate_in_flight");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // สมมติครั้งที่ 1 เน็ตหลุดหรือเซิร์ฟเวอร์ตอบ 500 แล้วผู้ใช้กดส่งอีกครั้ง -> ต้องใช้ Idempotency-Key เดิม
    resolveFirstFetch(
      new Response(JSON.stringify({ error: "เซิร์ฟเวอร์ขัดข้องชั่วคราว" }), {
        status: 500,
      }),
    );
    const firstResult = await firstPromise;
    expect(firstResult.status).toBe("api_error");

    const savedAfterError = loadSosDraft(storage);
    expect(savedAfterError.idempotencyKey).toBe("idem-fixed-1");

    const retryFetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ caseCode: "FL-2610-0099", trackingToken: "tok_99" }), {
        status: 201,
      });
    });

    const retryResult = await submitSosDraft({
      draft: { ...savedAfterError, consent: true, healthConsent: true },
      storage,
      inFlightRef,
      fetchImpl: retryFetchMock,
      generateIdempotencyKey: generateKey,
    });

    expect(retryResult.status).toBe("submitted");
    const sentHeaders = retryFetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(sentHeaders["Idempotency-Key"]).toBe("idem-fixed-1");
  });

  it("คำขอถึงระบบแล้วแต่ส่งรูปไม่สำเร็จ เก็บ payload เดิมให้คิวส่งซ้ำ", async () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    const dataUrl = "data:image/jpeg;base64,/9j/2Q==";
    const result = await submitSosDraft({
      draft: {
        ...createInitialSosDraft(),
        consent: true,
        healthConsent: true,
        currentStep: 5,
        dangerSigns: [],
        canSelfEvacuate: false,
        waterLevel: WaterLevel.WAIST_CHEST,
        lat: 13.75,
        lng: 100.5,
        landmark: "หน้าบ้าน",
        name: "ทดสอบ",
        phone: "0812345678",
        photos: [
          {
            id: "1",
            name: "test.jpg",
            mimeType: "image/jpeg",
            originalBytes: 4,
            compressedBytes: 4,
            width: 2,
            height: 2,
            dataUrl,
          },
        ],
      },
      storage,
      generateIdempotencyKey: () => "photo-key",
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify({ photosPending: true, caseCode: "FL-TEST", trackingToken: "token" }),
            { status: 503 },
          ),
      ) as typeof fetch,
    });
    expect(result.status).toBe("photo_pending");
    if (result.status !== "photo_pending") throw new Error("expected pending photo upload");
    expect(JSON.parse(result.requestBody).photos).toEqual([dataUrl]);
    expect(result.caseCode).toBe("FL-TEST");
    expect(loadSosDraft(storage).idempotencyKey).toBe("photo-key");
  });

  it("TF-15: เมื่อเน็ตหลุด เก็บ payload และ idempotency key ของคำขอเดิมสำหรับคิว", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const draft = {
      ...createInitialSosDraft(),
      consent: true,
      healthConsent: true,
      currentStep: 5 as const,
      dangerSigns: [],
      canSelfEvacuate: false,
      waterLevel: WaterLevel.WAIST_CHEST,
      lat: 13.7563,
      lng: 100.5018,
      landmark: "หน้าวัด",
      adults: 2,
      name: "สมชาย ใจดี",
      phone: "081-234-5678",
    };
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const result = await submitSosDraft({
      draft,
      storage,
      fetchImpl,
      generateIdempotencyKey: () => "offline-key",
    });
    expect(result.status).toBe("network_error");
    if (result.status !== "network_error") throw new Error("Expected network error");
    expect(result.idempotencyKey).toBe("offline-key");
    expect(JSON.parse(result.requestBody!)).toMatchObject({
      phone: "0812345678",
      lat: 13.7563,
      landmark: "หน้าวัด",
      consent: true,
      healthConsent: true,
    });
    expect(loadSosDraft(storage).idempotencyKey).toBe("offline-key");
  });

  it("การส่งฟอร์มข้อ 3: เมื่อส่งคำขอสำเร็จ ข้อมูลร่างใน localStorage ต้องถูกล้างทันที", async () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };

    const fullDraft = {
      ...createInitialSosDraft(),
      consent: true,
      healthConsent: true,
      currentStep: 5 as const,
      dangerSigns: [],
      canSelfEvacuate: false,
      waterLevel: WaterLevel.WAIST_CHEST,
      lat: 14.3532,
      lng: 100.5689,
      landmark: "ซอย 3 บ้านรั้วขาว",
      adults: 1,
      elderly: 1,
      needs: [Need.DRINKING_WATER],
      name: "สมหญิง ใจดี",
      phone: "089-123-4567",
    };

    saveSosDraft(fullDraft, storage);
    expect(storage.getItem(SOS_DRAFT_STORAGE_KEY)).not.toBeNull();

    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ caseCode: "FL-2610-0042", trackingToken: "tok_42" }), {
        status: 201,
      });
    });

    const result = await submitSosDraft({
      draft: fullDraft,
      storage,
      fetchImpl: fetchMock,
    });

    expect(result.status).toBe("submitted");
    if (result.status !== "submitted") {
      throw new Error("Expected submitted");
    }
    expect(result.caseCode).toBe("FL-2610-0042");
    expect(result.successMessage).toContain("FL-2610-0042");

    // ตรวจว่าร่างถูกล้างออกจาก storage แล้วจริงๆ
    expect(storage.getItem(SOS_DRAFT_STORAGE_KEY)).toBeNull();
    const reloaded = loadSosDraft(storage);
    expect(reloaded.currentStep).toBe(1);
    expect(reloaded.dangerSigns).toBeUndefined();
    expect(reloaded.name).toBe("");
    expect(reloaded.phone).toBe("");
  });

  it("TF-51: validateStep3Draft ตรวจคำถามบังคับของประเภทเหตุ และ getNeedOptionsForIncident เปลี่ยนตามประเภทเหตุพร้อม OTHER เสมอ", () => {
    // ROAD_ACCIDENT ยังไม่ตอบคำถามบังคับ 3 ข้อ -> ไม่ผ่าน
    const missingRoadQuestions = validateStep3Draft({
      incidentType: IncidentType.ROAD_ACCIDENT,
      details: {},
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(missingRoadQuestions.valid).toBe(false);
    expect(missingRoadQuestions.errors.questionErrors).toHaveProperty("injuredCount");
    expect(missingRoadQuestions.errors.questionErrors).toHaveProperty("vehicleTypes");
    expect(missingRoadQuestions.errors.questionErrors).toHaveProperty("isTrapped");

    // ตอบครบทั้ง 3 ข้อ (ตัวเลข + ตัวเลือก + ใช่/ไม่ใช่) -> ผ่าน
    const validRoadQuestions = validateStep3Draft({
      incidentType: IncidentType.ROAD_ACCIDENT,
      details: {
        injuredCount: 1,
        vehicleType: "CAR",
        isTrapped: false,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(validRoadQuestions.valid).toBe(true);

    // ความต้องการเปลี่ยนตามประเภทเหตุ และมี OTHER (อื่นๆ พิมพ์เอง) เสมอ
    const floodNeeds = getNeedOptionsForIncident(IncidentType.FLOOD).map((o) => o.value);
    const roadNeeds = getNeedOptionsForIncident(IncidentType.ROAD_ACCIDENT).map((o) => o.value);
    const animalNeeds = getNeedOptionsForIncident(IncidentType.ANIMAL).map((o) => o.value);

    expect(floodNeeds).toContain(Need.EVACUATION_BOAT);
    expect(roadNeeds).not.toContain(Need.EVACUATION_BOAT);
    expect(roadNeeds).toContain(Need.MEDICINE);
    expect(roadNeeds).toContain(Need.OTHER);
    expect(animalNeeds).not.toContain(Need.EVACUATION_BOAT);
    expect(animalNeeds).toContain(Need.OTHER);
  });

  it("TF-54: validateStep3Draft รองรับ multi-select, text kind ไม่เกิน 200 ตัวอักษร และ conditional questions", () => {
    // 1. multi-select vehicleTypes ใน ROAD_ACCIDENT
    const roadMulti = validateStep3Draft({
      incidentType: IncidentType.ROAD_ACCIDENT,
      details: {
        injuredCount: 0,
        vehicleTypes: ["CAR", "TRUCK"],
        isTrapped: false,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(roadMulti.valid).toBe(true);

    // 2. kind: text ใน OTHER (ไม่เกิน 200 ตัวอักษร)
    const otherValidText = validateStep3Draft({
      incidentType: IncidentType.OTHER,
      details: {
        otherCategory: "GENERAL",
        otherDescription: "เสาไฟล้มทับกำแพงบ้าน",
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(otherValidText.valid).toBe(true);

    const otherTooLong = validateStep3Draft({
      incidentType: IncidentType.OTHER,
      details: {
        otherCategory: "GENERAL",
        otherDescription: "ข้อความ".repeat(50), // 300 chars > 200
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(otherTooLong.valid).toBe(false);
    expect(otherTooLong.errors.questionErrors).toHaveProperty("otherDescription");

    // 3. Conditional sub-questions
    // FIRE: fireLocation === HOUSE -> ไม่ต้องตอบ buildingFloor
    const fireHouse = validateStep3Draft({
      incidentType: IncidentType.FIRE,
      details: {
        fireLocation: "HOUSE",
        isTrappedInSmoke: false,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(fireHouse.valid).toBe(true);

    // FIRE: fireLocation === HIGH_RISE แต่ยังไม่ตอบ buildingFloor -> ไม่ผ่าน
    const fireHighRiseMissing = validateStep3Draft({
      incidentType: IncidentType.FIRE,
      details: {
        fireLocation: "HIGH_RISE",
        isTrappedInSmoke: false,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(fireHighRiseMissing.valid).toBe(false);
    expect(fireHighRiseMissing.errors.questionErrors).toHaveProperty("buildingFloor");

    // FIRE: fireLocation === HIGH_RISE และตอบ buildingFloor -> ผ่าน
    const fireHighRiseOk = validateStep3Draft({
      incidentType: IncidentType.FIRE,
      details: {
        fireLocation: "HIGH_RISE",
        buildingFloor: 15,
        isTrappedInSmoke: false,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(fireHighRiseOk.valid).toBe(true);

    // WATER_RESCUE: isFloatingVisible === false -> บังคับ submersionDuration
    const waterRescueSubmergedMissing = validateStep3Draft({
      incidentType: IncidentType.WATER_RESCUE,
      details: {
        victimsInWater: 1,
        waterBodyType: "CANAL_RIVER",
        isFloatingVisible: false,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(waterRescueSubmergedMissing.valid).toBe(false);
    expect(waterRescueSubmergedMissing.errors.questionErrors).toHaveProperty("submersionDuration");

    const waterRescueSubmergedOk = validateStep3Draft({
      incidentType: IncidentType.WATER_RESCUE,
      details: {
        victimsInWater: 1,
        waterBodyType: "CANAL_RIVER",
        isFloatingVisible: false,
        submersionDuration: "UNDER_5_MIN",
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(waterRescueSubmergedOk.valid).toBe(true);

    // COLLAPSE: isTrappedUnderDebris === true -> บังคับ trappedCount
    const collapseMissing = validateStep3Draft({
      incidentType: IncidentType.COLLAPSE,
      details: {
        collapseType: "BUILDING_ROOF",
        isTrappedUnderDebris: true,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(collapseMissing.valid).toBe(false);
    expect(collapseMissing.errors.questionErrors).toHaveProperty("trappedCount");

    const collapseOk = validateStep3Draft({
      incidentType: IncidentType.COLLAPSE,
      details: {
        collapseType: "BUILDING_ROOF",
        isTrappedUnderDebris: true,
        trappedCount: 2,
      },
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
    });
    expect(collapseOk.valid).toBe(true);
  });

  it("TF-54: loadSosDraft คงค่า array ใน details และ submitSosDraft ตัดคำตอบคำถามย่อยที่ถูกซ่อนออก", async () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };

    const roadDraft = {
      ...createInitialSosDraft(),
      incidentType: IncidentType.ROAD_ACCIDENT,
      atScene: true,
      dangerSigns: [],
      canSelfEvacuate: false,
      lat: 13.7563,
      lng: 100.5018,
      landmark: "แยกรัชดา",
      details: {
        vehicleTypes: ["MOTORCYCLE", "CAR"],
        injuredCount: 1,
        isTrapped: false,
      },
      adults: 1,
      needs: [Need.MEDICINE],
      name: "สมชาย ทดสอบ",
      phone: "0812345678",
      consent: true,
      healthConsent: true,
    };

    saveSosDraft(roadDraft, storage);
    const reloaded = loadSosDraft(storage);
    expect(reloaded.details?.vehicleTypes).toEqual(["MOTORCYCLE", "CAR"]);

    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ caseCode: "FR-2611-0001", trackingToken: "tok_fr" }), {
        status: 201,
      });
    });

    // กรณี FIRE ที่เปลี่ยนจาก HIGH_RISE เป็น HOUSE แต่ยังมี buildingFloor ค้างใน details
    const fireDraft = {
      ...roadDraft,
      incidentType: IncidentType.FIRE,
      details: {
        fireLocation: "HOUSE",
        buildingFloor: 12,
        isTrappedInSmoke: false,
        hasInjured: false,
      },
    };

    const submitRes = await submitSosDraft({
      draft: fireDraft,
      storage,
      fetchImpl: fetchMock,
    });
    expect(submitRes.status).toBe("submitted");
    expect(capturedBody?.details).toEqual({
      fireLocation: "HOUSE",
      isTrappedInSmoke: false,
      hasInjured: false,
    });
  });
});
