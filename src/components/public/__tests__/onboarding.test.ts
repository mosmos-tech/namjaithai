import { describe, it, expect, beforeEach } from "vitest";
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  resetOnboardingSeen,
  ONBOARDING_SEEN_STORAGE_KEY,
  ONBOARDING_STEPS,
  type StorageLike,
} from "../OnboardingPopup";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("TF-45: Onboarding Storage & Configuration", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("เริ่มต้นต้องคืนค่า false เมื่อยังไม่เคยเปิดเว็บ", () => {
    expect(hasSeenOnboarding(storage)).toBe(false);
  });

  it("markOnboardingSeen บันทึกลง localStorage และ hasSeenOnboarding คืนค่า true", () => {
    markOnboardingSeen(storage);
    expect(storage.getItem(ONBOARDING_SEEN_STORAGE_KEY)).toBe("true");
    expect(hasSeenOnboarding(storage)).toBe(true);
  });

  it("resetOnboardingSeen ล้างค่าออกจาก localStorage สำเร็จ", () => {
    markOnboardingSeen(storage);
    expect(hasSeenOnboarding(storage)).toBe(true);
    resetOnboardingSeen(storage);
    expect(hasSeenOnboarding(storage)).toBe(false);
  });

  it("มีครบ 4 ขั้นและระดับน้ำสูงขึ้นตามลำดับ", () => {
    expect(ONBOARDING_STEPS).toHaveLength(4);

    const stepNumbers = ONBOARDING_STEPS.map((s) => s.stepNumberText);
    expect(stepNumbers).toEqual(["01", "02", "03", "04"]);

    const waterLevels = ONBOARDING_STEPS.map((s) => s.waterPercentage);
    expect(waterLevels[0]).toBeLessThan(waterLevels[1]);
    expect(waterLevels[1]).toBeLessThan(waterLevels[2]);
    expect(waterLevels[2]).toBeLessThan(waterLevels[3]);

    expect(ONBOARDING_STEPS[0].title).toBe("ยินดีต้อนรับสู่ น้ำใจไทย SOS");
    expect(ONBOARDING_STEPS[1].title).toBe("ตอบคำถามสั้นๆ");
    expect(ONBOARDING_STEPS[2].title).toBe("ส่งตำแหน่งของคุณ");
    expect(ONBOARDING_STEPS[3].title).toBe("ติดตามความช่วยเหลือ");
  });
});
