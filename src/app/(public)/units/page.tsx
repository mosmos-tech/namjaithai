import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listDistricts, listProvinces } from "@/features/geo/queries";
import {
  OsmCredit,
  UnitCapabilityList,
  UnitHotline,
  UnitStatusBadges,
} from "@/features/units/components/UnitBadges";
import { UnitFilters } from "@/features/units/components/UnitFilters";
import { UnitPicker } from "@/features/units/components/UnitPicker";
import { listPublicUnits } from "@/features/units/server/public-units";
import {
  filterUnits,
  groupUnitsByProvince,
  organizationsOf,
  parseUnitDirectoryParams,
} from "@/lib/domain";

export const metadata: Metadata = {
  title: "หน่วยกู้ภัย — น้ำใจไทย SOS",
  description: "ค้นหาหน่วยกู้ภัยตามจังหวัด อำเภอ องค์กร และความสามารถ พร้อมผลงานช่วยเหลือ",
};

const PAGE_SIZE = 30;

// TF-61: หน้าสาธารณะ เลือกหน่วยกู้ภัย (เปิดได้โดยไม่ล็อกอิน)
export default function UnitsPage({ searchParams }: PageProps<"/units">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <h1 className="font-heading text-text-primary text-3xl font-bold">หน่วยกู้ภัย</h1>
        <p className="text-text-secondary mt-2 text-base">
          ค้นหาหน่วยกู้ภัยใกล้คุณ ดูความสามารถและผลงานช่วยเหลือ 30 วันล่าสุด
        </p>
      </header>
      <Suspense fallback={<p className="text-text-secondary text-lg">กำลังโหลด…</p>}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Directory({ searchParams }: { searchParams: PageProps<"/units">["searchParams"] }) {
  const params = parseUnitDirectoryParams(await searchParams);
  const [units, provinces, districts] = await Promise.all([
    listPublicUnits(),
    listProvinces(),
    params.provinceCode ? listDistricts(params.provinceCode) : Promise.resolve([]),
  ]);
  // URL เก็บรหัสพื้นที่ของ TF-05 ส่วนตาราง units เก็บชื่อภาษาไทย
  const province = provinces.find((item) => item.code === params.provinceCode);
  const district = districts.find((item) => item.code === params.districtCode);
  const results = filterUnits(units, {
    province: province?.nameTh,
    district: district?.nameTh,
    organization: params.organization ?? undefined,
    capability: params.capability ?? undefined,
    query: params.query,
  });
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(params.page, pages);
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (params.query) query.set("q", params.query);
    if (province) query.set("province", String(province.code));
    if (district) query.set("district", String(district.code));
    if (params.organization) query.set("org", params.organization);
    if (params.capability) query.set("cap", params.capability);
    if (target > 1) query.set("page", String(target));
    return `/units?${query}`;
  };

  return (
    <>
      <section className="bg-bg-surface flex flex-col gap-4 rounded-[14px] border p-4 sm:p-5">
        <UnitPicker
          label="ไปที่หน่วยโดยตรง"
          placeholder="แตะเพื่อค้นหาและเลือกหน่วย"
          navigatePrefix="/units/"
          // ตัวเลือกตามตัวกรองปัจจุบัน (เลือกจังหวัดแล้วรายการสั้นลง)
          options={results.map((unit) => ({
            id: unit.id,
            label: unit.label,
            province: unit.province,
            isDemo: unit.isDemo,
          }))}
        />
        <UnitFilters
          // เปลี่ยน URL (เช่น กดล้างตัวกรอง) แล้วฟอร์มเริ่มใหม่จากค่าใน URL ไม่ค้างค่าเดิม
          key={JSON.stringify(params)}
          params={params}
          provinces={provinces}
          districts={districts}
          organizations={organizationsOf(units)}
        />
      </section>

      <p className="text-text-secondary" role="status" data-testid="units-count">
        {`พบ ${results.length.toLocaleString("th-TH")} หน่วย`}
        {pages > 1 && ` · หน้า ${page} จาก ${pages}`}
      </p>

      {groupUnitsByProvince(shown).map((group) => (
        <section key={group.province} className="flex flex-col gap-3" aria-label={group.province}>
          <h2 className="font-heading text-xl font-semibold">{group.province}</h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {group.units.map((unit) => (
              <li
                key={unit.id}
                className="bg-bg-surface flex flex-col gap-3 rounded-[14px] border p-4"
                data-testid="unit-card"
              >
                <Link
                  prefetch={false}
                  href={`/units/${unit.id}`}
                  className="text-primary-700 font-heading text-lg font-semibold break-words underline-offset-4 hover:underline"
                >
                  {unit.label}
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <UnitStatusBadges unit={unit} />
                  {!unit.notInService && (
                    <span className="text-text-secondary text-sm">
                      ช่วยสำเร็จทั้งหมด{" "}
                      <span className="text-text-primary font-mono font-semibold">
                        {unit.helpedTotal.toLocaleString("th-TH")}
                      </span>{" "}
                      เคส
                    </span>
                  )}
                </div>
                <UnitCapabilityList unit={unit} />
                <UnitHotline unit={unit} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {results.length === 0 && (
        <p className="bg-bg-surface rounded-[14px] border p-6 text-center text-lg">
          ไม่พบหน่วยที่ตรงกับตัวกรอง ลองเลือกจังหวัดอื่นหรือล้างตัวกรอง
        </p>
      )}

      {pages > 1 && (
        <nav aria-label="เปลี่ยนหน้า" className="flex flex-wrap gap-3">
          {page > 1 && (
            <Link
              prefetch={false}
              href={pageHref(page - 1)}
              className="border-primary-600 text-primary-700 inline-flex min-h-12 items-center rounded-full border-2 bg-white px-6 font-semibold"
            >
              ← หน้าก่อน
            </Link>
          )}
          {page < pages && (
            <Link
              prefetch={false}
              href={pageHref(page + 1)}
              className="border-primary-600 text-primary-700 inline-flex min-h-12 items-center rounded-full border-2 bg-white px-6 font-semibold"
            >
              หน้าถัดไป →
            </Link>
          )}
        </nav>
      )}

      {shown.some((unit) => unit.source === "OSM") && <OsmCredit />}
    </>
  );
}
