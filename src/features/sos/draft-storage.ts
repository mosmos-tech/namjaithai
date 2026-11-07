import {
  latSchema,
  lngSchema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  WaterLevel,
  Need,
  IncidentType,
  INCIDENT_REGISTRY,
  UNIVERSAL_DANGER_SIGNS,
  LocationSource,
  INACCURATE_LOCATION_MESSAGE,
  ADDRESS_REQUIRED_FOR_INACCURATE_GPS_MESSAGE,
  accuracyForLocationSource,
  isInaccurateGps,
  isQuestionVisible,
  type LocatedArea,
  type IncidentDetailValue,
} from "../../lib/domain";
import { MAX_PHOTO_BYTES, MAX_SOS_PHOTOS } from "./image-compression";

export const SOS_DRAFT_STORAGE_KEY = "namjaithai-sos-draft-v1";

/**
 * เกณฑ์ความคลาดเคลื่อนของ GPS (เมตร): ถ้าเกิน 100 เมตร ต้องแจ้งให้ผู้ใช้ปักหมุดเพิ่มบนแผนที่ (TF-09)
 */
export const GPS_LOW_ACCURACY_THRESHOLD_M = 100;

/**
 * พิกัดเริ่มต้นของแผนที่เมื่อยังไม่ได้ดึง GPS (ใจกลางประเทศไทย/กรุงเทพฯ)
 * เพื่อให้ผู้ใช้ที่ไม่อนุญาต GPS ยังเลื่อนและแตะปักหมุดเองได้ทันที
 */
export const DEFAULT_THAILAND_CENTER = {
  lat: 13.7563,
  lng: 100.5018,
} as const;

export type GpsErrorCode = "PERMISSION_DENIED" | "POSITION_UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED";

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
    title: "สถานการณ์ตอนนี้",
    shortLabel: "สถานการณ์",
    // TF-55: ผู้แจ้งตอบคำถามสั้นๆ ระบบจัดลำดับความเร่งด่วนเอง (ผู้แจ้งไม่เห็นระดับ)
    description: "ตอบคำถามสั้นๆ เรื่องอันตรายและระดับน้ำ เพื่อให้ทีมกู้ภัยจัดลำดับความช่วยเหลือ",
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
  // ขั้นที่ 1: สถานการณ์ (TF-50, TF-55) — undefined = ยังไม่ได้ตอบ
  incidentType?: IncidentType;
  atScene?: boolean;
  dangerSigns?: string[];
  canSelfEvacuate?: boolean;
  waterLevel?: WaterLevel;
  // ขั้นที่ 2: ตำแหน่ง (TF-09)
  lat?: number;
  lng?: number;
  accuracyM?: number;
  // TF-65: ได้พิกัดมาจาก GPS / ปักเอง / ลิงก์ และผู้แจ้งเลือก "ปักหมุดไม่ได้ ส่งพร้อมที่อยู่แทน" หรือยัง
  locationSource?: LocationSource;
  addressFallback?: boolean;
  provinceCode?: string;
  districtCode?: string;
  subdistrictCode?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  addressLine?: string;
  gmapsUrl?: string;
  landmark: string;
  // ขั้นที่ 3: คำถามเฉพาะประเภทเหตุ (TF-51) และผู้ติดค้าง (TF-11)
  details?: Record<string, string | number | boolean | string[] | undefined>;
  adults: number;
  elderly: number;
  bedridden: number;
  children: number;
  pets: number;
  // TF-55: ใช้คำนวณระดับ (ข้อมูลสุขภาพ)
  hasDisabled: boolean;
  hasInjured: boolean;
  // ขั้นที่ 4: สิ่งที่ต้องการ (TF-11)
  needs: Need[];
  otherDetail: string;
  // ขั้นที่ 5: ข้อมูลติดต่อและรูปถ่าย (TF-11)
  name: string;
  phone: string;
  lineId: string;
  notes: string;
  photos: SosDraftPhoto[];
  consent: boolean;
  healthConsent: boolean;
  // คีย์กันส่งซ้ำประจำร่างนี้ (ใช้ซ้ำถ้ากดส่งซ้ำหรือลองส่งใหม่ และถูกล้างเมื่อส่งสำเร็จ)
  idempotencyKey?: string;
  // เวลาที่บันทึกร่างล่าสุด (ISO string)
  updatedAt?: string;
}

