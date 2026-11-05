"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import { Check } from "lucide-react";
import {
  INCIDENT_REGISTRY,
  WaterLevel,
  waterLevelLabel,
  WATER_LEVEL_DISPLAY_ORDER,
} from "../../../lib/domain";
import type { Step1ValidationErrors } from "../draft-storage";
import { SosStepActions } from "./SosStepActions";

interface Step1SituationProps {
  dangerSigns?: string[];
  canSelfEvacuate?: boolean;
  waterLevel?: WaterLevel;
  errors: Step1ValidationErrors;
  onChangeDangerSigns: (dangerSigns: string[]) => void;
  onSelectCanSelfEvacuate: (canSelfEvacuate: boolean) => void;
  onSelectWaterLevel: (waterLevel: WaterLevel | undefined) => void;
  onNext: () => void;
}

// ตอนนี้ฟอร์มรับแค่น้ำท่วม — TF-50 จะเลือกชุดคำถามตามประเภทเหตุ
const DANGER_SIGNS = INCIDENT_REGISTRY.FLOOD.dangerSigns;

const headingClass =
  "font-heading text-text-primary text-[22px] leading-[1.3] font-semibold tracking-[-0.11px]";

function optionClass(selected: boolean) {
  return `flex min-h-14 w-full items-center gap-4 rounded-[12px] px-5 py-4 text-left text-lg font-semibold transition-colors ${
    selected
      ? "border-primary-600 bg-primary-50 border-2"
      : "border-border-default bg-bg-surface hover:border-border-strong border-[1.5px]"
  }`;
}

/**
 * ขั้นที่ 1 ของฟอร์ม SOS (TF-55): ผู้แจ้งไม่เลือกสีเอง ตอบคำถามสั้นๆ แล้วระบบจัดลำดับให้
 * - สัญญาณอันตราย: ติ๊กได้หลายข้อ หรือกด "ไม่มีข้อใดเลย" (ต้องตอบ) ติ๊กแล้วขึ้นแถบโทร 1669
 * - ออกจากที่นั่นเองได้ไหม: ได้ / ไม่ได้ (ต้องตอบ)
 * - ระดับน้ำ: ไม่บังคับ ทั้งมือถือและจอคอม (ไม่ตอบ = ไม่ทราบ ระบบจะไม่ให้ระดับต่ำสุด)
 * ผู้แจ้งไม่เห็นระดับที่ได้ (เกณฑ์ TF-55)
 */
export function Step1Situation({
  dangerSigns,
  canSelfEvacuate,
  waterLevel,
  errors,
  onChangeDangerSigns,
  onSelectCanSelfEvacuate,
  onSelectWaterLevel,
  onNext,
}: Step1SituationProps) {
  function toggleSign(key: string) {
    const current = dangerSigns ?? [];
    onChangeDangerSigns(
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  const noneSelected = Array.isArray(dangerSigns) && dangerSigns.length === 0;

  return (
    <>
      <section aria-labelledby="danger-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2
            id="danger-heading"
            className="font-heading text-text-primary text-[30px] leading-[1.25] font-bold tracking-[-0.3px] lg:text-[22px] lg:leading-[1.3] lg:font-semibold lg:tracking-[-0.11px]"
          >
            ตอนนี้มีข้อใดต่อไปนี้ไหม?
          </h2>
          <p className="text-text-secondary text-lg leading-[1.65]">
            เลือกได้หลายข้อ ถ้าไม่มีให้กด &quot;ไม่มีข้อใดเลย&quot;
          </p>
          {errors.dangerSigns && (
            <p role="alert" className="text-base font-medium text-red-600">
              {errors.dangerSigns}
            </p>
          )}
        </div>

        <div role="group" aria-labelledby="danger-heading" className="flex flex-col gap-3">
          {DANGER_SIGNS.map((sign) => {
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
                <span className="text-text-primary min-w-0 flex-1">{sign.label.th}</span>
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
            <span className="text-text-primary min-w-0 flex-1">ไม่มีข้อใดเลย</span>
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
          ออกจากที่นั่นเองได้ไหม?
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
            { value: true, label: "ได้ ออกเองได้" },
            { value: false, label: "ไม่ได้ ติดอยู่" },
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

      {/* ระดับน้ำ: TF-55 ถามทั้งมือถือและจอคอม (ใช้คำนวณระดับ) แต่ไม่บังคับ */}
      <section aria-labelledby="water-level-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="water-level-heading" className={headingClass}>
            ระดับน้ำรอบตัวคุณตอนนี้
          </h2>
          <p className="text-text-secondary text-base">ไม่แน่ใจข้ามได้</p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="water-level-heading"
          className="flex flex-wrap gap-3"
        >
          {WATER_LEVEL_DISPLAY_ORDER.map((level) => {
            const selected = waterLevel === level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={selected}
                // ไม่บังคับ: กดตัวที่เลือกอยู่ซ้ำเพื่อยกเลิก
                onClick={() => onSelectWaterLevel(selected ? undefined : level)}
                className={`min-h-12 rounded-full border-[1.5px] px-5 py-3 text-base leading-[1.4] font-medium transition-colors ${
                  selected
                    ? "border-primary-600 bg-primary-600 text-text-on-primary"
                    : "border-border-default bg-bg-surface text-text-primary hover:border-border-strong"
                }`}
              >
                {waterLevelLabel[level]}
              </button>
            );
          })}
        </div>
      </section>

      <SosStepActions onNext={onNext} mobileLabel="ถัดไป" desktopLabel="ถัดไป: ตำแหน่ง" />
    </>
  );
}
