"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  acceptCaseMessage,
  caseReleaseReasonSchema,
  type AcceptCaseResult,
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
