"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Need,
  urgencyLabel,
  waterLevelLabel,
  type Urgency,
  type WaterLevel,
} from "../../../lib/domain";
import {
  SOS_STEPS,
  saveSosDraft,
  clearSosDraft,
  submitSosDraft,
  validateStep1Draft,
  validateStep3Draft,
  validateStep4Draft,
  validateStep5Draft,
  subscribeSosDraft,
  getSosDraftSnapshot,
  getSosDraftServerSnapshot,
  type SosDraft,
  type SosDraftPhoto,
  type SosStepNumber,
  type Step1ValidationErrors,
  type Step3ValidationErrors,
  type Step4ValidationErrors,
  type Step5ValidationErrors,
} from "../draft-storage";
import { MAX_SOS_PHOTOS } from "../image-compression";
import { SosProgressBar } from "./SosProgressBar";
import { Step1UrgencyWater } from "./Step1UrgencyWater";
import { Step3People, type PeopleGroupKey } from "./Step3People";
import { Step4Needs } from "./Step4Needs";
import { Step5Contact } from "./Step5Contact";

/**
 * โครงฟอร์มขอความช่วยเหลือ SOS 5 ขั้น:
 * ขั้นที่ 1: ความเร่งด่วนและระดับน้ำ (TF-08)
 * ขั้นที่ 2: ตำแหน่งที่เกิดเหตุ (TF-09)
 * ขั้นที่ 3: จำนวนผู้ติดค้าง (TF-11)
 * ขั้นที่ 4: สิ่งที่ต้องการ (TF-11)
 * ขั้นที่ 5: ข้อมูลติดต่อและแนบรูป (TF-11)
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

  // สถานะตรวจข้อมูลขั้นที่ 1
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step1Errors, setStep1Errors] = useState<Step1ValidationErrors>({
    missingSummary: [],
  });

  // สถานะตรวจข้อมูลขั้นที่ 3
  const [step3Attempted, setStep3Attempted] = useState(false);
  const [step3Errors, setStep3Errors] = useState<Step3ValidationErrors>({
    missingSummary: [],
  });

  // สถานะตรวจข้อมูลขั้นที่ 4
  const [step4Attempted, setStep4Attempted] = useState(false);
  const [step4Errors, setStep4Errors] = useState<Step4ValidationErrors>({
    missingSummary: [],
  });

  // สถานะตรวจข้อมูลขั้นที่ 5 และการส่งฟอร์ม
  const [step5Attempted, setStep5Attempted] = useState(false);
  const [step5Errors, setStep5Errors] = useState<Step5ValidationErrors>({
    missingSummary: [],
  });
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);

  function updateDraft(updater: (prev: SosDraft) => SosDraft): SosDraft {
    const next = updater(draft);
    saveSosDraft(next);
    return next;
  }

  // ── ขั้นที่ 1 ───────────────────────────────────────────────────────────────
  function handleSelectUrgency(urgency: Urgency) {
    setSubmitSuccessMessage(null);
    setSubmitError(null);
    const next = updateDraft((prev) => ({ ...prev, urgency }));
    if (step1Attempted) {
      setStep1Errors(validateStep1Draft(next).errors);
    }
  }

  function handleSelectWaterLevel(waterLevel: WaterLevel) {
    setSubmitSuccessMessage(null);
    setSubmitError(null);
    const next = updateDraft((prev) => ({ ...prev, waterLevel }));
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

  // ── ขั้นที่ 3: ผู้ติดค้าง ──────────────────────────────────────────────────
  function handleChangePeopleCount(group: PeopleGroupKey, nextValue: number) {
    const next = updateDraft((prev) => ({
      ...prev,
      [group]: nextValue,
    }));
    if (step3Attempted) {
      setStep3Errors(validateStep3Draft(next).errors);
    }
  }

  function handleStep3Next() {
    setStep3Attempted(true);
    const check = validateStep3Draft(draft);
    setStep3Errors(check.errors);

    if (!check.valid) {
      return;
    }

    updateDraft((prev) => ({
      ...prev,
      currentStep: 4,
    }));
  }

  // ── ขั้นที่ 4: สิ่งที่ต้องการ ──────────────────────────────────────────────
  function handleToggleNeed(need: Need) {
    const exists = draft.needs.includes(need);
    const nextNeeds = exists
      ? draft.needs.filter((item) => item !== need)
      : [...draft.needs, need];

    const next = updateDraft((prev) => ({
      ...prev,
      needs: nextNeeds,
    }));

    if (step4Attempted) {
      setStep4Errors(validateStep4Draft(next).errors);
    }
  }

  function handleChangeOtherDetail(otherDetail: string) {
    const next = updateDraft((prev) => ({
      ...prev,
      otherDetail,
    }));

    if (step4Attempted) {
      setStep4Errors(validateStep4Draft(next).errors);
    }
  }

  function handleStep4Next() {
    setStep4Attempted(true);
    const check = validateStep4Draft(draft);
    setStep4Errors(check.errors);

    if (!check.valid) {
      return;
    }

    updateDraft((prev) => ({
      ...prev,
      currentStep: 5,
    }));
  }

  // ── ขั้นที่ 5: ข้อมูลติดต่อและแนบรูป ───────────────────────────────────────
  function handleChangeContactField(
    field: "name" | "phone" | "lineId" | "notes",
    value: string,
  ) {
    setSubmitError(null);
    setSubmitSuccessMessage(null);

    const next = updateDraft((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (step5Attempted) {
      setStep5Errors(validateStep5Draft(next).errors);
    }
  }

  function handleAddPhoto(photo: SosDraftPhoto) {
    setSubmitError(null);
    setSubmitSuccessMessage(null);

    const next = updateDraft((prev) => ({
      ...prev,
      photos: [...prev.photos, photo].slice(0, MAX_SOS_PHOTOS),
    }));

    if (step5Attempted) {
      setStep5Errors(validateStep5Draft(next).errors);
    }
  }

  function handleRemovePhoto(photoId: string) {
    setSubmitError(null);
    setSubmitSuccessMessage(null);

    const next = updateDraft((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => p.id !== photoId),
    }));

    if (step5Attempted) {
      setStep5Errors(validateStep5Draft(next).errors);
    }
  }

  async function handleStep5Submit() {
    if (isSubmittingRef.current) {
      return;
    }

    setStep5Attempted(true);
    setSubmitError(null);
    setSubmitSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const result = await submitSosDraft({
        draft,
        inFlightRef: isSubmittingRef,
      });

      if (result.status === "duplicate_in_flight") {
        return;
      }

      if (result.status === "invalid_step") {
        if (result.step === 5) {
          setStep5Errors(result.step5Errors);
          return;
        }
        if (result.step === 1) {
          setStep1Attempted(true);
          setStep1Errors(result.step1Errors);
          updateDraft((prev) => ({ ...prev, currentStep: 1 }));
          return;
        }
        if (result.step === 3) {
          setStep3Attempted(true);
          setStep3Errors(result.step3Errors);
          updateDraft((prev) => ({ ...prev, currentStep: 3 }));
          return;
        }
        if (result.step === 4) {
          setStep4Attempted(true);
          setStep4Errors(result.step4Errors);
          updateDraft((prev) => ({ ...prev, currentStep: 4 }));
          return;
        }
        if (result.step === 2) {
          setSubmitError(result.error);
          return;
        }
      }

      if (result.status === "api_error" || result.status === "network_error") {
        setSubmitError(result.error);
        return;
      }

      if (result.status === "submitted") {
        setStep1Attempted(false);
        setStep1Errors({ missingSummary: [] });
        setStep3Attempted(false);
        setStep3Errors({ missingSummary: [] });
        setStep4Attempted(false);
        setStep4Errors({ missingSummary: [] });
        setStep5Attempted(false);
        setStep5Errors({ missingSummary: [] });
        setSubmitSuccessMessage(result.successMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoToStep(targetStep: SosStepNumber) {
    // ตรวจความครบถ้วนของขั้นก่อนหน้าเมื่อผู้ใช้กดข้ามไปขั้นถัดไป
    if (targetStep > 1) {
      const check1 = validateStep1Draft(draft);
      if (!check1.valid) {
        setStep1Attempted(true);
        setStep1Errors(check1.errors);
        return;
      }
    }

    if (targetStep > 3 && draft.currentStep === 3) {
      const check3 = validateStep3Draft(draft);
      if (!check3.valid) {
        setStep3Attempted(true);
        setStep3Errors(check3.errors);
        return;
      }
    }

    if (targetStep > 4 && draft.currentStep === 4) {
      const check4 = validateStep4Draft(draft);
      if (!check4.valid) {
        setStep4Attempted(true);
        setStep4Errors(check4.errors);
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
    setStep3Attempted(false);
    setStep3Errors({ missingSummary: [] });
    setStep4Attempted(false);
    setStep4Errors({ missingSummary: [] });
    setStep5Attempted(false);
    setStep5Errors({ missingSummary: [] });
    setSubmitError(null);
    setSubmitSuccessMessage(null);
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

        {(draft.urgency || draft.waterLevel || draft.name || draft.phone) && (
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

      {/* กล่องแจ้งผลส่งคำขอสำเร็จ (แสดงหลังล้างร่างกลับเป็นขั้นที่ 1 แล้ว) */}
      {submitSuccessMessage && draft.currentStep !== 5 && (
        <div
          role="status"
          data-testid="step5-submit-success"
          className="mb-6 flex items-start gap-3 rounded-[12px] border border-green-700/30 bg-green-50 p-4 text-base text-green-700"
        >
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-heading font-bold">ส่งคำขอความช่วยเหลือสำเร็จ</p>
            <p className="mt-0.5">{submitSuccessMessage}</p>
          </div>
        </div>
      )}

      {/* เนื้อหาแต่ละขั้น */}
      {draft.currentStep === 1 && (
        <Step1UrgencyWater
          urgency={draft.urgency}
          waterLevel={draft.waterLevel}
          errors={step1Errors}
          onSelectUrgency={handleSelectUrgency}
          onSelectWaterLevel={handleSelectWaterLevel}
          onNext={handleStep1Next}
        />
      )}

      {draft.currentStep === 2 && (
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
              onClick={() => handleGoToStep(1)}
              className="flex h-14 w-full items-center justify-center rounded-full border border-border-strong bg-bg-surface px-6 font-heading text-[19px] font-semibold text-text-primary transition-colors hover:bg-bg-subtle sm:w-auto sm:min-w-[160px]"
            >
              ← ย้อนกลับ
            </button>

            <button
              type="button"
              data-testid="wizard-next-button"
              onClick={() => handleGoToStep(3)}
              className="flex h-14 w-full items-center justify-center rounded-full bg-primary-600 px-8 font-heading text-[19px] font-semibold text-text-on-primary transition-colors hover:bg-primary-700 active:bg-primary-700 sm:w-auto sm:min-w-[200px]"
            >
              ถัดไป: {SOS_STEPS[2].shortLabel} →
            </button>
          </div>
        </section>
      )}

      {draft.currentStep === 3 && (
        <Step3People
          adults={draft.adults}
          elderly={draft.elderly}
          bedridden={draft.bedridden}
          childrenCount={draft.children}
          pets={draft.pets}
          errors={step3Errors}
          onChangeCount={handleChangePeopleCount}
          onPrev={() => handleGoToStep(2)}
          onNext={handleStep3Next}
        />
      )}

      {draft.currentStep === 4 && (
        <Step4Needs
          needs={draft.needs}
          otherDetail={draft.otherDetail}
          errors={step4Errors}
          onToggleNeed={handleToggleNeed}
          onChangeOtherDetail={handleChangeOtherDetail}
          onPrev={() => handleGoToStep(3)}
          onNext={handleStep4Next}
        />
      )}

      {draft.currentStep === 5 && (
        <Step5Contact
          name={draft.name}
          phone={draft.phone}
          lineId={draft.lineId}
          notes={draft.notes}
          photos={draft.photos}
          errors={step5Errors}
          isSubmitting={isSubmitting}
          submitError={submitError}
          submitSuccessMessage={submitSuccessMessage}
          onChangeField={handleChangeContactField}
          onAddPhoto={handleAddPhoto}
          onRemovePhoto={handleRemovePhoto}
          onPrev={() => handleGoToStep(4)}
          onSubmit={handleStep5Submit}
        />
      )}
    </div>
  );
}
