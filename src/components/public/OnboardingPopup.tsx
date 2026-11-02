"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";

export const ONBOARDING_SEEN_STORAGE_KEY = "namjaithai-onboarding-seen-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenOnboarding(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markOnboardingSeen(storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
  } catch {
    // ignore when localStorage is unavailable
  }
}

export function resetOnboardingSeen(storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(ONBOARDING_SEEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface OnboardingStepConfig {
  step: number;
  stepNumberText: string;
  iconSrc: string;
  iconAlt: string;
  waterPercentage: number;
  waterHeightPxDesktop: number;
  waterHeightPxMobile: number;
  title: string;
  description: string;
  type: "welcome" | "urgency" | "location" | "tracking";
}

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    step: 1,
    stepNumberText: "01",
    iconSrc: "/brand/icon-life-buoy.svg",
    iconAlt: "ห่วงชูชีพ",
    waterPercentage: 18,
    waterHeightPxDesktop: 100.8,
    waterHeightPxMobile: 36,
    title: "ยินดีต้อนรับสู่ น้ำใจไทย SOS",
    description:
      "เว็บนี้ใช้ขอความช่วยเหลือเมื่อเกิดน้ำท่วม ทีมกู้ภัยในพื้นที่จะเห็นตำแหน่งของคุณบนแผนที่ และเข้าไปช่วยได้เร็วขึ้น",
    type: "welcome",
  },
  {
    step: 2,
    stepNumberText: "02",
    iconSrc: "/brand/icon-alert.svg",
    iconAlt: "ระดับความเร่งด่วน",
    waterPercentage: 36,
    waterHeightPxDesktop: 201.6,
    waterHeightPxMobile: 72,
    title: "บอกว่าเร่งด่วนแค่ไหน",
    description: "เลือกสีให้ตรงกับสถานการณ์ ทีมกู้ภัยจะไปช่วยเคสสีแดงก่อน",
    type: "urgency",
  },
  {
    step: 3,
    stepNumberText: "03",
    iconSrc: "/brand/icon-map-pin.svg",
    iconAlt: "ตำแหน่งพิกัด",
    waterPercentage: 54,
    waterHeightPxDesktop: 302.4,
    waterHeightPxMobile: 108,
    title: "ส่งตำแหน่งของคุณ",
    description:
      'กดปุ่ม "ดึงพิกัด GPS" หรือปักหมุดบนแผนที่ แล้วบอกจุดสังเกต เช่น บ้านหลังคาสีแดง ตรงข้ามวัด',
    type: "location",
  },
  {
    step: 4,
    stepNumberText: "04",
    iconSrc: "/brand/icon-navigation.svg",
    iconAlt: "ติดตามความช่วยเหลือ",
    waterPercentage: 72,
    waterHeightPxDesktop: 403.2,
    waterHeightPxMobile: 144,
    title: "ติดตามความช่วยเหลือ",
    description:
      "จดรหัสเคสไว้ คุณจะเห็นว่าทีมไหนรับเคส และกำลังเดินทางมาถึงไหน ถ้าไม่มีสัญญาณ ระบบจะบันทึกไว้และส่งให้เองเมื่อมีสัญญาณ",
    type: "tracking",
  },
];

function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getOnboardingSnapshot(): boolean {
  return hasSeenOnboarding();
}

function getServerOnboardingSnapshot(): boolean {
  return true; // บน server ไม่แสดงเพื่อป้องกัน hydration mismatch
}

interface OnboardingPopupProps {
  /**
   * บังคับให้เปิดสำหรับทดสอบหรือ preview
   */
  forceOpen?: boolean;
  /**
   * callback เมื่อปิด popup
   */
  onClose?: () => void;
}

