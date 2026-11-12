"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  acceptCaseMessage,
  acceptTransferMessage,
  advanceCaseMessage,
  cancelTransferMessage,
  caseTransferRequestSchema,
  caseCompletionSchema,
  caseNoteSchema,
  caseReleaseReasonSchema,
  CaseStatus,
  requestTransferMessage,
  RESCUER_NEXT_STATUS,
  UnitCapability,
  type AcceptCaseResult,
  type AcceptTransferResult,
  type CancelTransferResult,
  type RequestTransferResult,
  type TransferOption,
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

export async function assignCase(
  caseId: string,
  unitId: string,
  rescuerId: string,
  version: number,
) {
  if (
    ![caseId, unitId, rescuerId].every((id) => z.uuid().safeParse(id).success) ||
    !Number.isInteger(version)
  ) {
    return { error: "ข้อมูลมอบหมายไม่ถูกต้อง" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_case", {
    p_case_id: caseId,
    p_unit_id: unitId,
    p_rescuer_id: rescuerId,
    p_expected_version: version,
  });
  if (error || !data) return { error: "มอบหมายไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และลองใหม่" };
  switch (data.status) {
    case "ASSIGNED":
      return { success: true };
    case "UNCHANGED":
      return { error: "สมาชิกคนนี้รับเคสอยู่แล้ว" };
    case "LIMIT":
      return { error: "สมาชิกคนนี้ถือเคสครบ 2 เคสแล้ว" };
    default:
      return { error: "ข้อมูลเคสเปลี่ยนแล้ว กรุณาลองใหม่", stale: true };
  }
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

// ── TF-59 ส่งต่อเคส: สิทธิ์ ความสามารถ ส่งต่อซ้อน และกดพร้อมกันตรวจใน RPC ทั้งหมด ──

const capabilitiesSchema = z.array(z.enum(UnitCapability)).min(1).max(7);

export async function listTransferOptions(caseId: string, capabilities: string[]) {
  const parsed = capabilitiesSchema.safeParse(capabilities);
  if (!z.uuid().safeParse(caseId).success || !parsed.success) {
    return { error: "กรุณาเลือกอุปกรณ์หรือความสามารถที่ขาดอย่างน้อย 1 อย่าง" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("case_transfer_options", {
    p_case_id: caseId,
    p_capabilities: parsed.data,
  });
  if (error) return { error: "ค้นหาหน่วยไม่สำเร็จ กรุณาลองใหม่" };
  return { options: (data ?? []) as TransferOption[] };
}

export async function requestTransfer(
  caseId: string,
  version: number,
  toUnitId: string,
  input: { capabilities: string[]; reason: string },
) {
  if (
    ![caseId, toUnitId].every((id) => z.uuid().safeParse(id).success) ||
    !Number.isInteger(version)
  ) {
    return { error: "กรุณาเลือกหน่วยที่จะส่งต่อ" };
  }
  const parsed = caseTransferRequestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_transfer", {
    p_case_id: caseId,
    p_expected_version: version,
    p_to_unit_id: toUnitId,
    p_capabilities: parsed.data.capabilities,
    p_reason: parsed.data.reason,
  });
  if (error || !data) {
    return {
      error:
        error?.code === "22023"
          ? "หน่วยนี้รับส่งต่อไม่ได้แล้ว กรุณาค้นหาหน่วยใหม่"
          : "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่",
    };
  }
  const result = data as RequestTransferResult;
  return result.status === "REQUESTED"
    ? { result, message: requestTransferMessage(result) }
    : { result, error: requestTransferMessage(result) };
}

export async function acceptTransfer(transferId: string, version: number) {
  if (!z.uuid().safeParse(transferId).success || !Number.isInteger(version)) {
    return { error: "ไม่พบคำขอส่งต่อ" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_transfer", {
    p_transfer_id: transferId,
    p_expected_version: version,
  });
  if (error || !data) return { error: "รับเคสไม่สำเร็จ กรุณาลองใหม่" };
  const result = data as AcceptTransferResult;
  return result.status === "ACCEPTED"
    ? { result, message: acceptTransferMessage(result) }
    : { result, error: acceptTransferMessage(result) };
}

export async function cancelTransfer(transferId: string) {
  if (!z.uuid().safeParse(transferId).success) return { error: "ไม่พบคำขอส่งต่อ" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_transfer", { p_transfer_id: transferId });
  if (error || !data) return { error: "ยกเลิกไม่สำเร็จ กรุณาลองใหม่" };
  const result = data as CancelTransferResult;
  return result.status === "CANCELLED"
    ? { result, message: cancelTransferMessage(result) }
    : { result, error: cancelTransferMessage(result) };
}
