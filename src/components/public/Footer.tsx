import { cacheLife } from "next/cache";
import Link from "next/link";

import { Logo } from "./Logo";

const LINKS = [
  { label: "แจ้งขอความช่วยเหลือ", href: "/request" },
  { label: "ติดตามเคส", href: "/track" },
  { label: "เบอร์สายด่วน", href: "/hotlines" },
  { label: "คู่มือเอาตัวรอด", href: "/survival" },
];

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
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <Logo size="sm" />

          {/* Links */}
          <nav aria-label="ลิงก์ด่วน">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {LINKS.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-text-secondary transition-colors hover:text-primary-600"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-6 border-t border-border-default pt-4 text-xs text-text-secondary">
          © พ.ศ. {yearBE} น้ำใจไทย SOS — ข้อมูลทุกอย่างในระบบใช้เพื่อการช่วยเหลือในภาวะฉุกเฉินเท่านั้น
        </div>
      </div>
    </footer>
  );
}
