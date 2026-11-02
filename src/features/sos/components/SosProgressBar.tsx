"use client";

import { SOS_STEPS, formatStepProgressText, type SosStepNumber } from "../draft-storage";

/**
 * ความคืบหน้าของฟอร์ม SOS ตาม Figma
 * - SosProgressBar: "ขั้นที่ X จาก 5" + แถบ 5 ช่อง (แถบแสดงเฉพาะจอคอม อยู่หัวการ์ดฟอร์ม B1)
 * - SosProgressSegments: แถบ 5 ช่องเต็มความกว้างใต้แถบบนของมือถือ (MB1)
 *   ช่องที่ผ่าน/กำลังทำ สูง 8px สีน้ำเงิน ช่องที่ยังไม่ถึง สูง 4px สีเทา
 */
export function SosProgressBar({ currentStep }: { currentStep: SosStepNumber }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <p
        data-testid="sos-step-badge"
        className="text-primary-700 text-base leading-[1.4] font-medium"
      >
        {formatStepProgressText(currentStep)}
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={SOS_STEPS.length}
        aria-valuenow={currentStep}
        aria-label={formatStepProgressText(currentStep)}
        className="hidden gap-2 lg:flex"
      >
        {SOS_STEPS.map(({ step }) => (
          <span
            key={step}
            className={`h-2 flex-1 rounded-[4px] ${step <= currentStep ? "bg-primary-600" : "bg-border-default"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function SosProgressSegments({ currentStep }: { currentStep: SosStepNumber }) {
  return (
    <div aria-hidden="true" className="bg-bg-surface flex items-end gap-1.5 lg:hidden">
      {SOS_STEPS.map(({ step }) => (
        <span key={step} className="flex h-[10px] flex-1 items-end">
          <span
            className={`w-full rounded-[2px] ${step <= currentStep ? "bg-primary-600 h-2" : "bg-border-default h-1"}`}
          />
        </span>
      ))}
    </div>
  );
}
