import { HotlineBar } from "@/components/public/HotlineBar";
import { Navbar } from "@/components/public/Navbar";

// ฟอร์ม SOS (Figma B1 / MB1): จอคอมมีแถบสายด่วน + navbar ไม่มี footer
// มือถือไม่มีทั้งคู่ ฟอร์มมีแถบบนของตัวเอง (ย้อนกลับ + ปุ่มโทร 1669) จะได้มีที่ให้กรอกมากขึ้น
export default function SosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50 hidden lg:block">
        <HotlineBar />
        <Navbar />
      </header>
      <main className="bg-bg-page flex-1">{children}</main>
    </>
  );
}
