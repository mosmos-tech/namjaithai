"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  acceptCaseMessage,
  advanceCaseMessage,
  caseCompletionSchema,
  caseNoteSchema,
  caseReleaseReasonSchema,
  CaseStatus,
  RESCUER_NEXT_STATUS,
  type AcceptCaseResult,
  type AdvanceCaseResult,
  type ReleaseCaseResult,
} from "@/lib/domain";

export async function revealCaseContact(caseId: string) {
  if (!z.uuid().safeParse(caseId).success) return { error: "ไม่พบเคส" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_case_contact", { p_case_id: caseId });
  if (error) return { error: "ไม่สามารถแสดงข้อมูลติดต่อได้" };
  if (!data) return { error: "ไม่มีข้อมูลติดต่อ" };
  return {
    contact: data as {
      name: string | null;
      phone: string | null;
      lineId: string | null;
      address: string | null;
    },
  };
}

// ── TF-25 รับ/ปล่อยเคส: เช็กสิทธิ์ เพดาน และกดพร้อมกันอยู่ใน RPC ทั้งหมด ที่นี่แค่ส่งต่อ ──

export async function acceptCase(caseId: string, version: number) {
  if (!z.uuid().safeParse(caseId).success || !Number.isInteger(version)) {
    return { error: "ไม่พบเคส" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_case", {
    p_case_id: caseId,
    p_expected_version: version,
  });
  if (error || !data) return { error: "รับเคสไม่สำเร็จ กรุณาลองใหม่" };
  const result = data as AcceptCaseResult;
  return { result, message: acceptCaseMessage(result) };
}

export async function releaseCase(caseId: string, version: number, reason: string) {
  if (!z.uuid().safeParse(caseId).success || !Number.isInteger(version)) {
    return { error: "ไม่พบเคส" };
  }
  const parsed = caseReleaseReasonSchema.safeParse(reason);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_case", {
    p_case_id: caseId,
    p_expected_version: version,
    p_reason: parsed.data,
  });
  if (error || !data) return { error: "ปล่อยเคสไม่สำเร็จ กรุณาลองใหม่" };
  const result = data as ReleaseCaseResult;
  return result.status === "RELEASED"
    ? { result }
    : { result, error: "ข้อมูลเคสเพิ่งเปลี่ยน กรุณาดูรายละเอียดอีกครั้ง" };
}

// ── TF-26 เลื่อนสถานะทีละขั้น: สิทธิ์ ลำดับ และกดซ้ำ/กดพร้อมกันตรวจใน advance_case_status ──

export async function advanceCaseStatus(
  caseId: string,
  version: number,
  from: CaseStatus,
  completion?: { outcome: string; peopleHelped: number; note?: string },
) {
  const next = RESCUER_NEXT_STATUS[from];
  if (!z.uuid().safeParse(caseId).success || !Number.isInteger(version) || !next) {
    return { error: "ไม่พบเคส" };
  }
  let finish: { outcome: string; peopleHelped: number; note: string } | undefined;
  if (next.to === CaseStatus.AWAITING_CONFIRMATION) {
    const parsed = caseCompletionSchema.safeParse(completion ?? {});
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    finish = parsed.data;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_case_status", {
    p_case_id: caseId,
    p_expected_version: version,
    p_to_status: next.to,
    p_note: finish?.note || null,
    p_outcome: finish?.outcome ?? null,
    p_people_helped: finish?.peopleHelped ?? null,
  });
  if (error || !data) {
    // 23514 = ลำดับไม่ถูก (มีคนเปลี่ยนไปก่อนแล้ว) — ให้โหลดสถานะล่าสุด
    return {
      error:
        error?.code === "23514"
          ? "สถานะเคสเปลี่ยนไปแล้ว กรุณาดูสถานะล่าสุด"
          : "อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่",
    };
  }
  const result = data as AdvanceCaseResult;
  return result.status === "UPDATED"
    ? { result, message: advanceCaseMessage(result) }
    : { result, error: advanceCaseMessage(result) };
}

export async function addCaseNote(caseId: string, note: string) {
  if (!z.uuid().safeParse(caseId).success) return { error: "ไม่พบเคส" };
  const parsed = caseNoteSchema.safeParse(note);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_case_note", { p_case_id: caseId, p_note: parsed.data });
  return error ? { error: "บันทึกโน้ตไม่สำเร็จ กรุณาลองใหม่" } : { ok: true };
}
