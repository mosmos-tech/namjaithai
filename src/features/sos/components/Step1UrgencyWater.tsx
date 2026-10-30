"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import {
  Urgency,
  WaterLevel,
  waterLevelLabel,
  WATER_LEVEL_DISPLAY_ORDER,
} from "../../../lib/domain";
import type { Step1ValidationErrors } from "../draft-storage";
import { SosStepActions } from "./SosStepActions";

interface Step1UrgencyWaterProps {
  urgency?: Urgency;
  waterLevel?: WaterLevel;
  errors: Step1ValidationErrors;
  onSelectUrgency: (urgency: Urgency) => void;
  onSelectWaterLevel: (waterLevel: WaterLevel | undefined) => void;
  onNext: () => void;
}

// ข้อความตาม Figma: จอคอม (B1) กับมือถือ (MB1) เขียนต่างกัน
const URGENCY_OPTIONS: readonly {
  value: Urgency;
  dot: string;
  desktop: { title: string; desc: string };
  mobile: { title: string; desc: string };
}[] = [
  {
    value: Urgency.RED,
    dot: "/brand/urgency-red.svg",
    desktop: {
      title: "วิกฤต — อันตรายถึงชีวิต",
      desc: "ติดบนหลังคา ผู้ป่วยติดเตียง เด็กทารก น้ำท่วมมิดชั้น 1",
    },
    mobile: { title: "วิกฤต – อันตรายถึงชีวิต", desc: "น้ำสูงถึงหลังคา มีคนบาดเจ็บ หรือป่วยหนัก" },
  },
  {
    value: Urgency.YELLOW,
    dot: "/brand/urgency-yellow.svg",
    desktop: { title: "เร่งด่วน — ต้องการเรืออพยพ", desc: "น้ำระดับเอว–อก ไฟฟ้าดับ อาหารหมด" },
    mobile: { title: "เร่งด่วน – ติดอยู่ ออกไม่ได้", desc: "น้ำเข้าบ้าน อาหารหรือยาใกล้หมด" },
  },
  {
    value: Urgency.GREEN,
    dot: "/brand/urgency-green.svg",
    desktop: { title: "ทั่วไป — ยังปลอดภัยในบ้าน", desc: "ต้องการถุงยังชีพ น้ำดื่ม ยาสามัญ" },
    mobile: { title: "ทั่วไป – ต้องการของจำเป็น", desc: "ยังปลอดภัย แต่ต้องการอาหาร น้ำดื่ม" },
  },
];

/**
 * ขั้นที่ 1 ของฟอร์ม SOS ตาม Figma (B1 จอคอม / MB1 มือถือ)
 * - ความเร่งด่วน 3 ระดับ: การ์ดเลือก 1 ข้อ (บังคับ)
 * - ระดับน้ำรอบตัว: ชิป 5 แบบ เฉพาะจอคอม ไม่บังคับ (กดซ้ำเพื่อยกเลิก)
 */
export function Step1UrgencyWater({
  urgency,
  waterLevel,
  errors,
  onSelectUrgency,
  onSelectWaterLevel,
  onNext,
}: Step1UrgencyWaterProps) {
  return (
    <>
      <section aria-labelledby="urgency-heading" className="flex flex-col gap-6 lg:gap-4">
        <div className="flex flex-col gap-2 lg:gap-4">
          <h2
            id="urgency-heading"
            className="font-heading text-text-primary text-[30px] leading-[1.25] font-bold tracking-[-0.3px] lg:text-[22px] lg:leading-[1.3] lg:font-semibold lg:tracking-[-0.11px]"
          >
            <span className="lg:hidden">
              สถานการณ์ของคุณ
              <br />
              เร่งด่วนแค่ไหน?
            </span>
            <span className="hidden lg:inline">ตอนนี้สถานการณ์เป็นอย่างไร?</span>
          </h2>
          <p className="text-text-secondary text-lg leading-[1.65]">
            เลือก 1 ข้อที่ตรงที่สุด
            <span className="hidden lg:inline"> ทีมกู้ภัยจะช่วยเคสสีแดงก่อน</span>
          </p>
          {errors.urgency && (
            <p role="alert" className="text-base font-medium text-red-600">
              {errors.urgency}
            </p>
          )}
        </div>

        <div
          role="radiogroup"
          aria-labelledby="urgency-heading"
          className="flex flex-col gap-6 lg:gap-4"
        >
          {URGENCY_OPTIONS.map((option) => {
            const selected = urgency === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectUrgency(option.value)}
                className={`flex w-full items-center gap-[18px] rounded-[12px] px-6 py-[22px] text-left transition-colors ${
                  selected
                    ? "border-primary-600 bg-primary-50 border-2"
                    : "border-border-default bg-bg-surface hover:border-border-strong border-[1.5px]"
                }`}
              >
                <img src={option.dot} alt="" className="size-8 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[1.55]">
                  <span className="text-text-primary text-lg font-semibold whitespace-nowrap max-[389px]:whitespace-normal">
                    <span className="lg:hidden">{option.mobile.title}</span>
                    <span className="hidden lg:inline">{option.desktop.title}</span>
                  </span>
                  <span className="text-text-secondary text-base">
                    <span className="lg:hidden">{option.mobile.desc}</span>
                    <span className="hidden lg:inline">{option.desktop.desc}</span>
                  </span>
                </span>
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

      {/* ระดับน้ำ: มีเฉพาะจอคอมตาม Figma (มือถือ MB1 ไม่ถาม) */}
      <section aria-labelledby="water-level-heading" className="hidden flex-col gap-4 lg:flex">
        <h2
          id="water-level-heading"
          className="font-heading text-text-primary text-[22px] leading-[1.3] font-semibold tracking-[-0.11px]"
        >
          ระดับน้ำรอบตัวคุณตอนนี้
        </h2>
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
