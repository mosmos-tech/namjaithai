"use client";

import type { ReactNode } from "react";
import {
  Ship,
  HeartPulse,
  Droplets,
  Utensils,
  Pill,
  Baby,
  Flashlight,
  LifeBuoy,
  PawPrint,
  ZapOff,
  MessageSquarePlus,
} from "lucide-react";
import { Need, needLabel } from "../../../lib/domain";
import type { Step4ValidationErrors } from "../draft-storage";

export interface NeedOptionConfig {
  value: Need;
  label: string;
  subtitle: string;
  urgentHighlight?: boolean;
  icon: ReactNode;
}

export const NEED_OPTIONS: readonly NeedOptionConfig[] = [
  {
    value: Need.EVACUATION_BOAT,
    label: needLabel[Need.EVACUATION_BOAT],
    subtitle: "ต้องการเรือรับออกจากพื้นที่น้ำท่วม",
    urgentHighlight: true,
    icon: <Ship className="h-5 w-5 text-primary-700" aria-hidden="true" />,
  },
  {
    value: Need.EVACUATE_BEDRIDDEN,
    label: needLabel[Need.EVACUATE_BEDRIDDEN],
    subtitle: "ต้องการเปลสนามหรือทีมช่วยเคลื่อนย้าย",
    urgentHighlight: true,
    icon: <HeartPulse className="h-5 w-5 text-red-600" aria-hidden="true" />,
  },
  {
    value: Need.DRINKING_WATER,
    label: needLabel[Need.DRINKING_WATER],
    subtitle: "ขาดแคลนน้ำดื่มสะอาดสำหรับบริโภค",
    icon: <Droplets className="h-5 w-5 text-primary-600" aria-hidden="true" />,
  },
  {
    value: Need.FOOD,
    label: needLabel[Need.FOOD],
    subtitle: "อาหารพร้อมทาน ข้าวกล่อง หรืออาหารแห้ง",
    icon: <Utensils className="h-5 w-5 text-amber-700" aria-hidden="true" />,
  },
  {
    value: Need.MEDICINE,
    label: needLabel[Need.MEDICINE],
    subtitle: "ยาประจำตัว ยาสามัญ หรือชุดทำแผล",
    icon: <Pill className="h-5 w-5 text-red-600" aria-hidden="true" />,
  },
  {
    value: Need.BABY_SUPPLIES,
    label: needLabel[Need.BABY_SUPPLIES],
    subtitle: "นมผงเด็ก ขวดนม ผ้าอ้อมสำเร็จรูป",
    icon: <Baby className="h-5 w-5 text-primary-600" aria-hidden="true" />,
  },
  {
    value: Need.FLASHLIGHT_POWER,
    label: needLabel[Need.FLASHLIGHT_POWER],
    subtitle: "ไฟฉายส่องสว่าง แบตเตอรี่สำรองมือถือ",
    icon: <Flashlight className="h-5 w-5 text-amber-700" aria-hidden="true" />,
  },
  {
    value: Need.LIFE_JACKET,
    label: needLabel[Need.LIFE_JACKET],
    subtitle: "เสื้อชูชีพ ห่วงยาง หรือเชือกช่วยชีวิต",
    icon: <LifeBuoy className="h-5 w-5 text-primary-700" aria-hidden="true" />,
  },
  {
    value: Need.PET_FOOD,
    label: needLabel[Need.PET_FOOD],
    subtitle: "อาหารสุนัข อาหารแมว หรือกรงเคลื่อนย้าย",
    icon: <PawPrint className="h-5 w-5 text-green-700" aria-hidden="true" />,
  },
  {
    value: Need.CUT_POWER,
    label: needLabel[Need.CUT_POWER],
    subtitle: "น้ำท่วมปลั๊กไฟ/ตู้ไฟ เสี่ยงไฟดูดในบ้าน",
    urgentHighlight: true,
    icon: <ZapOff className="h-5 w-5 text-red-600" aria-hidden="true" />,
  },
  {
    value: Need.OTHER,
    label: needLabel[Need.OTHER],
    subtitle: "ระบุความต้องการเพิ่มเติมด้วยตัวเอง (ไม่เกิน 200 ตัวอักษร)",
    icon: <MessageSquarePlus className="h-5 w-5 text-primary-700" aria-hidden="true" />,
  },
];

