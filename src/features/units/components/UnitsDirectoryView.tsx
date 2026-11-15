import Link from "next/link";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/public/LanguageSwitch";
import { listAllDistricts, listDistricts, listProvinces } from "@/features/geo/queries";
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
  buildAreaNameLookup,
  filterUnits,
  groupUnitsByProvince,
  localizePublicUnit,
  organizationsOf,
  parseUnitDirectoryParams,
} from "@/lib/domain";
import { format, localePath, type Locale } from "@/lib/i18n/locale";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

const PAGE_SIZE = 30;

export function UnitsDirectoryView({
  searchParams,
  locale,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  locale: Locale;
}) {
  const t = (locale === "en" ? REPORTER_TEXT_EN : REPORTER_TEXT_TH).units;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Suspense
        fallback={
          <>
            <header>
              <LanguageSwitch
                locale={locale}
                path="/units"
                label={t.languageSwitchLabel}
                className="mb-4"
              />
              <h1 className="font-heading text-text-primary text-3xl font-bold">{t.title}</h1>
              <p className="text-text-secondary mt-2 text-base">{t.subtitle}</p>
            </header>
            <p className="text-text-secondary text-lg">{t.loading}</p>
          </>
        }
      >
        <Directory searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function Directory({
  searchParams,
  locale,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  locale: Locale;
}) {
  const t = (locale === "en" ? REPORTER_TEXT_EN : REPORTER_TEXT_TH).units;
  const numLocale = locale === "en" ? "en-US" : "th-TH";
  const params = parseUnitDirectoryParams(await searchParams);
  const [units, provinces, districts, allDistricts] = await Promise.all([
    listPublicUnits(),
    listProvinces(),
    params.provinceCode ? listDistricts(params.provinceCode) : Promise.resolve([]),
    locale === "en" ? listAllDistricts() : Promise.resolve([]),
  ]);
  const lookup = locale === "en" ? buildAreaNameLookup(provinces, allDistricts) : undefined;
  const localizedUnits =
    locale === "en" ? units.map((u) => localizePublicUnit(u, "en", lookup)) : units;
  // URL เก็บรหัสพื้นที่ของ TF-05 ส่วนตาราง units เก็บชื่อภาษาไทย (แปลงเป็นอังกฤษเมื่อ locale="en")
  const province = provinces.find((item) => item.code === params.provinceCode);
  const district = districts.find((item) => item.code === params.districtCode);
  const results = filterUnits(localizedUnits, {
    province: locale === "en" ? province?.nameEn : province?.nameTh,
    district: locale === "en" ? district?.nameEn : district?.nameTh,
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
    return query.size > 0 ? `/units?${query}` : "/units";
  };
  const switchPath = pageHref(page);

  return (
    <>
      <header>
        <LanguageSwitch
          locale={locale}
          path={switchPath}
          label={t.languageSwitchLabel}
          className="mb-4"
        />
        <h1 className="font-heading text-text-primary text-3xl font-bold">{t.title}</h1>
        <p className="text-text-secondary mt-2 text-base">{t.subtitle}</p>
      </header>

      <section className="bg-bg-surface flex flex-col gap-4 rounded-[14px] border p-4 sm:p-5">
        <UnitPicker
          label={t.pickerLabel}
          placeholder={t.pickerPlaceholder}
          navigatePrefix={locale === "en" ? "/en/units/" : "/units/"}
          locale={locale}
          // ตัวเลือกตามตัวกรองปัจจุบัน (เลือกจังหวัดแล้วรายการสั้นลง)
          options={results.map((unit) => ({
            id: unit.id,
            label: unit.label,
            province: unit.province,
            isDemo: unit.isDemo,
            searchText: unit.searchText,
          }))}
        />
        <UnitFilters
          // เปลี่ยน URL (เช่น กดล้างตัวกรอง) แล้วฟอร์มเริ่มใหม่จากค่าใน URL ไม่ค้างค่าเดิม
          key={JSON.stringify(params)}
          params={params}
          provinces={provinces}
          districts={districts}
          organizations={organizationsOf(units)}
          locale={locale}
        />
      </section>

      <p className="text-text-secondary" role="status" data-testid="units-count">
        {format(t.unitsCount, { count: results.length.toLocaleString(numLocale) })}
        {pages > 1 ? format(t.pageStatus, { page, pages }) : ""}
      </p>

      {groupUnitsByProvince(shown, locale).map((group) => (
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
                  href={localePath(`/units/${unit.id}`, locale)}
                  className="text-primary-700 font-heading text-lg font-semibold break-words underline-offset-4 hover:underline"
                >
                  {unit.label}
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <UnitStatusBadges unit={unit} locale={locale} />
                  {!unit.notInService && (
                    <span className="text-text-secondary text-sm">
                      {t.helpedTotalInline}{" "}
                      <span className="text-text-primary font-mono font-semibold">
                        {unit.helpedTotal.toLocaleString(numLocale)}
                      </span>{" "}
                      {t.casesUnit}
                    </span>
                  )}
                </div>
                <UnitCapabilityList unit={unit} locale={locale} />
                <UnitHotline unit={unit} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {results.length === 0 && (
        <p className="bg-bg-surface rounded-[14px] border p-6 text-center text-lg">
          {t.emptyResults}
        </p>
      )}

      {pages > 1 && (
        <nav aria-label={t.paginationAriaLabel} className="flex flex-wrap gap-3">
          {page > 1 && (
            <Link
              prefetch={false}
              href={localePath(pageHref(page - 1), locale)}
              className="border-primary-600 text-primary-700 inline-flex min-h-12 items-center rounded-full border-2 bg-white px-6 font-semibold"
            >
              {t.prevPage}
            </Link>
          )}
          {page < pages && (
            <Link
              prefetch={false}
              href={localePath(pageHref(page + 1), locale)}
              className="border-primary-600 text-primary-700 inline-flex min-h-12 items-center rounded-full border-2 bg-white px-6 font-semibold"
            >
              {t.nextPage}
            </Link>
          )}
        </nav>
      )}

      {shown.some((unit) => unit.source === "OSM") && <OsmCredit locale={locale} />}
    </>
  );
}
