"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { rememberSentCase } from "../sent-case";
import { saveOfflineSos } from "../offline-queue-core";
import { WaitingAdvice } from "./WaitingAdvice";
import { IncidentType, Need, type LocatedArea, type WaterLevel } from "../../../lib/domain";
import { buildSosSmsLink } from "../../../lib/domain/sms-format";
import {
  SOS_SLOW_SUBMIT_NOTICE_MS,
  applyGpsPositionToDraft,
  applyIncidentTypeToDraft,
  applyLocatedAreaToDraft,
  applyManualPinToDraft,
  saveSosDraft,
  clearSosDraft,
  submitSosDraft,
  validateStep1Draft,
  validateStep2Draft,
  validateStep3Draft,
  validateStep4Draft,
  validateStep5Draft,
  subscribeSosDraft,
  getSosDraftSnapshot,
  getSosDraftServerSnapshot,
  type ManualLocationSource,
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
import { DangerCallBar } from "./DangerCallBar";
import { useEnabledIncidentTypes } from "../enabled-incidents";
import { useHydrated } from "../../../lib/use-hydrated";
import { HydrationPending } from "../../../components/public/HydrationPending";
import { Step1Incident } from "./Step1Incident";
import { Step2Details, type PeopleGroupKey } from "./Step2Details";
import { Step3Location } from "./Step3Location";
import { Step4Needs } from "./Step4Needs";
import { Step5Contact } from "./Step5Contact";
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { LanguageSwitch } from "../../../components/public/LanguageSwitch";
import { format, localePath } from "../../../lib/i18n/locale";

/**
 * โครงฟอร์มขอความช่วยเหลือ SOS 5 ขั้น (เรียงใหม่ใน TF-66):
 * ขั้นที่ 1: เกิดเหตุอะไร — ประเภทเหตุ (เฉพาะที่เปิดรับแจ้ง) + อยู่ที่จุดเกิดเหตุไหม (TF-50)
 * ขั้นที่ 2: รายละเอียดเหตุ — สัญญาณอันตราย ออกเองได้ไหม (TF-55) คำถามเฉพาะประเภท (TF-51) จำนวนคน (TF-11)
 * ขั้นที่ 3: ตำแหน่งที่เกิดเหตุ (TF-09)
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
  const enabledIncidents = useEnabledIncidentTypes();
  // TF-68: ก่อน hydrate เสร็จ ปุ่มในฟอร์มกดแล้วการกดหายเงียบ จึงยังไม่แสดงฟอร์ม (แถบบนที่มีปุ่มโทร 1669 แสดงตลอด)
  const hydrated = useHydrated();
  const { t, locale } = useI18n();
  // ตรวจว่าประเภทที่เลือกยังเปิดรับแจ้งอยู่ เฉพาะเมื่อรู้รายการจริงแล้ว (ตอนออฟไลน์ให้เซิร์ฟเวอร์ตรวจตอนส่ง)
  const knownEnabledTypes =
    enabledIncidents.source === "network" || enabledIncidents.source === "cache"
      ? enabledIncidents.types
      : undefined;
  // ร่างที่เลือกประเภทไว้แล้ว (เช่น ?type= หรือร่างเก่า) แต่รายการสำรองไม่มี ให้ยังเห็นตัวที่เลือก
  const gridIncidents =
    knownEnabledTypes === undefined &&
    draft.incidentType &&
    !enabledIncidents.types.includes(draft.incidentType)
      ? { ...enabledIncidents, types: [...enabledIncidents.types, draft.incidentType] }
      : enabledIncidents;

  // สถานะตรวจข้อมูลขั้นที่ 1
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step1Errors, setStep1Errors] = useState<Step1ValidationErrors>({
    missingSummary: [],
  });

  // สถานะตรวจข้อมูลขั้นที่ 2
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
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlowSubmitting, setIsSlowSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [submittedType, setSubmittedType] = useState<IncidentType | null>(null);
  const [hasSentDetails, setHasSentDetails] = useState(false);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current !== null) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
    };
  }, []);

  function updateDraft(updater: (prev: SosDraft) => SosDraft): SosDraft {
    const latest = getSosDraftSnapshot();
    const next = updater(latest);
    saveSosDraft(next);
    return next;
  }

  // ── ขั้นที่ 1: เกิดเหตุอะไร ────────────────────────────────────────────────
  // TF-66: ย้อนกลับมาเปลี่ยนประเภทได้ — applyIncidentTypeToDraft ล้างคำตอบเฉพาะประเภทเดิม
  function handleChangeStep1(patch: { incidentType?: IncidentType; atScene?: boolean }) {
    setSubmitSuccessMessage(null);
    setSubmitError(null);
    const next = updateDraft((prev) => {
      const withType = patch.incidentType
        ? applyIncidentTypeToDraft(prev, patch.incidentType)
        : prev;
      return patch.atScene === undefined ? withType : { ...withType, atScene: patch.atScene };
    });
    if (step1Attempted) {
      setStep1Errors(validateStep1Draft(next, knownEnabledTypes, t.sos).errors);
    }
  }

  function handleStep1Next() {
    setStep1Attempted(true);
    const check = validateStep1Draft(draft, knownEnabledTypes, t.sos);
    setStep1Errors(check.errors);

    if (!check.valid) {
      return;
    }

    updateDraft((prev) => ({
      ...prev,
      incidentType: prev.incidentType ?? IncidentType.FLOOD,
      atScene: true,
      currentStep: 2,
    }));
  }

  // ── ขั้นที่ 2: รายละเอียดเหตุ ───────────────────────────────────────────────
  function handleChangeDanger(patch: Partial<Pick<SosDraft, "dangerSigns" | "canSelfEvacuate">>) {
    setSubmitSuccessMessage(null);
    setSubmitError(null);
    const next = updateDraft((prev) => {
      const merged: SosDraft = { ...prev, ...patch };
      if (
        typeof patch.canSelfEvacuate === "boolean" &&
        (merged.incidentType ?? IncidentType.FLOOD) === IncidentType.FLOOD
      ) {
        merged.details = { ...merged.details, canSelfEvacuate: patch.canSelfEvacuate };
      }
      return merged;
    });
    if (step2Attempted) {
      setStep2Errors(validateStep2Draft(next, t.sos).errors);
    }
  }

  // ── ขั้นที่ 2 (ต่อ): คำถามเฉพาะประเภทเหตุ + ผู้ติดค้าง ─────────────────────
  function handleChangeDetail(
    key: string,
    value: string | number | boolean | string[] | undefined,
  ) {
    const next = updateDraft((prev) => {
      const nextDetails = { ...(prev.details ?? {}) };
      if (value === undefined) {
        delete nextDetails[key];
      } else {
        nextDetails[key] = value;
      }

      const patch: Partial<SosDraft> = { details: nextDetails };
      if (key === "waterLevel") {
        patch.waterLevel = value as WaterLevel | undefined;
      } else if (key === "canSelfEvacuate" && typeof value === "boolean") {
        patch.canSelfEvacuate = value;
      } else if (key === "hasInjured" && typeof value === "boolean") {
        patch.hasInjured = value;
      }

      return {
        ...prev,
        ...patch,
      };
    });

    if (step2Attempted) {
      setStep2Errors(validateStep2Draft(next, t.sos).errors);
    }
  }

  function handleChangePeopleCount(group: PeopleGroupKey, nextValue: number) {
    const next = updateDraft((prev) => ({
      ...prev,
      [group]: nextValue,
    }));
    if (step2Attempted) {
      setStep2Errors(validateStep2Draft(next, t.sos).errors);
    }
  }

  function handleStep2Next() {
    setStep2Attempted(true);
    const check = validateStep2Draft(draft, t.sos);
    setStep2Errors(check.errors);

    if (!check.valid) {
      return;
    }

    updateDraft((prev) => ({
      ...prev,
      currentStep: 3,
    }));
  }

  // ── ขั้นที่ 3: พิกัดและที่อยู่ ──────────────────────────────────────────────
  function handleGpsPosition(coords: { latitude: number; longitude: number; accuracy?: number }) {
    const next = updateDraft((prev) => applyGpsPositionToDraft(prev, coords));
    if (step3Attempted) {
      setStep3Errors(validateStep3Draft(next, t.sos).errors);
    }
  }

  function handleManualPin(coords: { lat: number; lng: number }, source?: ManualLocationSource) {
    const next = updateDraft((prev) => applyManualPinToDraft(prev, coords, source));
    if (step3Attempted) {
      setStep3Errors(validateStep3Draft(next, t.sos).errors);
    }
  }

  function handleAutoFillArea(area: LocatedArea) {
    const next = updateDraft((prev) => applyLocatedAreaToDraft(prev, area));
    if (step3Attempted) {
      setStep3Errors(validateStep3Draft(next, t.sos).errors);
    }
  }

  function handleUpdateStep3Field(patch: Partial<SosDraft>) {
    const next = updateDraft((prev) => ({ ...prev, ...patch }));
    if (step3Attempted) {
      setStep3Errors(validateStep3Draft(next, t.sos).errors);
    }
  }

  function handleStep3Next() {
    setStep3Attempted(true);
    const check = validateStep3Draft(draft, t.sos);
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
    const nextNeeds = exists ? draft.needs.filter((item) => item !== need) : [...draft.needs, need];

    const next = updateDraft((prev) => ({
      ...prev,
      needs: nextNeeds,
    }));

    if (step4Attempted) {
      setStep4Errors(validateStep4Draft(next, t.sos).errors);
    }
  }

  function handleChangeOtherDetail(otherDetail: string) {
    const next = updateDraft((prev) => ({
      ...prev,
      otherDetail,
    }));

    if (step4Attempted) {
      setStep4Errors(validateStep4Draft(next, t.sos).errors);
    }
  }

  function handleStep4Next() {
    setStep4Attempted(true);
    const check = validateStep4Draft(draft, t.sos);
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
  function handleChangeContactField(field: "name" | "phone" | "lineId" | "notes", value: string) {
    setSubmitError(null);
    setSubmitSuccessMessage(null);

    const next = updateDraft((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (step5Attempted) {
      setStep5Errors(validateStep5Draft(next, t.sos).errors);
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
      setStep5Errors(validateStep5Draft(next, t.sos).errors);
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
      setStep5Errors(validateStep5Draft(next, t.sos).errors);
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
    setIsSlowSubmitting(false);
    if (slowTimerRef.current !== null) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      setIsSlowSubmitting(true);
    }, SOS_SLOW_SUBMIT_NOTICE_MS);

    try {
      const result = await submitSosDraft({
        text: t.sos,
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
        if (result.step === 2) {
          setStep2Attempted(true);
          setStep2Errors(result.step2Errors);
          updateDraft((prev) => ({ ...prev, currentStep: 2 }));
          return;
        }
        if (result.step === 4) {
          setStep4Attempted(true);
          setStep4Errors(result.step4Errors);
          updateDraft((prev) => ({ ...prev, currentStep: 4 }));
          return;
        }
        if (result.step === 3) {
          setSubmitError(result.error);
          return;
        }
      }

      if (
        result.status === "photo_pending" ||
        (result.status === "network_error" && result.requestBody)
      ) {
        if (result.status === "photo_pending") {
          rememberSentCase({
            caseCode: result.caseCode,
            trackingToken: result.trackingToken,
            confirmationToken: result.confirmationToken,
            phoneLast4: draft.phone.replace(/\D/g, "").slice(-4),
            incidentType: draft.incidentType ?? IncidentType.FLOOD,
          });
        }
        try {
          await saveOfflineSos(
            result.idempotencyKey,
            result.requestBody!,
            result.status === "photo_pending"
              ? {
                  caseCode: result.caseCode,
                  trackingToken: result.trackingToken,
                  confirmationToken: result.confirmationToken,
                }
              : undefined,
          );
          clearSosDraft();
          window.dispatchEvent(
            new CustomEvent("sos-queued", { detail: { skipImmediateRetry: true } }),
          );
        } catch {
          setSubmitError(
            result.status === "photo_pending"
              ? format(t.wizard.photoPendingError, { code: result.caseCode })
              : t.wizard.offlineSaveFailed,
          );
        }
        return;
      }
      if (result.status === "api_error" || result.status === "network_error") {
        setSubmitError(result.error);
        return;
      }

      if (result.status === "submitted") {
        const incidentType = draft.incidentType ?? IncidentType.FLOOD;
        setSubmittedType(incidentType);
        if (result.caseCode && result.trackingToken) {
          rememberSentCase({
            caseCode: result.caseCode,
            trackingToken: result.trackingToken,
            confirmationToken: result.confirmationToken,
            phoneLast4: draft.phone.replace(/\D/g, "").slice(-4),
            incidentType,
          });
          setHasSentDetails(true);
        } else setHasSentDetails(false);
        setStep1Attempted(false);
        setStep1Errors({ missingSummary: [] });
        setStep2Attempted(false);
        setStep2Errors({ missingSummary: [] });
        setStep3Attempted(false);
        setStep3Errors({ missingSummary: [] });
        setStep4Attempted(false);
        setStep4Errors({ missingSummary: [] });
        setStep5Attempted(false);
        setStep5Errors({ missingSummary: [] });
        setSubmitSuccessMessage(result.successMessage);
      }
    } finally {
      if (slowTimerRef.current !== null) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      setIsSlowSubmitting(false);
      setIsSubmitting(false);
    }
  }

  function handleGoToStep(targetStep: SosStepNumber) {
    // ตรวจความครบถ้วนของขั้นก่อนหน้าเมื่อผู้ใช้กดข้ามไปขั้นถัดไป
    if (targetStep > 1) {
      const check1 = validateStep1Draft(draft, knownEnabledTypes, t.sos);
      if (!check1.valid) {
        setStep1Attempted(true);
        setStep1Errors(check1.errors);
        if (draft.currentStep !== 1) {
          updateDraft((prev) => ({ ...prev, currentStep: 1 }));
        }
        return;
      }
    }

    // ถ้าจะข้ามไปขั้นที่ 3–5 ต้องตอบรายละเอียดเหตุในขั้นที่ 2 ก่อน
    if (targetStep > 2) {
      const check2 = validateStep2Draft(draft, t.sos);
      if (!check2.valid) {
        setStep2Attempted(true);
        setStep2Errors(check2.errors);
        if (draft.currentStep !== 2) {
          updateDraft((prev) => ({ ...prev, currentStep: 2 }));
        }
        return;
      }
    }

    // ถ้าจะข้ามไปขั้นที่ 4–5 ต้องมีตำแหน่งในขั้นที่ 3 ก่อน
    if (targetStep > 3) {
      const check3 = validateStep3Draft(draft, t.sos);
      if (!check3.valid) {
        setStep3Attempted(true);
        setStep3Errors(check3.errors);
        if (draft.currentStep !== 3) {
          updateDraft((prev) => ({ ...prev, currentStep: 3 }));
        }
        return;
      }
    }

    if (targetStep > 4 && draft.currentStep === 4) {
      const check4 = validateStep4Draft(draft, t.sos);
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
      <SosStepperCard
        currentStep={draft.currentStep}
        onSelectStep={handleGoToStep}
        disabled={!hydrated}
      />

      <div className="min-w-0 flex-1">
        {/* TF-55: ติ๊กสัญญาณอันตรายแล้วแถบโทรค้างบนสุดทุกขั้น */}
        {(draft.dangerSigns?.length ?? 0) > 0 && <DangerCallBar />}
        <SosTopBar onBack={goToPrevStep} />
        <SosProgressSegments currentStep={draft.currentStep} />

        {/* การ์ดฟอร์ม: มือถือเต็มจอ จอคอมเป็นการ์ดขาวมีขอบ */}
        <div className="lg:border-border-default lg:bg-bg-surface flex flex-col gap-6 px-6 pt-7 pb-10 lg:gap-10 lg:rounded-[14px] lg:border lg:px-14 lg:py-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SosProgressBar currentStep={draft.currentStep} />
            {/* TF-63: ลิงก์ธรรมดา กดได้ก่อน hydrate */}
            <LanguageSwitch locale={locale} path="/request" label={t.common.languageSwitchLabel} />
          </div>
          {!hydrated && <HydrationPending emergencyHelp />}

          {/* กล่องแจ้งผลส่งคำขอสำเร็จ (แสดงหลังล้างร่างกลับเป็นขั้นที่ 1 แล้ว) */}
          {hydrated && submitSuccessMessage && draft.currentStep !== 5 && (
            <div
              role="status"
              data-testid="step5-submit-success"
              className="flex items-start gap-3 rounded-[12px] border border-green-700/30 bg-green-50 p-4 text-base text-green-700"
            >
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-heading font-bold">{t.wizard.successTitle}</p>
                <p className="mt-0.5">{submitSuccessMessage}</p>
                {hasSentDetails && (
                  <Link
                    href={localePath("/sos/sent", locale)}
                    className="mt-2 inline-flex min-h-12 items-center font-semibold underline"
                  >
                    {t.wizard.successTrackLink}
                  </Link>
                )}
              </div>
            </div>
          )}
          {submitSuccessMessage && submittedType && <WaitingAdvice incidentType={submittedType} />}

          {hydrated && draft.currentStep === 1 && (
            <Step1Incident
              incidentType={draft.incidentType}
              atScene={draft.atScene}
              enabledIncidents={gridIncidents}
              errors={step1Errors}
              onSelectIncidentType={(incidentType) => handleChangeStep1({ incidentType })}
              onSelectAtScene={(atScene) => handleChangeStep1({ atScene })}
              onNext={handleStep1Next}
            />
          )}

          {hydrated && draft.currentStep === 2 && (
            <Step2Details
              incidentType={draft.incidentType ?? IncidentType.FLOOD}
              details={draft.details}
              dangerSigns={draft.dangerSigns}
              waterLevel={draft.waterLevel}
              canSelfEvacuate={draft.canSelfEvacuate}
              adults={draft.adults}
              elderly={draft.elderly}
              bedridden={draft.bedridden}
              childrenCount={draft.children}
              pets={draft.pets}
              hasInjured={draft.hasInjured}
              errors={step2Errors}
              onChangeDangerSigns={(dangerSigns) => handleChangeDanger({ dangerSigns })}
              onSelectCanSelfEvacuate={(canSelfEvacuate) => handleChangeDanger({ canSelfEvacuate })}
              onChangeDetail={handleChangeDetail}
              onChangeCount={handleChangePeopleCount}
              onToggleInjured={(hasInjured) => updateDraft((prev) => ({ ...prev, hasInjured }))}
              onPrev={() => handleGoToStep(1)}
              onNext={handleStep2Next}
            />
          )}

          {hydrated && draft.currentStep === 3 && (
            <Step3Location
              draft={draft}
              errors={step3Errors}
              onGpsPosition={handleGpsPosition}
              onManualPin={handleManualPin}
              onAutoFillArea={handleAutoFillArea}
              onUpdateField={handleUpdateStep3Field}
              onPrev={() => handleGoToStep(2)}
              onNext={handleStep3Next}
            />
          )}

          {hydrated && draft.currentStep === 4 && (
            <Step4Needs
              incidentType={draft.incidentType ?? IncidentType.FLOOD}
              needs={draft.needs}
              otherDetail={draft.otherDetail}
              errors={step4Errors}
              onToggleNeed={handleToggleNeed}
              onChangeOtherDetail={handleChangeOtherDetail}
              onPrev={() => handleGoToStep(3)}
              onNext={handleStep4Next}
            />
          )}

          {hydrated && draft.currentStep === 5 && (() => {
            const slowSms = buildSosSmsLink(
              {
                incidentType: draft.incidentType,
                waterLevel: draft.waterLevel,
                lat: draft.lat,
                lng: draft.lng,
                phone: draft.phone,
                landmark: draft.landmark,
                adults: draft.adults,
                elderly: draft.elderly,
                bedridden: draft.bedridden,
                children: draft.children,
              },
              process.env.NEXT_PUBLIC_SMS_GATEWAY_NUMBER ?? "",
            );
            return (
              <Step5Contact
                name={draft.name}
                phone={draft.phone}
                lineId={draft.lineId}
                notes={draft.notes}
                photos={draft.photos}
                consent={draft.consent}
                healthConsent={draft.healthConsent}
                onConsentChange={(field, value) => {
                  const next = updateDraft((prev) => ({ ...prev, [field]: value }));
                  if (step5Attempted) setStep5Errors(validateStep5Draft(next, t.sos).errors);
                }}
                errors={step5Errors}
                isSubmitting={isSubmitting}
                isSlowSubmitting={isSlowSubmitting}
                slowSmsHref={slowSms.href}
                slowSmsToSystem={slowSms.toSystem}
                submitError={submitError}
                submitSuccessMessage={submitSuccessMessage}
                onChangeField={handleChangeContactField}
                onAddPhoto={handleAddPhoto}
                onRemovePhoto={handleRemovePhoto}
                onPrev={() => handleGoToStep(4)}
                onSubmit={handleStep5Submit}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}
