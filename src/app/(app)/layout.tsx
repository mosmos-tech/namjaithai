import { HotlineBar } from "@/components/public/HotlineBar";
import { NavbarWithAccount } from "@/features/auth/components/NavbarWithAccount";

// หน้าที่ต้องล็อกอิน (เคสของฉัน, แผนที่กู้ภัย, หน่วยของฉัน, ห้องสั่งการ) ใช้ header เดียวกับหน้าสาธารณะไปก่อน
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50">
        <HotlineBar />
        <NavbarWithAccount />
      </header>
      <main className="bg-bg-page flex-1">{children}</main>
    </>
  );
}
