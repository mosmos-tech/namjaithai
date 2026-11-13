import { describe, expect, it, vi } from "vitest";
import { handleReporterCase, type ReporterRpcClient } from "../server/reporter-case";

const update = {
  action: "update",
  version: 1,
  waterLevel: "ROOF",
  notes: "น้ำขึ้น",
  adults: 1,
  elderly: 0,
  bedridden: 2,
  children: 0,
  pets: 0,
};
function client(data: unknown = { version: 2 }, code?: string, overridden = false) {
  const rpc = vi.fn(async (_fn, { p_action }) => ({
    data:
      p_action === "score_context" && data && !code
        ? {
            urgency: overridden ? "GREEN" : "YELLOW",
            createdAt: new Date().toISOString(),
            incidentType: "FLOOD",
            canSelfEvacuate: true,
            dangerSigns: [],
            hasDisabled: false,
            hasInjured: false,
            needs: [],
            overridden,
          }
        : data,
    error: code ? { code, message: "private database detail" } : null,
  }));
  return { rpc } as unknown as ReporterRpcClient;
}
function call(supabase: ReporterRpcClient, mutation: unknown = update, token = "a".repeat(32)) {
  return handleReporterCase({
    caseCode: "fl-2611-0001",
    token,
    phone: "0812345678",
    headers: new Headers(),
    mutation,
    supabase,
  });
}
describe("TF-14 reporter mutations", () => {
  it("validates ownership proof before calling RPC", async () => {
    const db = client();
    expect((await call(db, update, "bad")).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...update, adults: -1 },
    { ...update, children: 1.2 },
    { ...update, pets: 100 },
    { ...update, adults: 0, bedridden: 0 },
    { ...update, notes: "a".repeat(501) },
    { ...update, waterLevel: "INVALID" },
    { ...update, priorityScore: 99999 },
    { action: "cancel" },
    { action: "cancel", version: 0 },
  ])("rejects invalid or client-controlled fields: %j", async (mutation) => {
    const db = client();
    expect((await call(db, mutation)).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("computes the score from verified case data and passes it to the atomic update", async () => {
    const db = client();
    const result = await call(db);
    expect(result.status).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(db.rpc).toHaveBeenNthCalledWith(1, "reporter_case_verified", {
      p_case_code: "FL-2611-0001",
      p_token: "a".repeat(32),
      p_phone: "0812345678",
      p_client_ip: null,
      p_action: "score_context",
      p_payload: {},
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, "reporter_case_verified", {
      p_case_code: "FL-2611-0001",
      p_token: "a".repeat(32),
      p_phone: "0812345678",
      p_client_ip: null,
      p_action: "update",
      p_payload: {
        ...update,
        previousUrgency: "YELLOW",
        urgency: "RED",
        systemUrgency: "RED",
        triageReasons: ["WATER_ROOF"],
        priorityScore: 10030,
      },
    });
  });
  it("keeps a rescuer override but updates calculated triage context", async () => {
    const db = client({ version: 2 }, undefined, true);
    expect((await call(db)).status).toBe(200);
    expect(db.rpc).toHaveBeenNthCalledWith(
      2,
      "reporter_case_verified",
      expect.objectContaining({
        p_payload: expect.objectContaining({
          previousUrgency: "GREEN",
          urgency: "GREEN",
          systemUrgency: "RED",
          triageReasons: ["WATER_ROOF"],
        }),
      }),
    );
  });
  it("returns not found for wrong proof", async () => {
    const db = client(null);
    expect((await call(db)).status).toBe(404);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["SOS40", "SOS41"])("reports closed/version conflicts (%s)", async (code) => {
    expect((await call(client(null, code))).status).toBe(409);
  });
  it("does not expose database errors", async () => {
    const result = await call(client(null, "XX000"));
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("private database");
  });
  it("loads editable details without a mutation", async () => {
    const db = client();
    await handleReporterCase({
      caseCode: "FL-2611-0001",
      token: "a".repeat(32),
      phone: "0812345678",
      headers: new Headers(),
      supabase: db,
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "reporter_case_verified",
      expect.objectContaining({ p_action: "read", p_payload: {} }),
    );
  });
  it.each(["+66812345678", "+66 81 234 5678"])(
    "TF-63: เบอร์ %s ยืนยันเคสที่เก็บเป็น 0812345678 ได้ (แปลงก่อนเทียบเหมือนฟอร์ม SOS)",
    async (phone) => {
      const db = client();
      const result = await handleReporterCase({
        caseCode: "FL-2611-0001",
        token: "a".repeat(32),
        phone,
        headers: new Headers(),
        mutation: { action: "cancel", version: 1 },
        supabase: db,
      });
      expect(result.status).toBe(200);
      expect(db.rpc).toHaveBeenCalledWith(
        "reporter_case_verified",
        expect.objectContaining({ p_phone: "0812345678", p_action: "cancel" }),
      );
    },
  );
  it("TF-63: เบอร์ต่างประเทศอื่นยังไม่ผ่าน และไม่ถามฐานข้อมูล", async () => {
    const db = client();
    const result = await handleReporterCase({
      caseCode: "FL-2611-0001",
      token: "a".repeat(32),
      phone: "+447911123456",
      headers: new Headers(),
      supabase: db,
    });
    expect(result.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("requires the full reporter phone even with a valid shared token", async () => {
    const db = client();
    const result = await handleReporterCase({
      caseCode: "FL-2611-0001",
      token: "a".repeat(32),
      phone: "",
      headers: new Headers(),
      mutation: update,
      supabase: db,
    });
    expect(result.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("returns retry headers for repeated failed verifications", async () => {
    const result = await call(client(null, "SOS29"));
    expect(result.status).toBe(429);
    expect(result.headers["Retry-After"]).toBe("900");
  });
});
