import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { dailyHelpedChartData } from "@/features/unit-stats/chart-data";
import { HelpedChart } from "@/features/unit-stats/components/HelpedChart";
import {
  OsmCredit,
  UnitCapabilityList,
  UnitHotline,
  UnitStatusBadges,
} from "@/features/units/components/UnitBadges";
import { getPublicDailyHelped, getPublicUnitProfile } from "@/features/units/server/public-units";

export async function generateMetadata({ params }: PageProps<"/units/[id]">): Promise<Metadata> {
  const unit = await getPublicUnitProfile((await params).id);
  return { title: `${unit?.label ?? "หน่วยกู้ภัย"} — น้ำใจไทย SOS` };
}

// TF-61: ผลงานหน่วยต่อสาธารณะ (เปิดได้โดยไม่ล็อกอิน) — ตัวเลขรวมเท่านั้น ไม่มีรายเคส
export default function UnitPage({ params }: PageProps<"/units/[id]">) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        prefetch={false}
        href="/units"
        className="text-primary-700 inline-flex min-h-12 items-center self-start font-semibold underline-offset-4 hover:underline"
      >
        ← หน่วยกู้ภัยทั้งหมด
      </Link>
      <Suspense fallback={<p className="text-text-secondary text-lg">กำลังโหลด…</p>}>
        <UnitProfile params={params} />
      </Suspense>
    </div>
  );
}

async function UnitProfile({ params }: { params: PageProps<"/units/[id]">["params"] }) {
  const { id } = await params;
  const unit = await getPublicUnitProfile(id);
  if (!unit) notFound();

  const header = (
    <header className="flex flex-col gap-3">
      <h1
        className="font-heading text-text-primary text-2xl font-bold break-words sm:text-3xl"
        data-testid="unit-label"
      >
        {unit.label}
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <UnitStatusBadges unit={unit} />
      </div>
      <UnitCapabilityList unit={unit} />
      <UnitHotline unit={unit} />
    </header>
  );

  // หน่วยจริงจาก OSM ที่ยังไม่ได้ใช้ระบบ: ไม่มีตัวเลขและกราฟ
  if (unit.notInService) {
    return (
      <>
        {header}
        <p className="bg-bg-surface rounded-[14px] border p-5 text-lg">
          หน่วยนี้ยังไม่ได้ใช้ระบบน้ำใจไทย SOS จึงยังไม่มีผลงานในระบบ
          {unit.hotline ? " ติดต่อหน่วยได้ที่สายด่วนด้านบน" : ""}
        </p>
        <OsmCredit />
      </>
    );
  }

  const bars = await getPublicDailyHelped(unit.id);
  // ช่วยสำเร็จนับเฉพาะผู้แจ้งยืนยัน (เหมือน /unit/dashboard) — เคสที่หัวหน้าปิดบอกแยกใต้ตัวเลข
  const tiles = [
    { key: "active", label: "กำลังช่วยอยู่", value: unit.activeCount, unit: "เคส" },
    {
      key: "helped-30d",
      label: "ช่วยสำเร็จ 30 วัน",
      value: unit.helped30d,
      unit: "เคส",
      note: unit.leadClosed30d > 0 ? `ไม่รวมหัวหน้าปิด ${unit.leadClosed30d} เคส` : null,
    },
    {
      key: "helped-all",
      label: "ช่วยสำเร็จทั้งหมด",
      value: unit.helpedTotal,
      unit: "เคส",
      note: unit.leadClosedTotal > 0 ? `ไม่รวมหัวหน้าปิด ${unit.leadClosedTotal} เคส` : null,
    },
    { key: "people", label: "จำนวนคนที่ช่วยได้", value: unit.peopleHelped, unit: "คน" },
  ];

  return (
    <>
      {header}
      <p className="text-text-secondary">
        นับเฉพาะเคสที่ผ่านการตรวจกันปั๊มผลงาน · &quot;ช่วยสำเร็จ&quot;
        คือเคสที่ผู้แจ้งยืนยันว่าได้รับความช่วยเหลือแล้ว
      </p>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="ตัวเลขสรุป">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="bg-bg-surface flex flex-col gap-1 rounded-[14px] border p-4"
          >
            <dt className="text-text-secondary text-sm">{tile.label}</dt>
            <dd className="font-mono text-3xl font-bold" data-testid={`stat-${tile.key}`}>
              {tile.value.toLocaleString("th-TH")}
              <span className="font-heading text-text-secondary ml-1 text-base font-normal">
                {tile.unit}
              </span>
            </dd>
            {tile.note && <dd className="text-text-secondary text-xs">{tile.note}</dd>}
          </div>
        ))}
      </dl>

      <HelpedChart title="ผลงาน 30 วันล่าสุด" data={dailyHelpedChartData(bars)} />
    </>
  );
}
