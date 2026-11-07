import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { manageableUnits } from "@/features/auth/server/unit-invites";
import { createAdminClient } from "@/lib/supabase/admin";
import { unitsWithoutCapabilities } from "../red-alert";

/**
 * แถบเตือนบนหน้า /unit (TF-34): หน่วยที่ยังไม่ได้ตั้งความสามารถจะได้รับแจ้งเคสแดงทุกประเภท
 * ลิงก์ไปที่แผงตั้งความสามารถ (TF-52) บนหน้าเดียวกัน
 */
export async function UnitCapabilityAlertNotice() {
  // SignedInShell ตรวจสิทธิ์และ redirect ให้แล้ว — ที่นี่แค่อ่านผู้ใช้ ห้าม redirect ซ้ำกลางการวาดหน้า
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE") return null;
  const units = await manageableUnits(user);
  if (units.length === 0) return null;

  const { data, error } = await createAdminClient()
    .from("unit_capabilities")
    .select("unit_id")
    .in(
      "unit_id",
      units.map((unit) => unit.id),
    );
  if (error) return null;
  const missing = unitsWithoutCapabilities(units, data ?? []);
  if (missing.length === 0) return null;

  const names = missing.slice(0, 3).map((unit) => unit.name);
  const more = missing.length - names.length;

  return (
    <div
      role="alert"
      data-testid="unit-capability-missing"
      className="mb-5 flex flex-col gap-3 rounded-[12px] border border-amber-500/40 bg-amber-50 px-4 py-3 text-base text-amber-700 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        <strong className="font-semibold">หน่วยยังไม่ได้ตั้งความสามารถ</strong>{" "}
        จะได้รับแจ้งเตือนทุกประเภท
        {units.length > 1 && (
          <span className="block text-sm">
            {names.join(", ")}
            {more > 0 ? ` และอีก ${more} หน่วย` : ""}
          </span>
        )}
      </p>
      <a
        href="#capability-heading"
        className="border-primary-600 bg-bg-surface text-primary-700 font-heading inline-flex min-h-12 shrink-0 items-center justify-center rounded-full border px-5 font-semibold"
      >
        ตั้งความสามารถหน่วย
      </a>
    </div>
  );
}
