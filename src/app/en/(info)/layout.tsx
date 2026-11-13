import { HotlineBar } from "@/components/public/HotlineBar";
import { Navbar } from "@/components/public/Navbar";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

// เหมือน (public)/layout.tsx แต่เป็นภาษาอังกฤษ (TF-63) — ไม่อ่าน session หน้าจึงยัง static
export default function EnglishInfoLayout({ children }: { children: React.ReactNode }) {
  const chrome = REPORTER_TEXT_EN.chrome;
  return (
    <>
      <header className="sticky top-0 z-50">
        <HotlineBar text={{ label: chrome.hotlineBarLabel, items: chrome.hotlineBar }} />
        <Navbar text={chrome} homeHref="/en/hotlines" resolveAccount />
      </header>
      <main className="bg-bg-page flex-1">{children}</main>
    </>
  );
}
