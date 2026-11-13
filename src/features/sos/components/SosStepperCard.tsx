"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import { SOS_STEPS, type SosStepNumber } from "../draft-storage";
import { useI18n } from "../../../lib/i18n/I18nProvider";

// คำอธิบายใต้ชื่อแต่ละขั้นในการ์ดด้านซ้าย (Figma B1 · Stepper) อยู่ใน t.wizard.stepHints (TF-63)

/**
 * การ์ดรายการ 5 ขั้นด้านซ้ายของฟอร์ม SOS (เฉพาะจอคอม ตาม Figma B1)
 * กดชื่อขั้นเพื่อย้อนไปแก้ได้ (การตรวจข้อมูลก่อนข้ามขั้นอยู่ที่ onSelectStep ของ SosWizard)
 */
export function SosStepperCard({
  currentStep,
  onSelectStep,
  disabled = false,
}: {
  currentStep: SosStepNumber;
  onSelectStep: (step: SosStepNumber) => void;
  /** TF-68: ยัง hydrate ไม่เสร็จ — กดแล้วจะไม่มีอะไรเกิดขึ้น จึงปิดไว้ก่อน */
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <aside className="border-border-default bg-bg-surface hidden w-[340px] shrink-0 flex-col gap-2 rounded-[28px] border px-7 py-8 lg:flex">
      <h1 className="font-heading text-text-primary text-[22px] leading-[1.3] font-semibold tracking-[-0.11px]">
        {t.wizard.title}
      </h1>
      <p className="text-text-secondary text-lg leading-[1.65]">
        {t.wizard.takesAboutAMinute}
        <br />
        {t.wizard.noSignUp}
      </p>

      <ol className="flex flex-col gap-1 pt-5">
        {SOS_STEPS.map(({ step }) => {
          const shortLabel = t.sos.steps[step - 1].shortLabel;
          const current = step === currentStep;
          const completed = step < currentStep;
          return (
            <li key={step}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectStep(step)}
                aria-current={current ? "step" : undefined}
                className={`flex w-full items-center gap-4 rounded-[18px] p-[14px] text-left transition-colors ${
                  current ? "bg-primary-50" : "hover:bg-bg-page"
                }`}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full text-lg leading-[1.55] font-semibold ${
                    current
                      ? "bg-primary-600 text-text-on-primary"
                      : completed
                        ? "bg-green-50 text-green-700"
                        : "bg-bg-page text-text-secondary"
                  }`}
                >
                  {completed ? (
                    <img
                      src="/brand/icon-check-green.svg"
                      alt=""
                      width={18}
                      height={18}
                      className="size-[18px] shrink-0"
                    />
                  ) : (
                    step
                  )}
                </span>
                <span className="flex min-w-0 flex-col leading-[1.55]">
                  <span
                    className={`text-lg font-semibold ${current ? "text-text-primary" : "text-text-secondary"}`}
                  >
                    {shortLabel}
                  </span>
                  <span className="text-text-secondary text-base">
                    {t.wizard.stepHints[step - 1]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="flex items-center gap-2.5 pt-4 text-base leading-[1.55] text-green-700">
        <img src="/brand/icon-check-green.svg" alt="" className="size-[18px] shrink-0" />
        {t.wizard.autosaved}
      </p>
    </aside>
  );
}
