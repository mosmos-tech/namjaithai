import { cacheLife } from "next/cache";
import Link from "next/link";

import { Logo } from "./Logo";

/**
 * คำนวณปี พ.ศ. ปัจจุบัน — cache 1 วัน
 * ป้องกัน "unstable value new Date()" ขณะ prerender
 */
async function getBuddhistYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear() + 543;
}

export async function Footer() {
  const yearBE = await getBuddhistYear();

  return (
    <footer className="mt-auto border-t border-border-default bg-bg-nav">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {/* แถวหลัก: logo ซ้าย · disclaimer ขวา */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo size="sm" />

          {/* Disclaimer + ลิงก์ คั่นด้วย · */}
          <p className="text-xs leading-relaxed text-text-secondary sm:text-right">
            ระบบประสานงานอาสา ไม่ใช่หน่วยงานรัฐ
            <span className="mx-2 select-none opacity-50">·</span>
            กรณีฉุกเฉินโทร&nbsp;1669 หรือ&nbsp;1784
            <span className="mx-2 select-none opacity-50">·</span>
            <Link href="/privacy" className="underline underline-offset-2 hover:text-primary-600">
              นโยบายความเป็นส่วนตัว
            </Link>
          </p>
        </div>

        {/* ลิขสิทธิ์ */}
        <p className="mt-4 border-t border-border-default pt-4 text-xs text-text-secondary">
          © พ.ศ. {yearBE} น้ำใจไทย SOS — ข้อมูลทุกอย่างในระบบใช้เพื่อการช่วยเหลือในภาวะฉุกเฉินเท่านั้น
        </p>
      </div>
    </footer>
  );
}
