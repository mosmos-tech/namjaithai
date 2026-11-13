"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import type { ReactNode } from "react";
import { User, HeartHandshake, Bed, Baby, PawPrint, Minus, Plus, Check } from "lucide-react";
import {
  INCIDENT_REGISTRY,
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  isQuestionVisible,
  type IncidentQuestion,
  type WaterLevel,
} from "../../../lib/domain";
import { getTotalPeopleCount, type Step2ValidationErrors } from "../draft-storage";
import { useI18n } from "../../../lib/i18n/I18nProvider";
import { format, pickText } from "../../../lib/i18n/locale";

const headingClass =
  "font-heading text-text-primary text-[22px] leading-[1.3] font-semibold tracking-[-0.11px]";

function optionClass(selected: boolean) {
  return `flex min-h-14 w-full items-center gap-4 rounded-[12px] px-5 py-4 text-left text-lg font-semibold transition-colors ${
    selected
      ? "border-primary-600 bg-primary-50 border-2"
      : "border-border-default bg-bg-surface hover:border-border-strong border-[1.5px]"
  }`;
}

export type PeopleGroupKey = "adults" | "elderly" | "bedridden" | "children" | "pets";

export interface PeopleGroupConfig {
  key: PeopleGroupKey;
  label: string;
  subtitle: string;
  unit: string;
  badgeText?: string;
  icon: ReactNode;
}

export const PEOPLE_GROUPS: readonly PeopleGroupConfig[] = [
  {
    key: "adults",
    label: "ผู้ใหญ่",
    subtitle: "อายุ 15–59 ปี สุขภาพทั่วไป",
    unit: "คน",
    icon: <User className="text-primary-700 h-6 w-6" aria-hidden="true" />,
  },
  {
    key: "elderly",
    label: "ผู้สูงอายุ",
    subtitle: "อายุ 60 ปีขึ้นไป หรือเคลื่อนไหวช้า",
    unit: "คน",
    badgeText: "กลุ่มเปราะบาง",
    icon: <HeartHandshake className="h-6 w-6 text-amber-700" aria-hidden="true" />,
  },
  {
    key: "bedridden",
    label: "ผู้ป่วยติดเตียง / พิการ",
    subtitle: "ช่วยเหลือตัวเองไม่ได้ ต้องใช้อุปกรณ์ช่วยเคลื่อนย้าย",
    unit: "คน",
    badgeText: "เร่งด่วนพิเศษ",
    icon: <Bed className="h-6 w-6 text-red-600" aria-hidden="true" />,
  },
  {
    key: "children",
    label: "เด็กเล็ก",
    subtitle: "อายุต่ำกว่า 15 ปี หรือทารก",
    unit: "คน",
    badgeText: "กลุ่มเปราะบาง",
    icon: <Baby className="text-primary-600 h-6 w-6" aria-hidden="true" />,
  },
  {
    key: "pets",
    label: "สัตว์เลี้ยง",
    subtitle: "สุนัข แมว หรือสัตว์เลี้ยงที่ต้องอพยพด้วย",
    unit: "ตัว",
    icon: <PawPrint className="h-6 w-6 text-green-700" aria-hidden="true" />,
  },
];

