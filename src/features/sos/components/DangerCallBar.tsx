"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */

/**
 * แถบโทรทันที (TF-55): ขึ้นค้างบนสุดทุกขั้นเมื่อผู้แจ้งติ๊กสัญญาณอันตราย
 * บอกให้โทร 1669 ก่อน ไม่ต้องรอส่งฟอร์มเสร็จ
 */
export function DangerCallBar() {
  return (
    <div
      role="region"
      aria-label="มีสัญญาณอันตราย โทร 1669 ทันที"
      data-testid="danger-call-bar"
      className="sticky top-0 z-[60] flex flex-wrap items-center gap-3 bg-red-600 px-4 py-3 text-white lg:mb-4 lg:rounded-[14px] lg:px-6"
    >
      <img src="/brand/icon-alert-white.svg" alt="" className="size-6 shrink-0" />
      <p className="min-w-0 flex-1 text-base leading-snug font-semibold sm:text-lg">
        มีสัญญาณอันตราย โทรกู้ชีพก่อน แล้วค่อยกรอกต่อ
      </p>
      <a
        href="tel:1669"
        className="flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-white px-5 font-mono text-lg font-bold text-red-600"
      >
        <img src="/brand/icon-phone-red.svg" alt="" className="size-5" />
        โทร 1669
      </a>
    </div>
  );
}
