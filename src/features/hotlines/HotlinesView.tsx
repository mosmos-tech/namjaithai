import Link from "next/link";
import { LanguageSwitch } from "@/components/public/LanguageSwitch";
import { format, localePath, type Locale } from "@/lib/i18n/locale";
import type { ReporterText } from "@/lib/i18n/reporter-text";

/**
 * หน้าเบอร์สายด่วน (ไทย /hotlines และอังกฤษ /en/hotlines — TF-63)
 * Server Component: ข้อความมาจาก dictionary ของภาษาหน้านั้น ลิงก์ tel: กดได้โดยไม่ต้องรอ JS
 */
export function HotlinesView({ t, locale }: { t: ReporterText["hotlines"]; locale: Locale }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <LanguageSwitch
          locale={locale}
          path="/hotlines"
          label={t.languageSwitchLabel}
          className="mb-4"
        />
        <h1 className="font-heading text-text-primary text-3xl font-bold">{t.title}</h1>
        <p className="text-text-secondary mt-2 text-base">{t.subtitle}</p>
        {locale === "en" && (
          <Link
            href={localePath("/request", locale)}
            className="font-heading mt-4 inline-flex min-h-12 items-center rounded-full bg-red-600 px-6 text-base font-semibold text-white"
          >
            {t.requestHelp}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {t.items.map(({ number, name, shortName, description, urgent }) => (
          <div
            key={number}
            data-testid={`hotline-${number}`}
            className={`flex flex-col rounded-[14px] border p-5 ${
              urgent ? "border-red-600/20 bg-red-50" : "border-border-default bg-bg-surface"
            }`}
          >
            {/* Header: badge + ชื่อ + ตัวเลขเบอร์ */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`font-heading inline-block rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${
                    urgent ? "bg-red-600" : "bg-primary-700"
                  }`}
                >
                  {shortName}
                </span>
                <p className="font-heading text-text-primary mt-1.5 text-sm font-semibold">
                  {name}
                </p>
              </div>
              {/* ตัวเลขใช้ IBM Plex Mono — อ่านง่าย ไม่มีแอมบิกิวตี้ */}
              <span
                className={`font-mono text-3xl font-bold tabular-nums ${
                  urgent ? "text-red-600" : "text-primary-700"
                }`}
              >
                {number}
              </span>
            </div>

            {/* คำอธิบาย — flex-1 ดันปุ่มลงล่างให้เท่ากันทุกการ์ด */}
            <p className="text-text-secondary mt-3 flex-1 text-sm leading-relaxed">{description}</p>

            {/* ปุ่มโทร */}
            <a
              href={`tel:${number}`}
              className={`font-heading mt-4 flex h-12 items-center justify-center rounded-full text-base font-semibold text-white transition-colors ${
                urgent
                  ? "bg-red-600 hover:bg-red-600/90 active:bg-red-600/90"
                  : "bg-primary-600 hover:bg-primary-700 active:bg-primary-700"
              }`}
            >
              {format(t.callNumber, { number })}
            </a>
          </div>
        ))}
      </div>

      {/* กล่องศูนย์ประสานงานจังหวัด */}
      <div className="border-primary-100 bg-primary-50 mt-8 rounded-[14px] border p-5 sm:p-6">
        <h2 className="font-heading text-primary-700 text-lg font-bold">{t.provinceTitle}</h2>
        <p className="text-text-secondary mt-2 text-sm leading-relaxed">
          {t.provinceBefore} <strong className="text-text-primary">{t.provinceStrong}</strong>{" "}
          {t.provinceAfter}{" "}
          <a
            href="https://www.disaster.go.th"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700 font-semibold underline underline-offset-2"
          >
            disaster.go.th
          </a>
        </p>
      </div>
    </div>
  );
}
