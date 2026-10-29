"use client";

import { useState, useSyncExternalStore } from "react";
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
    const next = updateDraft((prev) => ({ ...prev, urgency }));
    if (step1Attempted) {
      setStep1Errors(validateStep1Draft(next).errors);
    }
  }

  function handleSelectWaterLevel(waterLevel: WaterLevel) {
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
    setStep5Attempted(true);
    setSubmitError(null);
    setSubmitSuccessMessage(null);

    const check5 = validateStep5Draft(draft);
    setStep5Errors(check5.errors);
    if (!check5.valid) {
      return;
    }

    const check3 = validateStep3Draft(draft);
    if (!check3.valid) {
      setStep3Attempted(true);
      setStep3Errors(check3.errors);
      updateDraft((prev) => ({ ...prev, currentStep: 3 }));
      return;
    }

    const check4 = validateStep4Draft(draft);
    if (!check4.valid) {
      setStep4Attempted(true);
      setStep4Errors(check4.errors);
      updateDraft((prev) => ({ ...prev, currentStep: 4 }));
      return;
    }

    // บันทึกเบอร์โทรที่ตัดขีดและช่องว่างเรียบร้อยลงในร่าง
    const normalizedPhone = check5.normalizedPhone ?? draft.phone.replace(/[\s\-]/g, "");
    const nextDraft = updateDraft((prev) => ({
      ...prev,
      name: prev.name.trim(),
      phone: normalizedPhone,
    }));

    // ถ้ามีพิกัดและจุดสังเกตจากขั้นที่ 2 ครบแล้ว ให้ส่งเข้า POST /api/cases ทันที
    if (
      typeof nextDraft.lat === "number" &&
      typeof nextDraft.lng === "number" &&
      nextDraft.landmark.trim().length > 0 &&
      nextDraft.urgency &&
      nextDraft.waterLevel
    ) {
      setIsSubmitting(true);
      try {
        const response = await fetch("/api/cases", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            urgency: nextDraft.urgency,
            waterLevel: nextDraft.waterLevel,
            lat: nextDraft.lat,
            lng: nextDraft.lng,
            accuracyM: nextDraft.accuracyM,
            province: nextDraft.province,
            district: nextDraft.district,
            subdistrict: nextDraft.subdistrict,
            landmark: nextDraft.landmark,
            adults: nextDraft.adults,
            elderly: nextDraft.elderly,
            bedridden: nextDraft.bedridden,
            children: nextDraft.children,
            pets: nextDraft.pets,
            needs: nextDraft.needs,
            otherDetail: nextDraft.needs.includes(Need.OTHER)
              ? nextDraft.otherDetail
              : undefined,
            name: nextDraft.name,
            phone: nextDraft.phone,
            lineId: nextDraft.lineId || undefined,
            notes: nextDraft.notes || undefined,
          }),
        });

        const data = (await response.json()) as {
          caseCode?: string;
          error?: string;
        };

        if (!response.ok) {
          setSubmitError(
            data.error ??
              "ไม่สามารถส่งคำขอได้ในขณะนี้ กรุณาลองใหม่อีกครั้งหรือโทรสายด่วน 1669 / 1784",
          );
          return;
        }

        setSubmitSuccessMessage(
          `ส่งคำขอสำเร็จ รหัสเคสของคุณคือ ${data.caseCode ?? ""}`,
        );
      } catch {
        setSubmitError(
          "ไม่สามารถเชื่อมต่อเครือข่ายได้ ระบบบันทึกข้อมูลร่างไว้ในเครื่องแล้ว",
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setSubmitSuccessMessage(
      `บันทึกข้อมูลผู้ติดค้าง สิ่งที่ต้องการ และข้อมูลติดต่อ (${normalizedPhone}) เรียบร้อยแล้ว`,
    );
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
