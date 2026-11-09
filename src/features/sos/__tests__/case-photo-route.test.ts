import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  parse: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  after: vi.fn(),
  notify: vi.fn(),
  config: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/server", () => ({ after: deps.after }));
vi.mock("@/features/notifications/line-worker", () => ({ runLineNotifications: deps.notify }));
vi.mock("@/features/notifications/server/line-config", () => ({
  lineWorkerConfigFromEnv: deps.config,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: deps.rpc }) }));
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
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "");
    deps.rpc.mockResolvedValue({ data: "secret-token", error: null });
    deps.parse.mockResolvedValue([{ bytes: Buffer.from("photo"), hash: "hash" }]);
    deps.create.mockResolvedValue({
      status: 201,
      body: { caseId: "case-1", caseCode: "FL-TEST", trackingToken: "token" },
    });
  });
  afterEach(() => vi.unstubAllEnvs());
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
      confirmationToken: "secret-token",
      photosPending: true,
    });
  });
  it("never discloses a confirmation token for an updated existing case", async () => {
    deps.create.mockResolvedValue({
      status: 200,
      body: {
        caseId: "existing",
        caseCode: "FL-TEST",
        trackingToken: "tracking",
        updatedExisting: true,
        replayed: true,
      },
    });
    deps.save.mockResolvedValue("ok");
    const response = await POST(
      new Request("http://localhost/api/cases", {
        method: "POST",
        body: JSON.stringify({ photos: ["test"] }),
      }),
    );
    expect((await response.json()).confirmationToken).toBeUndefined();
    expect(deps.rpc).not.toHaveBeenCalledWith("confirmation_secret_for_case", expect.anything());
  });
  it("asks for an idempotent retry if confirmation capability cannot be retrieved", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
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
      error: expect.stringContaining("กดส่งอีกครั้ง"),
    });
    expect(deps.save).not.toHaveBeenCalled();
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
  it("wakes LINE after creating an SOS even if the photo upload needs a retry", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "test-token");
    deps.save.mockRejectedValue(new Error("storage unavailable"));
    deps.config.mockReturnValue({});
    deps.notify.mockResolvedValue({});
    const response = await POST(
      new Request("http://localhost/api/cases", {
        method: "POST",
        body: JSON.stringify({ photos: ["test"] }),
      }),
    );
    expect(response.status).toBe(503);
    expect(deps.after).toHaveBeenCalledOnce();
    await deps.after.mock.calls[0][0]();
    expect(deps.notify).toHaveBeenCalledOnce();
  });
  it("does not wake LINE again on an idempotent replay", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "test-token");
    deps.create.mockResolvedValue({
      status: 200,
      body: { caseId: "case-1", caseCode: "FL-TEST", trackingToken: "token" },
    });
    deps.save.mockResolvedValue("ok");
    const response = await POST(
      new Request("http://localhost/api/cases", {
        method: "POST",
        body: JSON.stringify({ photos: ["test"] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(deps.after).not.toHaveBeenCalled();
  });
});
