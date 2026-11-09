"use client";

/* eslint-disable @next/next/no-img-element -- ไอคอน SVG เล็กจาก Figma */
import {
  Building2,
  CarFront,
  CircleHelp,
  Flame,
  HeartPulse,
  LifeBuoy,
  PawPrint,
  PhoneCall,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { INCIDENT_REGISTRY, IncidentType } from "../../../lib/domain";
import type { Step1ValidationErrors } from "../draft-storage";
import type { EnabledIncidentsState } from "../enabled-incidents";
import { SosStepActions } from "./SosStepActions";

interface Step1IncidentProps {
  incidentType?: IncidentType;
  atScene?: boolean;
  /** ประเภทที่แอดมินเปิดรับแจ้งอยู่ (TF-30) — ประเภทที่ปิดไม่แสดงในกริด */
  enabledIncidents: EnabledIncidentsState;
  errors: Step1ValidationErrors;
  onSelectIncidentType: (incidentType: IncidentType) => void;
  onSelectAtScene: (atScene: boolean) => void;
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
    description: "แจ้งไฟฟ้ารั่ว สายไฟขาด ตัดกระแสไฟฟ้าในพื้นที่ประสบภัย",
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
 * ขั้นที่ 1 ของฟอร์ม SOS "เกิดเหตุอะไร" (TF-50, TF-66):
 * - กริดไอคอนประเภทเหตุ เฉพาะที่แอดมินเปิดรับแจ้ง ปุ่มสูงอย่างน้อย 56px รองรับ ?type=FLOOD เลือกไว้ให้ล่วงหน้า
 * - ไม่เคยโหลดรายการได้ (ออฟไลน์ตั้งแต่ครั้งแรก) แสดงแค่น้ำท่วม พร้อมปุ่มโทรสายด่วนสำหรับเหตุอื่น
 * - ถามว่าอยู่ที่จุดเกิดเหตุไหม (แจ้งแทนคนอื่นไม่ได้ — ถ้าไม่ได้อยู่ แสดงเบอร์สายด่วนแทน ไม่สร้างเคส)
 * สัญญาณอันตรายและคำถามอื่นย้ายไปขั้นที่ 2 (Step2Details)
 */
export function Step1Incident({
  incidentType,
  atScene,
  enabledIncidents,
  errors,
  onSelectIncidentType,
  onSelectAtScene,
  onNext,
}: Step1IncidentProps) {
  return (
    <>
      {/* 1. กริดไอคอนประเภทเหตุที่เปิดรับแจ้ง (TF-50: ปุ่มสูงอย่างน้อย 56px รองรับ ?type=FLOOD) */}
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
          {enabledIncidents.types.map((type) => {
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

        {/* ออฟไลน์และยังไม่เคยโหลดรายการ (มีแค่น้ำท่วม) หรือแอดมินปิดทุกประเภท: เหตุอื่นให้โทรสายด่วน */}
        {(enabledIncidents.source === "fallback" || enabledIncidents.types.length === 0) && (
          <div
            data-testid="incident-fallback-hotlines"
            className="border-border-default bg-bg-subtle flex flex-col gap-3 rounded-[12px] border p-4"
          >
            <p className="text-text-primary text-base font-medium">
              เหตุอื่นโทร 1669 (เจ็บป่วย/อุบัติเหตุ) หรือ 199 (ไฟไหม้)
            </p>
            <div className="grid grid-cols-2 gap-3">
              {["1669", "199"].map((number) => (
                <a
                  key={number}
                  href={`tel:${number}`}
                  className="font-heading flex min-h-14 items-center justify-center gap-2 rounded-full bg-red-600 text-base font-semibold text-white transition-colors hover:bg-red-600/90"
                >
                  <PhoneCall className="size-5 shrink-0" aria-hidden="true" />
                  <span>โทร {number}</span>
                </a>
              ))}
            </div>
          </div>
        )}
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
            <h3 id="not-at-scene-heading" className="font-heading text-xl font-bold text-red-700">
              แจ้งแทนคนอื่นไม่ได้ — กรุณาโทรสายด่วนฉุกเฉินแทน
            </h3>
            <p className="text-text-primary text-base leading-relaxed">
              ระบบต้องใช้พิกัด GPS และข้อมูลจากผู้ที่อยู่ในจุดเกิดเหตุโดยตรง
              จึงไม่สามารถสร้างเคสแทนกันได้ กรุณาโทรแจ้งสายด่วนด้านล่าง
              หรือส่งลิงก์เว็บนี้ให้ผู้ประสบภัยกรอกด้วยตัวเอง
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
                  className={`font-heading flex min-h-14 items-center justify-center gap-2 rounded-full text-base font-semibold text-white transition-colors ${
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
          <SosStepActions
            onNext={onNext}
            mobileLabel="ถัดไป"
            desktopLabel="ถัดไป: รายละเอียดเหตุ"
          />
        </>
      )}
    </>
  );
}
