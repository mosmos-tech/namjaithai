import { Suspense } from "react";
import { Navbar } from "@/components/public/Navbar";
import { homePathForRole } from "@/lib/domain";
import { getCurrentAppUser } from "../server/app-user";

/**
 * Navbar ที่รู้ว่าใครล็อกอินอยู่: ล็อกอินแล้วปุ่มขวาบนเป็น "หน้าของฉัน" (ไปหน้าตามบทบาท)
 * หน้าเว็บส่วนใหญ่ prerender ได้ (Cache Components) จึงโชว์ปุ่ม "เข้าสู่ระบบ" ไปก่อน
 * แล้วค่อยสลับเมื่ออ่าน cookie ล็อกอินเสร็จ ไม่ทำให้ทั้งหน้าต้องรอ
 */
export function NavbarWithAccount() {
  return (
    <Suspense fallback={<Navbar />}>
      <NavbarForCurrentUser />
    </Suspense>
  );
}

async function NavbarForCurrentUser() {
  const user = await getCurrentAppUser();
  const signedIn = user && user.status === "ACTIVE";
  return <Navbar account={signedIn ? { href: homePathForRole(user.role) } : null} />;
}
