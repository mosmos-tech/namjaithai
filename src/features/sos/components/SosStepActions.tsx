"use client";

/**
 * ปุ่มท้ายแต่ละขั้นของฟอร์ม SOS ตาม Figma
 * - มือถือ (MB1): แถบขาวติดล่างจอ ปุ่มเต็มความกว้าง
 * - จอคอม (B1): เส้นคั่น แล้วปุ่มชิดขวา (มีปุ่มย้อนกลับชิดซ้ายถ้าไม่ใช่ขั้นแรก)
 */
export function SosStepActions({
  onNext,
  onPrev,
  mobileLabel,
  desktopLabel,
}: {
  onNext: () => void;
  onPrev?: () => void;
  mobileLabel: string;
  desktopLabel: string;
}) {
  return (
    <div className="border-border-default bg-bg-surface sticky bottom-0 z-10 -mx-6 -mb-10 border-t px-6 pt-4 pb-7 lg:static lg:mx-0 lg:mb-0 lg:flex lg:flex-col lg:gap-[14px] lg:border-t-0 lg:bg-transparent lg:p-0 lg:pt-2">
      <div className="bg-border-default hidden h-px lg:block" />
      <div className="flex gap-4 lg:items-center lg:pt-4">
        {onPrev && (
          <button
            type="button"
            onClick={onPrev}
            className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle hidden rounded-full border-[1.5px] px-8 py-[18px] text-[19px] leading-[1.2] font-semibold lg:block"
          >
            ย้อนกลับ
          </button>
        )}
        <span className="hidden flex-1 lg:block" />
        <button
          type="button"
          onClick={onNext}
          className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 w-full rounded-full px-8 py-[18px] text-[19px] leading-[1.2] font-semibold transition-colors lg:w-auto"
        >
          <span className="lg:hidden">{mobileLabel}</span>
          <span className="hidden lg:inline">{desktopLabel}</span>
        </button>
      </div>
    </div>
  );
}
