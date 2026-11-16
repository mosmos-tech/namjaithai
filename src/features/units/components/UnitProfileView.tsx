import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/public/LanguageSwitch";
import { listAllDistricts, listProvinces } from "@/features/geo/queries";
import { dailyHelpedChartData } from "@/features/unit-stats/chart-data";
import { HelpedChart } from "@/features/unit-stats/components/HelpedChart";
import {
  OsmCredit,
  UnitCapabilityList,
  UnitHotline,
  UnitStatusBadges,
} from "@/features/units/components/UnitBadges";
import { getPublicDailyHelped, getPublicUnitProfile } from "@/features/units/server/public-units";
import { buildAreaNameLookup, localizePublicUnit } from "@/lib/domain";
import { format, localePath, type Locale } from "@/lib/i18n/locale";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

export async function generateUnitProfileMetadata(
  params: Promise<{ id: string }>,
  locale: Locale,
): Promise<Metadata> {
  const rawUnit = await getPublicUnitProfile((await params).id);
  if (locale !== "en") {
    return { title: `${rawUnit?.label ?? "หน่วยกู้ภัย"} — น้ำใจไทย SOS` };
  }
  const unit = rawUnit
    ? localizePublicUnit(
        rawUnit,
        "en",
        buildAreaNameLookup(...(await Promise.all([listProvinces(), listAllDistricts()]))),
      )
    : null;
  return { title: `${unit?.label ?? REPORTER_TEXT_EN.units.title} — Namjai Thai SOS` };
}

export function UnitProfileView({
  params,
  locale,
}: {
  params: Promise<{ id: string }>;
  locale: Locale;
}) {
  const t = (locale === "en" ? REPORTER_TEXT_EN : REPORTER_TEXT_TH).units;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        prefetch={false}
        href={localePath("/units", locale)}
        className="text-primary-700 inline-flex min-h-12 items-center self-start font-semibold underline-offset-4 hover:underline"
      >
        {t.backToUnits}
      </Link>
      <Suspense fallback={<p className="text-text-secondary text-lg">{t.loading}</p>}>
        <UnitProfile params={params} locale={locale} />
      </Suspense>
    </div>
  );
}

async function UnitProfile({
  params,
  locale,
}: {
  params: Promise<{ id: string }>;
  locale: Locale;
}) {
  const t = (locale === "en" ? REPORTER_TEXT_EN : REPORTER_TEXT_TH).units;
  const numLocale = locale === "en" ? "en-US" : "th-TH";
  const { id } = await params;
  const rawUnit = await getPublicUnitProfile(id);
  if (!rawUnit) notFound();

  const unit =
    locale === "en"
      ? localizePublicUnit(
          rawUnit,
          "en",
          buildAreaNameLookup(...(await Promise.all([listProvinces(), listAllDistricts()]))),
        )
      : rawUnit;

  const header = (
    <header className="flex flex-col gap-3">
      <LanguageSwitch
        locale={locale}
        path={`/units/${unit.id}`}
        label={t.languageSwitchLabel}
        className="self-start"
      />
      <h1
        className="font-heading text-text-primary text-2xl font-bold break-words sm:text-3xl"
        data-testid="unit-label"
      >
        {unit.label}
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <UnitStatusBadges unit={unit} locale={locale} />
      </div>
      <UnitCapabilityList unit={unit} locale={locale} />
      <UnitHotline unit={unit} locale={locale} />
    </header>
  );

  // หน่วยจริงจาก OSM ที่ยังไม่ได้ใช้ระบบ: ไม่มีตัวเลขและกราฟ
  if (unit.notInService) {
    return (
      <>
        {header}
        <p className="bg-bg-surface rounded-[14px] border p-5 text-lg">
          {t.notInServiceNotice}
          {unit.hotline ? t.notInServiceHotlineHint : ""}
        </p>
        <OsmCredit locale={locale} />
      </>
    );
  }

  const bars = await getPublicDailyHelped(unit.id, locale);
  // ช่วยสำเร็จนับเฉพาะผู้แจ้งยืนยัน (เหมือน /unit/dashboard) — เคสที่หัวหน้าปิดบอกแยกใต้ตัวเลข
  const tiles = [
    { key: "active", label: t.statActive, value: unit.activeCount, unit: t.casesUnit },
    {
      key: "helped-30d",
      label: t.statHelped30d,
      value: unit.helped30d,
      unit: t.casesUnit,
      note:
        unit.leadClosed30d > 0
          ? format(t.excludingLeadClosed, { count: unit.leadClosed30d.toLocaleString(numLocale) })
          : null,
    },
    {
      key: "helped-all",
      label: t.statHelpedAll,
      value: unit.helpedTotal,
      unit: t.casesUnit,
      note:
        unit.leadClosedTotal > 0
          ? format(t.excludingLeadClosed, { count: unit.leadClosedTotal.toLocaleString(numLocale) })
          : null,
    },
    { key: "people", label: t.statPeople, value: unit.peopleHelped, unit: t.peopleUnit },
  ];

  return (
    <>
      {header}
      <p className="text-text-secondary">{t.antiGamingNote}</p>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t.summaryAriaLabel}>
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="bg-bg-surface flex flex-col gap-1 rounded-[14px] border p-4"
          >
            <dt className="text-text-secondary text-sm">{tile.label}</dt>
            <dd className="font-mono text-3xl font-bold" data-testid={`stat-${tile.key}`}>
              {tile.value.toLocaleString(numLocale)}
              <span className="font-heading text-text-secondary ml-1 text-base font-normal">
                {tile.unit}
              </span>
            </dd>
            {tile.note && <dd className="text-text-secondary text-xs">{tile.note}</dd>}
          </div>
        ))}
      </dl>

      <HelpedChart
        title={t.chartTitle30d}
        data={dailyHelpedChartData(bars, locale)}
        locale={locale}
      />
    </>
  );
}
