import { stripLocale, type Locale } from "@/lib/i18n/locale";

/**
 * ปุ่มสลับ ไทย / EN ของหน้าฝั่งผู้แจ้ง (TF-63)
 * เป็นลิงก์ธรรมดา (กดได้ก่อน JS โหลด) ผ่าน /api/lang ซึ่งจำภาษาใน cookie แล้วพาไปหน้าเดียวกันอีกภาษา
 * path = path ปัจจุบัน (รวม ?query) จะเป็นภาษาไหนก็ได้
 * compactOnMobile: จอเล็กซ่อนภาษาปัจจุบัน เหลือแค่ปุ่มอีกภาษา (Navbar หน้าแรกที่ที่แคบ)
 */
export function LanguageSwitch({
  locale,
  path,
  label,
  className = "",
  compactOnMobile = false,
}: {
  locale: Locale;
  path: string;
  /** ข้อความอ่านออกเสียง เช่น "เปลี่ยนภาษา" / "Change language" */
  label: string;
  className?: string;
  compactOnMobile?: boolean;
}) {
  const plain = stripLocale(path).path;
  const href = (to: Locale) => `/api/lang?locale=${to}&next=${encodeURIComponent(plain)}`;
  const item = (to: Locale, text: string) =>
    to === locale ? (
      <span
        aria-current="true"
        className={`bg-primary-600 text-text-on-primary rounded-full px-3 py-1.5 font-semibold ${compactOnMobile ? "hidden sm:inline" : ""}`}
      >
        {text}
      </span>
    ) : (
      <a
        href={href(to)}
        hrefLang={to}
        lang={to}
        className="text-primary-700 hover:bg-primary-50 rounded-full px-3 py-1.5 font-semibold"
      >
        {text}
      </a>
    );
  return (
    <nav
      aria-label={label}
      data-testid="language-switch"
      className={`border-border-default bg-bg-surface inline-flex min-h-12 items-center gap-1 rounded-full border p-1 text-sm ${className}`}
    >
      {item("th", "ไทย")}
      {item("en", "EN")}
    </nav>
  );
}
