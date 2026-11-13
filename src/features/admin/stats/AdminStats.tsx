import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { listProvinces } from "@/features/geo/queries";
import { INCIDENT_REGISTRY, type IncidentType } from "@/lib/domain/incidents";
import { createClient } from "@/lib/supabase/server";
import { parseStatsFilters } from "./filters";

type Count = { name: string; count: number };
type Stats = {
  open: number;
  critical_waiting: number;
  helping: number;
  closed_today: number;
  urgencies: Count[];
  provinces: Count[];
  incidents: Count[];
};

export async function AdminStats({
  searchParams,
}: {
  searchParams: PageProps<"/admin">["searchParams"];
}) {
  const user = await getCurrentAppUser();
  if (user?.role !== "ADMIN" || user.status !== "ACTIVE") return null;
  const filters = parseStatsFilters(await searchParams);
  const [provinces, db] = await Promise.all([listProvinces(), createClient()]);
  const { data, error } = filters.error
    ? { data: null, error: null }
    : await db.rpc("admin_case_statistics", {
        p_province: filters.province || null,
        p_from: filters.from || null,
        p_to: filters.to || null,
      });
  const stats = data as Stats | null;
  const cards = stats
    ? ([
        ["เคสที่เปิดอยู่", stats.open, "bg-slate-800 text-white"],
        ["วิกฤตรอคนรับ", stats.critical_waiting, "bg-red-700 text-white"],
        ["กำลังช่วยเหลือ", stats.helping, "bg-sky-700 text-white"],
        ["ปิดแล้ววันนี้", stats.closed_today, "bg-green-700 text-white"],
      ] as const)
    : [];
  const urgency: Record<string, string> = { RED: "แดง", YELLOW: "เหลือง", GREEN: "เขียว" };
  const groups = stats
    ? [
        {
          title: "สถิติแยกสี",
          rows: stats.urgencies,
          label: (name: string) => urgency[name] ?? name,
        },
        { title: "สถิติแยกจังหวัด", rows: stats.provinces, label: (name: string) => name },
        {
          title: "สถิติแยกประเภทเหตุ",
          rows: stats.incidents,
          label: (name: string) => INCIDENT_REGISTRY[name as IncidentType]?.label.th ?? name,
        },
      ]
    : [];
  return (
    <section aria-label="สถิติห้องสั่งการ" className="flex min-w-0 flex-col gap-5">
      <form method="get" className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 font-semibold">
          จังหวัดของสถิติ
          <select
            name="province"
            defaultValue={filters.province}
            className="min-h-12 w-full rounded-lg border bg-white px-3 font-normal"
          >
            <option value="">ทุกจังหวัด</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.nameTh}>
                {p.nameTh}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 font-semibold">
          ตั้งแต่วันที่
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className="min-h-12 min-w-0 rounded-lg border bg-white px-3 font-normal"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 font-semibold">
          ถึงวันที่
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            className="min-h-12 min-w-0 rounded-lg border bg-white px-3 font-normal"
          />
        </label>
        <button className="bg-primary-600 min-h-12 rounded-full px-6 font-semibold text-white sm:col-span-3 sm:justify-self-start">
          แสดงสถิติ
        </button>
      </form>
      {(filters.error || error) && (
        <p role="alert" className="text-red-700">
          {filters.error ?? "ไม่สามารถโหลดสถิติได้ กรุณาลองใหม่"}
        </p>
      )}
      {stats && (
        <>
          <p className="text-text-secondary text-sm">
            ตัวเลขปัจจุบันตามจังหวัดที่เลือก · สถิตินับตามวันที่แจ้งเหตุ เวลาไทย
          </p>
          <dl aria-label="ตัวเลขสรุป" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map(([label, count, color]) => (
              <div key={label} className={`rounded-xl p-4 ${color}`}>
                <dt>{label}</dt>
                <dd className="text-3xl font-bold">{count.toLocaleString("th-TH")}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-4 md:grid-cols-3">
            {groups.map(({ title, rows, label }) => (
              <section
                key={title}
                aria-label={title}
                className="min-w-0 rounded-xl border bg-white p-4"
              >
                <h2 className="text-lg font-bold">{title}</h2>
                {rows.length ? (
                  <dl className="mt-3 space-y-2">
                    {rows.map((row) => (
                      <div key={row.name} className="flex items-start justify-between gap-3">
                        <dt className="break-words">{label(row.name)}</dt>
                        <dd className="font-semibold">{row.count.toLocaleString("th-TH")}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3">ไม่มีข้อมูลในช่วงที่เลือก</p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
