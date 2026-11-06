import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type LocatedArea } from "../../../lib/domain";
import {
  GPS_LOW_ACCURACY_THRESHOLD_M,
  applyGpsPositionToDraft,
  applyLocatedAreaToDraft,
  applyManualPinToDraft,
  createInitialSosDraft,
  getGpsStatusMessage,
  isLowGpsAccuracy,
  loadSosDraft,
  saveSosDraft,
  validateStep2Draft,
} from "../draft-storage";

function createMemoryStorage() {
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

describe("TF-09: ฟอร์ม SOS ขั้น 2 พิกัดและที่อยู่", () => {
  it("เกณฑ์ข้อ 1: กดดึง GPS แล้วหมุดไปอยู่ตำแหน่งปัจจุบัน และเติมจังหวัด/อำเภอ/ตำบลอัตโนมัติได้", () => {
    const initial = {
      ...createInitialSosDraft(),
      currentStep: 2 as const,
      dangerSigns: [],
      canSelfEvacuate: false,
    };

    // จำลองการกดปุ่มดึง GPS ได้พิกัดวัดไร่ขิง อ.สามพราน จ.นครปฐม (ความแม่นยำ ±12 เมตร)
    const afterGps = applyGpsPositionToDraft(initial, {
      latitude: 13.7367174,
      longitude: 100.2845123,
      accuracy: 12.4,
    });

    expect(afterGps.lat).toBe(13.736717);
    expect(afterGps.lng).toBe(100.284512);
    expect(afterGps.accuracyM).toBe(12);

    const banner = getGpsStatusMessage({
      lat: afterGps.lat,
      lng: afterGps.lng,
      accuracyM: afterGps.accuracyM,
    });
    expect(banner?.tone).toBe("success");
    expect(banner?.desktopText).toContain("ได้ตำแหน่งแล้ว");
    expect(banner?.desktopText).toContain("±12 เมตร");
    expect(banner?.mobileText).toBe("ได้ตำแหน่งแล้ว (แม่นยำ ±12 ม.)");

    // จำลองการเติมจังหวัด/อำเภอ/ตำบลอัตโนมัติจาก API /api/geo/reverse (TF-05)
    const mockArea: LocatedArea = {
      province: { code: 73, nameTh: "นครปฐม" },
      district: { code: 7306, nameTh: "สามพราน" },
      subdistrict: { code: 730607, nameTh: "ไร่ขิง" },
      distanceM: 0,
    };
    const afterReverse = applyLocatedAreaToDraft(afterGps, mockArea);

    expect(afterReverse.provinceCode).toBe("73");
    expect(afterReverse.province).toBe("นครปฐม");
    expect(afterReverse.districtCode).toBe("7306");
    expect(afterReverse.district).toBe("สามพราน");
    expect(afterReverse.subdistrictCode).toBe("730607");
    expect(afterReverse.subdistrict).toBe("ไร่ขิง");
  });

  it("เกณฑ์ข้อ 2: ความแม่นยำเกิน 100 ม. มีข้อความเตือนให้ปักหมุดเพิ่มบนแผนที่", () => {
    expect(GPS_LOW_ACCURACY_THRESHOLD_M).toBe(100);
    expect(isLowGpsAccuracy(12)).toBe(false);
    expect(isLowGpsAccuracy(100)).toBe(false);
    expect(isLowGpsAccuracy(101)).toBe(true);
    expect(isLowGpsAccuracy(240)).toBe(true);

    const draftWithLowAccuracy = applyGpsPositionToDraft(createInitialSosDraft(), {
      latitude: 14.3532,
      longitude: 100.5689,
      accuracy: 185,
    });

    const banner = getGpsStatusMessage({
      lat: draftWithLowAccuracy.lat,
      lng: draftWithLowAccuracy.lng,
      accuracyM: draftWithLowAccuracy.accuracyM,
    });

    expect(banner).not.toBeNull();
    expect(banner?.tone).toBe("warning");
    expect(banner?.desktopText).toContain("185");
    expect(banner?.desktopText).toContain("เกิน 100 ม.");
    expect(banner?.desktopText).toContain("ปักหมุดเพิ่ม");
    expect(banner?.mobileText).toContain("เกิน 100 ม.");
    expect(banner?.mobileText).toContain("ปักหมุดเพิ่ม");
  });

  it("เกณฑ์ข้อ 3: ไม่อนุญาต GPS ยังปักหมุดเองบนแผนที่ได้ และกรอกจุดสังเกตเพื่อไปขั้นถัดไปได้", () => {
    // เมื่อผู้ใช้กดไม่อนุญาต GPS (PERMISSION_DENIED) จะแสดงข้อความแจ้งว่าปักหมุดเองได้
    const deniedBanner = getGpsStatusMessage({
      lat: undefined,
      lng: undefined,
      gpsError: "PERMISSION_DENIED",
    });
    expect(deniedBanner?.tone).toBe("warning");
    expect(deniedBanner?.desktopText).toContain("ไม่ได้รับอนุญาตให้ใช้ GPS");
    expect(deniedBanner?.desktopText).toContain("ปักหมุดตำแหน่งเองได้");
    expect(deniedBanner?.mobileText).toContain("ไม่อนุญาต GPS");

    // ผู้ใช้แตะหรือลากหมุดปักเองบนแผนที่ MapLibre
    const initial = {
      ...createInitialSosDraft(),
      currentStep: 2 as const,
      dangerSigns: [],
      canSelfEvacuate: false,
    };
    const pinnedDraft = applyManualPinToDraft(initial, {
      lat: 14.353219,
      lng: 100.568912,
    });

    expect(pinnedDraft.lat).toBe(14.353219);
    expect(pinnedDraft.lng).toBe(100.568912);
    expect(pinnedDraft.accuracyM).toBeUndefined();

    // หลังปักหมุดเอง แถบสถานะเปลี่ยนเป็นสีเขียวยืนยันว่าปักหมุดแล้ว
    const pinnedBanner = getGpsStatusMessage({
      lat: pinnedDraft.lat,
      lng: pinnedDraft.lng,
      accuracyM: pinnedDraft.accuracyM,
      gpsError: null,
    });
    expect(pinnedBanner?.tone).toBe("success");
    expect(pinnedBanner?.desktopText).toContain("ปักหมุดตำแหน่งแล้ว");

    // ถ้ายังไม่กรอกจุดสังเกต (บังคับ) จะยังไม่ผ่านการตรวจสอบขั้นที่ 2
    const missingLandmarkCheck = validateStep2Draft(pinnedDraft);
    expect(missingLandmarkCheck.valid).toBe(false);
    expect(missingLandmarkCheck.errors.location).toBeUndefined();
    expect(missingLandmarkCheck.errors.landmark).toBeDefined();
    expect(missingLandmarkCheck.errors.missingSummary).toEqual(["จุดสังเกต"]);

    // เมื่อกรอกจุดสังเกตแล้ว ผ่านการตรวจสอบขั้นที่ 2 ทันทีแม้ไม่ได้เปิด GPS
    const completedStep2 = {
      ...pinnedDraft,
      landmark: "บ้านหลังคาสีแดง 2 ชั้น ตรงข้ามวัดใหม่",
    };
    const validCheck = validateStep2Draft(completedStep2);
    expect(validCheck.valid).toBe(true);
    expect(validCheck.errors.missingSummary).toEqual([]);

    // บันทึกลง localStorage แล้วโหลดใหม่ ค่าพิกัดและจุดสังเกตยังอยู่ครบ
    const storage = createMemoryStorage();
    saveSosDraft(completedStep2, storage);
    const restored = loadSosDraft(storage);
    expect(restored.lat).toBe(14.353219);
    expect(restored.lng).toBe(100.568912);
    expect(restored.landmark).toBe("บ้านหลังคาสีแดง 2 ชั้น ตรงข้ามวัดใหม่");
  });

  it("เกณฑ์ข้อ 4: แผนที่ MapLibre โหลดเฉพาะตอนเปิดขั้นที่ 2 เท่านั้น (lazy load ด้วย next/dynamic ssr: false)", () => {
    const componentsDir = resolve(__dirname, "../components");
    const step1Source = readFileSync(
      resolve(componentsDir, "Step1Situation.tsx"),
      "utf8",
    );
    const wizardSource = readFileSync(
      resolve(componentsDir, "SosWizard.tsx"),
      "utf8",
    );
    const step2Source = readFileSync(
      resolve(componentsDir, "Step2Location.tsx"),
      "utf8",
    );
    const mapSource = readFileSync(
      resolve(componentsDir, "Step2LocationMap.tsx"),
      "utf8",
    );

    // ขั้นที่ 1 และ SosWizard ต้องไม่ import maplibre-gl หรือ Step2LocationMap โดยตรง
    expect(step1Source).not.toContain("maplibre-gl");
    expect(step1Source).not.toContain("Step2LocationMap");
    expect(wizardSource).not.toContain("maplibre-gl");
    expect(wizardSource).not.toContain("Step2LocationMap");

    // SosWizard แสดง Step2Location เฉพาะเมื่อ draft.currentStep === 2
    expect(wizardSource).toContain("draft.currentStep === 2");
    expect(wizardSource).toContain("<Step2Location");

    // Step2Location โหลด Step2LocationMap แบบ dynamic import พร้อม ssr: false
    expect(step2Source).toContain('dynamic(() => import("./Step2LocationMap")');
    expect(step2Source).toContain("ssr: false");

    // Step2LocationMap โหลดไลบรารี maplibre-gl แบบ dynamic import ในฝั่งเบราว์เซอร์
    expect(mapSource).toContain('await import("maplibre-gl")');
  });
});
