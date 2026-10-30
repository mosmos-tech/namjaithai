"use client";

import { useState, useSyncExternalStore } from "react";
import {
  urgencyLabel,
  waterLevelLabel,
  type Urgency,
  type WaterLevel,
} from "../../../lib/domain";
import {
  SOS_STEPS,
  saveSosDraft,
  validateStep1Draft,
  subscribeSosDraft,
  getSosDraftSnapshot,
  getSosDraftServerSnapshot,
  type SosDraft,
  type SosStepNumber,
  type Step1ValidationErrors,
} from "../draft-storage";
import { SosProgressBar, SosProgressSegments } from "./SosProgressBar";
import { SosStepActions } from "./SosStepActions";
import { SosStepperCard } from "./SosStepperCard";
import { SosTopBar } from "./SosTopBar";
import { Step1UrgencyWater } from "./Step1UrgencyWater";

/**
 * โครงฟอร์มขอความช่วยเหลือ SOS 5 ขั้น:
 * ขั้นที่ 1: ความเร่งด่วนและระดับน้ำ (TF-08)
 * ขั้นที่ 2: ตำแหน่งที่เกิดเหตุ (TF-09)
 * ขั้นที่ 3: จำนวนผู้ติดค้าง (TF-11)
 * ขั้นที่ 4: สิ่งที่ต้องการ (TF-11)
 * ขั้นที่ 5: ข้อมูลติดต่อ (TF-11)
 *
 * บันทึกร่างลง localStorage ทุกครั้งที่ผู้ใช้เลือกหรือเปลี่ยนขั้น
 *
 * หน้าตาตาม Figma: จอคอม (B1) การ์ดรายการขั้นซ้าย + การ์ดฟอร์มขวา,
 * มือถือ (MB1) แถบบนของฟอร์ม + แถบความคืบหน้า + ปุ่มถัดไปติดล่างจอ
 */
export function SosWizard() {
  const draft = useSyncExternalStore(
    subscribeSosDraft,
    getSosDraftSnapshot,
    getSosDraftServerSnapshot,
  );
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step1Errors, setStep1Errors] = useState<Step1ValidationErrors>({
    missingSummary: [],
  });

  function updateDraft(updater: (prev: SosDraft) => SosDraft) {
    const next = updater(draft);
    saveSosDraft(next);
  }

  function handleSelectUrgency(urgency: Urgency) {
    const next = { ...draft, urgency };
    saveSosDraft(next);
    if (step1Attempted) {
      setStep1Errors(validateStep1Draft(next).errors);
    }
  }

  // ระดับน้ำไม่บังคับ: undefined = ผู้ใช้กดยกเลิกตัวที่เลือกไว้
  function handleSelectWaterLevel(waterLevel: WaterLevel | undefined) {
    const next = { ...draft, waterLevel };
    saveSosDraft(next);
    if (step1Attempted) {
      setStep1Errors(validateStep1Draft(next).errors);
    }
  }

  function handleStep1Next() {
    setStep1Attempted(true);
    const check = validateStep1Draft(draft);
    setStep1Errors(check.errors);

    if (!check.valid) {
      return;
    }

    updateDraft((prev) => ({
      ...prev,
      currentStep: 2,
    }));
  }

  function handleGoToStep(targetStep: SosStepNumber) {
    // ถ้าจะข้ามจากขั้นที่ 1 ไปขั้นอื่น ต้องผ่านการตรวจขั้นที่ 1 ก่อน
    if (targetStep > 1) {
      const check = validateStep1Draft(draft);
      if (!check.valid) {
        setStep1Attempted(true);
        setStep1Errors(check.errors);
        return;
      }
    }

    updateDraft((prev) => ({
      ...prev,
      currentStep: targetStep,
    }));
  }

  const currentStepDef = SOS_STEPS[draft.currentStep - 1];

  const goToPrevStep =
    draft.currentStep > 1
      ? () => handleGoToStep((draft.currentStep - 1) as SosStepNumber)
      : undefined;

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1200px] lg:items-start lg:gap-10 lg:px-10 lg:pt-14 lg:pb-24">
      <SosStepperCard currentStep={draft.currentStep} onSelectStep={handleGoToStep} />

      <div className="min-w-0 flex-1">
        <SosTopBar onBack={goToPrevStep} />
        <SosProgressSegments currentStep={draft.currentStep} />

        {/* การ์ดฟอร์ม: มือถือเต็มจอ จอคอมเป็นการ์ดขาวมีขอบ */}
        <div className="flex flex-col gap-6 px-6 pt-7 pb-10 lg:gap-10 lg:rounded-[14px] lg:border lg:border-border-default lg:bg-bg-surface lg:px-14 lg:py-12">
          <SosProgressBar currentStep={draft.currentStep} />

          {draft.currentStep === 1 ? (
            <Step1UrgencyWater
              urgency={draft.urgency}
              waterLevel={draft.waterLevel}
              errors={step1Errors}
              onSelectUrgency={handleSelectUrgency}
              onSelectWaterLevel={handleSelectWaterLevel}
              onNext={handleStep1Next}
            />
          ) : (
            // ขั้น 2–5 ยังไม่ทำ (TF-09, TF-11) แสดงสรุปขั้นที่ 1 และปุ่มไปต่อไว้ก่อน
            <>
              <section aria-labelledby="step-placeholder-heading" className="flex flex-col gap-4">
                <h2
                  id="step-placeholder-heading"
                  className="font-heading text-[30px] leading-[1.25] font-bold tracking-[-0.3px] text-text-primary lg:text-[22px] lg:leading-[1.3] lg:font-semibold"
                >
                  {currentStepDef.title}
                </h2>
                <p className="text-lg leading-[1.65] text-text-secondary">{currentStepDef.description}</p>
                <div className="rounded-[12px] bg-bg-subtle p-4 text-base text-text-secondary">
                  ความเร่งด่วน:{" "}
                  <strong className="text-text-primary">
                    {draft.urgency ? urgencyLabel[draft.urgency] : "-"}
                  </strong>{" "}
                  · ระดับน้ำ:{" "}
                  <strong className="text-text-primary">
                    {draft.waterLevel ? waterLevelLabel[draft.waterLevel] : "ไม่ได้ระบุ"}
                  </strong>
                </div>
              </section>
              {draft.currentStep < 5 && (
                <SosStepActions
                  onPrev={goToPrevStep}
                  onNext={() => handleGoToStep((draft.currentStep + 1) as SosStepNumber)}
                  mobileLabel="ถัดไป"
                  desktopLabel={`ถัดไป: ${SOS_STEPS[draft.currentStep].shortLabel}`}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
