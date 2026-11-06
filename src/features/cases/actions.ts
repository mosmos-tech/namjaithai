"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  overrideCaseUrgency,
  type OverrideCaseRow,
  type OverrideResult,
} from "./server/override-urgency";

/**
 * Server Action: กู้ภัยปรับระดับความเร่งด่วน (TF-55)
 * ใช้ client ของผู้ใช้ที่ล็อกอิน (ไม่ใช่ service role) เพื่อให้ฐานข้อมูลเช็กสิทธิ์จากตัวคนกดจริง
 * หน้าเคสของกู้ภัย (TF-23/24) เรียกผ่าน <TriageOverrideForm />
 */
export async function overrideCaseUrgencyAction(input: unknown): Promise<OverrideResult> {
  const supabase = await createClient();
  const result = await overrideCaseUrgency(input, {
    async loadCase(caseId) {
      const { data } = await supabase
        .from("cases")
        .select(
          "urgency, incident_type, version, created_at, details, case_people(elderly, bedridden, children)",
        )
        .eq("id", caseId)
        .maybeSingle<OverrideCaseRow>();
      return data;
    },
    async callRpc(args) {
      const { data, error } = await supabase.rpc("override_case_urgency", args);
      return { data: data as number | null, error };
    },
  });
  if (result.ok) refresh();
  return result;
}
