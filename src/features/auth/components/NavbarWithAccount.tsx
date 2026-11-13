import { Navbar } from "@/components/public/Navbar";

// ใช้ Navbar ตัวเดียวระหว่างอ่านบัญชี เพื่อไม่ให้เมนูที่กำลังเปิดถูกแทนที่
export function NavbarWithAccount() {
  return <Navbar resolveAccount />;
}
