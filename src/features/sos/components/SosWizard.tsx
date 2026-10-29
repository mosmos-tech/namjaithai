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
  clearSosDraft,
  validateStep1Draft,
  subscribeSosDraft,
  getSosDraftSnapshot,
  getSosDraftServerSnapshot,
  type SosDraft,
  type SosStepNumber,
  type Step1ValidationErrors,
} from "../draft-storage";
import { SosProgressBar } from "./SosProgressBar";
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

  function handleSelectWaterLevel(waterLevel: WaterLevel) {
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

  function handleResetDraft() {
    clearSosDraft();
    setStep1Attempted(false);
    setStep1Errors({ missingSummary: [] });
  }

  const currentStepDef = SOS_STEPS[draft.currentStep - 1];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      {/* หัวข้อหน้าฟอร์ม + ปุ่มล้างร่างเมื่อมีการกรอกค้างไว้ */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
            แจ้งขอความช่วยเหลือน้ำท่วม
          </h1>
          <p className="mt-1 text-base text-text-secondary">
            กรอกข้อมูลทีละขั้น ระบบบันทึกข้อมูลไว้ในเครื่องให้อัตโนมัติทุกครั้งที่เลือก
          </p>
        </div>

        {(draft.urgency || draft.waterLevel) && (
          <button
            type="button"
            onClick={handleResetDraft}
            className="inline-flex h-12 items-center rounded-full border border-border-strong bg-bg-surface px-4 font-heading text-sm font-semibold text-text-secondary transition-colors hover:bg-bg-subtle hover:text-text-primary"
          >
            เริ่มกรอกใหม่
          </button>
        )}
      </div>

      {/* แถบความคืบหน้า 5 ช่อง + ข้อความ "ขั้นที่ X จาก 5" */}
      <div className="mb-6">
        <SosProgressBar
          currentStep={draft.currentStep}
          onSelectStep={handleGoToStep}
        />
      </div>

      {/* เนื้อหาแต่ละขั้น */}
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
        <section
          aria-labelledby="step-placeholder-heading"
          className="space-y-6 rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6"
        >
          {/* สรุปค่าที่เลือกไว้จากขั้นที่ 1 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-bg-subtle p-4">
            <div className="space-y-1 text-base">
              <p className="font-heading font-semibold text-text-primary">
                ข้อมูลจากขั้นที่ 1 (บันทึกไว้แล้ว)
              </p>
              <p className="text-text-secondary">
                ความเร่งด่วน:{" "}
                <strong className="text-text-primary">
                  {draft.urgency ? urgencyLabel[draft.urgency] : "-"}
                </strong>{" "}
                · ระดับน้ำ:{" "}
                <strong className="text-text-primary">
                  {draft.waterLevel ? waterLevelLabel[draft.waterLevel] : "-"}
                </strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleGoToStep(1)}
              className="inline-flex h-12 items-center rounded-full border border-border-strong bg-bg-surface px-4 font-heading text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
            >
              แก้ไขขั้นที่ 1
            </button>
          </div>

          <div>
            <h2
              id="step-placeholder-heading"
              className="font-heading text-xl font-bold text-text-primary sm:text-[22px]"
            >
              {currentStepDef.step}. {currentStepDef.title}
            </h2>
            <p className="mt-1.5 text-base leading-relaxed text-text-secondary">
              {currentStepDef.description}
            </p>
          </div>

          {/* ปุ่มย้อนกลับ / ถัดไป (สูง >= 48px ตามกติกา) */}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              data-testid="wizard-prev-button"
              onClick={() =>
                handleGoToStep((draft.currentStep - 1) as SosStepNumber)
              }
              className="flex h-14 w-full items-center justify-center rounded-full border border-border-strong bg-bg-surface px-6 font-heading text-[19px] font-semibold text-text-primary transition-colors hover:bg-bg-subtle sm:w-auto sm:min-w-[160px]"
            >
              ← ย้อนกลับ
            </button>

            {draft.currentStep < 5 && (
              <button
                type="button"
                data-testid="wizard-next-button"
                onClick={() =>
                  handleGoToStep((draft.currentStep + 1) as SosStepNumber)
                }
                className="flex h-14 w-full items-center justify-center rounded-full bg-primary-600 px-8 font-heading text-[19px] font-semibold text-text-on-primary transition-colors hover:bg-primary-700 active:bg-primary-700 sm:w-auto sm:min-w-[200px]"
              >
                ถัดไป: {SOS_STEPS[draft.currentStep].shortLabel} →
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
