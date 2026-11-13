"use client";

import { LanguageSwitch } from "@/components/public/LanguageSwitch";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TrackLookupForm } from "./TrackLookupForm";

/** หน้า /track และ /en/track: กรอกรหัสเคส + เบอร์ 4 ตัวท้าย (TF-13, TF-63) */
export function TrackLookupPage() {
  const { t, locale } = useI18n();
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <LanguageSwitch
        locale={locale}
        path="/track"
        label={t.common.languageSwitchLabel}
        className="mb-4"
      />
      <h1 className="font-heading text-text-primary text-3xl font-bold">{t.track.title}</h1>
      <p className="text-text-secondary mt-2 text-lg">{t.track.lookupPageHint}</p>
      <TrackLookupForm />
    </div>
  );
}
