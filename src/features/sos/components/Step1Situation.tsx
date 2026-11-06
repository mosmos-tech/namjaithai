"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import {
  Building2,
  CarFront,
  Check,
  CircleHelp,
  Flame,
  HeartPulse,
  LifeBuoy,
  PawPrint,
  PhoneCall,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  INCIDENT_REGISTRY,
  INCIDENT_TYPE_ORDER,
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  WaterLevel,
  waterLevelLabel,
  WATER_LEVEL_DISPLAY_ORDER,
} from "../../../lib/domain";
import type { Step1ValidationErrors } from "../draft-storage";
import { SosStepActions } from "./SosStepActions";

interface Step1SituationProps {
  incidentType?: IncidentType;
  atScene?: boolean;
  dangerSigns?: string[];
  canSelfEvacuate?: boolean;
  waterLevel?: WaterLevel;
  errors: Step1ValidationErrors;
  onSelectIncidentType: (incidentType: IncidentType) => void;
  onSelectAtScene: (atScene: boolean) => void;
  onChangeDangerSigns: (dangerSigns: string[]) => void;
  onSelectCanSelfEvacuate: (canSelfEvacuate: boolean) => void;
  onSelectWaterLevel: (waterLevel: WaterLevel | undefined) => void;
  onNext: () => void;
}

const INCIDENT_ICONS: Record<IncidentType, LucideIcon> = {
  FLOOD: Waves,
  FIRE: Flame,
  ROAD_ACCIDENT: CarFront,
  MEDICAL: HeartPulse,
  WATER_RESCUE: LifeBuoy,
  COLLAPSE: Building2,
  ANIMAL: PawPrint,
  OTHER: CircleHelp,
};

const EMERGENCY_HOTLINES = [
  {
    number: "1669",
    name: "สถาบันการแพทย์ฉุกเฉินแห่งชาติ (กู้ชีพ)",
    description: "เจ็บป่วยฉุกเฉิน บาดเจ็บ หมดสติ ส่งโรงพยาบาลฟรี 24 ชม.",
    urgent: true,
  },
  {
    number: "1784",
    name: "กรมป้องกันและบรรเทาสาธารณภัย (ปภ.)",
    description: "แจ้งอุทกภัย วาตภัย อัคคีภัย ขอความช่วยเหลือสาธารณภัย 24 ชม.",
    urgent: true,
  },
  {
    number: "199",
    name: "ศูนย์วิทยุพระราม / ดับเพลิงและกู้ภัย",
    description: "แจ้งเหตุไฟไหม้ กู้ภัยทางน้ำ อาคารถล่ม สัตว์มีพิษเข้าบ้าน",
    urgent: false,
  },
  {
    number: "191",
    name: "สายด่วนตำรวจ",
    description: "แจ้งเหตุด่วนเหตุร้าย อุบัติเหตุทางถนน ขอความช่วยเหลือเร่งด่วน",
    urgent: false,
  },
  {
    number: "1182",
    name: "การไฟฟ้าส่วนภูมิภาค (กฟภ.)",
    description: "แจ้งไฟฟ้ารั่ว สายไฟขาด ตัดกระแสไฟฟ้าในพื้นที่น้ำท่วม",
    urgent: false,
  },
] as const;

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
 * ขั้นที่ 1 ของฟอร์ม SOS (TF-50, TF-55):
 * - ถามก่อนว่าอยู่ที่จุดเกิดเหตุไหม (แจ้งแทนคนอื่นไม่ได้ — ถ้าไม่ได้อยู่ แสดงเบอร์สายด่วนแทน ไม่สร้างเคส)
 * - กริดไอคอน 8 ประเภทเหตุ ปุ่มสูงอย่างน้อย 56px รองรับ ?type=FLOOD เลือกไว้ให้ล่วงหน้า
 * - สัญญาณอันตราย: ติ๊กได้หลายข้อ หรือกด "ไม่มีข้อใดเลย" (ติ๊กแล้วขึ้นแถบโทร 1669 ค้างบนสุดทุกขั้น)
 * - ออกจากที่นั่นเองได้ไหม: ได้ / ไม่ได้ (ต้องตอบ)
 * - ระดับน้ำ: ไม่บังคับ ทั้งมือถือและจอคอม
 * ผู้แจ้งไม่เลือกสีเองและไม่เห็นระดับที่ได้ (TF-50, TF-55)
 */
