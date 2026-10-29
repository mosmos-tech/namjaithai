import {
  step1Schema,
  Urgency,
  WaterLevel,
  type Need,
} from "../../lib/domain";

export const SOS_DRAFT_STORAGE_KEY = "namjaithai-sos-draft-v1";

export type SosStepNumber = 1 | 2 | 3 | 4 | 5;

export interface SosStepDefinition {
  step: SosStepNumber;
  title: string;
  shortLabel: string;
  description: string;
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
  // ขั้นที่ 5: ข้อมูลติดต่อ (TF-11)
  name: string;
  phone: string;
  lineId: string;
  notes: string;
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

    const urgency =
      typeof parsed.urgency === "string" && validUrgencies.includes(parsed.urgency)
        ? (parsed.urgency as Urgency)
        : undefined;

    const waterLevel =
      typeof parsed.waterLevel === "string" && validWaterLevels.includes(parsed.waterLevel)
        ? (parsed.waterLevel as WaterLevel)
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
