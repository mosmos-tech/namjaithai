import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/features/auth/server/app-user";

// ให้หน้า static อ่านเฉพาะบทบาทหลังโหลด โดยไม่เปิดเผยข้อมูลผู้ใช้หรือ cache ข้าม session
export async function GET() {
  const user = await getCurrentAppUser();
  return NextResponse.json(
    { role: user?.status === "ACTIVE" ? user.role : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
