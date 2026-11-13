import { z } from "zod";
import { priorityScore, triageOverrideSchema, WaterLevel, type Urgency } from "../../../lib/domain";

/**
 * กู้ภัยปรับระดับความเร่งด่วนของเคส (TF-55)
 * - ตรวจข้อมูลด้วย triageOverrideSchema (บังคับเหตุผล 5–300 ตัวอักษร)
 * - คำนวณคะแนนจัดลำดับใหม่ด้วย priorityScore() กลาง แล้วส่งเข้า override_case_urgency()
 * - ฐานข้อมูลเช็กสิทธิ์ (แอดมิน / กู้ภัยที่รับเคส / หัวหน้าหน่วยที่รับเคส) และบันทึก audit_logs
 *
 * แยก loadCase / callRpc ออกมาเป็นพารามิเตอร์ เพื่อทดสอบด้วย Vitest ได้โดยไม่ต่อฐานข้อมูล
 */

export interface OverrideCaseRow {
  urgency: Urgency;
  incident_type?: import("../../../lib/domain").IncidentType;
  version: number;
  created_at: string;
  details: { waterLevel?: string } | null;
  case_people: { elderly: number; bedridden: number; children: number } | null;
}

export interface OverrideDeps {
  loadCase(caseId: string): Promise<OverrideCaseRow | null>;
  callRpc(args: {
    p_case_id: string;
    p_urgency: Urgency;
    p_reason: string;
    p_priority_score: number;
    p_expected_version: number;
  }): Promise<{ data: number | null; error: { code?: string; message: string } | null }>;
}

export type OverrideResult =
  | { ok: true; version: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const ERROR_BY_CODE: Record<string, string> = {
  "42501": "คุณไม่มีสิทธิ์ปรับระดับเคสนี้ (ต้องเป็นผู้รับเคส หัวหน้าหน่วยที่รับเคส หรือแอดมิน)",
  SOS40: "เคสนี้ปิดแล้ว ปรับระดับไม่ได้",
  SOS41: "เคสนี้ถูกแก้ไขไปแล้ว กรุณาโหลดหน้าใหม่ก่อนลองอีกครั้ง",
  P0002: "ไม่พบเคสนี้",
  "22023": "ระดับใหม่ต้องต่างจากระดับเดิม และต้องมีเหตุผลอย่างน้อย 5 ตัวอักษร",
};

export async function overrideCaseUrgency(
  rawInput: unknown,
  deps: OverrideDeps,
  now: Date = new Date(),
): Promise<OverrideResult> {
  const parsed = triageOverrideSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const input = parsed.data;

  const row = await deps.loadCase(input.caseId);
  if (!row) return { ok: false, error: ERROR_BY_CODE.P0002 };

  const waterLevel = Object.values(WaterLevel).find((w) => w === row.details?.waterLevel);
  const score = priorityScore(
    {
      urgency: input.urgency,
      incidentType: row.incident_type,
      waterLevel,
      bedridden: row.case_people?.bedridden ?? 0,
      elderly: row.case_people?.elderly ?? 0,
      children: row.case_people?.children ?? 0,
      createdAt: new Date(row.created_at),
    },
    now,
  );

  const { data, error } = await deps.callRpc({
    p_case_id: input.caseId,
    p_urgency: input.urgency,
    p_reason: input.reason,
    p_priority_score: score,
    p_expected_version: input.expectedVersion,
  });

  if (error) {
    return {
      ok: false,
      error: ERROR_BY_CODE[error.code ?? ""] ?? "ปรับระดับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    };
  }
  return { ok: true, version: data ?? input.expectedVersion + 1 };
}
