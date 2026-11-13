import { Footer } from "@/components/public/Footer";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

/**
 * TF-63: หน้าฝั่งผู้แจ้งภาษาอังกฤษ (/en/...) — ส่ง dictionary ภาษาอังกฤษให้คอมโพเนนต์จากเซิร์ฟเวอร์
 * หน้ายังเป็น static เหมือนหน้าไทย (ไม่อ่าน cookie) HTML เป็นภาษาอังกฤษตั้งแต่ก่อน JS โหลด
 * footer ภาษาไทยของ root layout ซ่อนด้วย CSS แล้วใช้ footer ภาษาอังกฤษแทน
 */
export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="en" text={REPORTER_TEXT_EN}>
      <style>{"[data-root-footer]{display:none}"}</style>
      <div lang="en" data-locale="en" className="flex flex-1 flex-col">
        {children}
        <Footer text={REPORTER_TEXT_EN.chrome} />
      </div>
    </I18nProvider>
  );
}
