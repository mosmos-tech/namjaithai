"use client";

import {
  SOS_STEPS,
  formatStepProgressText,
  type SosStepNumber,
} from "../draft-storage";

interface SosProgressBarProps {
  currentStep: SosStepNumber;
  onSelectStep?: (step: SosStepNumber) => void;
}

/**
 * แถบความคืบหน้า 5 ช่องของฟอร์มแจ้งขอความช่วยเหลือ SOS
 * แสดงข้อความ "ขั้นที่ X จาก 5" พร้อมชื่อขั้นปัจจุบันและแถบสถานะ 5 ช่อง
 */
export function SosProgressBar({ currentStep, onSelectStep }: SosProgressBarProps) {
  const activeStepDef = SOS_STEPS[currentStep - 1];

  return (
    <section
      aria-label="ความคืบหน้าการกรอกฟอร์มขอความช่วยเหลือ"
      className="rounded-[14px] border border-border-default bg-bg-surface p-4 sm:p-5"
    >
      {/* แถวบน: ป้าย "ขั้นที่ X จาก 5" + ชื่อขั้นปัจจุบัน */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            data-testid="sos-step-badge"
            className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 font-heading text-base font-bold text-primary-700"
          >
            {formatStepProgressText(currentStep)}
          </span>
          <span className="font-heading text-base font-semibold text-text-primary sm:text-lg">
            {activeStepDef.title}
          </span>
        </div>

        <span className="font-mono text-base font-semibold text-text-secondary">
          {currentStep}/5
        </span>
      </div>

      {/* แถบความคืบหน้า 5 ช่อง */}
      <div
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={SOS_STEPS.length}
        aria-label={formatStepProgressText(currentStep)}
        className="mt-3.5 grid grid-cols-5 gap-2"
      >
        {SOS_STEPS.map((item) => {
          const isCompleted = item.step < currentStep;
          const isCurrent = item.step === currentStep;
          const canJumpBack = isCompleted && Boolean(onSelectStep);

          return (
            <div key={item.step} className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={!canJumpBack}
                onClick={() => canJumpBack && onSelectStep?.(item.step)}
                aria-label={`ขั้นที่ ${item.step}: ${item.shortLabel}`}
                aria-current={isCurrent ? "step" : undefined}
                className={`h-2.5 w-full rounded-full transition-colors ${
                  isCurrent
                    ? "bg-primary-600"
                    : isCompleted
                      ? "cursor-pointer bg-primary-500 hover:bg-primary-600"
                      : "bg-border-default"
                }`}
              />
              <span
                className={`truncate text-center text-xs font-medium sm:text-sm ${
                  isCurrent
                    ? "font-heading font-bold text-primary-700"
                    : isCompleted
                      ? "text-text-primary"
                      : "text-text-secondary"
                }`}
              >
                {item.step}. {item.shortLabel}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
