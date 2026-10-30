import { Navbar } from "@/components/public/Navbar";

// หน้าเข้าใช้งาน (Figma D1 / MC4): มือถือมีแค่ navbar ไม่มีแถบสายด่วนและ footer
// จอคอมเป็นหน้าแบ่งสองฝั่งเต็มจอ ไม่มี navbar
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="lg:hidden">
        <Navbar />
      </header>
      <main className="bg-bg-surface lg:bg-bg-page flex flex-1 flex-col">{children}</main>
    </>
  );
}
