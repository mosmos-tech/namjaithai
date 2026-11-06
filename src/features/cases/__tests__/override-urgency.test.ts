import { describe, it, expect, vi } from "vitest";
import { Urgency } from "../../../lib/domain";
import {
  overrideCaseUrgency,
  type OverrideCaseRow,
  type OverrideDeps,
} from "../server/override-urgency";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

const row: OverrideCaseRow = {
  urgency: Urgency.YELLOW,
  version: 3,
  created_at: "2026-11-05T00:00:00.000Z",
  details: { waterLevel: "WAIST_CHEST" },
  case_people: { elderly: 1, bedridden: 0, children: 0 },
};

function deps(rpcResult: Awaited<ReturnType<OverrideDeps["callRpc"]>> = { data: 4, error: null }) {
  const callRpc = vi.fn<OverrideDeps["callRpc"]>(async () => rpcResult);
  const loadCase = vi.fn<OverrideDeps["loadCase"]>(async () => row);
  return { callRpc, loadCase };
}

const valid = {
  caseId: CASE_ID,
  urgency: Urgency.RED,
  reason: "ถึงที่เกิดเหตุแล้ว ผู้สูงอายุหายใจลำบาก",
  expectedVersion: 3,
};

describe("overrideCaseUrgency — กู้ภัยปรับระดับ (TF-55)", () => {
  it("ปรับได้ ส่งเหตุผล + version + คะแนนใหม่ที่คำนวณด้วย priorityScore กลาง", async () => {
    const d = deps();
    const result = await overrideCaseUrgency(valid, d, new Date("2026-11-05T00:00:00.000Z"));
    expect(result).toEqual({ ok: true, version: 4 });
    expect(d.callRpc).toHaveBeenCalledWith({
      p_case_id: CASE_ID,
      p_urgency: Urgency.RED,
      p_reason: valid.reason,
      // RED 10000 + WAIST_CHEST (2*5=10) + ผู้สูงอายุ (1*2=2)
      p_priority_score: 10012,
      p_expected_version: 3,
    });
  });

  it("ไม่ใส่เหตุผล หรือสั้นเกินไป → ไม่เรียกฐานข้อมูล", async () => {
    for (const reason of ["", "   ", "สั้น"]) {
      const d = deps();
      const result = await overrideCaseUrgency({ ...valid, reason }, d);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors?.reason?.[0]).toMatch(/เหตุผล/);
      expect(d.callRpc).not.toHaveBeenCalled();
    }
  });

  it("ไม่มีสิทธิ์ (42501) แจ้งเป็นภาษาไทย", async () => {
    const d = deps({ data: null, error: { code: "42501", message: "not allowed" } });
    const result = await overrideCaseUrgency(valid, d);
    expect(result).toEqual({
      ok: false,
      error: "คุณไม่มีสิทธิ์ปรับระดับเคสนี้ (ต้องเป็นผู้รับเคส หัวหน้าหน่วยที่รับเคส หรือแอดมิน)",
    });
  });

  it("มีคนแก้เคสไปก่อน (SOS41) ให้โหลดหน้าใหม่", async () => {
    const d = deps({ data: null, error: { code: "SOS41", message: "version conflict" } });
    const result = await overrideCaseUrgency(valid, d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/โหลดหน้าใหม่/);
  });

  it("หาเคสไม่เจอ (ไม่มีสิทธิ์อ่าน) ไม่เรียก RPC", async () => {
    const d = deps();
    d.loadCase.mockResolvedValueOnce(null);
    const result = await overrideCaseUrgency(valid, d);
    expect(result).toEqual({ ok: false, error: "ไม่พบเคสนี้" });
    expect(d.callRpc).not.toHaveBeenCalled();
  });
});
