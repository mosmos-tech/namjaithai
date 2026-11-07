"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
