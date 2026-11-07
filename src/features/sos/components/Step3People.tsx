"use client";

import type { ReactNode } from "react";
import { User, HeartHandshake, Bed, Baby, PawPrint, Minus, Plus, Check } from "lucide-react";
import {
  INCIDENT_REGISTRY,
  IncidentType,
  isQuestionVisible,
  type IncidentQuestion,
  type WaterLevel,
} from "../../../lib/domain";
import { getTotalPeopleCount, type Step3ValidationErrors } from "../draft-storage";

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
    icon: <User className="h-6 w-6 text-primary-700" aria-hidden="true" />,
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
    icon: <Baby className="h-6 w-6 text-primary-600" aria-hidden="true" />,
  },
  {
    key: "pets",
    label: "สัตว์เลี้ยง",
    subtitle: "สุนัข แมว หรือสัตว์เลี้ยงที่ต้องอพยพด้วย",
    unit: "ตัว",
    icon: <PawPrint className="h-6 w-6 text-green-700" aria-hidden="true" />,
  },
];

interface Step3PeopleProps {
  incidentType?: IncidentType;
  details?: Record<string, string | number | boolean | string[] | undefined>;
  waterLevel?: WaterLevel;
  canSelfEvacuate?: boolean;
  adults: number;
  elderly: number;
  bedridden: number;
  childrenCount: number;
  pets: number;
  hasInjured: boolean;
  errors: Step3ValidationErrors;
  onChangeDetail?: (
    key: string,
    value: string | number | boolean | string[] | undefined,
  ) => void;
  onChangeCount: (group: PeopleGroupKey, nextValue: number) => void;
  onToggleInjured: (next: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * ฟอร์มขอความช่วยเหลือ SOS ขั้นที่ 3 (TF-11, TF-51, TF-54):
 * - วาดคำถามเฉพาะประเภทจากทะเบียน INCIDENT_REGISTRY (เลือก/ตัวเลข/ใช่-ไม่ใช่/ข้อความสั้น) ไม่เกิน 4 คำถามหลัก
 * - ซ่อน/แสดงคำถามย่อยตามเงื่อนไข dependsOn
 * - ตัวเลือกแบบหลายข้อ (multi-select) และปุ่มกดอย่างน้อย 48px
 * - ต่อด้วยตัวนับจำนวนผู้ติดค้างและสัตว์เลี้ยง 5 กลุ่ม
 * - ปุ่ม + และ − ขนาด 48x48px (min-h-[48px] min-w-[48px]) กดง่ายสำหรับผู้สูงอายุ
 * - จำนวนคนรวม (ผู้ใหญ่ + ผู้สูงอายุ + ผู้ป่วยติดเตียง + เด็กเล็ก) ต้องมีอย่างน้อย 1 คน
 */
export function Step3People({
  incidentType = IncidentType.FLOOD,
  details = {},
  waterLevel,
  canSelfEvacuate,
  adults,
  elderly,
  bedridden,
  childrenCount,
  pets,
  hasInjured,
  errors,
  onChangeDetail,
  onChangeCount,
  onToggleInjured,
  onPrev,
  onNext,
}: Step3PeopleProps) {
  const incident = INCIDENT_REGISTRY[incidentType];
  const questions = incident.questions;

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

  function getQuestionValue(
    q: IncidentQuestion,
  ): string | number | boolean | string[] | undefined {
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
      {/* คำถามเฉพาะประเภทเหตุจากทะเบียน INCIDENT_REGISTRY (TF-51 / TF-54) */}
      {visibleQuestions.length > 0 && (
        <section
          aria-labelledby="step3-questions-heading"
          data-testid="step3-incident-questions"
          className="rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6"
        >
          <div className="mb-4">
            <h2
              id="step3-questions-heading"
              className="font-heading text-xl font-bold text-text-primary sm:text-[22px]"
            >
              รายละเอียดเหตุ{incident.label.th}
            </h2>
            <p className="mt-1 text-base text-text-secondary">
              ตอบคำถามสั้นๆ เพื่อให้ทีมกู้ภัยเตรียมอุปกรณ์ช่วยเหลือได้ตรงกับสถานการณ์
            </p>
          </div>

          <div className="space-y-5">
            {visibleQuestions.map((q) => {
              const currentValue = getQuestionValue(q);
              const questionError = errors.questionErrors?.[q.key];

              return (
                <div
                  key={q.key}
                  data-testid={`incident-question-${q.key}`}
                  className="rounded-[12px] border border-border-default bg-bg-subtle/30 p-4"
                >
                  <p className="font-heading text-base font-bold text-text-primary sm:text-lg">
                    {q.label.th}{" "}
                    {q.required ? (
                      <span className="text-red-600">*</span>
                    ) : (
                      <span className="text-sm font-normal text-text-secondary">(ไม่บังคับ)</span>
                    )}
                  </p>

                  {q.kind === "choice" && !q.multiple && (
                    <div
                      role="radiogroup"
                      aria-label={q.label.th}
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
                            className={`flex min-h-[48px] items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-left font-heading text-base font-semibold transition-colors ${
                              selected
                                ? "border-2 border-primary-600 bg-primary-50 text-primary-700"
                                : "border border-border-default bg-bg-surface text-text-primary hover:border-border-strong"
                            }`}
                          >
                            <span>{opt.label.th}</span>
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
                      aria-label={q.label.th}
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
                            className={`flex min-h-[48px] items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-left font-heading text-base font-semibold transition-colors ${
                              selected
                                ? "border-2 border-primary-600 bg-primary-50 text-primary-700"
                                : "border border-border-default bg-bg-surface text-text-primary hover:border-border-strong"
                            }`}
                          >
                            <span>{opt.label.th}</span>
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
                        aria-label={q.label.th}
                        data-testid={`question-${q.key}-input`}
                        placeholder={
                          q.placeholder?.th ?? `ระบุข้อมูลไม่เกิน ${q.maxLength} ตัวอักษร`
                        }
                        value={typeof currentValue === "string" ? currentValue : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleAnswer(q, val.length > 0 ? val : undefined);
                        }}
                        className="min-h-[48px] w-full rounded-[10px] border border-border-strong bg-bg-surface p-3 font-sans text-base text-text-primary focus:border-primary-600 focus:outline-none"
                      />
                      <div className="mt-1 flex justify-end text-xs text-text-secondary">
                        <span data-testid={`question-${q.key}-counter`}>
                          {typeof currentValue === "string" ? currentValue.length : 0} /{" "}
                          {q.maxLength} ตัวอักษร
                        </span>
                      </div>
                    </div>
                  )}

                  {q.kind === "number" && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        data-testid={`question-${q.key}-decrease`}
                        aria-label={`ลด${q.label.th}`}
                        disabled={typeof currentValue === "number" && currentValue <= q.min}
                        onClick={() => {
                          const next =
                            typeof currentValue === "number"
                              ? Math.max(q.min, currentValue - 1)
                              : q.min;
                          handleAnswer(q, next);
                        }}
                        className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-border-strong bg-bg-surface text-text-primary transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-5 w-5" aria-hidden="true" />
                      </button>

                      <input
                        type="number"
                        inputMode="numeric"
                        min={q.min}
                        max={q.max}
                        aria-label={q.label.th}
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
                        className="h-12 min-h-[48px] w-28 rounded-[10px] border border-border-strong bg-bg-surface px-3 text-center font-mono text-xl font-bold text-text-primary focus:border-primary-600 focus:outline-none"
                      />

                      <button
                        type="button"
                        data-testid={`question-${q.key}-increase`}
                        aria-label={`เพิ่ม${q.label.th}`}
                        disabled={typeof currentValue === "number" && currentValue >= q.max}
                        onClick={() => {
                          const next =
                            typeof currentValue === "number"
                              ? Math.min(q.max, currentValue + 1)
                              : Math.max(q.min, 1);
                          handleAnswer(q, next);
                        }}
                        className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-primary-600 text-text-on-primary transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  {q.kind === "boolean" && (
                    <div
                      role="radiogroup"
                      aria-label={q.label.th}
                      className="mt-3 grid grid-cols-2 gap-3"
                    >
                      {[
                        { value: true, text: "ใช่", testId: `question-${q.key}-yes` },
                        { value: false, text: "ไม่ใช่", testId: `question-${q.key}-no` },
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
                            className={`flex min-h-[48px] items-center justify-center rounded-[10px] px-4 py-3 font-heading text-base font-semibold transition-colors ${
                              selected
                                ? "border-2 border-primary-600 bg-primary-50 text-primary-700"
                                : "border border-border-default bg-bg-surface text-text-primary hover:border-border-strong"
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
                      className="mt-2 font-heading text-sm font-semibold text-red-600"
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
        aria-labelledby="step3-people-heading"
        className="rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="step3-people-heading"
              className="font-heading text-xl font-bold text-text-primary sm:text-[22px]"
            >
              3. จำนวนผู้ติดค้างในจุดเกิดเหตุ <span className="text-red-600">*</span>
            </h2>
            <p className="mt-1 text-base text-text-secondary">
              กดปุ่ม + หรือ − เพื่อระบุจำนวนคนในแต่ละกลุ่ม (ต้องมีผู้ติดค้างอย่างน้อย 1 คน)
            </p>
          </div>

          {/* แถบสรุปจำนวนคนรวม */}
          <div
            data-testid="step3-total-summary"
            className={`rounded-[12px] border px-4 py-2.5 text-right ${
              totalPeople > 0
                ? "border-primary-500/40 bg-bg-subtle text-text-primary"
                : "border-red-600/40 bg-red-50 text-red-600"
            }`}
          >
            <p className="text-sm font-medium text-text-secondary">ผู้ติดค้างรวม</p>
            <p className="font-mono text-2xl font-bold">
              {totalPeople} <span className="font-heading text-base font-semibold">คน</span>
            </p>
            {pets > 0 && (
              <p className="font-mono text-xs font-semibold text-green-700">
                + สัตว์เลี้ยง {pets} ตัว
              </p>
            )}
          </div>
        </div>

        {/* รายการตัวนับ 5 กลุ่ม */}
        <div className="space-y-3.5">
          {PEOPLE_GROUPS.map((group) => {
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
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-primary-50"
                  >
                    {group.icon}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-lg font-bold text-text-primary">
                        {group.label}
                      </span>
                      {group.badgeText && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-heading text-xs font-semibold ${
                            group.key === "bedridden"
                              ? "bg-red-50 text-red-600"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {group.badgeText}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-text-secondary sm:text-base">
                      {group.subtitle}
                    </p>
                  </div>
                </div>

                {/* ปุ่ม − ตัวเลข และปุ่ม + (ขนาดอย่างน้อย 48x48px ตามเกณฑ์ผ่าน) */}
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    data-testid={`decrease-${group.key}`}
                    aria-label={`ลดจำนวน${group.label}`}
                    disabled={isMinusDisabled}
                    onClick={() => handleStep(group.key, -1)}
                    className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-border-strong bg-bg-surface text-text-primary transition-colors hover:bg-bg-subtle active:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Minus className="h-5 w-5" aria-hidden="true" />
                  </button>

                  <div className="min-w-[64px] text-center">
                    <span
                      data-testid={`count-${group.key}`}
                      className="font-mono text-2xl font-bold text-text-primary"
                    >
                      {value}
                    </span>
                    <span className="ml-1 text-sm text-text-secondary">{group.unit}</span>
                  </div>

                  <button
                    type="button"
                    data-testid={`increase-${group.key}`}
                    aria-label={`เพิ่มจำนวน${group.label}`}
                    disabled={isPlusDisabled}
                    onClick={() => handleStep(group.key, 1)}
                    className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-primary-600 text-text-on-primary transition-colors hover:bg-primary-700 active:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
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
            data-testid="step3-missing-alert"
            className="mt-5 rounded-[12px] border border-red-600/30 bg-red-50 p-4 text-base text-red-600"
          >
            <p className="font-heading font-bold">ยังไปขั้นถัดไปไม่ได้:</p>
            {errors.totalPeople && <p className="mt-1 font-medium">• {errors.totalPeople}</p>}
            {errors.questionErrors &&
              Object.values(errors.questionErrors).map((msg) => (
                <p key={msg} className="mt-1 font-medium">
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
          data-testid="step3-prev-button"
          onClick={onPrev}
          className="flex h-14 min-h-[48px] w-full items-center justify-center rounded-full border border-border-strong bg-bg-surface px-6 font-heading text-[19px] font-semibold text-text-primary transition-colors hover:bg-bg-subtle sm:w-auto sm:min-w-[160px]"
        >
          ← ย้อนกลับ
        </button>

        <button
          type="button"
          data-testid="step3-next-button"
          onClick={onNext}
          className="flex h-14 min-h-[48px] w-full items-center justify-center rounded-full bg-primary-600 px-8 font-heading text-[19px] font-semibold text-text-on-primary transition-colors hover:bg-primary-700 active:bg-primary-700 sm:w-auto sm:min-w-[220px]"
        >
          ถัดไป: สิ่งที่ต้องการ →
        </button>
      </div>
    </div>
  );
}
