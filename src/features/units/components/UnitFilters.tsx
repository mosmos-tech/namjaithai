"use client";

import Link from "next/link";
import { useState } from "react";
import { UNIT_CAPABILITY_LABELS, type AdminArea, type UnitDirectoryParams } from "@/lib/domain";

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
}: {
  params: UnitDirectoryParams;
  provinces: AdminArea[];
  districts: AdminArea[];
  organizations: string[];
}) {
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

  return (
    <form
      method="get"
      action="/units"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="กรองรายชื่อหน่วย"
    >
      <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
        ค้นด้วยชื่อ
        <input
          type="search"
          name="q"
          defaultValue={params.query}
          placeholder="เช่น ชื่อมูลนิธิ ชื่อศูนย์ หรืออำเภอ"
          className={selectClass}
        />
      </label>
      <label className={labelClass}>
        จังหวัด
        <select
          name="province"
          value={provinceCode}
          onChange={(event) => changeProvince(event.target.value)}
          className={selectClass}
        >
          <option value="">ทุกจังหวัด</option>
          {provinces.map((province) => (
            <option key={province.code} value={province.code}>
              {province.nameTh}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        อำเภอ/เขต
        <select
          name="district"
          value={districtCode}
          onChange={(event) => setDistrictCode(event.target.value)}
          disabled={!provinceCode}
          className={`${selectClass} disabled:opacity-60`}
        >
          <option value="">{provinceCode ? "ทุกอำเภอ/เขต" : "เลือกจังหวัดก่อน"}</option>
          {districts.map((district) => (
            <option key={district.code} value={district.code}>
              {district.nameTh}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        องค์กร
        <select name="org" defaultValue={params.organization ?? ""} className={selectClass}>
          <option value="">ทุกองค์กร</option>
          {organizations.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        ความสามารถ
        <select name="cap" defaultValue={params.capability ?? ""} className={selectClass}>
          <option value="">ทุกความสามารถ</option>
          {Object.entries(UNIT_CAPABILITY_LABELS).map(([value, label]) => (
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
          ค้นหา
        </button>
        <Link
          prefetch={false}
          href="/units"
          className="text-primary-700 inline-flex min-h-12 items-center px-3 font-semibold underline underline-offset-4"
        >
          ล้างตัวกรอง
        </Link>
      </div>
    </form>
  );
}
