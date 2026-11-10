import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { listDashboardUnits, loadPeriodBars } from "@/features/unit-stats/server/unit-dashboard";
import { decideAccess, parseMonthParam, unitStatsCsv } from "@/lib/domain";

// TF-57: ดาวน์โหลดตัวเลขช่วงที่เลือกเป็น CSV (BOM ให้ Excel อ่านภาษาไทยได้) — สิทธิ์และตัวเลขชุดเดียวกับหน้า dashboard
// ?month=YYYY-MM = รายวันของเดือนนั้น · ไม่ส่ง = 12 เดือนล่าสุด
export async function GET(request: Request) {
  const user = await getCurrentAppUser();
  if (!decideAccess("/unit/dashboard", user).allow || !user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const unitId = params.get("unit");
  const month = parseMonthParam(params.get("month"), new Date());
  if (!z.uuid().safeParse(unitId).success) {
    return NextResponse.json({ error: "invalid_unit" }, { status: 400 });
  }
  const unit = (await listDashboardUnits(user)).find((item) => item.id === unitId);
  if (!unit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const csv = unitStatsCsv(
    unit.label,
    await loadPeriodBars(unit.id, month),
    month ? "day" : "month",
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="unit-${month ?? "12-months"}-${unit.id.slice(0, 8)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
