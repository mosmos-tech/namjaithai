import type { LocalizedText } from "../domain/incidents/types";

// ── TF-63 ภาษาฝั่งผู้แจ้ง (ไทย / English) ─────────────────────────────────────
// ภาษาอยู่ใน URL: หน้าไทยใช้ path เดิม หน้าอังกฤษขึ้นต้นด้วย /en — หน้าเป็น static ทั้งสองภาษา
// ฝั่งกู้ภัย หัวหน้าหน่วย แอดมิน เป็นภาษาไทยอย่างเดียว (ไม่มี path /en)

export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** cookie จำภาษาที่ผู้แจ้งเลือก (ตั้งเมื่อกดปุ่มสลับ หรือ proxy เลือกให้ครั้งแรก) */
export const LOCALE_COOKIE = "nj_locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return value === "th" || value === "en";
}

/** หน้าฝั่งผู้แจ้งที่มีภาษาอังกฤษ (path ภาษาไทย) */
export function isReporterPath(path: string): boolean {
  return (
    path === "/request" ||
    path === "/sos" ||
    path === "/sos/sent" ||
    path === "/hotlines" ||
    path === "/track" ||
    path.startsWith("/track/")
  );
}

/** path ภาษาไทย → path ของภาษาที่ต้องการ (เฉพาะหน้าฝั่งผู้แจ้ง หน้าอื่นคืนค่าเดิม) */
export function localePath(path: string, locale: Locale): string {
  const plain = stripLocale(path).path;
  if (locale === "th" || !isReporterPath(plain.split("?")[0])) return plain;
  return `/en${plain}`;
}

/** แยกภาษาออกจาก path: /en/track/X → { locale: "en", path: "/track/X" } */
export function stripLocale(path: string): { locale: Locale; path: string } {
  if (path === "/en") return { locale: "en", path: "/" };
  if (path.startsWith("/en/")) return { locale: "en", path: path.slice(3) };
  return { locale: "th", path };
}

/**
 * ภาษาแรกตาม Accept-Language ของเบราว์เซอร์: th → ไทย, ภาษาอื่น → English
 * อ่านไม่ได้/ว่าง → ไทย (ห้ามทำให้หน้า SOS ภาษาไทยเปิดไม่ได้)
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  try {
    if (!header) return "th";
    const first = header
      .split(",")
      .map((part) => {
        const [tag, ...params] = part.trim().split(";");
        const q = params.find((p) => p.trim().startsWith("q="));
        return { tag: tag.trim().toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
      })
      .filter((item) => item.tag && item.tag !== "*" && Number.isFinite(item.q) && item.q > 0)
      .sort((a, b) => b.q - a.q)[0];
    if (!first) return "th";
    return first.tag === "th" || first.tag.startsWith("th-") ? "th" : "en";
  } catch {
    return "th";
  }
}

/** ข้อความจากทะเบียนเหตุตามภาษา */
export function pickText(text: LocalizedText, locale: Locale): string {
  return locale === "en" ? text.en : text.th;
}

/** แทนค่า {ชื่อ} ในข้อความ: format("Step {n}", { n: 2 }) */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
