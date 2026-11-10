import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUnitHandle,
  formatCaseStatusLine,
  formatCloseConfirmationLine,
  formatRedAlertDigestLine,
  IncidentType,
  UnitCapability,
} from "../../../lib/domain";
import { classifyLineResponse, lineDeliveryMode } from "../line-push";
import { selectRedAlertRecipients, unitsWithoutCapabilities } from "../red-alert";
import {
  deliverLineNotifications,
  deliverRedAlertDigests,
  fanOutRedCases,
  runLineNotifications,
} from "../line-worker";

const ORIGIN = "https://example.test";
const LINE_A = "U" + "a".repeat(32);
const LINE_B = "U" + "b".repeat(32);

afterEach(() => vi.restoreAllMocks());

describe("TF-34 แปลผลจาก LINE: โควตารายเดือนหมด ≠ 429 ปกติ", () => {
  it("429 monthly limit = หยุดทั้งระบบ ห้าม retry", () => {
    expect(classifyLineResponse(429, '{"message":"You have reached your monthly limit."}')).toBe(
      "QUOTA_EXHAUSTED",
    );
  });
  it("429 ยิงถี่เกิน = retry ได้", () => {
    expect(
      classifyLineResponse(
        429,
        '{"message":"The API rate limit has been exceeded. Try again later."}',
      ),
    ).toBe("RETRY");
    expect(classifyLineResponse(429, "not json")).toBe("RETRY");
  });
  it("2xx / 409 ที่รับไปแล้ว = SENT, 5xx = RETRY, 4xx อื่น = FAILED", () => {
    expect(classifyLineResponse(200, "")).toBe("SENT");
    expect(classifyLineResponse(409, "", true)).toBe("SENT");
    expect(classifyLineResponse(503, "")).toBe("RETRY");
    expect(classifyLineResponse(400, "")).toBe("FAILED");
    expect(classifyLineResponse(409, "")).toBe("FAILED");
  });
});

describe("TF-34 ด่าน dev/uat: ไม่ส่งถึงผู้ใช้จริง", () => {
  const admins = new Set([LINE_A]);
  it("production ส่งทุกคน", () => {
    expect(lineDeliveryMode("production", LINE_B, admins)).toBe("SEND");
  });
  it("dev / uat ส่งเฉพาะ SUPER_ADMIN_LINE_IDS", () => {
    expect(lineDeliveryMode("dev", LINE_A, admins)).toBe("SEND");
    expect(lineDeliveryMode("uat", LINE_B, admins)).toBe("SKIP");
  });
  it("เครื่องตัวเอง / ไม่ได้ตั้งค่า ไม่ส่งเลย", () => {
    expect(lineDeliveryMode("development", LINE_A, admins)).toBe("SKIP");
    expect(lineDeliveryMode(undefined, LINE_A, admins)).toBe("SKIP");
  });
});

describe("TF-34 คัดผู้รับเคสแดง (canUnitHandle, หน่วยละ ≤ 2 คน, รวม ≤ 10 คน)", () => {
  const boat = [UnitCapability.BOAT];
  it("ส่งเฉพาะหน่วยที่ canUnitHandle ผ่าน", () => {
    expect(
      selectRedAlertRecipients(IncidentType.FLOOD, [
        { unit_id: "u1", capabilities: boat, user_id: "a" },
        { unit_id: "u2", capabilities: [UnitCapability.FIRE_SUPPRESSION], user_id: "b" },
      ]),
    ).toEqual(["a"]);
  });
  it("หน่วยที่ยังไม่ได้ตั้งความสามารถเลย = รับแจ้งเคสแดงทุกประเภท", () => {
    for (const type of Object.values(IncidentType)) {
      expect(
        selectRedAlertRecipients(type, [{ unit_id: "u3", capabilities: [], user_id: "c" }]),
      ).toEqual(["c"]);
    }
  });
  it("ข้อยกเว้นนี้ไม่เปลี่ยน canUnitHandle() ที่ตัวกรองหน้ารายการใช้", () => {
    expect(canUnitHandle(IncidentType.FLOOD, [])).toBe(false);
  });
  it("หาหน่วยที่ยังไม่ได้ตั้งความสามารถ สำหรับแถบเตือนบนหน้า /unit", () => {
    const units = [
      { id: "u1", name: "หน่วย A" },
      { id: "u2", name: "หน่วย B" },
    ];
    expect(unitsWithoutCapabilities(units, [{ unit_id: "u1" }, { unit_id: "u1" }])).toEqual([
      units[1],
    ]);
    expect(unitsWithoutCapabilities(units, [])).toEqual(units);
  });
  it("ไม่เกินหน่วยละ 2 คน", () => {
    const candidates = ["a", "b", "c"].map((user_id) => ({
      unit_id: "u1",
      capabilities: boat,
      user_id,
    }));
    expect(selectRedAlertRecipients(IncidentType.FLOOD, candidates)).toEqual(["a", "b"]);
  });
  it("รวมไม่เกิน 10 คนต่อเคส", () => {
    const candidates = Array.from({ length: 8 }, (_, unit) =>
      ["x", "y"].map((p) => ({ unit_id: `u${unit}`, capabilities: boat, user_id: `${p}${unit}` })),
    ).flat();
    expect(selectRedAlertRecipients(IncidentType.FLOOD, candidates)).toHaveLength(10);
  });
});

