import { LanguageSwitch } from "@/components/public/LanguageSwitch";
import { SurvivalChecklist } from "@/components/public/SurvivalChecklist";
import type { Locale } from "@/lib/i18n/locale";
import type { ReporterText } from "@/lib/i18n/reporter-text";

const PHASE_STYLES: Record<
  string,
  { color: string; headingColor: string; markerColor: string }
> = {
  before: {
    color: "border-primary-100 bg-primary-50",
    headingColor: "text-primary-700",
    markerColor: "bg-primary-700",
  },
  during: {
    color: "border-amber-500/30 bg-amber-50",
    headingColor: "text-amber-700",
    markerColor: "bg-amber-700",
  },
  after: {
    color: "border-green-700/20 bg-green-50",
    headingColor: "text-green-700",
    markerColor: "bg-green-700",
  },
};

export function SurvivalView({
  t,
  locale,
}: {
  t: ReporterText["survival"];
  locale: Locale;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <LanguageSwitch
          locale={locale}
          path="/survival"
          label={t.languageSwitchLabel}
          className="mb-4"
        />
        <h1 className="font-heading text-text-primary text-3xl font-bold">{t.title}</h1>
        <p className="text-text-secondary mt-2 text-base">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Guides — ซ้าย (accordion ด้วย <details> native) */}
        <div className="flex flex-col gap-3">
          {t.phases.map(({ key, phase, tips }) => {
            const style = PHASE_STYLES[key] ?? PHASE_STYLES.before;
            return (
              <details key={key} className={`group rounded-[14px] border ${style.color}`}>
                <summary className="flex cursor-pointer list-none items-center justify-between p-5 [&::-webkit-details-marker]:hidden">
                  <h2 className={`font-heading text-lg font-bold ${style.headingColor}`}>
                    {phase}
                  </h2>
                  {/* chevron หมุน 180° เมื่อ open */}
                  <svg
                    className={`h-5 w-5 shrink-0 opacity-60 transition-transform duration-200 group-open:rotate-180 ${style.headingColor}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 7.5L10 12.5L15 7.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>

                <ol className="flex flex-col gap-3 px-5 pb-5">
                  {tips.map((tip, i) => (
                    <li key={tip} className="flex items-start gap-3">
                      {/* เลขข้อ */}
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${style.markerColor}`}
                      >
                        {i + 1}
                      </span>
                      {/* ข้อความ — text-wrap:pretty ให้ browser เลือกจุดตัดที่สวยกว่า */}
                      <span className="text-text-primary text-sm leading-relaxed [text-wrap:pretty]">
                        {tip}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
        </div>

        {/* Checklist — ขวา sticky บนจอใหญ่ */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SurvivalChecklist t={t.checklist} />
        </div>
      </div>
    </div>
  );
}
