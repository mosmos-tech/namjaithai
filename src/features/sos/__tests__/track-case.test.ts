import { describe, it, expect, vi } from "vitest";
import { handleTrackCase, type TrackCaseRpcClient } from "../server/track-case";
import type { TrackedCase } from "../../../lib/domain";

const TOKEN = "4ebf5c94233c857205aae26d170b628f";
const TRACKED: TrackedCase = {
  caseCode: "FL-2610-0042",
  trackingToken: TOKEN,
  status: "NEW",
  urgency: "RED",
  createdAt: "2026-10-30T07:48:00Z",
  lastStatusUpdatedAt: "2026-10-30T07:48:00Z",
  area: { province: "กรุงเทพมหานคร", district: "ราชเทวี", subdistrict: "ทุ่งพญาไท" },
  team: null,
  timeline: [{ type: "CREATED", toStatus: "NEW", at: "2026-10-30T07:48:00Z" }],
};

function mockClient(result: Awaited<ReturnType<TrackCaseRpcClient["rpc"]>>) {
  return { rpc: vi.fn().mockResolvedValue(result) } satisfies TrackCaseRpcClient;
}

const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });

describe("handleTrackCase", () => {
  it("เปิดด้วย token: ส่ง token และ IP ไปที่ RPC และไม่ส่ง 4 ตัวท้าย", async () => {
    const supabase = mockClient({ data: TRACKED, error: null });
    const res = await handleTrackCase({
      caseCode: "fl-2610-0042",
      proof: { trackingToken: TOKEN },
      headers,
      supabase,
    });
    expect(res.status).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(supabase.rpc).toHaveBeenCalledWith("get_case_tracking", {
      p_case_code: "FL-2610-0042",
      p_phone_last4: null,
      p_tracking_token: TOKEN,
      p_client_ip: "203.0.113.5",
    });
  });

  it("เปิดด้วย 4 ตัวท้าย: ไม่ส่ง token", async () => {
    const supabase = mockClient({ data: TRACKED, error: null });
    await handleTrackCase({
      caseCode: "FL-2610-0042",
      proof: { phoneLast4: "5678" },
      headers,
      supabase,
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "get_case_tracking",
      expect.objectContaining({ p_phone_last4: "5678", p_tracking_token: null }),
    );
  });

  it("ข้อมูลรูปแบบผิดตอบ 400 โดยไม่ถามฐานข้อมูล", async () => {
    const supabase = mockClient({ data: null, error: null });
    const badCode = await handleTrackCase({
      caseCode: "ABC",
      proof: { phoneLast4: "5678" },
      headers,
      supabase,
    });
    const badToken = await handleTrackCase({
      caseCode: "FL-2610-0042",
      proof: { trackingToken: "xyz" },
      headers,
      supabase,
    });
    const badLast4 = await handleTrackCase({
      caseCode: "FL-2610-0042",
      proof: { phoneLast4: "12" },
      headers,
      supabase,
    });
    expect([badCode.status, badToken.status, badLast4.status]).toEqual([400, 400, 400]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("ไม่พบเคส (รหัสหรือ 4 ตัวท้ายผิด) ตอบ 404 ข้อความเดียวกัน ไม่บอกว่าผิดช่องไหน", async () => {
    const res = await handleTrackCase({
      caseCode: "FL-2610-0042",
      proof: { phoneLast4: "0000" },
      headers,
      supabase: mockClient({ data: null, error: null }),
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "ไม่พบเคสนี้ ตรวจสอบรหัสเคสและเบอร์โทร 4 ตัวท้ายอีกครั้ง" });
  });

  it("ผิดเกินกำหนด (SOS29) ตอบ 429 พร้อม Retry-After", async () => {
    const res = await handleTrackCase({
      caseCode: "FL-2610-0042",
      proof: { phoneLast4: "0000" },
      headers,
      supabase: mockClient({
        data: null,
        error: { code: "SOS29", message: "too many", hint: "600" },
      }),
    });
    expect(res.status).toBe(429);
    expect(res.headers["Retry-After"]).toBe("600");
    expect(res.body).toMatchObject({ retryAfterSeconds: 600 });
  });

  it("ฐานข้อมูลพังตอบ 500", async () => {
    const res = await handleTrackCase({
      caseCode: "FL-2610-0042",
      proof: { trackingToken: TOKEN },
      headers,
      supabase: mockClient({ data: null, error: { message: "boom" } }),
    });
    expect(res.status).toBe(500);
  });
});
