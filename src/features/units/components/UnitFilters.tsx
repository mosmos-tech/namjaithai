"use client";

import Link from "next/link";
import { useState } from "react";
import { unitCapabilityLabels, type AdminArea, type UnitDirectoryParams } from "@/lib/domain";
import { localePath } from "@/lib/i18n/locale";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

const selectClass =
  "border-border-default bg-bg-surface min-h-12 w-full min-w-0 rounded-[12px] border px-3 text-base font-normal";
const labelClass = "flex min-w-0 flex-col gap-1 text-base font-semibold";

/**
 * ตัวกรองหน้า /units — ฟอร์ม GET ธรรมดา ค่าที่เลือกจึงอยู่ใน URL (แชร์ลิงก์/กดย้อนกลับได้)
 * จังหวัด → อำเภอ/เขต ใช้ข้อมูลพื้นที่ของ TF-05 (เปลี่ยนจังหวัดแล้วโหลดรายชื่ออำเภอใหม่)
 */
export function UnitFilters({
  params,
  provinces,
  districts: initialDistricts,
  organizations,
  locale = "th",
}: {
  params: UnitDirectoryParams;
  provinces: AdminArea[];
  districts: AdminArea[];
  organizations: string[];
  locale?: "th" | "en";
}) {
  const t = (locale === "en" ? REPORTER_TEXT_EN : REPORTER_TEXT_TH).units;
  const [provinceCode, setProvinceCode] = useState(params.provinceCode?.toString() ?? "");
  const [districts, setDistricts] = useState(initialDistricts);
  const [districtCode, setDistrictCode] = useState(params.districtCode?.toString() ?? "");

  async function changeProvince(code: string) {
    setProvinceCode(code);
    setDistrictCode("");
    setDistricts([]);
    if (!code) return;
    const response = await fetch(`/api/geo/provinces/${code}/districts`);
    if (response.ok) setDistricts((await response.json()) as AdminArea[]);
  }

  const sortedProvinces =
    locale === "en"
      ? [...provinces].sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en"))
      : provinces;
  const sortedDistricts =
    locale === "en"
      ? [...districts].sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en"))
      : districts;
  const unitsPath = localePath("/units", locale);

  return (
    <form
      method="get"
      action={unitsPath}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label={t.filterAriaLabel}
    >
      <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
        {t.searchByName}
        <input
          type="search"
          name="q"
          defaultValue={params.query}
          placeholder={t.searchPlaceholder}
          className={selectClass}
        />
      </label>
      <label className={labelClass}>
        {t.provinceLabel}
        <select
          name="province"
          value={provinceCode}
          onChange={(event) => changeProvince(event.target.value)}
          className={selectClass}
        >
          <option value="">{t.allProvinces}</option>
          {sortedProvinces.map((province) => (
            <option key={province.code} value={province.code}>
              {locale === "en" ? province.nameEn : province.nameTh}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {t.districtLabel}
        <select
          name="district"
          value={districtCode}
          onChange={(event) => setDistrictCode(event.target.value)}
          disabled={!provinceCode}
          className={`${selectClass} disabled:opacity-60`}
        >
          <option value="">{provinceCode ? t.allDistricts : t.selectProvinceFirst}</option>
          {sortedDistricts.map((district) => (
            <option key={district.code} value={district.code}>
              {locale === "en" ? district.nameEn : district.nameTh}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {t.organizationLabel}
        <select name="org" defaultValue={params.organization ?? ""} className={selectClass}>
          <option value="">{t.allOrganizations}</option>
          {organizations.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {t.capabilityLabel}
        <select name="cap" defaultValue={params.capability ?? ""} className={selectClass}>
          <option value="">{t.allCapabilities}</option>
          {Object.entries(unitCapabilityLabels(locale)).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-2">
        <button
          type="submit"
          className="bg-primary-600 text-text-on-primary min-h-12 flex-1 rounded-full px-6 font-semibold sm:flex-none"
        >
          {t.searchButton}
        </button>
        <Link
          prefetch={false}
          href={unitsPath}
          className="text-primary-700 inline-flex min-h-12 items-center px-3 font-semibold underline underline-offset-4"
        >
          {t.clearFilters}
        </Link>
      </div>
    </form>
  );
}
