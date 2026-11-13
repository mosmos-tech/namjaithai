"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { Locale } from "./locale";
import { REPORTER_TEXT_TH, type ReporterText } from "./reporter-text";

type I18nValue = { locale: Locale; t: ReporterText };

const I18nContext = createContext<I18nValue | null>(null);

// แบนเนอร์ใน root layout (ออฟไลน์ / ยืนยันปิดเคส) อยู่นอก layout ของ /en จึงรับภาษาผ่านตัวแปรกลางนี้แทน context
let published: I18nValue | null = null;
const listeners = new Set<() => void>();
function publish(value: I18nValue | null) {
  published = value;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * TF-63: ภาษาของหน้าฝั่งผู้แจ้ง — layout ของ /en ส่ง dictionary ภาษาอังกฤษมาจากเซิร์ฟเวอร์
 * (เฉพาะภาษาที่ใช้ ไม่โหลดภาษาอื่นมาด้วย) หน้าไทยไม่ต้องมี provider ใช้ภาษาไทยเป็นค่าเริ่มต้น
 */
export function I18nProvider({
  locale,
  text,
  children,
}: {
  locale: Locale;
  text: ReporterText;
  children: React.ReactNode;
}) {
  useEffect(() => {
    publish({ locale, t: text });
    return () => publish(null);
  }, [locale, text]);
  return <I18nContext.Provider value={{ locale, t: text }}>{children}</I18nContext.Provider>;
}

const THAI: I18nValue = { locale: "th", t: REPORTER_TEXT_TH };

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  const fromLayout = useSyncExternalStore(
    subscribe,
    () => published,
    () => null,
  );
  return context ?? fromLayout ?? THAI;
}
