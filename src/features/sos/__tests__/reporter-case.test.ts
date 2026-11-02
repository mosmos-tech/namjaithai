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
function client(data: unknown = { version: 2 }, code?: string) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data, error: code ? { code, message: "private database detail" } : null });
  return { rpc } as unknown as ReporterRpcClient;
}
function call(supabase: ReporterRpcClient, mutation: unknown = update, token = "a".repeat(32)) {
  return handleReporterCase({ caseCode: "fl-2611-0001", token, mutation, supabase });
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
  it("passes validated edits and proof to one atomic RPC", async () => {
    const db = client();
    const result = await call(db);
    expect(result.status).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(db.rpc).toHaveBeenCalledWith("reporter_case", {
      p_case_code: "FL-2611-0001",
      p_token: "a".repeat(32),
      p_action: "update",
      p_payload: update,
    });
  });
  it("returns not found for wrong proof", async () => {
    expect((await call(client(null))).status).toBe(404);
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
    await handleReporterCase({ caseCode: "FL-2611-0001", token: "a".repeat(32), supabase: db });
    expect(db.rpc).toHaveBeenCalledWith(
      "reporter_case",
      expect.objectContaining({ p_action: "read", p_payload: {} }),
    );
  });
});
