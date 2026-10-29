"use client";

import {
  Urgency,
  urgencyLabel,
  WaterLevel,
  waterLevelLabel,
  WATER_LEVEL_ORDER,
} from "../../../lib/domain";
import type { Step1ValidationErrors } from "../draft-storage";

interface Step1UrgencyWaterProps {
  urgency?: Urgency;
  waterLevel?: WaterLevel;
  errors: Step1ValidationErrors;
  onSelectUrgency: (urgency: Urgency) => void;
  onSelectWaterLevel: (waterLevel: WaterLevel) => void;
  onNext: () => void;
}

interface UrgencyCardOption {
  value: Urgency;
  label: string;
  subtitle: string;
  dotClass: string;
  badgeClass: string;
  selectedCardClass: string;
  unselectedCardClass: string;
}

const URGENCY_OPTIONS: readonly UrgencyCardOption[] = [
  {
    value: Urgency.RED,
    label: urgencyLabel[Urgency.RED],
    subtitle: "อันตรายต่อชีวิต น้ำท่วมสูง มีผู้ป่วยติดเตียง เด็กเล็ก คนชรา หรือไฟรั่ว",
    dotClass: "bg-red-600",
    badgeClass: "bg-red-600 text-text-on-primary",
    selectedCardClass: "border-2 border-red-600 bg-red-50 shadow-sm",
    unselectedCardClass:
      "border border-border-default bg-bg-surface hover:border-red-600/50 hover:bg-red-50/40",
  },
  {
    value: Urgency.YELLOW,
    label: urgencyLabel[Urgency.YELLOW],
    subtitle: "ติดอยู่ในพื้นที่น้ำท่วม ออกไม่ได้ ต้องการเรืออพยพหรือยารักษาโรค",
    dotClass: "bg-amber-500",
    badgeClass: "bg-amber-700 text-text-on-primary",
    selectedCardClass: "border-2 border-amber-500 bg-amber-50 shadow-sm",
    unselectedCardClass:
      "border border-border-default bg-bg-surface hover:border-amber-500/60 hover:bg-amber-50/40",
  },
  {
    value: Urgency.GREEN,
    label: urgencyLabel[Urgency.GREEN],
    subtitle: "อยู่ในจุดที่ยังปลอดภัยชั่วคราว แต่ขาดแคลนน้ำดื่ม อาหาร หรือของจำเป็น",
    dotClass: "bg-green-700",
    badgeClass: "bg-green-700 text-text-on-primary",
    selectedCardClass: "border-2 border-green-700 bg-green-50 shadow-sm",
    unselectedCardClass:
      "border border-border-default bg-bg-surface hover:border-green-700/50 hover:bg-green-50/40",
  },
];

const WATER_LEVEL_DESCRIPTIONS: Record<
  WaterLevel,
  { detail: string; meterLabel: string; fillPercent: number }
> = {
  [WaterLevel.ANKLE]: {
    detail: "ประมาณ 10–20 ซม. พอเดินลุยได้",
    meterLabel: "0.2 ม.",
    fillPercent: 20,
  },
  [WaterLevel.KNEE]: {
    detail: "ประมาณ 30–50 ซม. เดินลำบาก",
    meterLabel: "0.5 ม.",
    fillPercent: 40,
  },
  [WaterLevel.WAIST]: {
    detail: "ประมาณ 80–100 ซม. กระแสน้ำแรง",
    meterLabel: "1.0 ม.",
    fillPercent: 60,
  },
  [WaterLevel.CHEST]: {
    detail: "ประมาณ 120–150 ซม. อันตรายมาก",
    meterLabel: "1.5 ม.",
    fillPercent: 80,
  },
  [WaterLevel.ROOF]: {
    detail: "ชั้น 1 จมมิด ต้องหนีขึ้นที่สูงหรือหลังคา",
    meterLabel: "2.0+ ม.",
    fillPercent: 100,
  },
};

/**
 * ไอคอนไม้วัดระดับน้ำ (ลายประจำเว็บตาม Figma)
 * แสดงระดับน้ำสีฟ้า primary-500 สูงขึ้นตามตัวเลือกที่กด
 */
