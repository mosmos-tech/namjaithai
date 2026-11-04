import { envBannerFor, type EnvBannerTone } from "../lib/env-banner";

const TONE_CLASS: Record<EnvBannerTone, string> = {
  // ฟ้าอ่อน ให้ต่างจากแถบโทรสายด่วนที่เป็นฟ้าเข้ม
  dev: "bg-primary-100 text-primary-700",
  uat: "bg-amber-500 text-text-primary",
};

/**
 * แถบบอกว่ากำลังดูเว็บ dev/uat (TF-64) วางบนสุดของทุกหน้าใน root layout
 * เป็นแถบธรรมดา (ไม่ fixed/sticky) เลื่อนหน้าแล้วหายไป แถบโทรสายด่วนที่ติดบนสุด (sticky top-0) จึงไม่โดนบัง
 * production และในเครื่องไม่แสดง
 */
export function EnvBanner({ appEnv = process.env.NEXT_PUBLIC_APP_ENV }: { appEnv?: string }) {
  const banner = envBannerFor(appEnv);
  if (!banner) return null;

  return (
    <div
      data-testid="env-banner"
      aria-label={`สภาพแวดล้อม: ${banner.label}`}
      className={`font-heading px-4 py-1 text-center text-sm font-semibold ${TONE_CLASS[banner.tone]}`}
    >
      {banner.label}
    </div>
  );
}
