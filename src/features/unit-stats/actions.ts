"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// TF-57: แอดมินตัดสินเคสที่ติดด่านกันปั๊มผลงาน — สิทธิ์แอดมินและ audit_logs อยู่ใน RPC
export async function reviewCasePerformance(
  caseId: string,
  decision: "APPROVE" | "REJECT",
  note: string,
) {
  if (!z.uuid().safeParse(caseId).success || !["APPROVE", "REJECT"].includes(decision)) {
    return { error: "ข้อมูลไม่ถูกต้อง" };
  }
  if (note.trim().length > 300) return { error: "หมายเหตุต้องไม่เกิน 300 ตัวอักษร" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_case_performance", {
    p_case_id: caseId,
    p_decision: decision,
    p_note: note.trim() || null,
  });
  return error ? { error: "บันทึกไม่สำเร็จ เคสนี้อาจถูกตรวจไปแล้ว" } : { ok: true };
}
