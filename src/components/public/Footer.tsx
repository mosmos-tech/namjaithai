import { cacheLife } from "next/cache";

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
    <footer className="border-border-default bg-bg-nav mt-auto border-t">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {/* แถวหลัก: logo ซ้าย · disclaimer ขวา */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo size="sm" />

          {/* Disclaimer + ลิงก์ คั่นด้วย · */}
          <p className="text-text-secondary text-xs leading-relaxed sm:text-right">
            ระบบประสานงานอาสา ไม่ใช่หน่วยงานรัฐ
            <span className="mx-2 opacity-50 select-none">·</span>
            กรณีฉุกเฉินโทร&nbsp;1669 หรือ&nbsp;1784
            <span className="mx-2 opacity-50 select-none">·</span>
            <a href="/privacy" className="hover:text-primary-600 underline underline-offset-2">
              นโยบายความเป็นส่วนตัว
            </a>
          </p>
        </div>

        {/* ลิขสิทธิ์ */}
        <p className="border-border-default text-text-secondary mt-4 border-t pt-4 text-xs">
          © พ.ศ. {yearBE} น้ำใจไทย SOS —
          ข้อมูลทุกอย่างในระบบใช้เพื่อการช่วยเหลือในภาวะฉุกเฉินเท่านั้น
        </p>
      </div>
    </footer>
  );
}
