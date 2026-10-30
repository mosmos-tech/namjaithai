import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  Urgency,
  WaterLevel,
  Need,
} from "../../lib/domain";
import { MAX_PHOTO_BYTES, MAX_SOS_PHOTOS } from "./image-compression";

export const SOS_DRAFT_STORAGE_KEY = "namjaithai-sos-draft-v1";

export type SosStepNumber = 1 | 2 | 3 | 4 | 5;

export interface SosStepDefinition {
  step: SosStepNumber;
  title: string;
  shortLabel: string;
  description: string;
}

/**
 * ข้อมูลรูปถ่ายที่ผ่านการบีบอัด (<= 500 KB) และแนบไว้ในร่างฟอร์มขั้นที่ 5
 */
export interface SosDraftPhoto {
  id: string;
  name: string;
  mimeType: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  dataUrl: string;
}

/**
 * โครงฟอร์ม SOS ทั้ง 5 ขั้น ตามกติกาโดเมนใน CLAUDE.md และ docs/backlog.md
 */
export const SOS_STEPS: readonly SosStepDefinition[] = [
  {
    step: 1,
    title: "ความเร่งด่วนและระดับน้ำ",
    shortLabel: "ความเร่งด่วน",
    description: "เลือกสีความเร่งด่วนและระดับน้ำปัจจุบันเพื่อให้ทีมกู้ภัยจัดลำดับความช่วยเหลือ",
  },
  {
    step: 2,
    title: "ตำแหน่งที่เกิดเหตุ",
    shortLabel: "ตำแหน่ง",
    description: "ระบุพิกัด GPS หรือปักหมุดบนแผนที่ พร้อมจุดสังเกตที่มองเห็นได้ชัดเจน",
  },
  {
    step: 3,
    title: "จำนวนผู้ติดค้าง",
    shortLabel: "ผู้ติดค้าง",
    description: "ระบุจำนวนผู้ใหญ่ ผู้สูงอายุ ผู้ป่วยติดเตียง เด็กเล็ก และสัตว์เลี้ยง",
  },
  {
    step: 4,
    title: "สิ่งที่ต้องการความช่วยเหลือ",
    shortLabel: "สิ่งที่ต้องการ",
    description: "เลือกสิ่งที่ต้องการเร่งด่วน เช่น เรืออพยพ น้ำดื่ม อาหาร หรือยารักษาโรค",
  },
  {
    step: 5,
    title: "ข้อมูลติดต่อผู้แจ้ง",
    shortLabel: "ข้อมูลติดต่อ",
    description: "ระบุชื่อและเบอร์โทรศัพท์เพื่อให้ทีมกู้ภัยติดต่อกลับเมื่อรับเคสแล้ว",
  },
] as const;

/**
 * ข้อมูลร่างฟอร์ม SOS ที่บันทึกไว้ในเครื่อง (localStorage) ทุกครั้งที่ผู้ใช้กรอก
 * รองรับทั้ง 5 ขั้น เพื่อให้การ์ด TF-09 และ TF-11 ใช้ต่อได้ทันที
 */
export interface SosDraft {
  currentStep: SosStepNumber;
  // ขั้นที่ 1: ความเร่งด่วนและระดับน้ำ
  urgency?: Urgency;
  waterLevel?: WaterLevel;
  // ขั้นที่ 2: ตำแหน่ง (TF-09)
  lat?: number;
  lng?: number;
  accuracyM?: number;
  provinceCode?: string;
  districtCode?: string;
  subdistrictCode?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  landmark: string;
  // ขั้นที่ 3: ผู้ติดค้าง (TF-11)
  adults: number;
  elderly: number;
  bedridden: number;
  children: number;
  pets: number;
  // ขั้นที่ 4: สิ่งที่ต้องการ (TF-11)
  needs: Need[];
  otherDetail: string;
  // ขั้นที่ 5: ข้อมูลติดต่อและรูปถ่าย (TF-11)
  name: string;
  phone: string;
  lineId: string;
  notes: string;
  photos: SosDraftPhoto[];
  // คีย์กันส่งซ้ำประจำร่างนี้ (ใช้ซ้ำถ้ากดส่งซ้ำหรือลองส่งใหม่ และถูกล้างเมื่อส่งสำเร็จ)
  idempotencyKey?: string;
  // เวลาที่บันทึกร่างล่าสุด (ISO string)
  updatedAt?: string;
}

