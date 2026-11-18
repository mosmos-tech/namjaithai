import { unitCapabilityLabels, type PublicUnit } from "@/lib/domain";
import { format } from "@/lib/i18n/locale";
import { REPORTER_TEXT_TH } from "@/lib/i18n/reporter-text";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

const unitText = (locale: "th" | "en" = "th") =>
  (locale === "en" ? REPORTER_TEXT_EN : REPORTER_TEXT_TH).units;

/** ป้ายสถานะหน่วย: ข้อมูลตัวอย่าง (DEMO) / ยังไม่ได้ใช้ระบบ (OSM ที่ยังไม่เปิดใช้) */
export function UnitStatusBadges({
  unit,
  locale = "th",
}: {
  unit: PublicUnit;
  locale?: "th" | "en";
}) {
  const t = unitText(locale);
  return (
    <>
      {unit.isDemo && (
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
          {t.demoBadge}
        </span>
      )}
      {unit.notInService && (
        <span className="bg-bg-nav text-text-secondary rounded-full px-3 py-1 text-sm font-semibold">
          {t.notInServiceBadge}
        </span>
      )}
    </>
  );
}

export function UnitCapabilityList({
  unit,
  locale = "th",
}: {
  unit: PublicUnit;
  locale?: "th" | "en";
}) {
  if (unit.capabilities.length === 0) return null;
  const t = unitText(locale);
  const labels = unitCapabilityLabels(locale);
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t.capabilitiesAriaLabel}>
      {unit.capabilities.map((capability) => (
        <li
          key={capability}
          className="bg-bg-subtle text-primary-700 rounded-full px-3 py-1 text-sm font-semibold"
        >
          {labels[capability]}
        </li>
      ))}
    </ul>
  );
}

export function UnitHotline({
  unit,
  locale = "th",
}: {
  unit: PublicUnit;
  locale?: "th" | "en";
}) {
  if (!unit.hotline) return null;
  const t = unitText(locale);
  return (
    <a
      href={`tel:${unit.hotline.replace(/[^\d+]/g, "")}`}
      className="border-primary-600 text-primary-700 inline-flex min-h-12 items-center gap-2 self-start rounded-full border-2 bg-white px-5 font-semibold"
    >
      <span aria-hidden="true">☎</span>
      {format(t.callHotline, { hotline: unit.hotline })}
    </a>
  );
}

export function OsmCredit({ locale = "th" }: { locale?: "th" | "en" } = {}) {
  const t = unitText(locale);
  return (
    <p className="text-text-secondary text-sm" data-testid="osm-credit">
      {t.osmCreditBefore}{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        © OpenStreetMap contributors
      </a>
    </p>
  );
}