function WaterGaugeBar({ fillPercent }: { fillPercent: number }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-12 w-7 shrink-0 flex-col justify-between overflow-hidden rounded-[8px] border border-border-strong bg-bg-page p-1"
    >
      {/* ระดับน้ำสีฟ้า */}
      <div
        className="absolute inset-x-0 bottom-0 bg-primary-500/35 transition-all"
        style={{ height: `${fillPercent}%` }}
      />
      {/* ขีดสเกลไม้วัดระดับน้ำ 5 ขีด */}
      {[0, 1, 2, 3, 4].map((tick) => (
        <span
          key={tick}
          className={`relative z-10 block h-0.5 rounded-full ${
            tick % 2 === 0 ? "w-3 bg-primary-700" : "w-2 bg-primary-600/70"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * ฟอร์มขอความช่วยเหลือ SOS ขั้นที่ 1: เลือกความเร่งด่วน (แดง/เหลือง/เขียว) และระดับน้ำ 5 แบบ
 */
export function Step1UrgencyWater({
  urgency,
  waterLevel,
  errors,
  onSelectUrgency,
  onSelectWaterLevel,
  onNext,
}: Step1UrgencyWaterProps) {
  const hasMissing = errors.missingSummary.length > 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ส่วนที่ 1: เลือกความเร่งด่วน (การ์ด 3 สี) */}
      <section
        aria-labelledby="urgency-heading"
        className="rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6"
      >
        <div className="mb-4">
          <h2
            id="urgency-heading"
            className="font-heading text-xl font-bold text-text-primary sm:text-[22px]"
          >
            1. ความเร่งด่วนของสถานการณ์ <span className="text-red-600">*</span>
          </h2>
          <p className="mt-1 text-base text-text-secondary">
            แตะเลือก 1 ข้อที่ตรงกับสถานการณ์ของคุณมากที่สุด
          </p>
          {errors.urgency && (
            <p
              role="alert"
              data-testid="error-urgency"
              className="mt-2 font-heading text-base font-semibold text-red-600"
            >
              • {errors.urgency}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {URGENCY_OPTIONS.map((option) => {
            const isSelected = urgency === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                data-testid={`urgency-card-${option.value}`}
                onClick={() => onSelectUrgency(option.value)}
                className={`flex min-h-[84px] w-full items-start justify-between gap-3 rounded-[14px] p-4 text-left transition-all sm:p-5 ${
                  isSelected ? option.selectedCardClass : option.unselectedCardClass
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-5 w-5 shrink-0 rounded-full ${option.dotClass}`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-xl font-bold text-text-primary">
                        {option.label}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${option.badgeClass}`}
                      >
                        {option.value}
                      </span>
                    </div>
                    <p className="mt-1.5 text-base leading-relaxed text-text-secondary">
                      {option.subtitle}
                    </p>
                  </div>
                </div>

                {/* วงกลมติ๊กเลือก */}
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-heading text-sm font-bold ${
                    isSelected
                      ? "border-primary-600 bg-primary-600 text-text-on-primary"
                      : "border-border-strong bg-bg-surface text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ส่วนที่ 2: เลือกระดับน้ำ 5 แบบ */}
      <section
        aria-labelledby="water-level-heading"
        className="rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6"
      >
        <div className="mb-4">
          <h2
            id="water-level-heading"
            className="font-heading text-xl font-bold text-text-primary sm:text-[22px]"
          >
            2. ระดับน้ำตอนนี้สูงแค่ไหน <span className="text-red-600">*</span>
          </h2>
          <p className="mt-1 text-base text-text-secondary">
            เปรียบเทียบระดับน้ำกับร่างกายหรือตัวบ้านของคุณ
          </p>
          {errors.waterLevel && (
            <p
              role="alert"
              data-testid="error-water-level"
              className="mt-2 font-heading text-base font-semibold text-red-600"
            >
              • {errors.waterLevel}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WATER_LEVEL_ORDER.map((level) => {
            const isSelected = waterLevel === level;
            const info = WATER_LEVEL_DESCRIPTIONS[level];

            return (
              <button
                key={level}
                type="button"
                aria-pressed={isSelected}
                data-testid={`water-level-${level}`}
                onClick={() => onSelectWaterLevel(level)}
                className={`flex min-h-[72px] w-full items-center justify-between gap-3 rounded-[12px] p-3.5 text-left transition-all sm:p-4 ${
                  isSelected
                    ? "border-2 border-primary-600 bg-bg-subtle shadow-sm"
                    : "border border-border-default bg-bg-surface hover:border-primary-500 hover:bg-primary-50/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <WaterGaugeBar fillPercent={info.fillPercent} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-lg font-bold text-text-primary">
                        {waterLevelLabel[level]}
                      </span>
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 font-mono text-xs font-semibold text-primary-700">
                        {info.meterLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-base text-text-secondary">{info.detail}</p>
                  </div>
                </div>

                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-heading text-sm font-bold ${
                    isSelected
                      ? "border-primary-600 bg-primary-600 text-text-on-primary"
                      : "border-border-strong bg-bg-surface text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* กล่องสรุปเมื่อกดถัดไปแล้วยังเลือกไม่ครบ */}
      {hasMissing && (
        <div
          role="alert"
          data-testid="step1-missing-alert"
          className="rounded-[12px] border border-red-600/30 bg-red-50 p-4 text-base text-red-600"
        >
          <p className="font-heading font-bold">
            ยังไปขั้นถัดไปไม่ได้ กรุณาเลือกข้อมูลที่ขาด:
          </p>
          <p className="mt-1 font-medium">
            ขาด: {errors.missingSummary.join(" และ ")}
          </p>
        </div>
      )}

      {/* ปุ่มไปขั้นถัดไป (ขนาด >= 56px บนมือถือ กดง่าย) */}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:justify-end">
        <button
          type="button"
          data-testid="step1-next-button"
          onClick={onNext}
          className="flex h-14 w-full items-center justify-center rounded-full bg-primary-600 px-8 font-heading text-[19px] font-semibold text-text-on-primary transition-colors hover:bg-primary-700 active:bg-primary-700 sm:w-auto sm:min-w-[220px]"
        >
          ถัดไป: ระบุตำแหน่ง →
        </button>
      </div>
    </div>
  );
}