export function createInitialSosDraft(): SosDraft {
  return {
    currentStep: 1,
    urgency: undefined,
    waterLevel: undefined,
    landmark: "",
    adults: 1,
    elderly: 0,
    bedridden: 0,
    children: 0,
    pets: 0,
    needs: [],
    otherDetail: "",
    name: "",
    phone: "",
    lineId: "",
    notes: "",
    photos: [],
  };
}

export interface Step1ValidationErrors {
  urgency?: string;
  waterLevel?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 1 ด้วย step1Schema จาก src/lib/domain
 * ถ้ายังไม่เลือกช่องไหน จะคืนข้อความภาษาไทยบอกว่าขาดอะไรอย่างชัดเจน
 */
export function validateStep1Draft(draft: Pick<SosDraft, "urgency" | "waterLevel">): {
  valid: boolean;
  errors: Step1ValidationErrors;
} {
  const result = step1Schema.safeParse({
    urgency: draft.urgency,
    waterLevel: draft.waterLevel,
  });

  if (result.success) {
    return {
      valid: true,
      errors: { missingSummary: [] },
    };
  }

  const errors: Step1ValidationErrors = {
    missingSummary: [],
  };

  const validUrgencies = Object.values(Urgency) as string[];
  const validWaterLevels = Object.values(WaterLevel) as string[];

  if (!draft.urgency || !validUrgencies.includes(draft.urgency)) {
    errors.urgency = "กรุณาเลือกระดับความเร่งด่วน (วิกฤต / เร่งด่วน / ทั่วไป)";
    errors.missingSummary.push("ระดับความเร่งด่วน");
  }

  if (!draft.waterLevel || !validWaterLevels.includes(draft.waterLevel)) {
    errors.waterLevel = "กรุณาเลือกระดับน้ำปัจจุบัน";
    errors.missingSummary.push("ระดับน้ำปัจจุบัน");
  }

  return {
    valid: false,
    errors,
  };
}

export interface Step2ValidationErrors {
  location?: string;
  landmark?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 2 (พิกัดตำแหน่งและจุดสังเกต) ด้วย step2Schema จาก src/lib/domain
 * ป้องกันการกดส่งในขั้นที่ 5 โดยยังไม่มีพิกัดหรือจุดสังเกต
 */
export function validateStep2Draft(
  draft: Pick<
    SosDraft,
    "lat" | "lng" | "accuracyM" | "province" | "district" | "subdistrict" | "landmark"
  >,
): {
  valid: boolean;
  errors: Step2ValidationErrors;
} {
  const result = step2Schema.safeParse({
    lat: draft.lat,
    lng: draft.lng,
    accuracyM: draft.accuracyM,
    province: draft.province,
    district: draft.district,
    subdistrict: draft.subdistrict,
    landmark: draft.landmark,
  });

  if (result.success) {
    return {
      valid: true,
      errors: { missingSummary: [] },
    };
  }

  const errors: Step2ValidationErrors = {
    missingSummary: [],
  };

  const hasCoordError = result.error.issues.some(
    (issue) => issue.path[0] === "lat" || issue.path[0] === "lng",
  );
  if (typeof draft.lat !== "number" || typeof draft.lng !== "number" || hasCoordError) {
    errors.location = "กรุณาระบุตำแหน่งที่เกิดเหตุในขั้นที่ 2";
    errors.missingSummary.push("ตำแหน่งที่เกิดเหตุ (ขั้นที่ 2)");
  }

  const trimmedLandmark = draft.landmark?.trim() ?? "";
  if (trimmedLandmark.length === 0) {
    errors.landmark = "กรุณาระบุจุดสังเกตในขั้นที่ 2";
    errors.missingSummary.push("จุดสังเกต (ขั้นที่ 2)");
  }

  return {
    valid: false,
    errors,
  };
}

export interface Step3ValidationErrors {
  totalPeople?: string;
  missingSummary: string[];
}

/**
 * คำนวณจำนวนคนรวม (ไม่นับสัตว์เลี้ยง)
 */
export function getTotalPeopleCount(
  draft: Pick<SosDraft, "adults" | "elderly" | "bedridden" | "children">,
): number {
  return (
    Math.max(0, draft.adults) +
    Math.max(0, draft.elderly) +
    Math.max(0, draft.bedridden) +
    Math.max(0, draft.children)
  );
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 3 (ผู้ติดค้าง) ด้วย step3Schema จาก src/lib/domain
 * เกณฑ์ผ่าน: จำนวนคนรวม (ผู้ใหญ่ + ผู้สูงอายุ + ผู้ป่วยติดเตียง + เด็กเล็ก) ต้องมีอย่างน้อย 1 คน
 */
export function validateStep3Draft(
  draft: Pick<SosDraft, "adults" | "elderly" | "bedridden" | "children" | "pets">,
): {
  valid: boolean;
  totalPeople: number;
  errors: Step3ValidationErrors;
} {
  const totalPeople = getTotalPeopleCount(draft);
  const result = step3Schema.safeParse({
    adults: draft.adults,
    elderly: draft.elderly,
    bedridden: draft.bedridden,
    children: draft.children,
    pets: draft.pets,
  });

  if (result.success) {
    return {
      valid: true,
      totalPeople,
      errors: { missingSummary: [] },
    };
  }

  return {
    valid: false,
    totalPeople,
    errors: {
      totalPeople: "ต้องมีผู้ติดค้างอย่างน้อย 1 คน (ไม่นับรวมสัตว์เลี้ยง)",
      missingSummary: ["จำนวนผู้ติดค้างอย่างน้อย 1 คน"],
    },
  };
}

export interface Step4ValidationErrors {
  otherDetail?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 4 (สิ่งที่ต้องการ) ด้วย step4Schema จาก src/lib/domain
 * เกณฑ์ผ่าน: เมื่อเลือก "อื่นๆ (พิมพ์เอง)" ต้องพิมพ์รายละเอียด (1–200 ตัวอักษร) ก่อนไปขั้นถัดไป
 */
export function validateStep4Draft(
  draft: Pick<SosDraft, "needs" | "otherDetail">,
): {
  valid: boolean;
  errors: Step4ValidationErrors;
} {
  const trimmedOther = draft.otherDetail?.trim() ?? "";

  if (draft.needs.includes(Need.OTHER)) {
    if (trimmedOther.length === 0) {
      return {
        valid: false,
        errors: {
          otherDetail: "กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ ก่อนไปขั้นถัดไป",
          missingSummary: ["รายละเอียดสิ่งที่ต้องการอื่นๆ"],
        },
      };
    }

    if (draft.otherDetail.length > 200) {
      return {
        valid: false,
        errors: {
          otherDetail: "รายละเอียดสิ่งที่ต้องการอื่นๆ ต้องไม่เกิน 200 ตัวอักษร",
          missingSummary: ["รายละเอียดสิ่งที่ต้องการอื่นๆ ไม่เกิน 200 ตัวอักษร"],
        },
      };
    }
  }

  const result = step4Schema.safeParse({
    needs: draft.needs,
    otherDetail: draft.needs.includes(Need.OTHER) ? draft.otherDetail : undefined,
  });

  if (result.success) {
    return {
      valid: true,
      errors: { missingSummary: [] },
    };
  }

  return {
    valid: false,
    errors: {
      otherDetail: "กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ ก่อนไปขั้นถัดไป",
      missingSummary: ["รายละเอียดสิ่งที่ต้องการอื่นๆ"],
    },
  };
}

export interface Step5ValidationErrors {
  name?: string;
  phone?: string;
  notes?: string;
  photos?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 5 (ข้อมูลติดต่อและรูปแนบ) ด้วย step5Schema จาก src/lib/domain
 * เกณฑ์ผ่าน:
 * - ชื่อต้องไม่ว่างเปล่า
 * - เบอร์โทรตรวจรูปแบบเบอร์ไทย (มือถือ 06x-09x 10 หลัก หรือเบอร์บ้าน 02x-05x 9-10 หลัก)
 * - รูปถ่ายแนบได้ไม่เกิน 3 รูป และแต่ละรูปต้องถูกบีบอัดให้ไม่เกิน 500 KB
 */
export function validateStep5Draft(
  draft: Pick<SosDraft, "name" | "phone" | "lineId" | "notes"> & {
    photos?: readonly SosDraftPhoto[];
  },
): {
  valid: boolean;
  normalizedPhone?: string;
  errors: Step5ValidationErrors;
} {
  const errors: Step5ValidationErrors = {
    missingSummary: [],
  };

  const trimmedName = draft.name?.trim() ?? "";
  if (trimmedName.length === 0) {
    errors.name = "กรุณาระบุชื่อผู้แจ้งหรือผู้ติดต่อ";
    errors.missingSummary.push("ชื่อผู้แจ้ง");
  }

  const cleanedPhone = (draft.phone ?? "").replace(/[\s\-]/g, "");
  if (cleanedPhone.length === 0) {
    errors.phone = "กรุณาระบุเบอร์โทรศัพท์สำหรับติดต่อกลับ";
    errors.missingSummary.push("เบอร์โทรศัพท์");
  }

  if ((draft.notes ?? "").length > 500) {
    errors.notes = "รายละเอียดเพิ่มเติมต้องไม่เกิน 500 ตัวอักษร";
    errors.missingSummary.push("รายละเอียดเพิ่มเติมไม่เกิน 500 ตัวอักษร");
  }

  const parsed = step5Schema.safeParse({
    name: draft.name,
    phone: draft.phone,
    lineId: draft.lineId || undefined,
    notes: draft.notes || undefined,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "name" && !errors.name) {
        errors.name = issue.message;
        errors.missingSummary.push("ชื่อผู้แจ้ง");
      } else if (field === "phone" && !errors.phone) {
        errors.phone = issue.message;
        errors.missingSummary.push("เบอร์โทรศัพท์ไทยที่ถูกต้อง");
      } else if (field === "notes" && !errors.notes) {
        errors.notes = issue.message;
        errors.missingSummary.push("รายละเอียดเพิ่มเติม");
      }
    }
  }

  const photos = draft.photos ?? [];
  if (photos.length > MAX_SOS_PHOTOS) {
    errors.photos = `แนบรูปได้ไม่เกิน ${MAX_SOS_PHOTOS} รูป`;
    errors.missingSummary.push(`รูปถ่ายไม่เกิน ${MAX_SOS_PHOTOS} รูป`);
  } else if (photos.some((p) => p.compressedBytes > MAX_PHOTO_BYTES)) {
    errors.photos = "มีรูปถ่ายที่ขนาดเกิน 500 KB กรุณาลบแล้วเลือกใหม่";
    errors.missingSummary.push("ขนาดรูปไม่เกิน 500 KB");
  }

  const valid =
    !errors.name && !errors.phone && !errors.notes && !errors.photos && parsed.success;

  return {
    valid,
    normalizedPhone: parsed.success ? parsed.data.phone : undefined,
    errors,
  };
}

function isValidStepNumber(value: unknown): value is SosStepNumber {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

const SERVER_INITIAL_DRAFT: SosDraft = Object.freeze(createInitialSosDraft());

let _cachedRaw: string | null = null;
let _cachedDraft: SosDraft = SERVER_INITIAL_DRAFT;
const _listeners = new Set<() => void>();

function notifyListeners(): void {
  _listeners.forEach((listener) => listener());
}

/**
 * โหลดข้อมูลร่างฟอร์ม SOS จาก localStorage
 * ถ้าไม่มีข้อมูลหรือ JSON เสีย จะคืนค่าเริ่มต้นที่ไม่พังหน้าเว็บ
 */
export function loadSosDraft(
  storage: Pick<Storage, "getItem"> | undefined = typeof window !== "undefined"
    ? window.localStorage
    : undefined,
): SosDraft {
  const initial = createInitialSosDraft();
  if (!storage) return initial;

  try {
    const raw = storage.getItem(SOS_DRAFT_STORAGE_KEY);
    if (!raw) return initial;

    const parsed = JSON.parse(raw) as Partial<SosDraft>;
    if (typeof parsed !== "object" || parsed === null) {
      return initial;
    }

    const validUrgencies = Object.values(Urgency) as string[];
    const validWaterLevels = Object.values(WaterLevel) as string[];
    const validNeeds = Object.values(Need) as string[];

    const urgency =
      typeof parsed.urgency === "string" && validUrgencies.includes(parsed.urgency)
        ? (parsed.urgency as Urgency)
        : undefined;

    const waterLevel =
      typeof parsed.waterLevel === "string" && validWaterLevels.includes(parsed.waterLevel)
        ? (parsed.waterLevel as WaterLevel)
        : undefined;

    const needs = Array.isArray(parsed.needs)
      ? parsed.needs.filter(
          (item): item is Need => typeof item === "string" && validNeeds.includes(item),
        )
      : initial.needs;

    const photos = Array.isArray(parsed.photos)
      ? parsed.photos.slice(0, MAX_SOS_PHOTOS)
      : initial.photos;

    const idempotencyKey =
      typeof parsed.idempotencyKey === "string" &&
      parsed.idempotencyKey.trim().length > 0
        ? parsed.idempotencyKey.trim()
        : undefined;

    // ถ้าเคยอยู่ขั้นถัดไปแต่ค่าขั้นที่ 1 ไม่ครบ ให้กลับมาเริ่มที่ขั้นที่ 1
    const rawStep = isValidStepNumber(parsed.currentStep) ? parsed.currentStep : 1;
    const currentStep: SosStepNumber =
      rawStep > 1 && (!urgency || !waterLevel) ? 1 : rawStep;

    return {
      ...initial,
      ...parsed,
      currentStep,
      urgency,
      waterLevel,
      needs,
      photos,
      idempotencyKey,
    };
  } catch {
    return initial;
  }
}

/**
 * บันทึกร่างฟอร์ม SOS ลง localStorage ทุกครั้งที่มีการเปลี่ยนแปลงค่า
 */
export function saveSosDraft(
  draft: SosDraft,
  storage: Pick<Storage, "setItem"> | undefined = typeof window !== "undefined"
    ? window.localStorage
    : undefined,
): void {
  if (!storage) return;

  try {
    const payload: SosDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    const raw = JSON.stringify(payload);
    storage.setItem(SOS_DRAFT_STORAGE_KEY, raw);

    if (typeof window !== "undefined" && storage === window.localStorage) {
      _cachedRaw = raw;
      _cachedDraft = payload;
      notifyListeners();
    }
  } catch {
    // กรณีเบราว์เซอร์โหมดส่วนตัวหรือพื้นที่เต็ม ให้ข้ามโดยไม่ทำให้หน้าเว็บค้าง
  }
}

/**
 * ล้างข้อมูลร่างออกจาก localStorage (ใช้เมื่อส่งคำขอสำเร็จหรือกดเริ่มใหม่)
 */
export function clearSosDraft(
  storage: Pick<Storage, "removeItem"> | undefined = typeof window !== "undefined"
    ? window.localStorage
    : undefined,
): void {
  if (!storage) return;

  try {
    storage.removeItem(SOS_DRAFT_STORAGE_KEY);
    if (typeof window !== "undefined" && storage === window.localStorage) {
      _cachedRaw = null;
      _cachedDraft = SERVER_INITIAL_DRAFT;
      notifyListeners();
    }
  } catch {
    // ข้ามกรณีไม่สามารถลบได้
  }
}

/**
 * Store functions สำหรับ useSyncExternalStore (เหมือนแพตเทิร์นใน SurvivalChecklist.tsx)
 * ป้องกัน hydration mismatch และไม่ต้องเรียก setState ใน useEffect
 */
export function getSosDraftSnapshot(): SosDraft {
  try {
    const raw = window.localStorage.getItem(SOS_DRAFT_STORAGE_KEY);
    if (raw !== _cachedRaw) {
      _cachedRaw = raw;
      _cachedDraft = raw ? loadSosDraft(window.localStorage) : SERVER_INITIAL_DRAFT;
    }
    return _cachedDraft;
  } catch {
    return _cachedDraft;
  }
}

export function getSosDraftServerSnapshot(): SosDraft {
  return SERVER_INITIAL_DRAFT;
}

export function subscribeSosDraft(listener: () => void): () => void {
  _listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    _listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * สร้างข้อความแสดงความคืบหน้า เช่น "ขั้นที่ 1 จาก 5"
 */
export function formatStepProgressText(step: SosStepNumber): string {
  return `ขั้นที่ ${step} จาก ${SOS_STEPS.length}`;
}

export type SubmitSosDraftResult =
  | { status: "duplicate_in_flight" }
  | {
      status: "invalid_step";
      step: 1;
      step1Errors: Step1ValidationErrors;
      error: string;
    }
  | {
      status: "invalid_step";
      step: 2;
      step2Errors: Step2ValidationErrors;
      error: string;
    }
  | {
      status: "invalid_step";
      step: 3;
      step3Errors: Step3ValidationErrors;
      error: string;
    }
  | {
      status: "invalid_step";
      step: 4;
      step4Errors: Step4ValidationErrors;
      error: string;
    }
  | {
      status: "invalid_step";
      step: 5;
      step5Errors: Step5ValidationErrors;
      error: string;
    }
  | {
      status: "api_error" | "network_error";
      error: string;
      idempotencyKey: string;
    }
  | {
      status: "submitted";
      caseCode: string;
      trackingToken?: string;
      idempotencyKey: string;
      successMessage: string;
    };

export interface SubmitSosDraftOptions {
  draft: SosDraft;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  inFlightRef?: { current: boolean };
  fetchImpl?: typeof fetch;
  generateIdempotencyKey?: () => string;
}

const _defaultInFlightRef = { current: false };

/**
 * ส่งคำขอความช่วยเหลือ SOS ไปยัง POST /api/cases:
 * 1. ป้องกันการกดส่งซ้ำขณะกำลังส่ง (inFlightRef lock) และผูก Idempotency-Key ประจำร่าง
 * 2. ตรวจความครบถ้วนทุกขั้น (รวมถึงพิกัดและจุดสังเกตในขั้นที่ 2 — ถ้าไม่มีตำแหน่งจะตอบ error ไม่ขึ้นกล่องสีเขียว)
 * 3. เมื่อส่งสำเร็จ (response.ok) จะล้างร่างออกจาก localStorage ทันทีด้วย clearSosDraft()
 */
export async function submitSosDraft(
  options: SubmitSosDraftOptions,
): Promise<SubmitSosDraftResult> {
  const inFlightRef = options.inFlightRef ?? _defaultInFlightRef;
  if (inFlightRef.current) {
    return { status: "duplicate_in_flight" };
  }

  inFlightRef.current = true;
  try {
    const {
      draft,
      storage = typeof window !== "undefined" ? window.localStorage : undefined,
      fetchImpl = fetch,
      generateIdempotencyKey = () => crypto.randomUUID(),
    } = options;

    const check5 = validateStep5Draft(draft);
    if (!check5.valid) {
      return {
        status: "invalid_step",
        step: 5,
        step5Errors: check5.errors,
        error: `ยังส่งคำขอไม่ได้ กรุณาตรวจสอบ: ${check5.errors.missingSummary.join(", ")}`,
      };
    }

    const check1 = validateStep1Draft(draft);
    if (!check1.valid || !draft.urgency || !draft.waterLevel) {
      return {
        status: "invalid_step",
        step: 1,
        step1Errors: check1.errors,
        error: "ยังส่งคำขอไม่ได้ กรุณาเลือกระดับความเร่งด่วนและระดับน้ำในขั้นที่ 1",
      };
    }

    const check3 = validateStep3Draft(draft);
    if (!check3.valid) {
      return {
        status: "invalid_step",
        step: 3,
        step3Errors: check3.errors,
        error: "ยังส่งคำขอไม่ได้ กรุณาระบุจำนวนผู้ติดค้างอย่างน้อย 1 คนในขั้นที่ 3",
      };
    }

    const check4 = validateStep4Draft(draft);
    if (!check4.valid) {
      return {
        status: "invalid_step",
        step: 4,
        step4Errors: check4.errors,
        error: "ยังส่งคำขอไม่ได้ กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ ในขั้นที่ 4",
      };
    }

    const check2 = validateStep2Draft(draft);
    if (!check2.valid || typeof draft.lat !== "number" || typeof draft.lng !== "number") {
      return {
        status: "invalid_step",
        step: 2,
        step2Errors: check2.errors,
        error: `ยังส่งคำขอไม่ได้ กรุณาระบุ${check2.errors.missingSummary.join("และ")}ก่อนส่งคำขอ`,
      };
    }

    const normalizedPhone =
      check5.normalizedPhone ?? draft.phone.replace(/[\s\-]/g, "");
    const idempotencyKey =
      draft.idempotencyKey && draft.idempotencyKey.trim().length > 0
        ? draft.idempotencyKey.trim()
        : generateIdempotencyKey();

    const nextDraft: SosDraft = {
      ...draft,
      name: draft.name.trim(),
      phone: normalizedPhone,
      landmark: draft.landmark.trim(),
      idempotencyKey,
    };

    saveSosDraft(nextDraft, storage);

    try {
      const response = await fetchImpl("/api/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          urgency: nextDraft.urgency,
          waterLevel: nextDraft.waterLevel,
          lat: nextDraft.lat,
          lng: nextDraft.lng,
          accuracyM: nextDraft.accuracyM,
          province: nextDraft.province,
          district: nextDraft.district,
          subdistrict: nextDraft.subdistrict,
          landmark: nextDraft.landmark,
          adults: nextDraft.adults,
          elderly: nextDraft.elderly,
          bedridden: nextDraft.bedridden,
          children: nextDraft.children,
          pets: nextDraft.pets,
          needs: nextDraft.needs,
          otherDetail: nextDraft.needs.includes(Need.OTHER)
            ? nextDraft.otherDetail
            : undefined,
          name: nextDraft.name,
          phone: nextDraft.phone,
          lineId: nextDraft.lineId || undefined,
          notes: nextDraft.notes || undefined,
        }),
      });

      const data = (await response.json()) as {
        caseCode?: string;
        trackingToken?: string;
        error?: string;
      };

      if (!response.ok) {
        return {
          status: "api_error",
          error:
            data.error ??
            "ไม่สามารถส่งคำขอได้ในขณะนี้ กรุณาลองใหม่อีกครั้งหรือโทรสายด่วน 1669 / 1784",
          idempotencyKey,
        };
      }

      // ส่งสำเร็จแล้วต้องล้างข้อมูลร่างในเครื่องทันทีเพื่อไม่ให้ค้างหรือส่งซ้ำ
      clearSosDraft(storage);

      const caseCode = data.caseCode ?? "";
      return {
        status: "submitted",
        caseCode,
        trackingToken: data.trackingToken,
        idempotencyKey,
        successMessage: `ส่งคำขอสำเร็จ รหัสเคสของคุณคือ ${caseCode}`,
      };
    } catch {
      return {
        status: "network_error",
        error: "ไม่สามารถเชื่อมต่อเครือข่ายได้ ระบบบันทึกข้อมูลร่างไว้ในเครื่องแล้ว",
        idempotencyKey,
      };
    }
  } finally {
    inFlightRef.current = false;
  }
}