export function OnboardingPopup({ forceOpen, onClose }: OnboardingPopupProps) {
  const seenFromStorage = useSyncExternalStore(
    subscribeToStorage,
    getOnboardingSnapshot,
    getServerOnboardingSnapshot
  );
  const [dismissedLocally, setDismissedLocally] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const isOpen = Boolean(forceOpen || (!seenFromStorage && !dismissedLocally));

  if (!isOpen) return null;

  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1;

  const handleDismiss = () => {
    markOnboardingSeen();
    setDismissedLocally(true);
    onClose?.();
  };

  const handleNext = () => {
    if (isLastStep) {
      handleDismiss();
    } else {
      setCurrentStepIndex((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-popup"
      data-step={currentStep.step}
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center p-0 md:p-6"
    >
      {/* Scrim / Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 transition-opacity backdrop-blur-[2px]"
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Popup Container (Desktop: Center Modal 1000x560 | Mobile: Bottom Sheet max 590px) */}
      <div className="relative z-10 w-full md:max-w-[1000px] h-[590px] md:h-[560px] bg-bg-surface rounded-t-[24px] md:rounded-[20px] shadow-[0px_20px_60px_0px_rgba(10,26,51,0.28)] flex flex-col md:flex-row overflow-hidden animate-in fade-in duration-150">
        {/* ========================================================= */}
        {/* Left (Desktop) / Top (Mobile): Water Gauge Illustration  */}
        {/* ========================================================= */}
        <div className="relative shrink-0 w-full h-[180px] md:w-[440px] md:h-full bg-primary-700 overflow-hidden text-text-on-primary">
          {/* Animated Water Level */}
          <div
            className="absolute inset-x-0 bottom-0 bg-primary-500 transition-all duration-500 ease-out"
            style={{
              height: `${currentStep.waterPercentage}%`,
            }}
          >
            {/* Water Line Top Highlight */}
            <div className="h-[3px] w-full bg-primary-100" />
          </div>

          {/* Water Gauge Marks on the Right */}
          <div
            className="absolute right-0 top-0 bottom-0 w-24 pointer-events-none select-none"
            aria-hidden="true"
          >
            {/* Desktop Gauge Marks */}
            <div className="hidden md:block absolute inset-0">
              {[
                { mark: "3.5", y: 54, tickY: 62 },
                { mark: "3.0", y: 124, tickY: 132 },
                { mark: "2.5", y: 194, tickY: 202 },
                { mark: "2.0", y: 264, tickY: 272 },
                { mark: "1.5", y: 334, tickY: 342 },
                { mark: "1.0", y: 404, tickY: 412 },
                { mark: "0.5", y: 474, tickY: 482 },
              ].map(({ mark, y, tickY }) => {
                // Ticks at or below the water level highlight with full opacity
                const isUnder =
                  560 - tickY <= (currentStep.waterPercentage / 100) * 560;
                return (
                  <div key={mark}>
                    <span
                      className={`absolute right-14 font-sans text-[13px] leading-none transition-opacity duration-500 ${
                        isUnder
                          ? "text-primary-100 opacity-100 font-medium"
                          : "text-primary-100 opacity-60"
                      }`}
                      style={{ top: `${y}px` }}
                    >
                      {mark}
                    </span>
                    <div
                      className={`absolute right-0 w-[30px] h-[2px] transition-opacity duration-500 ${
                        isUnder
                          ? "bg-primary-100 opacity-100"
                          : "bg-primary-100 opacity-55"
                      }`}
                      style={{ top: `${tickY}px` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Mobile Gauge Marks */}
            <div className="block md:hidden absolute inset-0">
              {[
                { mark: "1.5", y: 34, tickY: 42 },
                { mark: "1.0", y: 84, tickY: 92 },
                { mark: "0.5", y: 134, tickY: 142 },
              ].map(({ mark, y, tickY }) => {
                const isUnder =
                  180 - tickY <= (currentStep.waterPercentage / 100) * 180;
                return (
                  <div key={mark}>
                    <span
                      className={`absolute right-10 font-sans text-[11px] leading-none transition-opacity duration-500 ${
                        isUnder
                          ? "text-primary-100 opacity-100 font-medium"
                          : "text-primary-100 opacity-60"
                      }`}
                      style={{ top: `${y}px` }}
                    >
                      {mark}
                    </span>
                    <div
                      className={`absolute right-0 w-[22px] h-[2px] transition-opacity duration-500 ${
                        isUnder
                          ? "bg-primary-100 opacity-100"
                          : "bg-primary-100 opacity-55"
                      }`}
                      style={{ top: `${tickY}px` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Big Step Number and Label */}
          <div className="absolute left-6 md:left-10 top-5 md:top-10 select-none">
            <span
              data-testid="onboarding-step-number"
              className="font-mono font-bold text-6xl md:text-[120px] leading-none tracking-tight block"
            >
              {currentStep.stepNumberText}
            </span>
            <span className="font-sans text-sm md:text-base font-medium opacity-80 mt-1 md:mt-2 block">
              จาก 04
            </span>
          </div>

          {/* Icon Badge */}
          <div className="absolute left-32 md:left-10 top-7 md:bottom-14 md:top-auto w-12 h-12 md:w-[72px] md:h-[72px] bg-bg-surface rounded-xl md:rounded-[14px] flex items-center justify-center shadow-md select-none transition-transform duration-300">
            <Image
              src={currentStep.iconSrc}
              alt={currentStep.iconAlt}
              width={36}
              height={36}
              className="w-6 h-6 md:w-9 md:h-9"
              priority
            />
          </div>

          {/* Mobile Close Button (Top-Right on Mobile Header) */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="ปิดวิธีใช้งาน"
            data-testid="onboarding-close"
            className="md:hidden absolute right-4 top-4 w-10 h-10 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white transition-colors"
          >
            <Image
              src="/brand/icon-x.svg"
              alt="ปิด"
              width={20}
              height={20}
              className="w-5 h-5 invert brightness-200"
            />
          </button>
        </div>

        {/* ========================================================= */}
        {/* Right (Desktop) / Bottom (Mobile): Content & Controls     */}
        {/* ========================================================= */}
        <div className="relative flex-1 p-6 md:p-14 h-[410px] md:h-full bg-bg-surface overflow-hidden">
          {/* Top Bar on Desktop */}
          <div className="hidden md:flex items-center justify-between shrink-0 h-11">
            <span className="font-sans text-base font-medium text-primary-700">
              วิธีใช้งาน
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="ปิดวิธีใช้งาน"
              data-testid="onboarding-close"
              className="w-11 h-11 rounded-full bg-bg-page hover:bg-primary-50 flex items-center justify-center text-text-primary transition-colors cursor-pointer"
            >
              <Image
                src="/brand/icon-x.svg"
                alt="ปิด"
                width={22}
                height={22}
                className="w-5 h-5"
              />
            </button>
          </div>

          {/* Main Body (Slot with identical height across all steps) */}
          <div className="mt-2 md:mt-6 h-[220px] md:h-[260px] overflow-hidden flex flex-col justify-start">
            <h2
              id="onboarding-title"
              className="font-heading font-bold text-2xl md:text-[40px] leading-[1.2] text-text-primary tracking-tight"
            >
              {currentStep.title}
            </h2>

            <p className="mt-2.5 md:mt-4 font-sans text-base md:text-xl leading-[1.6] text-text-secondary">
              {currentStep.description}
            </p>

            {/* Step-specific visual badges/pills with fixed vertical slot */}
            <div className="mt-3 md:mt-5 h-[38px] md:h-[46px] flex items-center shrink-0">
              {currentStep.type === "welcome" && (
                <div className="inline-flex items-center gap-2 text-green-700">
                  <Image
                    src="/brand/icon-check.svg"
                    alt="ยืนยัน"
                    width={22}
                    height={22}
                    className="w-5 h-5"
                  />
                  <span className="font-sans font-semibold text-sm md:text-lg">
                    ไม่ต้องสมัครสมาชิก ไม่ต้องติดตั้งแอป
                  </span>
                </div>
              )}

              {currentStep.type === "urgency" && (
                <div className="flex items-center gap-2 md:gap-2.5">
                  <div className="inline-flex items-center gap-1.5 md:gap-2 px-3 py-1.5 rounded-full bg-bg-page text-xs md:text-base font-medium text-text-primary">
                    <Image
                      src="/brand/urgency-red.svg"
                      alt="สีแดง"
                      width={16}
                      height={16}
                      className="w-3.5 h-3.5 md:w-4 md:h-4"
                    />
                    <span>วิกฤต</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 md:gap-2 px-3 py-1.5 rounded-full bg-bg-page text-xs md:text-base font-medium text-text-primary">
                    <Image
                      src="/brand/urgency-yellow.svg"
                      alt="สีเหลือง"
                      width={16}
                      height={16}
                      className="w-3.5 h-3.5 md:w-4 md:h-4"
                    />
                    <span>เร่งด่วน</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 md:gap-2 px-3 py-1.5 rounded-full bg-bg-page text-xs md:text-base font-medium text-text-primary">
                    <Image
                      src="/brand/urgency-green.svg"
                      alt="สีเขียว"
                      width={16}
                      height={16}
                      className="w-3.5 h-3.5 md:w-4 md:h-4"
                    />
                    <span>ทั่วไป</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Controls (Pinned at bottom, mathematically identical across all steps) */}
          <div className="absolute bottom-6 md:bottom-14 left-6 md:left-14 right-6 md:right-14 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 select-none">
            {/* Dots */}
            <div
              className="flex items-center gap-2 select-none h-3"
              aria-label={`ขั้นที่ ${currentStep.step} จาก 4`}
            >
              {ONBOARDING_STEPS.map((s, idx) => {
                const isActive = idx === currentStepIndex;
                return (
                  <div
                    key={s.step}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      isActive
                        ? "w-7 bg-primary-600"
                        : "w-2.5 bg-primary-100"
                    }`}
                  />
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 md:flex items-center gap-3 w-full md:w-auto h-[52px]">
              {isFirstStep ? (
                <>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    data-testid="onboarding-skip"
                    className="box-border h-[52px] px-6 md:px-8 rounded-full border border-transparent font-heading font-semibold text-base md:text-lg text-primary-700 hover:bg-primary-50 transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ข้าม
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    data-testid="onboarding-next"
                    className="box-border h-[52px] px-6 md:px-8 rounded-full border border-transparent bg-primary-600 hover:bg-primary-700 text-text-on-primary font-heading font-semibold text-base md:text-lg shadow-sm transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ถัดไป
                  </button>
                </>
              ) : isLastStep ? (
                <>
                  <button
                    type="button"
                    onClick={handleBack}
                    data-testid="onboarding-back"
                    className="box-border h-[52px] px-6 md:px-8 rounded-full border border-border-strong text-text-primary hover:bg-bg-page font-heading font-semibold text-base md:text-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    data-testid="onboarding-start"
                    className="box-border h-[52px] px-6 md:px-8 rounded-full border border-transparent bg-primary-600 hover:bg-primary-700 text-text-on-primary font-heading font-semibold text-base md:text-lg shadow-sm transition-colors flex items-center justify-center cursor-pointer"
                  >
                    เริ่มใช้งาน
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleBack}
                    data-testid="onboarding-back"
                    className="box-border h-[52px] px-6 md:px-8 rounded-full border border-border-strong text-text-primary hover:bg-bg-page font-heading font-semibold text-base md:text-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    data-testid="onboarding-next"
                    className="box-border h-[52px] px-6 md:px-8 rounded-full border border-transparent bg-primary-600 hover:bg-primary-700 text-text-on-primary font-heading font-semibold text-base md:text-lg shadow-sm transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ถัดไป
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
