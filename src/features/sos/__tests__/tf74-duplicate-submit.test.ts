import { describe, expect, it, vi } from "vitest";
import { WaterLevel } from "../../../lib/domain";
import { createInitialSosDraft, loadSosDraft, submitSosDraft } from "../draft-storage";
import { SOS_TEXT_EN } from "../sos-text.en";

// TF-74: ส่ง SOS แล้วพบเคสที่อาจซ้ำ (409) → เลือกทาง แล้วส่งใหม่ด้วย Idempotency-Key เดิม

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

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

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const sentBody = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) =>
  JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as Record<string, unknown>;
const sentKey = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) =>
  (fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>)["Idempotency-Key"];

describe("TF-74: พบเคสที่อาจซ้ำตอนส่ง SOS", () => {
  it("409 คืนเฉพาะประเภทที่พบและทางเลือก และเก็บร่างพร้อม key เดิมไว้", async () => {
    const storage = memoryStorage();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(
        {
          code: "DUPLICATE_CANDIDATE",
          error: "เบอร์โทรศัพท์นี้มีคำขอที่ยังเปิดอยู่",
          matchReason: "SAME_PHONE",
          options: ["UPDATE_EXISTING", "CREATE_NEW"],
        },
        409,
      ),
    );
    const result = await submitSosDraft({
      draft: fullDraft,
      storage,
      fetchImpl: fetchMock,
      generateIdempotencyKey: () => "idem-tf74",
    });
    expect(result).toEqual({
      status: "duplicate_candidate",
      matchReason: "SAME_PHONE",
      options: ["UPDATE_EXISTING", "CREATE_NEW"],
      idempotencyKey: "idem-tf74",
    });
    // ยังไม่ได้เลือก = ไม่ส่ง duplicateAction และไม่ส่ง token ของเครื่อง
    expect(sentBody(fetchMock)).not.toHaveProperty("duplicateAction");
    expect(sentBody(fetchMock)).not.toHaveProperty("deviceConfirmationTokens");
    expect(loadSosDraft(storage).idempotencyKey).toBe("idem-tf74");
  });

  it('"อัปเดตเคสเดิม" ส่ง key เดิม + token ยืนยันของเครื่องนี้ และเครื่องเดิมได้รหัสเคสไปติดตาม', async () => {
    const storage = memoryStorage({
      "namjaithai:confirmation-cases": JSON.stringify([
        { caseCode: "FL-2611-0001", trackingToken: "t1", confirmationToken: "device-secret-1" },
      ]),
    });
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(
        { caseCode: "FL-2611-0001", trackingToken: "t1", replayed: false, updatedExisting: true },
        200,
      ),
    );
    const result = await submitSosDraft({
      draft: { ...fullDraft, idempotencyKey: "idem-tf74" },
      storage,
      fetchImpl: fetchMock,
      duplicateAction: "UPDATE_EXISTING",
    });
    expect(sentKey(fetchMock)).toBe("idem-tf74");
    expect(sentBody(fetchMock)).toMatchObject({
      duplicateAction: "UPDATE_EXISTING",
      deviceConfirmationTokens: ["device-secret-1"],
    });
    expect(result).toMatchObject({
      status: "submitted",
      caseCode: "FL-2611-0001",
      trackingToken: "t1",
      updatedExisting: true,
    });
  });

  it('เบอร์เดิมจากเครื่องอื่น: ได้แค่ "ส่งข้อมูลเพิ่มให้ทีมแล้ว" ไม่มีรหัสเคส และล้างร่าง', async () => {
    const storage = memoryStorage();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ supplemented: true, replayed: false }, 200),
    );
    const result = await submitSosDraft({
      draft: { ...fullDraft, idempotencyKey: "idem-tf74" },
      storage,
      fetchImpl: fetchMock,
      duplicateAction: "UPDATE_EXISTING",
    });
    expect(result).toEqual({
      status: "supplemented",
      idempotencyKey: "idem-tf74",
      successMessage: "ส่งข้อมูลเพิ่มให้ทีมแล้ว ถ้าต้องการติดตามเคส ใช้รหัสที่ได้ตอนแจ้งครั้งแรก",
    });
    expect(sentBody(fetchMock).deviceConfirmationTokens).toEqual([]);
    expect(storage.getItem("namjaithai-sos-draft-v2")).toBeNull();
  });

  it('"สร้างเคสใหม่" ส่ง CREATE_NEW ด้วย key เดิม และไม่ส่ง token ของเครื่อง', async () => {
    const storage = memoryStorage({
      "namjaithai:confirmation-cases": JSON.stringify([
        { caseCode: "FL-2611-0001", trackingToken: "t1", confirmationToken: "device-secret-1" },
      ]),
    });
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ caseCode: "FL-2611-0002", trackingToken: "t2", confirmationToken: "c2" }, 201),
    );
    const result = await submitSosDraft({
      draft: { ...fullDraft, idempotencyKey: "idem-tf74" },
      storage,
      fetchImpl: fetchMock,
      duplicateAction: "CREATE_NEW",
    });
    expect(sentKey(fetchMock)).toBe("idem-tf74");
    expect(sentBody(fetchMock).duplicateAction).toBe("CREATE_NEW");
    expect(sentBody(fetchMock)).not.toHaveProperty("deviceConfirmationTokens");
    expect(result).toMatchObject({ status: "submitted", caseCode: "FL-2611-0002" });
  });

  it("กดทางเลือกรัว 2 ครั้งพร้อมกัน ยิงคำขอเดียว", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const inFlightRef = { current: false };
    const options = {
      draft: { ...fullDraft, idempotencyKey: "idem-tf74" },
      storage: memoryStorage(),
      fetchImpl: fetchMock,
      inFlightRef,
      duplicateAction: "CREATE_NEW" as const,
    };
    const first = submitSosDraft(options);
    const second = await submitSosDraft(options);
    expect(second.status).toBe("duplicate_in_flight");
    release(json({ caseCode: "FL-2611-0003", trackingToken: "t3" }, 201));
    expect((await first).status).toBe("submitted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("หน้าอังกฤษได้ข้อความรายงานเพิ่มเติมเป็นภาษาอังกฤษ", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ supplemented: true }, 200));
    const result = await submitSosDraft({
      draft: { ...fullDraft, idempotencyKey: "idem-tf74" },
      storage: memoryStorage(),
      fetchImpl: fetchMock,
      duplicateAction: "UPDATE_EXISTING",
      text: SOS_TEXT_EN,
    });
    expect(result).toMatchObject({
      status: "supplemented",
      successMessage: SOS_TEXT_EN.submit.supplemented,
    });
  });
});
