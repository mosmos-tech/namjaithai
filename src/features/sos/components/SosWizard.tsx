"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Need,
  type LocatedArea,
  type Urgency,
  type WaterLevel,
} from "../../../lib/domain";
import {
  applyGpsPositionToDraft,
  applyLocatedAreaToDraft,
  applyManualPinToDraft,
  saveSosDraft,
  submitSosDraft,
  validateStep1Draft,
  validateStep2Draft,
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
  type Step2ValidationErrors,
  type Step3ValidationErrors,
  type Step4ValidationErrors,
  type Step5ValidationErrors,
} from "../draft-storage";
import { MAX_SOS_PHOTOS } from "../image-compression";
import { SosProgressBar, SosProgressSegments } from "./SosProgressBar";
import { SosStepperCard } from "./SosStepperCard";
import { SosTopBar } from "./SosTopBar";
import { Step1UrgencyWater } from "./Step1UrgencyWater";
import { Step2Location } from "./Step2Location";
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
  const [step2Attempted, setStep2Attempted] = useState(false);
  const [step2Errors, setStep2Errors] = useState<Step2ValidationErrors>({
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
    const latest = getSosDraftSnapshot();
    const next = updater(latest);
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

  // ระดับน้ำไม่บังคับ: undefined = ผู้ใช้กดยกเลิกตัวที่เลือกไว้
  function handleSelectWaterLevel(waterLevel: WaterLevel | undefined) {
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

  // ── ขั้นที่ 2: พิกัดและที่อยู่ ──────────────────────────────────────────────
  function handleGpsPosition(coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) {
    const next = updateDraft((prev) => applyGpsPositionToDraft(prev, coords));
    if (step2Attempted) {
      setStep2Errors(validateStep2Draft(next).errors);
    }
  }

  function handleManualPin(coords: { lat: number; lng: number }) {
    const next = updateDraft((prev) => applyManualPinToDraft(prev, coords));
    if (step2Attempted) {
      setStep2Errors(validateStep2Draft(next).errors);
    }
  }

  function handleAutoFillArea(area: LocatedArea) {
    const next = updateDraft((prev) => applyLocatedAreaToDraft(prev, area));
    if (step2Attempted) {
      setStep2Errors(validateStep2Draft(next).errors);
    }
  }

  function handleUpdateStep2Field(patch: Partial<SosDraft>) {
    const next = updateDraft((prev) => ({ ...prev, ...patch }));
    if (step2Attempted) {
      setStep2Errors(validateStep2Draft(next).errors);
    }
  }

  function handleStep2Next() {
    setStep2Attempted(true);
    const check = validateStep2Draft(draft);
    setStep2Errors(check.errors);

    if (!check.valid) {
      return;
    }

    updateDraft((prev) => ({
      ...prev,
      currentStep: 3,
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

    // ถ้าจะข้ามไปขั้นที่ 3–5 ต้องผ่านการตรวจขั้นที่ 2 ก่อน
    if (targetStep > 2) {
      const check2 = validateStep2Draft(draft);
      if (!check2.valid) {
        setStep2Attempted(true);
        setStep2Errors(check2.errors);
        if (draft.currentStep !== 2) {
          updateDraft((prev) => ({ ...prev, currentStep: 2 }));
        }
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

          {/* กล่องแจ้งผลส่งคำขอสำเร็จ (แสดงหลังล้างร่างกลับเป็นขั้นที่ 1 แล้ว) */}
          {submitSuccessMessage && draft.currentStep !== 5 && (
            <div
              role="status"
              data-testid="step5-submit-success"
              className="flex items-start gap-3 rounded-[12px] border border-green-700/30 bg-green-50 p-4 text-base text-green-700"
            >
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-heading font-bold">ส่งคำขอความช่วยเหลือสำเร็จ</p>
                <p className="mt-0.5">{submitSuccessMessage}</p>
              </div>
            </div>
          )}

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
            <Step2Location
              draft={draft}
              errors={step2Errors}
              onGpsPosition={handleGpsPosition}
              onManualPin={handleManualPin}
              onAutoFillArea={handleAutoFillArea}
              onUpdateField={handleUpdateStep2Field}
              onPrev={() => handleGoToStep(1)}
              onNext={handleStep2Next}
            />
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
      </div>
    </div>
  );
}