export function createInitialSosDraft(): SosDraft {
  return {
    currentStep: 1,
    incidentType: undefined,
    atScene: undefined,
    dangerSigns: undefined,
    canSelfEvacuate: undefined,
    waterLevel: undefined,
    addressLine: "",
    gmapsUrl: "",
    landmark: "",
    details: {},
    adults: 1,
    elderly: 0,
    bedridden: 0,
    children: 0,
    pets: 0,
    hasDisabled: false,
    hasInjured: false,
    needs: [],
    otherDetail: "",
    name: "",
    phone: "",
    lineId: "",
    notes: "",
    photos: [],
    consent: false,
    healthConsent: false,
  };
}

/**
 * อ่านพารามิเตอร์ ?type=FLOOD จาก URL query string เพื่อเลือกประเภทเหตุไว้ให้ล่วงหน้า (TF-50)
 */
export function parseIncidentTypeParam(
  search: string | null | undefined,
): IncidentType | undefined {
  if (!search) return undefined;
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    const rawType = params.get("type")?.trim().toUpperCase();
    if (rawType && (Object.values(IncidentType) as string[]).includes(rawType)) {
      return rawType as IncidentType;
    }
  } catch {
    // ข้ามกรณี query string รูปแบบไม่ถูกต้อง
  }
  return undefined;
}

export interface Step1ValidationErrors {
  incidentType?: string;
  atScene?: string;
  dangerSigns?: string;
  canSelfEvacuate?: string;
  waterLevel?: string;
  missingSummary: string[];
}

