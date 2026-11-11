import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedInShell } from "@/features/auth/components/SignedInShell";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { HelpedChart } from "@/features/unit-stats/components/HelpedChart";
import {
  countActiveCases,
  listDashboardUnits,
  loadPeriodBars,
  loadUnitMonthlyStats,
} from "@/features/unit-stats/server/unit-dashboard";
import { parseMonthParam, recentMonthOptions, thaiMonthLongLabel, unitTotals } from "@/lib/domain";

export const metadata: Metadata = {
  title: "ผลงานหน่วย — น้ำใจไทย SOS",
  robots: { index: false },
};

// TF-57: ผลงานหน่วยสำหรับสมาชิก หัวหน้า และแอดมิน (นับเฉพาะเคสที่ผ่านด่านกันปั๊มผลงาน)
export default function Page({ searchParams }: PageProps<"/unit/dashboard">) {
  return (
    <Suspense fallback={<p className="text-text-secondary p-8 text-center text-lg">กำลังโหลด…</p>}>
      <SignedInShell pathname="/unit/dashboard" title="ผลงานหน่วย" denied={Promise.resolve(false)}>
        <Dashboard searchParams={searchParams} />
      </SignedInShell>
    </Suspense>
  );
}

async function Dashboard({
  searchParams,
}: {
  searchParams: PageProps<"/unit/dashboard">["searchParams"];
}) {
  // SignedInShell ตรวจสิทธิ์และ redirect ให้แล้ว — ที่นี่แค่อ่านผู้ใช้ ห้าม redirect ซ้ำกลางการวาดหน้า
  const user = await getCurrentAppUser();
  if (!user) return null;
  const units = await listDashboardUnits(user);
  if (units.length === 0) {
    return <p className="text-lg">คุณยังไม่ได้อยู่ในหน่วยไหน จึงยังไม่มีผลงานให้แสดง</p>;
  }
  const params = await searchParams;
  const unit = units.find((item) => item.id === params.unit) ?? units[0];
  const now = new Date();
  // ช่วงเวลา: ไม่เลือก = 12 เดือนล่าสุด (รายเดือน) · ?month=YYYY-MM = รายวันของเดือนนั้น
  const month = parseMonthParam(params.month, now);
  const [rows, active] = await Promise.all([
    loadUnitMonthlyStats(unit.id),
    countActiveCases(unit.id),
  ]);
  const bars = await loadPeriodBars(unit.id, month, rows);
  const totals = unitTotals(rows, now);
  const csvQuery = new URLSearchParams({ unit: unit.id, ...(month ? { month } : {}) });
  // ช่องที่ 2 ตามช่วงเวลา: เลือกเดือน = ยอดของเดือนนั้น (ผลรวมแท่งรายวันชุดเดียวกับกราฟ/ตาราง)
  const tiles = [
    ["active", "กำลังช่วย", active, "เคส"],
    month
      ? [
          "helped-period",
          `ช่วยสำเร็จ ${thaiMonthLongLabel(month)}`,
          bars.reduce((total, bar) => total + bar.helped, 0),
          "เคส",
        ]
      : ["helped-period", "ช่วยสำเร็จเดือนนี้", totals.helpedThisMonth, "เคส"],
    ["helped-all", "ช่วยสำเร็จทั้งหมด", totals.helpedAll, "เคส"],
    ["people", "คนที่ช่วยได้", totals.peopleHelped, "คน"],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <form method="get" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          {units.length > 1 ? (
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-base font-semibold">
              เลือกหน่วย
              <select
                name="unit"
                defaultValue={unit.id}
                className="border-border-default bg-bg-surface min-h-12 w-full rounded-[12px] border px-3 text-base font-normal"
              >
                {units.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="unit" value={unit.id} />
          )}
          <label className="flex flex-col gap-1 text-base font-semibold sm:w-56">
            ช่วงเวลา
            <select
              name="month"
              defaultValue={month ?? ""}
              className="border-border-default bg-bg-surface min-h-12 w-full rounded-[12px] border px-3 text-base font-normal"
            >
              <option value="">12 เดือนล่าสุด</option>
              {recentMonthOptions(now).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="bg-primary-600 text-text-on-primary min-h-12 rounded-full px-6 font-semibold"
          >
            ดูผลงาน
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl font-semibold break-words" data-testid="unit-label">
            {unit.label}
          </h2>
          {unit.isDemo && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
              ข้อมูลตัวอย่าง
            </span>
          )}
        </div>
        <p className="text-text-secondary">
          นับเฉพาะเคสที่ผู้แจ้งยืนยันว่าได้รับความช่วยเหลือ และผ่านการตรวจกันปั๊มผลงาน
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="ตัวเลขสรุป">
        {tiles.map(([key, label, value, unitLabel]) => (
          <div key={key} className="bg-bg-surface flex flex-col gap-1 rounded-[14px] border p-4">
            <dt className="text-text-secondary text-sm" data-testid={`stat-label-${key}`}>
              {label}
            </dt>
            <dd className="font-mono text-3xl font-bold" data-testid={`stat-${key}`}>
              {value.toLocaleString("th-TH")}
              <span className="font-heading text-text-secondary ml-1 text-base font-normal">
                {unitLabel}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <HelpedChart
        bars={bars}
        period={month ? "day" : "month"}
        title={
          month
            ? `ช่วยสำเร็จรายวัน ${thaiMonthLongLabel(month)}`
            : "ช่วยสำเร็จรายเดือน (12 เดือนล่าสุด)"
        }
      />

      <a
        href={`/unit/dashboard/csv?${csvQuery}`}
        download
        className="border-primary-600 text-primary-700 inline-flex min-h-12 items-center justify-center self-start rounded-full border-2 bg-white px-6 font-semibold"
      >
        ดาวน์โหลดตัวเลขช่วงนี้ (CSV)
      </a>
    </div>
  );
}