interface Step4NeedsProps {
  needs: Need[];
  otherDetail: string;
  errors: Step4ValidationErrors;
  onToggleNeed: (need: Need) => void;
  onChangeOtherDetail: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * ฟอร์มขอความช่วยเหลือ SOS ขั้นที่ 4: เลือกสิ่งที่ต้องการ 10 อย่าง + "อื่นๆ (พิมพ์เอง)"
 * - เลือกได้หลายข้อ (หรือข้ามได้ถ้ายังไม่แน่ใจ)
 * - ถ้าเลือก "อื่นๆ (พิมพ์เอง)" จะแสดงช่องพิมพ์ (ไม่เกิน 200 ตัวอักษร) และต้องพิมพ์ก่อนกดถัดไป
 */
export function Step4Needs({
  needs,
  otherDetail,
  errors,
  onToggleNeed,
  onChangeOtherDetail,
  onPrev,
  onNext,
}: Step4NeedsProps) {
  const isOtherSelected = needs.includes(Need.OTHER);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="step4-needs-heading"
        className="rounded-[14px] border border-border-default bg-bg-surface p-5 sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2
              id="step4-needs-heading"
              className="font-heading text-xl font-bold text-text-primary sm:text-[22px]"
            >
              4. สิ่งที่ต้องการความช่วยเหลือ
            </h2>
            <p className="mt-1 text-base text-text-secondary">
              แตะเลือกได้มากกว่า 1 ข้อ เพื่อให้ทีมกู้ภัยเตรียมอุปกรณ์และสิ่งของมาได้ตรงจุด
            </p>
          </div>

          <span className="rounded-full bg-bg-subtle px-3.5 py-1 font-heading text-sm font-semibold text-primary-700">
            เลือกแล้ว <span className="font-mono font-bold">{needs.length}</span> รายการ
          </span>
        </div>

        {/* ตัวเลือก 10 อย่าง + อื่นๆ */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NEED_OPTIONS.map((option) => {
            const isSelected = needs.includes(option.value);
            const isOtherOption = option.value === Need.OTHER;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                data-testid={`need-option-${option.value}`}
                onClick={() => onToggleNeed(option.value)}
                className={`flex min-h-[68px] w-full items-start justify-between gap-3 rounded-[12px] p-3.5 text-left transition-all sm:p-4 ${
                  isOtherOption ? "sm:col-span-2" : ""
                } ${
                  isSelected
                    ? "border-2 border-primary-600 bg-bg-subtle shadow-sm"
                    : "border border-border-default bg-bg-surface hover:border-primary-500 hover:bg-primary-50/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
                      option.urgentHighlight ? "bg-red-50" : "bg-primary-50"
                    }`}
                  >
                    {option.icon}
                  </span>
                  <div>
                    <span className="font-heading text-base font-bold text-text-primary sm:text-lg">
                      {option.label}
                    </span>
                    <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                      {option.subtitle}
                    </p>
                  </div>
                </div>

                {/* ช่องติ๊กถูก */}
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 font-heading text-sm font-bold ${
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

        {/* ช่องพิมพ์เองเมื่อเลือก "อื่นๆ (พิมพ์เอง)" */}
        {isOtherSelected && (
          <div
            data-testid="other-detail-container"
            className="mt-4 rounded-[12px] border border-primary-500 bg-bg-subtle/60 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="other-detail-input"
                className="font-heading text-base font-bold text-text-primary"
              >
                โปรดระบุสิ่งที่ต้องการอื่นๆ <span className="text-red-600">*</span>
              </label>
              <span
                data-testid="other-detail-counter"
                className="font-mono text-xs font-semibold text-text-secondary"
              >
                {otherDetail.length}/200 ตัวอักษร
              </span>
            </div>

            <textarea
              id="other-detail-input"
              data-testid="other-detail-input"
              rows={3}
              maxLength={200}
              value={otherDetail}
              onChange={(e) => onChangeOtherDetail(e.target.value.slice(0, 200))}
              placeholder="เช่น ต้องการอินซูลินแช่เย็น, ออกซิเจนถัง, หรืออุปกรณ์ช่วยหายใจ..."
              className="mt-2 w-full rounded-[10px] border border-border-strong bg-bg-surface p-3 text-base text-text-primary placeholder:text-text-secondary/70 focus:border-primary-600 focus:outline-none"
            />

            {errors.otherDetail && (
              <p
                role="alert"
                data-testid="error-other-detail"
                className="mt-2 font-heading text-sm font-semibold text-red-600 sm:text-base"
              >
                • {errors.otherDetail}
              </p>
            )}
          </div>
        )}

        {/* แจ้งเตือนเมื่อเลือก "อื่นๆ" แต่ยังไม่พิมพ์รายละเอียด */}
        {errors.missingSummary.length > 0 && (
          <div
            role="alert"
            data-testid="step4-missing-alert"
            className="mt-4 rounded-[12px] border border-red-600/30 bg-red-50 p-4 text-base text-red-600"
          >
            <p className="font-heading font-bold">
              ยังไปขั้นถัดไปไม่ได้ กรุณากรอกข้อมูลที่ขาด:
            </p>
            <p className="mt-1 font-medium">
              ขาด: {errors.missingSummary.join(", ")}
            </p>
          </div>
        )}
      </section>

      {/* ปุ่มย้อนกลับ / ถัดไป */}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
        <button
          type="button"
          data-testid="step4-prev-button"
          onClick={onPrev}
          className="flex h-14 min-h-[48px] w-full items-center justify-center rounded-full border border-border-strong bg-bg-surface px-6 font-heading text-[19px] font-semibold text-text-primary transition-colors hover:bg-bg-subtle sm:w-auto sm:min-w-[160px]"
        >
          ← ย้อนกลับ
        </button>

        <button
          type="button"
          data-testid="step4-next-button"
          onClick={onNext}
          className="flex h-14 min-h-[48px] w-full items-center justify-center rounded-full bg-primary-600 px-8 font-heading text-[19px] font-semibold text-text-on-primary transition-colors hover:bg-primary-700 active:bg-primary-700 sm:w-auto sm:min-w-[220px]"
        >
          ถัดไป: ข้อมูลติดต่อ →
        </button>
      </div>
    </div>
  );
}
