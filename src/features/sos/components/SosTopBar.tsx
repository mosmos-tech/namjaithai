"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import Link from "next/link";

/**
 * แถบบนของฟอร์ม SOS บนมือถือ (Figma MB1 · Top bar) ใช้แทน navbar ของเว็บ
 * ปุ่มย้อนกลับ: ขั้นแรกกลับหน้าแรก ขั้นอื่นย้อนไปขั้นก่อนหน้า · ปุ่มแดงโทร 1669 ได้ทันที
 */
export function SosTopBar({ onBack }: { onBack?: () => void }) {
  const backClass = "flex shrink-0 rounded-full bg-bg-subtle p-2.5 hover:bg-primary-100";
  const backIcon = <img src="/brand/icon-arrow-left.svg" alt="" className="size-6" />;

  return (
    <div className="border-border-default bg-bg-surface flex items-center gap-3 border-b py-3.5 pr-6 pl-4 lg:hidden">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className={backClass}>
          {backIcon}
        </button>
      ) : (
        <Link href="/" aria-label="กลับหน้าแรก" className={backClass}>
          {backIcon}
        </Link>
      )}
      <h1 className="text-text-primary min-w-0 flex-1 text-lg leading-[1.55] font-semibold">
        แจ้งขอความช่วยเหลือ
      </h1>
      <a
        href="tel:1669"
        aria-label="โทรสายด่วนกู้ชีพ 1669"
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 py-2 pr-3.5 pl-3"
      >
        <img src="/brand/icon-phone-red.svg" alt="" className="size-[18px]" />
        <span className="font-mono text-[17px] leading-[1.3] font-semibold text-red-600">1669</span>
      </a>
    </div>
  );
}
