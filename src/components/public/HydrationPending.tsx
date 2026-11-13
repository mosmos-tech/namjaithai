"use client";

import { useI18n } from "../../lib/i18n/I18nProvider";

/**
 * TF-68: แสดงระหว่างรอ JS ของหน้าโหลดและ hydrate เสร็จ (ปุ่มยังกดไม่ได้)
 * - "กำลังโหลด..." มองเห็นได้และโปรแกรมอ่านหน้าจออ่านได้ (role="status")
 * - เกิน 5 วินาที (CSS ล้วน ไม่ต้องรอ JS) ขึ้นทางเลือกโทร/SMS ที่เป็นลิงก์ธรรมดา กดได้แม้ JS ยังไม่มา
 * ไม่มี state จึงอยู่ใน HTML ตั้งแต่แรก — ภาษามาจาก I18nProvider ที่ render ฝั่งเซิร์ฟเวอร์ด้วย (TF-63)
 */
export function HydrationPending({ emergencyHelp = false }: { emergencyHelp?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="status" className="flex flex-col gap-4" data-testid="hydration-pending">
      <p className="text-text-secondary text-lg">{t.common.loading}</p>
      {emergencyHelp && (
        <div
          className="reveal-after-5s flex flex-col gap-3 rounded-[12px] border border-red-200 bg-red-50 p-4"
          data-testid="slow-load-help"
        >
          <p className="font-heading text-lg font-semibold text-red-800">{t.common.slowLoadHelp}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="tel:1669"
              className="inline-flex min-h-14 flex-1 items-center justify-center rounded-full bg-red-700 px-6 text-lg font-semibold text-white"
            >
              {t.common.call1669}
            </a>
            <a
              href={`sms:?body=${encodeURIComponent(t.common.smsBody)}`}
              className="inline-flex min-h-14 flex-1 items-center justify-center rounded-full border-2 border-red-700 bg-white px-6 text-lg font-semibold text-red-700"
            >
              {t.common.sendSms}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