export function Step1Situation({
  incidentType,
  atScene,
  dangerSigns,
  canSelfEvacuate,
  waterLevel,
  errors,
  onSelectIncidentType,
  onSelectAtScene,
  onChangeDangerSigns,
  onSelectCanSelfEvacuate,
  onSelectWaterLevel,
  onNext,
}: Step1SituationProps) {
  const activeType = incidentType ?? IncidentType.FLOOD;
  const registrySigns = INCIDENT_REGISTRY[activeType].dangerSigns;
  const dangerSignList =
    registrySigns.length > 0 ? registrySigns : UNIVERSAL_DANGER_SIGNS;

  function toggleSign(key: string) {
    const current = dangerSigns ?? [];
    onChangeDangerSigns(
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  const noneSelected = Array.isArray(dangerSigns) && dangerSigns.length === 0;

  return (
    <>
      {/* 1. กริดไอคอน 8 ประเภทเหตุ (TF-50: ปุ่มสูงอย่างน้อย 56px รองรับ ?type=FLOOD) */}
      <section aria-labelledby="incident-type-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="incident-type-heading" className={headingClass}>
            เกิดเหตุอะไรขึ้น?
          </h2>
          <p className="text-text-secondary text-base">เลือกประเภทเหตุที่ต้องการความช่วยเหลือ</p>
          {errors.incidentType && (
            <p role="alert" className="text-base font-medium text-red-600">
              {errors.incidentType}
            </p>
          )}
        </div>

        <div
          role="radiogroup"
          aria-labelledby="incident-type-heading"
          data-testid="incident-type-grid"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {INCIDENT_TYPE_ORDER.map((type) => {
            const def = INCIDENT_REGISTRY[type];
            const Icon = INCIDENT_ICONS[type];
            const selected = incidentType === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`incident-type-${type}`}
                onClick={() => onSelectIncidentType(type)}
                className={`flex min-h-16 w-full items-center gap-3 rounded-[12px] px-4 py-3.5 text-left text-base font-semibold transition-colors ${
                  selected
                    ? "border-primary-600 bg-primary-50 text-primary-700 border-2"
                    : "border-border-default bg-bg-surface text-text-primary hover:border-border-strong border-[1.5px]"
                }`}
              >
                <Icon
                  aria-hidden="true"
                  className={`size-6 shrink-0 ${
                    selected ? "text-primary-600" : "text-text-secondary"
                  }`}
                />
                <span className="min-w-0 flex-1 leading-snug">{def.label.th}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. ถามก่อนว่าอยู่ที่จุดเกิดเหตุไหม (TF-50: แจ้งแทนคนอื่นไม่ได้) */}
      <section aria-labelledby="at-scene-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="at-scene-heading" className={headingClass}>
            ตอนนี้คุณอยู่ที่จุดเกิดเหตุไหม?
          </h2>
          <p className="text-text-secondary text-base">
            ต้องอยู่ที่จุดเกิดเหตุด้วยตัวเองเพื่อให้ปักหมุดพิกัดได้ตรงจุด (แจ้งแทนคนอื่นไม่ได้)
          </p>
          {errors.atScene && (
            <p role="alert" className="text-base font-medium text-red-600">
              {errors.atScene}
            </p>
          )}
        </div>

        <div
          role="radiogroup"
          aria-labelledby="at-scene-heading"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {[
            { value: true, label: "อยู่ที่จุดเกิดเหตุ" },
            { value: false, label: "ไม่ได้อยู่ที่จุดเกิดเหตุ" },
          ].map((option) => {
            const selected = atScene === option.value;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectAtScene(option.value)}
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

      {/* ตอบว่าไม่ได้อยู่ที่จุดเกิดเหตุ → แสดงเบอร์สายด่วนแทน ไม่สร้างเคส (TF-50) */}
      {atScene === false ? (
        <section
          role="region"
          aria-labelledby="not-at-scene-heading"
          data-testid="not-at-scene-hotlines"
          className="flex flex-col gap-4 rounded-[14px] border-2 border-red-600/30 bg-red-50 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h3
              id="not-at-scene-heading"
              className="font-heading text-xl font-bold text-red-700"
            >
              แจ้งแทนคนอื่นไม่ได้ — กรุณาโทรสายด่วนฉุกเฉินแทน
            </h3>
            <p className="text-text-primary text-base leading-relaxed">
              ระบบต้องใช้พิกัด GPS และข้อมูลจากผู้ที่อยู่ในจุดเกิดเหตุโดยตรง จึงไม่สามารถสร้างเคสแทนกันได้
              กรุณาโทรแจ้งสายด่วนด้านล่าง หรือส่งลิงก์เว็บนี้ให้ผู้ประสบภัยกรอกด้วยตัวเอง
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EMERGENCY_HOTLINES.map((hotline) => (
              <div
                key={hotline.number}
                className="border-border-default bg-bg-surface flex flex-col justify-between gap-3 rounded-[12px] border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-text-primary text-base font-bold">
                      {hotline.name}
                    </p>
                    <p className="text-text-secondary mt-1 text-sm leading-snug">
                      {hotline.description}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-2xl font-bold tabular-nums ${
                      hotline.urgent ? "text-red-600" : "text-primary-700"
                    }`}
                  >
                    {hotline.number}
                  </span>
                </div>
                <a
                  href={`tel:${hotline.number}`}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-full font-heading text-base font-semibold text-white transition-colors ${
                    hotline.urgent
                      ? "bg-red-600 hover:bg-red-600/90"
                      : "bg-primary-600 hover:bg-primary-700"
                  }`}
                >
                  <PhoneCall className="size-5 shrink-0" aria-hidden="true" />
                  <span>โทร {hotline.number}</span>
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : (
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
      )}
    </>
  );
}