interface Step2DetailsProps {
  incidentType?: IncidentType;
  details?: Record<string, string | number | boolean | string[] | undefined>;
  dangerSigns?: string[];
  waterLevel?: WaterLevel;
  canSelfEvacuate?: boolean;
  adults: number;
  elderly: number;
  bedridden: number;
  childrenCount: number;
  pets: number;
  hasInjured: boolean;
  errors: Step2ValidationErrors;
  onChangeDangerSigns: (dangerSigns: string[]) => void;
  onSelectCanSelfEvacuate: (canSelfEvacuate: boolean) => void;
  onChangeDetail?: (key: string, value: string | number | boolean | string[] | undefined) => void;
  onChangeCount: (group: PeopleGroupKey, nextValue: number) => void;
  onToggleInjured: (next: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * ฟอร์มขอความช่วยเหลือ SOS ขั้นที่ 2 "รายละเอียดเหตุ" (TF-11, TF-51, TF-54, TF-55, TF-66):
 * - สัญญาณอันตรายอยู่บนสุด: ติ๊กได้หลายข้อ หรือกด "ไม่มีข้อใดเลย" (ติ๊กแล้วขึ้นแถบโทร 1669 ค้างบนสุดทุกขั้น)
 * - ออกจากที่นั่นเองได้ไหม: ได้ / ไม่ได้ (ต้องตอบ)
 * - วาดคำถามเฉพาะประเภทจากทะเบียน INCIDENT_REGISTRY (เลือก/ตัวเลข/ใช่-ไม่ใช่/ข้อความสั้น) ไม่เกิน 4 คำถามหลัก
 * - ซ่อน/แสดงคำถามย่อยตามเงื่อนไข dependsOn
 * - ตัวเลือกแบบหลายข้อ (multi-select) และปุ่มกดอย่างน้อย 56px (TF-66)
 * - ต่อด้วยตัวนับคนและสัตว์เลี้ยง 5 กลุ่ม หัวข้อเปลี่ยนตามประเภท (peopleLabel ในทะเบียน)
 * - ปุ่ม + และ − ขนาด 56x56px (size-14) กดง่ายสำหรับผู้สูงอายุ
 * - จำนวนคนรวม (ผู้ใหญ่ + ผู้สูงอายุ + ผู้ป่วยติดเตียง + เด็กเล็ก) ต้องมีอย่างน้อย 1 คน
 */
export function Step2Details({
  incidentType = IncidentType.FLOOD,
  details = {},
  dangerSigns,
  waterLevel,
  canSelfEvacuate,
  adults,
  elderly,
  bedridden,
  childrenCount,
  pets,
  hasInjured,
  errors,
  onChangeDangerSigns,
  onSelectCanSelfEvacuate,
  onChangeDetail,
  onChangeCount,
  onToggleInjured,
  onPrev,
  onNext,
}: Step2DetailsProps) {
  const { t, locale } = useI18n();
  const incident = INCIDENT_REGISTRY[incidentType];
  // ออกเองได้ไหมถามในส่วนอันตรายด้านบนแล้ว ไม่ถามซ้ำ (เดิมน้ำท่วมถาม 2 รอบ)
  const questions = incident.questions.filter((q) => q.key !== "canSelfEvacuate");
  const dangerSignList =
    incident.dangerSigns.length > 0 ? incident.dangerSigns : UNIVERSAL_DANGER_SIGNS;

  function toggleSign(key: string) {
    const current = dangerSigns ?? [];
    onChangeDangerSigns(
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  const noneSelected = Array.isArray(dangerSigns) && dangerSigns.length === 0;

  const allAnswers: Record<string, unknown> = {
    ...details,
    waterLevel,
    canSelfEvacuate,
    hasInjured,
  };
  if (allAnswers.vehicleTypes === undefined && details.vehicleType !== undefined) {
    allAnswers.vehicleTypes = Array.isArray(details.vehicleType)
      ? details.vehicleType
      : [details.vehicleType];
  }

  const visibleQuestions = questions.filter((q) => isQuestionVisible(q, allAnswers));

  function getQuestionValue(q: IncidentQuestion): string | number | boolean | string[] | undefined {
    const fromDetails = details[q.key];
    if (fromDetails !== undefined) return fromDetails;
    if (q.key === "vehicleTypes" && details.vehicleType !== undefined) {
      return Array.isArray(details.vehicleType)
        ? details.vehicleType
        : [details.vehicleType as string];
    }
    if (q.key === "waterLevel") return waterLevel;
    if (q.key === "canSelfEvacuate") return canSelfEvacuate;
    if (q.key === "hasInjured") return hasInjured ? true : undefined;
    return undefined;
  }

  function handleAnswer(
    q: IncidentQuestion,
    nextValue: string | number | boolean | string[] | undefined,
  ) {
    if (q.key === "hasInjured" && typeof nextValue === "boolean") {
      onToggleInjured(nextValue);
    }
    onChangeDetail?.(q.key, nextValue);
  }
  const counts: Record<PeopleGroupKey, number> = {
    adults,
    elderly,
    bedridden,
    children: childrenCount,
    pets,
  };

  const totalPeople = getTotalPeopleCount({
    adults,
    elderly,
    bedridden,
    children: childrenCount,
  });

  function handleStep(key: PeopleGroupKey, delta: number) {
    const current = counts[key] ?? 0;
    const next = Math.max(0, Math.min(99, current + delta));
    onChangeCount(key, next);
  }

  return (
    <div className="space-y-6">
      {/* TF-66: สัญญาณอันตรายอยู่บนสุด (ย้ายมาจากขั้นที่ 1) — ติ๊กแล้วแถบโทรขึ้นทันทีและค้างทุกขั้น */}
      <section aria-labelledby="danger-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2
            id="danger-heading"
            className="font-heading text-text-primary text-[30px] leading-[1.25] font-bold tracking-[-0.3px] lg:text-[22px] lg:leading-[1.3] lg:font-semibold lg:tracking-[-0.11px]"
          >
            {t.step2.dangerHeading}
          </h2>
          <p className="text-text-secondary text-lg leading-[1.65]">{t.step2.dangerHint}</p>
          {errors.dangerSigns && (
            <p role="alert" className="text-base font-medium text-red-600">
              {errors.dangerSigns}
            </p>
          )}
        </div>

        <div role="group" aria-labelledby="danger-heading" className="flex flex-col gap-3">
          {dangerSignList.map((sign) => {
            const selected = dangerSigns?.includes(sign.key) ?? false;
            return (
              <button
                key={sign.key}
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => toggleSign(sign.key)}
                className={optionClass(selected)}
              >
                <span className="text-text-primary min-w-0 flex-1">
                  {pickText(sign.label, locale)}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md border-2 ${
                    selected
                      ? "border-primary-600 bg-primary-600 text-white"
                      : "border-border-strong"
                  }`}
                >
                  {selected && <Check className="size-5" />}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            role="checkbox"
            aria-checked={noneSelected}
            onClick={() => onChangeDangerSigns([])}
            className={optionClass(noneSelected)}
          >
            <span className="text-text-primary min-w-0 flex-1">{t.step2.noneOfThese}</span>
            <img
              src={noneSelected ? "/brand/radio-on.svg" : "/brand/radio-off.svg"}
              alt=""
              className="size-[26px] shrink-0"
            />
          </button>
        </div>
      </section>

      <section aria-labelledby="evacuate-heading" className="flex flex-col gap-4">
        <h2 id="evacuate-heading" className={headingClass}>
          {t.step2.selfEvacHeading}
        </h2>
        {errors.canSelfEvacuate && (
          <p role="alert" className="text-base font-medium text-red-600">
            {errors.canSelfEvacuate}
          </p>
        )}
        <div
          role="radiogroup"
          aria-labelledby="evacuate-heading"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {[
            { value: true, label: t.step2.selfEvacYes },
            { value: false, label: t.step2.selfEvacNo },
          ].map((option) => {
            const selected = canSelfEvacuate === option.value;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectCanSelfEvacuate(option.value)}
                className={optionClass(selected)}
              >
                <span className="text-text-primary min-w-0 flex-1">{option.label}</span>
                <img
                  src={selected ? "/brand/radio-on.svg" : "/brand/radio-off.svg"}
                  alt=""
                  className="size-[26px] shrink-0"
                />
              </button>
            );
          })}
        </div>
      </section>

      {/* คำถามเฉพาะประเภทเหตุจากทะเบียน INCIDENT_REGISTRY (TF-51 / TF-54) */}
      {visibleQuestions.length > 0 && (
        <section
          aria-labelledby="step2-questions-heading"
          data-testid="step2-incident-questions"
          className="border-border-default bg-bg-surface rounded-[14px] border p-5 sm:p-6"
        >
          <div className="mb-4">
            <h2
              id="step2-questions-heading"
              className="font-heading text-text-primary text-xl font-bold sm:text-[22px]"
            >
              {format(t.step2.detailsHeading, { incident: pickText(incident.label, locale) })}
            </h2>
            <p className="text-text-secondary mt-1 text-base">{t.step2.detailsHint}</p>
          </div>

          <div className="space-y-5">
            {visibleQuestions.map((q) => {
              const currentValue = getQuestionValue(q);
              const questionError = errors.questionErrors?.[q.key];

              return (
                <div
                  key={q.key}
                  data-testid={`incident-question-${q.key}`}
                  className="border-border-default bg-bg-subtle/30 rounded-[12px] border p-4"
                >
                  <p className="font-heading text-text-primary text-base font-bold sm:text-lg">
                    {pickText(q.label, locale)}{" "}
                    {q.required ? (
                      <span className="text-red-600">*</span>
                    ) : (
                      <span className="text-text-secondary text-sm font-normal">
                        {t.step2.optional}
                      </span>
                    )}
                  </p>

                  {q.kind === "choice" && !q.multiple && (
                    <div
                      role="radiogroup"
                      aria-label={pickText(q.label, locale)}
                      className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                    >
                      {q.options.map((opt) => {
                        const selected = currentValue === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            data-testid={`question-${q.key}-option-${opt.value}`}
                            onClick={() =>
                              handleAnswer(q, !q.required && selected ? undefined : opt.value)
                            }
                            className={`font-heading flex min-h-14 items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-left text-base font-semibold transition-colors ${
                              selected
                                ? "border-primary-600 bg-primary-50 text-primary-700 border-2"
                                : "border-border-default bg-bg-surface text-text-primary hover:border-border-strong border"
                            }`}
                          >
                            <span>{pickText(opt.label, locale)}</span>
                            <span
                              aria-hidden="true"
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                selected
                                  ? "border-primary-600 bg-primary-600 text-white"
                                  : "border-border-strong"
                              }`}
                            >
                              {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {q.kind === "choice" && q.multiple && (
                    <div
                      role="group"
                      aria-label={pickText(q.label, locale)}
                      className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                    >
                      {q.options.map((opt) => {
                        const selected =
                          Array.isArray(currentValue) && currentValue.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="checkbox"
                            aria-checked={selected}
                            data-testid={`question-${q.key}-option-${opt.value}`}
                            onClick={() => {
                              const currentArr = Array.isArray(currentValue) ? currentValue : [];
                              const next = selected
                                ? currentArr.filter((v) => v !== opt.value)
                                : [...currentArr, opt.value];
                              handleAnswer(q, next.length > 0 ? next : undefined);
                            }}
                            className={`font-heading flex min-h-14 items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-left text-base font-semibold transition-colors ${
                              selected
                                ? "border-primary-600 bg-primary-50 text-primary-700 border-2"
                                : "border-border-default bg-bg-surface text-text-primary hover:border-border-strong border"
                            }`}
                          >
                            <span>{pickText(opt.label, locale)}</span>
                            <span
                              aria-hidden="true"
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 ${
                                selected
                                  ? "border-primary-600 bg-primary-600 text-white"
                                  : "border-border-strong"
                              }`}
                            >
                              {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {q.kind === "text" && (
                    <div className="mt-3">
                      <textarea
                        rows={3}
                        maxLength={q.maxLength}
                        aria-label={pickText(q.label, locale)}
                        data-testid={`question-${q.key}-input`}
                        placeholder={
                          (q.placeholder ? pickText(q.placeholder, locale) : undefined) ??
                          format(t.step2.textPlaceholder, { max: q.maxLength })
                        }
                        value={typeof currentValue === "string" ? currentValue : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleAnswer(q, val.length > 0 ? val : undefined);
                        }}
                        className="border-border-strong bg-bg-surface text-text-primary focus:border-primary-600 min-h-14 w-full rounded-[10px] border p-3 font-sans text-base focus:outline-none"
                      />
                      <div className="text-text-secondary mt-1 flex justify-end text-xs">
                        <span data-testid={`question-${q.key}-counter`}>
                          {format(t.step2.charCount, {
                            count: typeof currentValue === "string" ? currentValue.length : 0,
                            max: q.maxLength,
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  {q.kind === "number" && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        data-testid={`question-${q.key}-decrease`}
                        aria-label={format(t.step2.decrease, { label: pickText(q.label, locale) })}
                        disabled={typeof currentValue === "number" && currentValue <= q.min}
                        onClick={() => {
                          const next =
                            typeof currentValue === "number"
                              ? Math.max(q.min, currentValue - 1)
                              : q.min;
                          handleAnswer(q, next);
                        }}
                        className="border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle flex size-14 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-5 w-5" aria-hidden="true" />
                      </button>

                      <input
                        type="number"
                        inputMode="numeric"
                        min={q.min}
                        max={q.max}
                        aria-label={pickText(q.label, locale)}
                        data-testid={`question-${q.key}-input`}
                        value={typeof currentValue === "number" ? String(currentValue) : ""}
                        placeholder={`${q.min}–${q.max}`}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === "") {
                            handleAnswer(q, undefined);
                            return;
                          }
                          const parsed = Number.parseInt(raw, 10);
                          if (!Number.isNaN(parsed)) {
                            handleAnswer(q, Math.max(q.min, Math.min(q.max, parsed)));
                          }
                        }}
                        className="border-border-strong bg-bg-surface text-text-primary focus:border-primary-600 min-h-14 w-28 rounded-[10px] border px-3 text-center font-mono text-xl font-bold focus:outline-none"
                      />

                      <button
                        type="button"
                        data-testid={`question-${q.key}-increase`}
                        aria-label={format(t.step2.increase, { label: pickText(q.label, locale) })}
                        disabled={typeof currentValue === "number" && currentValue >= q.max}
                        onClick={() => {
                          const next =
                            typeof currentValue === "number"
                              ? Math.min(q.max, currentValue + 1)
                              : Math.max(q.min, 1);
                          handleAnswer(q, next);
                        }}
                        className="bg-primary-600 text-text-on-primary hover:bg-primary-700 flex size-14 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  {q.kind === "boolean" && (
                    <div
                      role="radiogroup"
                      aria-label={pickText(q.label, locale)}
                      className="mt-3 grid grid-cols-2 gap-3"
                    >
                      {[
                        { value: true, text: t.step2.yes, testId: `question-${q.key}-yes` },
                        { value: false, text: t.step2.no, testId: `question-${q.key}-no` },
                      ].map((opt) => {
                        const selected = currentValue === opt.value;
                        return (
                          <button
                            key={opt.text}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            data-testid={opt.testId}
                            onClick={() => handleAnswer(q, opt.value)}
                            className={`font-heading flex min-h-14 items-center justify-center rounded-[10px] px-4 py-3 text-base font-semibold transition-colors ${
                              selected
                                ? "border-primary-600 bg-primary-50 text-primary-700 border-2"
                                : "border-border-default bg-bg-surface text-text-primary hover:border-border-strong border"
                            }`}
                          >
                            {opt.text}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {questionError && (
                    <p
                      role="alert"
                      data-testid={`error-question-${q.key}`}
                      className="font-heading mt-2 text-sm font-semibold text-red-600"
                    >
                      • {questionError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section
        aria-labelledby="step2-people-heading"
        className="border-border-default bg-bg-surface rounded-[14px] border p-5 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="step2-people-heading"
              className="font-heading text-text-primary text-xl font-bold sm:text-[22px]"
            >
              {pickText(incident.peopleLabel, locale)} <span className="text-red-600">*</span>
            </h2>
            <p className="text-text-secondary mt-1 text-base">{t.step2.peopleHint}</p>
          </div>

          {/* แถบสรุปจำนวนคนรวม */}
          <div
            data-testid="step2-total-summary"
            className={`rounded-[12px] border px-4 py-2.5 text-right ${
              totalPeople > 0
                ? "border-primary-500/40 bg-bg-subtle text-text-primary"
                : "border-red-600/40 bg-red-50 text-red-600"
            }`}
          >
            <p className="text-text-secondary text-sm font-medium">{t.step2.total}</p>
            <p className="font-mono text-2xl font-bold">
              {totalPeople}{" "}
              <span className="font-heading text-base font-semibold">{t.step2.peopleUnit}</span>
            </p>
            {pets > 0 && (
              <p className="font-mono text-xs font-semibold text-green-700">
                {format(t.step2.petsSummary, { count: pets })}
              </p>
            )}
          </div>
        </div>

        {/* รายการตัวนับ 5 กลุ่ม */}
        <div className="space-y-3.5">
          {PEOPLE_GROUPS.map((config) => {
            const group = { ...config, ...t.step2.groups[config.key] };
            const value = counts[group.key];
            const isMinusDisabled = value <= 0;
            const isPlusDisabled = value >= 99;

            return (
              <div
                key={group.key}
                data-testid={`people-row-${group.key}`}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-[14px] border p-4 transition-colors ${
                  value > 0
                    ? "border-primary-600 bg-bg-subtle/60"
                    : "border-border-default bg-bg-surface"
                }`}
              >
                {/* ไอคอน + ชื่อกลุ่ม */}
                <div className="flex min-w-[180px] flex-1 items-start gap-3.5">
                  <div
                    data-testid={`icon-${group.key}`}
                    className="bg-primary-50 flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]"
                  >
                    {group.icon}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-text-primary text-lg font-bold">
                        {group.label}
                      </span>
                      {group.badge && (
                        <span
                          className={`font-heading rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            group.key === "bedridden"
                              ? "bg-red-50 text-red-600"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {group.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-text-secondary mt-0.5 text-sm leading-relaxed sm:text-base">
                      {group.subtitle}
                    </p>
                  </div>
                </div>

                {/* ปุ่ม − ตัวเลข และปุ่ม + (ขนาด 56x56px ตาม TF-66) */}
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    data-testid={`decrease-${group.key}`}
                    aria-label={format(t.step2.decreaseGroup, { label: group.label })}
                    disabled={isMinusDisabled}
                    onClick={() => handleStep(group.key, -1)}
                    className="border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle active:bg-primary-100 flex size-14 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Minus className="h-5 w-5" aria-hidden="true" />
                  </button>

                  <div className="min-w-[64px] text-center">
                    <span
                      data-testid={`count-${group.key}`}
                      className="text-text-primary font-mono text-2xl font-bold"
                    >
                      {value}
                    </span>
                    <span className="text-text-secondary ml-1 text-sm">{group.unit}</span>
                  </div>

                  <button
                    type="button"
                    data-testid={`increase-${group.key}`}
                    aria-label={format(t.step2.increaseGroup, { label: group.label })}
                    disabled={isPlusDisabled}
                    onClick={() => handleStep(group.key, 1)}
                    className="bg-primary-600 text-text-on-primary hover:bg-primary-700 active:bg-primary-700 flex size-14 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ข้อความแจ้งเตือนเมื่อจำนวนคนรวมเป็น 0 หรือยังไม่ได้ตอบคำถามบังคับ */}
        {(errors.totalPeople || errors.missingSummary.length > 0) && (
          <div
            role="alert"
            data-testid="step2-missing-alert"
            className="mt-5 rounded-[12px] border border-red-600/30 bg-red-50 p-4 text-base text-red-600"
          >
            <p className="font-heading font-bold">{t.step2.cannotContinue}</p>
            {errors.dangerSigns && <p className="mt-1 font-medium">• {errors.dangerSigns}</p>}
            {errors.canSelfEvacuate && (
              <p className="mt-1 font-medium">• {errors.canSelfEvacuate}</p>
            )}
            {errors.totalPeople && <p className="mt-1 font-medium">• {errors.totalPeople}</p>}
            {errors.questionErrors &&
              Object.entries(errors.questionErrors).map(([key, msg]) => (
                <p key={key} className="mt-1 font-medium">
                  • {msg}
                </p>
              ))}
          </div>
        )}
      </section>

      {/* ปุ่มย้อนกลับ / ถัดไป */}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
        <button
          type="button"
          data-testid="step2-prev-button"
          onClick={onPrev}
          className="border-border-strong bg-bg-surface font-heading text-text-primary hover:bg-bg-subtle flex min-h-14 w-full items-center justify-center rounded-full border px-6 text-[19px] font-semibold transition-colors sm:w-auto sm:min-w-[160px]"
        >
          {t.step2.prev}
        </button>

        <button
          type="button"
          data-testid="step2-next-button"
          onClick={onNext}
          className="bg-primary-600 font-heading text-text-on-primary hover:bg-primary-700 active:bg-primary-700 flex min-h-14 w-full items-center justify-center rounded-full px-8 text-[19px] font-semibold transition-colors sm:w-auto sm:min-w-[220px]"
        >
          {t.step2.nextDesktop}
        </button>
      </div>
    </div>
  );
}