describe("TF-34 ข้อความ LINE ไม่มีข้อมูลส่วนตัวหรือสุขภาพ", () => {
  const ref = {
    caseCode: "FL-2611-0042",
    trackingToken: "t".repeat(32),
    incidentType: "FLOOD",
    district: "บางพลี",
    province: "สมุทรปราการ",
    origin: ORIGIN,
  };

  it("ผู้แจ้ง: มีรหัสเคส ประเภท พื้นที่ ลิงก์ — ไม่มีระดับความเร่งด่วน", () => {
    const text = formatCaseStatusLine({ ...ref, toStatus: "ACCEPTED", at: "2026-11-07T08:00:00Z" });
    expect(text).toContain("FL-2611-0042");
    expect(text).toContain("ทีมรับเคสแล้ว");
    expect(text).toContain("น้ำท่วม · บางพลี สมุทรปราการ");
    expect(text).toContain(`${ORIGIN}/track/FL-2611-0042?t=`);
    expect(text).not.toMatch(/วิกฤต|เร่งด่วน|ทั่วไป/);
  });

  it("TF-25 ทีมปล่อยเคส (สถานะกลับเป็น NEW) บอกว่ากำลังหาทีมใหม่ ไม่ใช่ข้อความรอรับครั้งแรก", () => {
    const text = formatCaseStatusLine({ ...ref, toStatus: "NEW", at: "2026-11-07T08:00:00Z" });
    expect(text).toContain("ทีมเดิมไม่สามารถไปได้ กำลังหาทีมใหม่ให้");
    expect(text).not.toContain("รอทีมรับเคส");
    expect(text).toContain(`${ORIGIN}/track/FL-2611-0042?t=`);
  });

  it("ยืนยันปิดเคส (จุดเชื่อม TF-58)", () => {
    const text = formatCloseConfirmationLine(ref);
    expect(text).toContain("กรุณากดยืนยัน");
    expect(text).toContain("บัญชี LINE ที่ใช้แจ้งเคส");
    expect(text).toContain(`${ORIGIN}/track/FL-2611-0042?t=`);
    const link = new URL(text.split("\n").at(-1)!);
    expect([...link.searchParams.keys()]).toEqual(["t"]);
  });

  it("กู้ภัย: 1 เคส และหลายเคสรวมเป็นข้อความเดียว พร้อมลิงก์ไปหน้ารายการเคส", () => {
    const latest = {
      caseCode: "FL-2611-0042",
      incidentType: "FLOOD",
      urgency: "RED" as const,
      district: "บางพลี",
      province: "สมุทรปราการ",
    };
    const one = formatRedAlertDigestLine({ caseCount: 1, latest, origin: ORIGIN });
    expect(one).toContain("FL-2611-0042 · น้ำท่วม · วิกฤต");
    expect(one).toContain(`${ORIGIN}/rescue/cases`);
    const many = formatRedAlertDigestLine({ caseCount: 3, latest, origin: ORIGIN });
    expect(many).toContain("มีเคสแดงใหม่ 3 เคสในพื้นที่ของคุณ");
    expect(many).toContain(`${ORIGIN}/rescue/cases`);
  });
});

// db ปลอม: ตอบตามชื่อ RPC
function fakeDb(responses: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) => {
    const value = responses[name];
    return { data: typeof value === "function" ? value() : (value ?? null), error: null };
  });
  return { rpc };
}

const caseJob = (id: string) => ({
  id,
  lease_id: `lease-${id}`,
  line_user_id: LINE_A,
  case_code: "FL-2611-0001",
  tracking_token: "a".repeat(32),
  kind: "CASE_STATUS",
  to_status: "ACCEPTED",
  incident_type: "FLOOD",
  district: null,
  province: "สมุทรสงคราม",
  created_at: "2026-11-07T08:00:00Z",
});

