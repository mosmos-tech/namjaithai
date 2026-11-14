import { HotlineBar } from "@/components/public/HotlineBar";
import { Navbar } from "@/components/public/Navbar";
import { REPORTER_TEXT_EN } from "@/lib/i18n/reporter-text.en";

// เหมือน (sos)/layout.tsx: จอคอมมีแถบสายด่วน + navbar มือถือใช้แถบบนของฟอร์มเอง (TF-63 ภาษาอังกฤษ)
export default function EnglishSosLayout({ children }: { children: React.ReactNode }) {
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
