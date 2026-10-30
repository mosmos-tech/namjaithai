import type { Metadata } from "next";
import Link from "next/link";
import { LineLogo } from "@/components/public/LineLogo";

export const metadata: Metadata = {
  title: "เข้าใช้งาน — น้ำใจไทย SOS",
};

/**
 * หน้าเข้าใช้งานชั่วคราว: ปุ่ม "เข้าสู่ระบบ" ใน navbar ลิงก์มาที่นี่ จะได้ไม่เจอ 404
 * มีแค่ 2 ทางตามกติกาโปรเจกต์ — LINE Login จริงจะมาใน TF-17 (เขียนทับหน้านี้ได้เลย)
 */
export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div>
        <h1 className="font-heading text-text-primary text-3xl font-bold">เข้าใช้งาน</h1>
        <p className="text-text-secondary mt-2 text-lg">
          ต้องการความช่วยเหลือ กดปุ่มแดงได้เลย ไม่ต้องเข้าสู่ระบบ
        </p>
      </div>

      <Link
        href="/request"
        className="font-heading text-text-on-primary flex min-h-16 items-center justify-center rounded-full bg-red-600 px-6 text-xl font-bold shadow-sm hover:bg-red-600/90"
      >
        ขอความช่วยเหลือทันที
      </Link>

      <div className="text-text-secondary flex items-center gap-3 text-base">
        <span className="bg-border-default h-px flex-1" />
        สำหรับทีมกู้ภัยและผู้ใช้ที่มีบัญชี
        <span className="bg-border-default h-px flex-1" />
      </div>

      <div>
        <button
          type="button"
          disabled
          aria-describedby="line-login-soon"
          className="bg-line-green font-heading flex min-h-14 w-full items-center justify-center gap-3 rounded-full px-6 text-[19px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LineLogo className="size-7" />
          เข้าสู่ระบบด้วย LINE
        </button>
        <p id="line-login-soon" className="text-text-secondary mt-2 text-center text-base">
          เปิดให้ใช้งานเร็วๆ นี้
        </p>
      </div>

      <Link
        href="/track"
        className="font-heading text-primary-700 hover:bg-primary-50 mx-auto inline-flex min-h-12 items-center rounded-full px-5 text-lg font-semibold"
      >
        ติดตามเคสด้วยรหัสเคส
      </Link>
    </div>
  );
}