export interface Step2ValidationErrors {
  location?: string;
  landmark?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 1 ด้วย step1Schema จาก src/lib/domain
 * - ถ้าตอบว่าไม่ได้อยู่ที่จุดเกิดเหตุ (atScene === false) จะไม่ผ่านและไม่สร้างเคส (TF-50)
 * - ต้องตอบเรื่องสัญญาณอันตราย (ติ๊ก หรือกด "ไม่มี") และออกเองได้ไหม ระดับน้ำไม่บังคับ
 */
export function validateStep1Draft(
  draft: Pick<
    SosDraft,
    "incidentType" | "atScene" | "dangerSigns" | "canSelfEvacuate" | "waterLevel"
  >,
): {
  valid: boolean;
  errors: Step1ValidationErrors;
} {
  const result = step1Schema.safeParse({
    incidentType: draft.incidentType,
    atScene: draft.atScene,
    dangerSigns: draft.dangerSigns,
    canSelfEvacuate: draft.canSelfEvacuate,
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

  const validIncidentTypes = Object.values(IncidentType) as string[];
  const validWaterLevels = Object.values(WaterLevel) as string[];

  if (draft.atScene === false) {
    errors.atScene = "แจ้งแทนคนอื่นไม่ได้ กรุณาโทรสายด่วนฉุกเฉินแทน";
    errors.missingSummary.push("อยู่ที่จุดเกิดเหตุ");
  }

  if (draft.incidentType !== undefined && !validIncidentTypes.includes(draft.incidentType)) {
    errors.incidentType = "ไม่มีประเภทเหตุนี้";
    errors.missingSummary.push("ประเภทเหตุ");
  }

  if (!Array.isArray(draft.dangerSigns)) {
    errors.dangerSigns = 'กรุณาเลือกข้อที่ตรง หรือกด "ไม่มีข้อใดเลย"';
    errors.missingSummary.push("สัญญาณอันตราย");
  }

  if (typeof draft.canSelfEvacuate !== "boolean") {
    errors.canSelfEvacuate = "กรุณาตอบว่าออกจากที่นั่นเองได้ไหม";
    errors.missingSummary.push("ออกเองได้ไหม");
  }

  // ระดับน้ำไม่บังคับ ผิดได้แค่กรณีค่าไม่อยู่ในรายการ
  if (draft.waterLevel && !validWaterLevels.includes(draft.waterLevel)) {
    errors.waterLevel = "ไม่มีตัวเลือกระดับน้ำนี้";
    errors.missingSummary.push("ระดับน้ำ");
  }

  return {
    valid: false,
    errors,
  };
}

export interface Step2ValidationErrors {
  location?: string;
  addressLine?: string;
  landmark?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 2 (พิกัดและจุดสังเกต) ด้วย step2Schema จาก src/lib/domain
 * - พิกัด (lat, lng) ต้องอยู่ในขอบเขตประเทศไทย
 * - จุดสังเกต (landmark) บังคับต้องระบุเพื่อให้ทีมกู้ภัยสังเกตเห็นได้เมื่อป้ายบ้านจมน้ำ
 */
export function validateStep2Draft(
  draft: Pick<
    SosDraft,
    | "lat"
    | "lng"
    | "accuracyM"
    | "locationSource"
    | "addressFallback"
    | "addressLine"
    | "province"
    | "district"
    | "subdistrict"
    | "landmark"
  >,
): {
  valid: boolean;
  errors: Step2ValidationErrors;
} {
  const result = step2Schema.safeParse({
    lat: draft.lat,
    lng: draft.lng,
    accuracyM: draft.accuracyM,
    locationSource: draft.locationSource,
    addressLine: draft.addressLine,
    province: draft.province,
    district: draft.district,
    subdistrict: draft.subdistrict,
    landmark: draft.landmark,
  });

  // TF-65: GPS คลาดเคลื่อนเกิน 1000 ม. ไปต่อได้ 2 ทาง คือปักหมุดเอง/วางลิงก์ (accuracy ถูกล้าง)
  // หรือกด "ส่งพร้อมที่อยู่แทน" แล้วกรอกที่อยู่ — ไม่บล็อกการขอความช่วยเหลือ
  const inaccurateGps = isInaccurateGps(draft.accuracyM);
  const needsPinOrFallback = inaccurateGps && draft.addressFallback !== true;
  const needsAddress =
    inaccurateGps && draft.addressFallback === true && !draft.addressLine?.trim();

  if (result.success && !needsPinOrFallback && !needsAddress) {
    return {
      valid: true,
      errors: { missingSummary: [] },
    };
  }

  const errors: Step2ValidationErrors = {
    missingSummary: [],
  };

  if (typeof draft.lat !== "number" || typeof draft.lng !== "number") {
    errors.location = "กรุณาดึงพิกัด GPS หรือแตะปักหมุดตำแหน่งบนแผนที่";
    errors.missingSummary.push("พิกัดตำแหน่ง");
  } else if (needsPinOrFallback) {
    errors.location = INACCURATE_LOCATION_MESSAGE;
    errors.missingSummary.push("พิกัดตำแหน่ง");
  } else {
    const latCheck = latSchema.safeParse(draft.lat);
    const lngCheck = lngSchema.safeParse(draft.lng);
    if (!latCheck.success || !lngCheck.success) {
      errors.location =
        latCheck.error?.issues[0]?.message ??
        lngCheck.error?.issues[0]?.message ??
        "พิกัดอยู่นอกประเทศไทย";
      errors.missingSummary.push("พิกัดตำแหน่ง");
    }
  }

  if (needsAddress) {
    errors.addressLine = ADDRESS_REQUIRED_FOR_INACCURATE_GPS_MESSAGE;
    errors.missingSummary.push("ที่อยู่");
  }

  if (!draft.landmark || draft.landmark.trim().length === 0) {
    errors.landmark = "กรุณาระบุจุดสังเกต เช่น สีหลังคา จำนวนชั้น หรือสถานที่ใกล้เคียง";
    errors.missingSummary.push("จุดสังเกต");
  }

  return {
    valid: false,
    errors,
  };
}

/**
 * ตรวจว่าความคลาดเคลื่อนของ GPS เกิน 100 เมตรหรือไม่ (เกณฑ์ผ่านข้อ 2 ของ TF-09)
 */
export function isLowGpsAccuracy(accuracyM?: number): boolean {
  return (
    typeof accuracyM === "number" &&
    Number.isFinite(accuracyM) &&
    accuracyM > GPS_LOW_ACCURACY_THRESHOLD_M
  );
}

/**
 * นำพิกัดจาก GPS ของอุปกรณ์มาอัปเดตลงร่างฟอร์ม พร้อมบันทึกค่าความแม่นยำ (accuracyM)
 * เก็บไว้แม้คลาดเคลื่อนเกิน 1000 ม. (ใช้ตอนผู้แจ้งเลือกส่งพร้อมที่อยู่แทน) แต่หน้าจอจะไม่ปักหมุดให้ (TF-65)
 */
export function applyGpsPositionToDraft(
  draft: SosDraft,
  coords: { latitude: number; longitude: number; accuracy?: number },
): SosDraft {
  return {
    ...draft,
    lat: Number(coords.latitude.toFixed(6)),
    lng: Number(coords.longitude.toFixed(6)),
    accuracyM:
      typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy)
        ? Math.round(coords.accuracy)
        : undefined,
    locationSource: LocationSource.GPS,
    addressFallback: false,
  };
}

/**
 * นำพิกัดจากการปักหมุดเองบนแผนที่หรือลิงก์ Google Maps มาอัปเดตลงร่างฟอร์ม
 * ล้างค่า accuracyM ออกเพราะเป็นจุดที่ผู้ใช้ปักยืนยันด้วยตัวเองแล้ว (เคสเก็บ accuracy_m = null)
 */
export function applyManualPinToDraft(
  draft: SosDraft,
  coords: { lat: number; lng: number },
  source: ManualLocationSource = LocationSource.MANUAL_PIN,
): SosDraft {
  return {
    ...draft,
    lat: Number(coords.lat.toFixed(6)),
    lng: Number(coords.lng.toFixed(6)),
    accuracyM: undefined,
    locationSource: source,
    addressFallback: false,
  };
}

export type ManualLocationSource =
  typeof LocationSource.MANUAL_PIN | typeof LocationSource.GMAPS_LINK;

/**
 * นำผลลัพธ์จาก API แปลงพิกัดเป็นที่อยู่ (/api/geo/reverse) มาเติมจังหวัด/อำเภอ/ตำบลในร่างฟอร์มอัตโนมัติ
 */
export function applyLocatedAreaToDraft(draft: SosDraft, area: LocatedArea): SosDraft {
  return {
    ...draft,
    provinceCode: String(area.province.code),
    province: area.province.nameTh,
    districtCode: String(area.district.code),
    district: area.district.nameTh,
    subdistrictCode: String(area.subdistrict.code),
    subdistrict: area.subdistrict.nameTh,
  };
}

export interface GpsStatusBanner {
  tone: "success" | "warning" | "error";
  desktopText: string;
  mobileText: string;
}

/**
 * สร้างข้อความแจ้งสถานะพิกัดและการปักหมุดสำหรับแสดงใต้ปุ่ม GPS / แผนที่
 * - ถ้าความแม่นยำเกิน 100 ม. จะแสดงข้อความเตือนให้ปักหมุดเพิ่มบนแผนที่
 * - ถ้าไม่อนุญาต GPS จะแสดงข้อความว่ายังสามารถแตะ/ลากหมุดปักเองบนแผนที่ได้
 */
export function getGpsStatusMessage(params: {
  lat?: number;
  lng?: number;
  accuracyM?: number;
  gpsError?: GpsErrorCode | null;
}): GpsStatusBanner | null {
  if (params.gpsError === "PERMISSION_DENIED") {
    return {
      tone: "warning",
      desktopText:
        "ไม่ได้รับอนุญาตให้ใช้ GPS · คุณยังสามารถแตะหรือลากหมุดบนแผนที่เพื่อปักหมุดตำแหน่งเองได้",
      mobileText: "ไม่อนุญาต GPS · แตะหรือลากหมุดบนแผนที่เพื่อปักหมุดเองได้",
    };
  }

  if (params.gpsError) {
    return {
      tone: "warning",
      desktopText: "ดึงพิกัด GPS ไม่สำเร็จ · กรุณาแตะหรือลากหมุดบนแผนที่เพื่อปักหมุดตำแหน่งเอง",
      mobileText: "ดึง GPS ไม่สำเร็จ · แตะหรือลากหมุดบนแผนที่เพื่อปักหมุดเองได้",
    };
  }

  if (typeof params.lat === "number" && typeof params.lng === "number") {
    if (isInaccurateGps(params.accuracyM)) {
      const rounded = Math.round(params.accuracyM!).toLocaleString("th-TH");
      return {
        tone: "error",
        desktopText: `${INACCURATE_LOCATION_MESSAGE} (คลาดเคลื่อน ±${rounded} เมตร)`,
        mobileText: INACCURATE_LOCATION_MESSAGE,
      };
    }

    if (isLowGpsAccuracy(params.accuracyM)) {
      const rounded = Math.round(params.accuracyM!);
      return {
        tone: "warning",
        desktopText: `ความแม่นยำ ±${rounded} เมตร (คลาดเคลื่อนเกิน 100 ม.) · กรุณาแตะหรือลากหมุดบนแผนที่เพื่อปักหมุดเพิ่มให้ตรงจุด`,
        mobileText: `ความแม่นยำ ±${rounded} ม. (เกิน 100 ม.) กรุณาเลื่อนหมุดปักหมุดเพิ่มบนแผนที่`,
      };
    }

    if (typeof params.accuracyM === "number" && Number.isFinite(params.accuracyM)) {
      const rounded = Math.round(params.accuracyM);
      return {
        tone: "success",
        desktopText: `ได้ตำแหน่งแล้ว · แม่นยำ ±${rounded} เมตร · ลากหมุดบนแผนที่เพื่อปรับได้`,
        mobileText: `ได้ตำแหน่งแล้ว (แม่นยำ ±${rounded} ม.)`,
      };
    }

    return {
      tone: "success",
      desktopText: "ปักหมุดตำแหน่งแล้ว · ลากหมุดบนแผนที่เพื่อปรับได้",
      mobileText: "ปักหมุดตำแหน่งแล้ว",
    };
  }

  return null;
}

export interface Step3ValidationErrors {
  totalPeople?: string;
  questionErrors?: Record<string, string>;
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
 * ตรวจสอบข้อมูลขั้นที่ 3 (คำถามเฉพาะประเภทจากทะเบียน + จำนวนผู้ติดค้าง)
 * เกณฑ์ผ่าน:
 * - คำถามที่บังคับ (required: true) ของประเภทเหตุนั้นต้องตอบครบและถูกต้องตามชนิดข้อมูล (TF-51)
 * - จำนวนคนรวม (ผู้ใหญ่ + ผู้สูงอายุ + ผู้ป่วยติดเตียง + เด็กเล็ก) ต้องมีอย่างน้อย 1 คน (TF-11)
 */
export function validateStep3Draft(
  draft: Pick<SosDraft, "adults" | "elderly" | "bedridden" | "children" | "pets"> &
    Partial<
      Pick<SosDraft, "incidentType" | "details" | "canSelfEvacuate" | "waterLevel" | "hasInjured">
    >,
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

  const errors: Step3ValidationErrors = {
    missingSummary: [],
  };
  const questionErrors: Record<string, string> = {};

  const activeType = draft.incidentType ?? IncidentType.FLOOD;
  const questions = INCIDENT_REGISTRY[activeType].questions;

  const allAnswers: Record<string, unknown> = {
    ...(draft.details ?? {}),
    waterLevel: draft.waterLevel,
    canSelfEvacuate: draft.canSelfEvacuate,
    hasInjured: draft.hasInjured,
  };
  if (allAnswers.vehicleTypes === undefined && draft.details?.vehicleType !== undefined) {
    allAnswers.vehicleTypes = Array.isArray(draft.details.vehicleType)
      ? draft.details.vehicleType
      : [draft.details.vehicleType];
  }

  for (const q of questions) {
    // ถ้าคำถามมีเงื่อนไข dependsOn และคำตอบปัจจุบันไม่ตรงเงื่อนไข ให้ข้ามการตรวจ
    if (q.dependsOn && !isQuestionVisible(q, allAnswers)) {
      continue;
    }

    let val: string | number | boolean | string[] | undefined = draft.details?.[q.key];
    if (val === undefined) {
      if (q.key === "waterLevel") val = draft.waterLevel;
      else if (q.key === "canSelfEvacuate") val = draft.canSelfEvacuate;
      else if (q.key === "hasInjured") val = draft.hasInjured;
      else if (q.key === "vehicleTypes" && draft.details?.vehicleType !== undefined) {
        val = Array.isArray(draft.details.vehicleType)
          ? draft.details.vehicleType
          : [draft.details.vehicleType as string];
      }
    }

    // สำหรับ FLOOD คำถาม canSelfEvacuate ถูกบังคับตั้งแต่ขั้นที่ 1 แล้ว
    // ถ้าเรียก validateStep3Draft เฉพาะตัวนับคน (ไม่ได้ส่ง canSelfEvacuate หรือ incidentType มา) ไม่ต้องบังคับซ้ำ
    if (
      activeType === IncidentType.FLOOD &&
      q.key === "canSelfEvacuate" &&
      val === undefined &&
      draft.incidentType === undefined
    ) {
      continue;
    }

    const isEmpty =
      val === undefined ||
      val === "" ||
      (Array.isArray(val) && val.length === 0);

    if (q.required && isEmpty) {
      questionErrors[q.key] = `กรุณาตอบคำถาม "${q.label.th}"`;
      if (q.key === "vehicleTypes") {
        questionErrors.vehicleType = `กรุณาตอบคำถาม "${q.label.th}"`;
      }
      errors.missingSummary.push(q.label.th);
      continue;
    }

    if (val !== undefined && val !== "") {
      if (q.kind === "choice") {
        if (q.multiple) {
          if (
            !Array.isArray(val) ||
            val.length === 0 ||
            !val.every((v) => typeof v === "string" && q.options.some((o) => o.value === v))
          ) {
            questionErrors[q.key] = `ตัวเลือกของ "${q.label.th}" ไม่ถูกต้อง`;
            errors.missingSummary.push(q.label.th);
          }
        } else {
          if (typeof val !== "string" || !q.options.some((o) => o.value === val)) {
            questionErrors[q.key] = `ตัวเลือกของ "${q.label.th}" ไม่ถูกต้อง`;
            errors.missingSummary.push(q.label.th);
          }
        }
      } else if (q.kind === "number") {
        if (typeof val !== "number" || !Number.isInteger(val) || val < q.min || val > q.max) {
          questionErrors[q.key] = `กรุณาระบุ "${q.label.th}" เป็นตัวเลขระหว่าง ${q.min}–${q.max}`;
          errors.missingSummary.push(q.label.th);
        }
      } else if (q.kind === "boolean") {
        if (typeof val !== "boolean") {
          questionErrors[q.key] = `กรุณาตอบคำถาม "${q.label.th}"`;
          errors.missingSummary.push(q.label.th);
        }
      } else if (q.kind === "text") {
        if (typeof val !== "string" || val.length > q.maxLength) {
          questionErrors[q.key] = `"${q.label.th}" ต้องไม่เกิน ${q.maxLength} ตัวอักษร`;
          errors.missingSummary.push(q.label.th);
        }
      }
    }
  }

  if (!result.success) {
    errors.totalPeople = "ต้องมีผู้ติดค้างอย่างน้อย 1 คน (ไม่นับรวมสัตว์เลี้ยง)";
    errors.missingSummary.push("จำนวนผู้ติดค้างอย่างน้อย 1 คน");
  }

  if (Object.keys(questionErrors).length > 0) {
    errors.questionErrors = questionErrors;
  }

  if (errors.totalPeople || Object.keys(questionErrors).length > 0) {
    return {
      valid: false,
      totalPeople,
      errors,
    };
  }

  return {
    valid: true,
    totalPeople,
    errors: { missingSummary: [] },
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
export function validateStep4Draft(draft: Pick<SosDraft, "needs" | "otherDetail">): {
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
  consent?: string;
  healthConsent?: string;
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
    consent?: boolean;
    healthConsent?: boolean;
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

  if (draft.consent !== true) {
    errors.consent = "กรุณายินยอมก่อนส่งคำขอ";
    errors.missingSummary.push("ความยินยอมในการใช้ข้อมูล");
  }
  if (draft.healthConsent !== true) {
    errors.healthConsent = "กรุณายินยอมให้ใช้ข้อมูลสุขภาพ";
    errors.missingSummary.push("ความยินยอมข้อมูลสุขภาพ");
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
    !errors.name &&
    !errors.phone &&
    !errors.notes &&
    !errors.photos &&
    !errors.consent &&
    !errors.healthConsent &&
    parsed.success;

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

let _cachedKey: string | null = null;
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

    const validIncidentTypes = Object.values(IncidentType) as string[];
    const validWaterLevels = Object.values(WaterLevel) as string[];
    const validNeeds = Object.values(Need) as string[];
    const validDangerSigns = Array.from(
      new Set([
        ...UNIVERSAL_DANGER_SIGNS.map((sign) => sign.key),
        ...Object.values(INCIDENT_REGISTRY).flatMap((def) =>
          def.dangerSigns.map((sign) => sign.key),
        ),
      ]),
    );

    const incidentType =
      typeof parsed.incidentType === "string" && validIncidentTypes.includes(parsed.incidentType)
        ? (parsed.incidentType as IncidentType)
        : undefined;
    const atScene = typeof parsed.atScene === "boolean" ? parsed.atScene : undefined;

    // ร่างที่บันทึกก่อน TF-55 มี urgency แต่ไม่มีคำตอบใหม่ → กลับไปตอบขั้น 1 ใหม่
    const dangerSigns = Array.isArray(parsed.dangerSigns)
      ? parsed.dangerSigns.filter(
          (key): key is string => typeof key === "string" && validDangerSigns.includes(key),
        )
      : undefined;
    const canSelfEvacuate =
      typeof parsed.canSelfEvacuate === "boolean" ? parsed.canSelfEvacuate : undefined;

    const locationSource =
      typeof parsed.locationSource === "string" &&
      (Object.values(LocationSource) as string[]).includes(parsed.locationSource)
        ? (parsed.locationSource as LocationSource)
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

    const details: Record<string, IncidentDetailValue | undefined> = {};
    if (
      typeof parsed.details === "object" &&
      parsed.details !== null &&
      !Array.isArray(parsed.details)
    ) {
      for (const [k, v] of Object.entries(parsed.details)) {
        if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean" ||
          (Array.isArray(v) && v.every((item): item is string => typeof item === "string"))
        ) {
          details[k] = v;
        }
      }
    }

    const idempotencyKey =
      typeof parsed.idempotencyKey === "string" && parsed.idempotencyKey.trim().length > 0
        ? parsed.idempotencyKey.trim()
        : undefined;

    // ถ้าเคยอยู่ขั้นถัดไปแต่ค่าขั้นที่ 1 ไม่ครบ หรือตอบว่าไม่ได้อยู่ที่จุดเกิดเหตุ ให้กลับมาเริ่มที่ขั้นที่ 1
    const rawStep = isValidStepNumber(parsed.currentStep) ? parsed.currentStep : 1;
    const step1Answered =
      atScene !== false && dangerSigns !== undefined && canSelfEvacuate !== undefined;
    const currentStep: SosStepNumber = rawStep > 1 && !step1Answered ? 1 : rawStep;

    // ตัด urgency ของร่างรุ่นเก่าทิ้ง ไม่ให้หลุดไปกับคำขอ
    const { urgency: _legacyUrgency, ...rest } = parsed as Partial<SosDraft> & {
      urgency?: unknown;
    };
    void _legacyUrgency;

    return {
      ...initial,
      ...rest,
      currentStep,
      incidentType,
      atScene,
      dangerSigns,
      canSelfEvacuate,
      consent: false,
      healthConsent: false,
      hasDisabled: parsed.hasDisabled === true,
      hasInjured: parsed.hasInjured === true,
      waterLevel,
      details,
      locationSource,
      addressFallback: parsed.addressFallback === true,
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
      _cachedKey = `${raw}::${window.location.search}`;
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
      _cachedKey = null;
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
    const search = window.location.search;
    const cacheKey = `${raw ?? ""}::${search}`;
    if (cacheKey !== _cachedKey) {
      _cachedKey = cacheKey;
      const base = raw ? loadSosDraft(window.localStorage) : createInitialSosDraft();
      const urlType = parseIncidentTypeParam(search);
      _cachedDraft =
        base.incidentType === undefined && urlType !== undefined
          ? { ...base, incidentType: urlType }
          : base;
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
      requestBody?: string;
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
    if (!check1.valid) {
      return {
        status: "invalid_step",
        step: 1,
        step1Errors: check1.errors,
        error: `ยังส่งคำขอไม่ได้ กรุณาตอบ${check1.errors.missingSummary.join("และ")} ในขั้นที่ 1`,
      };
    }

    const check3 = validateStep3Draft(draft);
    if (!check3.valid) {
      return {
        status: "invalid_step",
        step: 3,
        step3Errors: check3.errors,
        error: `ยังส่งคำขอไม่ได้ กรุณาตรวจสอบข้อมูลในขั้นที่ 3: ${check3.errors.missingSummary.join(", ")}`,
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
        error: `ยังส่งคำขอไม่ได้ กรุณาระบุ${check2.errors.missingSummary.join("และ")} ในขั้นที่ 2 ก่อนส่งคำขอ`,
      };
    }

    const normalizedPhone = check5.normalizedPhone ?? draft.phone.replace(/[\s\-]/g, "");
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

    const activeType = nextDraft.incidentType ?? IncidentType.FLOOD;
    const detailsPayload: Record<string, IncidentDetailValue> = {};
    for (const q of INCIDENT_REGISTRY[activeType].questions) {
      if (q.dependsOn && !isQuestionVisible(q, nextDraft.details ?? {})) {
        continue;
      }
      let val: IncidentDetailValue | undefined = nextDraft.details?.[q.key];
      if (val === undefined) {
        if (q.key === "waterLevel") val = nextDraft.waterLevel;
        else if (q.key === "canSelfEvacuate") val = nextDraft.canSelfEvacuate;
        else if (q.key === "hasInjured" && nextDraft.hasInjured) val = true;
        else if (q.key === "vehicleTypes" && nextDraft.details?.vehicleType !== undefined) {
          val = Array.isArray(nextDraft.details.vehicleType)
            ? nextDraft.details.vehicleType
            : [String(nextDraft.details.vehicleType)];
        }
      }
      if (val !== undefined) {
        detailsPayload[q.key] = val;
      }
    }

    const requestBody = JSON.stringify({
      incidentType: nextDraft.incidentType,
      atScene: nextDraft.atScene,
      dangerSigns: nextDraft.dangerSigns,
      canSelfEvacuate: nextDraft.canSelfEvacuate,
      waterLevel: activeType === IncidentType.FLOOD ? nextDraft.waterLevel : undefined,
      details: detailsPayload,
      lat: nextDraft.lat,
      lng: nextDraft.lng,
      accuracyM: accuracyForLocationSource(nextDraft.locationSource, nextDraft.accuracyM),
      locationSource: nextDraft.locationSource,
      addressLine: nextDraft.addressLine?.trim() || undefined,
      province: nextDraft.province,
      district: nextDraft.district,
      subdistrict: nextDraft.subdistrict,
      landmark: nextDraft.landmark,
      adults: nextDraft.adults,
      elderly: nextDraft.elderly,
      bedridden: nextDraft.bedridden,
      children: nextDraft.children,
      pets: nextDraft.pets,
      hasDisabled: nextDraft.hasDisabled,
      hasInjured: nextDraft.hasInjured,
      needs: nextDraft.needs,
      otherDetail: nextDraft.needs.includes(Need.OTHER) ? nextDraft.otherDetail : undefined,
      name: nextDraft.name,
      phone: nextDraft.phone,
      lineId: nextDraft.lineId || undefined,
      notes: nextDraft.notes || undefined,
      consent: nextDraft.consent,
      healthConsent: nextDraft.healthConsent,
    });

    try {
      const response = await fetchImpl("/api/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: requestBody,
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
        requestBody,
      };
    }
  } finally {
    inFlightRef.current = false;
  }
}
