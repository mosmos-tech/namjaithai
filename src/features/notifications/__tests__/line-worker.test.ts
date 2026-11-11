import { describe, expect, it, vi } from "vitest";
import { deliverLineNotifications, validWorkerAuthorization } from "../line-worker";
const job = {
  id: "ab660000-0000-0000-0000-000000000001",
  lease_id: "ab660000-0000-0000-0000-000000000002",
  line_user_id: "U" + "a".repeat(32),
  case_code: "FL-2611-0001",
  tracking_token: "a".repeat(32),
  to_status: "ACCEPTED",
  created_at: "2026-11-02T12:00:00Z",
};
function setup(response: Response | Error) {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [job], error: null })
    .mockResolvedValue({ data: null, error: null });
  const fetcher =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  return {
    rpc,
    fetcher,
    run: () =>
      deliverLineNotifications({
        db: { rpc },
        fetcher,
        token: "fake-channel-token",
        baseUrl: "https://example.test",
        appEnv: "production",
      }),
  };
}
describe("LINE status notification worker", () => {
  it("requires an exact secret and never accepts an unset secret", () => {
    expect(validWorkerAuthorization(null, undefined)).toBe(false);
    expect(validWorkerAuthorization("Bearer secret", "secret")).toBe(false);
    expect(validWorkerAuthorization("Bearer " + "a".repeat(20), "a".repeat(20))).toBe(true);
    expect(validWorkerAuthorization("Bearer " + "b".repeat(20), "a".repeat(20))).toBe(false);
  });
  it("does not claim jobs before configuration is ready", async () => {
    const rpc = vi.fn();
    expect(
      (await deliverLineNotifications({ db: { rpc }, baseUrl: "https://example.test" })).status,
    ).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends only case status and a tracking link with a stable retry key", async () => {
    const { rpc, fetcher, run } = setup(new Response("{}", { status: 200 }));
    expect((await run()).body).toEqual({ processed: 1, accepted: 1 });
    const [, request] = fetcher.mock.calls[0];
    expect(request.headers["X-Line-Retry-Key"]).toBe(job.id);
    expect(JSON.parse(request.body).messages[0].text).toContain("ทีมรับเคสแล้ว");
    expect(JSON.parse(request.body).messages[0].text).toContain(
      "https://example.test/track/FL-2611-0001?t=",
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "finish_case_line_notification",
      expect.objectContaining({ p_result: "SENT", p_lease_id: job.lease_id }),
    );
  });
  it.each(["STALE_UNCLAIMED", "STALE_TEAM"] as const)(
    "sends %s without a reporter tracking token",
    async (kind) => {
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: [{ ...job, kind, to_status: null }], error: null })
        .mockResolvedValue({ data: null, error: null });
      const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      await deliverLineNotifications({
        db: { rpc },
        fetcher,
        token: "fake-token",
        baseUrl: "https://example.test",
        appEnv: "production",
      });
      const message = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].text as string;
      expect(message).toContain(job.case_code);
      expect(message).not.toContain(job.tracking_token);
      expect(message).not.toContain("/track/");
      expect(message).toContain(kind === "STALE_UNCLAIMED" ? "/admin/cases" : "/rescue/my-tasks");
    },
  );
  it.each([429, 500, 503])("retries transient HTTP %i failures", async (status) => {
    const { rpc, run } = setup(new Response("{}", { status }));
    await run();
    expect(rpc).toHaveBeenLastCalledWith(
      "finish_case_line_notification",
      expect.objectContaining({ p_result: "RETRY", p_error: `line_http_${status}` }),
    );
  });
  it("retries network failures without storing raw error details", async () => {
    const { rpc, run } = setup(new Error("sensitive upstream details"));
    await run();
    expect(rpc).toHaveBeenLastCalledWith(
      "finish_case_line_notification",
      expect.objectContaining({ p_result: "RETRY", p_error: "network_error" }),
    );
  });
  it("treats LINE's confirmed duplicate retry as accepted", async () => {
    const { run } = setup(
      new Response("{}", {
        status: 409,
        headers: { "x-line-accepted-request-id": "fake-request" },
      }),
    );
    expect((await run()).body).toEqual({ processed: 1, accepted: 1 });
  });
  it.each([400, 401, 403, 409])(
    "does not repeatedly push permanent HTTP %i failures",
    async (status) => {
      const { rpc, run } = setup(new Response("{}", { status }));
      await run();
      expect(rpc).toHaveBeenLastCalledWith(
        "finish_case_line_notification",
        expect.objectContaining({ p_result: "FAILED" }),
      );
    },
  );
  it("does not hide a failed database acknowledgement", async () => {
    const { rpc, run } = setup(new Response("{}", { status: 200 }));
    rpc.mockResolvedValueOnce({ data: null, error: "db error" });
    expect((await run()).status).toBe(500);
  });
});
