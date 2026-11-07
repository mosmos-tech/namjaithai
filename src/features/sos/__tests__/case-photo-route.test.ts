import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ parse: vi.fn(), save: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
vi.mock("@/features/auth/server/app-user", () => ({ getCurrentAppUser: async () => null }));
vi.mock("@/features/sos/server/create-case", () => ({ handleCreateSosCase: deps.create }));
vi.mock("@/features/sos/server/case-photos", () => ({
  parseCasePhotos: deps.parse,
  photoFingerprint: () => "fingerprint",
  saveCasePhotos: deps.save,
}));
import { POST } from "@/app/api/cases/route";

describe("SOS photo upload response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.parse.mockResolvedValue([{ bytes: Buffer.from("photo"), hash: "hash" }]);
    deps.create.mockResolvedValue({
      status: 201,
      body: { caseId: "case-1", caseCode: "FL-TEST", trackingToken: "token" },
    });
  });
  it("reports that the SOS arrived if the photo storage failed", async () => {
    deps.save.mockRejectedValue(new Error("storage unavailable"));
    const response = await POST(
      new Request("http://localhost/api/cases", {
        method: "POST",
        body: JSON.stringify({ photos: ["test"] }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      caseCode: "FL-TEST",
      trackingToken: "token",
      photosPending: true,
    });
  });
  it("rejects oversized requests before creating an SOS", async () => {
    const response = await POST(
      new Request("http://localhost/api/cases", {
        method: "POST",
        headers: { "content-length": "2200001" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(413);
    expect(deps.create).not.toHaveBeenCalled();
  });
  it("warns if an existing case has no remaining photo slots", async () => {
    deps.save.mockResolvedValue("limit");
    const response = await POST(
      new Request("http://localhost/api/cases", {
        method: "POST",
        body: JSON.stringify({ photos: ["test"] }),
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).photoWarning).toContain("ครบ 3 รูป");
  });
});