describe("TF-34 worker: โควตาหมด / ด่าน dev", () => {
  it("โควตารายเดือนหมด: งานนั้น FAILED, หยุดทั้งระบบ, คืนงานที่เหลือ และไม่ยิงต่อ", async () => {
    const db = fakeDb({
      claim_case_line_notifications: [caseJob("1"), caseJob("2"), caseJob("3")],
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response('{"message":"You have reached your monthly limit."}', { status: 429 }),
      );
    const result = await deliverLineNotifications({
      db,
      fetcher,
      token: "fake",
      baseUrl: ORIGIN,
      appEnv: "production",
    });
    expect(result.body).toMatchObject({ paused: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith(
      "finish_case_line_notification",
      expect.objectContaining({ p_id: "1", p_result: "FAILED", p_error: "line_monthly_quota" }),
    );
    expect(db.rpc).toHaveBeenCalledWith("pause_line_delivery", { p_reason: "line_monthly_quota" });
    for (const id of ["2", "3"]) {
      expect(db.rpc).toHaveBeenCalledWith(
        "finish_case_line_notification",
        expect.objectContaining({ p_id: id, p_result: "RELEASE" }),
      );
    }
  });

  it("429 ปกติยัง retry และไม่หยุดระบบ", async () => {
    const db = fakeDb({ claim_case_line_notifications: [caseJob("1")] });
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"rate limit"}', { status: 429 }));
    await deliverLineNotifications({
      db,
      fetcher,
      token: "fake",
      baseUrl: ORIGIN,
      appEnv: "production",
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "finish_case_line_notification",
      expect.objectContaining({ p_result: "RETRY", p_error: "line_http_429" }),
    );
    expect(db.rpc).not.toHaveBeenCalledWith("pause_line_delivery", expect.anything());
  });

  it("uat ส่งถึงคนที่ไม่ใช่แอดมิน = ไม่ยิง LINE ปิดงานเป็น SKIPPED", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const db = fakeDb({ claim_case_line_notifications: [caseJob("1")] });
    const fetcher = vi.fn();
    await deliverLineNotifications({
      db,
      fetcher,
      token: "fake",
      baseUrl: ORIGIN,
      appEnv: "uat",
      superAdminLineIds: new Set([LINE_B]),
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith(
      "finish_case_line_notification",
      expect.objectContaining({ p_result: "SKIPPED" }),
    );
  });

  it("digest เคสแดง: ใช้ digest_id เป็น retry key และบอกจำนวนเคส", async () => {
    const db = fakeDb({
      claim_red_alert_digests: [
        {
          digest_id: "d1",
          lease_id: "l1",
          line_user_id: LINE_A,
          case_count: 3,
          case_code: "FL-2611-0099",
          incident_type: "FLOOD",
          urgency: "RED",
          district: null,
          province: "สมุทรสงคราม",
        },
      ],
    });
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await deliverRedAlertDigests({
      db,
      fetcher,
      token: "fake",
      baseUrl: ORIGIN,
      appEnv: "production",
    });
    const [, request] = fetcher.mock.calls[0];
    expect(request.headers["X-Line-Retry-Key"]).toBe("d1");
    expect(JSON.parse(request.body).messages[0].text).toContain("มีเคสแดงใหม่ 3 เคส");
    expect(db.rpc).toHaveBeenCalledWith(
      "finish_red_alert_digest",
      expect.objectContaining({ p_digest_id: "d1", p_result: "SENT" }),
    );
  });

  it("กระจายเคสแดงด้วย canUnitHandle แล้วเข้าคิว", async () => {
    const db = fakeDb({
      claim_red_case_fanouts: [{ case_id: "c1", incident_type: "FLOOD" }],
      list_red_alert_candidates: [
        { unit_id: "u1", capabilities: ["BOAT"], user_id: "r1" },
        { unit_id: "u2", capabilities: ["FIRE_SUPPRESSION"], user_id: "r2" },
      ],
      enqueue_red_alerts: 1,
    });
    expect(await fanOutRedCases(db)).toBe(1);
    expect(db.rpc).toHaveBeenCalledWith("enqueue_red_alerts", {
      p_case_id: "c1",
      p_user_ids: ["r1"],
    });
  });

  it("หยุดส่งอยู่ (โควตาหมด) = ไม่ claim งานใดเลย", async () => {
    const db = fakeDb({ is_line_delivery_paused: true });
    const result = await runLineNotifications({
      db,
      token: "fake",
      baseUrl: ORIGIN,
      appEnv: "production",
    });
    expect(result.body).toEqual({ paused: true });
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
});
