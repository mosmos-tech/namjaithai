import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { caseExportCsv, parseCaseExportFilters, type CaseExportRow } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "no-store" };

/**
 * TF-38: แอดมินดาวน์โหลดรายการเคสเป็น CSV (ตัวกรองชุดเดียวกับสถิติห้องสั่งการ)
 * - ตรวจสิทธิ์ที่นี่และใน RPC admin_case_export (ไม่พึ่งการซ่อนปุ่ม)
 * - RPC เลือกเฉพาะคอลัมน์ที่อนุญาต ไม่รวมเคสตัวอย่าง และเขียน audit_logs ทุกครั้ง
 * - ตัวกรองไม่ถูกต้อง → กลับหน้าห้องสั่งการพร้อมข้อความ (ฟอร์มส่งแบบ GET ธรรมดา ไม่ต้องใช้ JS)
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  const params = request.nextUrl.searchParams;
  const filters = parseCaseExportFilters(params);
  if (!filters.ok) {
    const back = new URL("/admin", request.nextUrl.origin);
    for (const key of ["province", "from", "to", "incident"]) {
      const value = params.get(key);
      if (value) back.searchParams.set(key, value);
    }
    back.searchParams.set("exportError", filters.code);
    return NextResponse.redirect(back, 303);
  }
  const { data, error } = await (
    await createClient()
  ).rpc("admin_case_export", {
    p_from: filters.from,
    p_to: filters.to,
    p_province: filters.province || null,
    p_incident_type: filters.incidentType || null,
  });
  if (error) {
    return NextResponse.json(
      { error: "export_failed" },
      { status: error.code === "42501" ? 403 : 400, headers: noStore },
    );
  }
  return new Response(caseExportCsv((data ?? []) as CaseExportRow[]), {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cases-${filters.from}_${filters.to}.csv"`,
    },
  });
}
