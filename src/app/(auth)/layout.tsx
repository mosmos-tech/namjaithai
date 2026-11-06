import { NavbarWithAccount } from "@/features/auth/components/NavbarWithAccount";

// หน้าเข้าใช้งาน (Figma D1 / MC4): มือถือมี navbar โดยไม่มีแถบสายด่วน
// จอคอมเป็นหน้าแบ่งสองฝั่งเต็มจอ ไม่มี navbar
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="lg:hidden">
        <NavbarWithAccount />
      </header>
      <main className="bg-bg-surface lg:bg-bg-page flex flex-1 flex-col">{children}</main>
    </>
  );
}
