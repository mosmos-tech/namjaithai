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
  accuracyForLocationSource,
  isInaccurateGps,
  isQuestionVisible,
  locationSourceSchema,
  normalizePhoneInput,
  type LocatedArea,
  type IncidentDetailValue,
  type WebLocationSource,
} from "../../lib/domain";
import { MAX_PHOTO_BYTES, MAX_SOS_PHOTOS } from "./image-compression";
import { format, pickText } from "../../lib/i18n/locale";
import { SOS_TEXT_TH, type SosText } from "./sos-text";

/**
 * ข้อความจาก zod schema ใน src/lib/domain เป็นภาษาไทย — หน้าไทยใช้ตามเดิม หน้าอังกฤษใช้ข้อความจาก dictionary
 */
function schemaMessage(thMessage: string | undefined, fallback: string, t: SosText): string {
  return t.locale === "th" ? (thMessage ?? fallback) : fallback;
}

export const SOS_DRAFT_STORAGE_KEY = "namjaithai-sos-draft-v2";

/**
 * ร่างก่อน TF-66 (ขั้น 2 = ตำแหน่ง, ขั้น 3 = ผู้ติดค้าง) — ชื่อฟิลด์เหมือนเดิม ต่างแค่เลขขั้น
 * เปิดหน้าครั้งแรกหลังอัปเดต migrateLegacySosDraft() ย้ายมาเป็น v2 แล้วลบทิ้ง
 */
export const LEGACY_SOS_DRAFT_STORAGE_KEY = "namjaithai-sos-draft-v1";
const LEGACY_STEP_TO_STEP: Record<SosStepNumber, SosStepNumber> = { 1: 1, 2: 3, 3: 2, 4: 4, 5: 5 };

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
    title: "เกิดเหตุอะไร",
    shortLabel: "ประเภทเหตุ",
    description: "เลือกประเภทเหตุ และยืนยันว่าคุณอยู่ที่จุดเกิดเหตุ",
  },
  {
    step: 2,
    title: "รายละเอียดเหตุ",
    shortLabel: "รายละเอียด",
    // TF-55: ผู้แจ้งตอบคำถามสั้นๆ ระบบจัดลำดับความเร่งด่วนเอง (ผู้แจ้งไม่เห็นระดับ)
    description: "ตอบคำถามเรื่องอันตรายและจำนวนคน เพื่อให้ทีมกู้ภัยจัดลำดับความช่วยเหลือ",
  },
  {
    step: 3,
    title: "ตำแหน่งที่เกิดเหตุ",
    shortLabel: "ตำแหน่ง",
    description: "ระบุพิกัด GPS หรือปักหมุดบนแผนที่ พร้อมจุดสังเกตที่มองเห็นได้ชัดเจน",
  },
  {
    step: 4,
    title: "สิ่งที่ต้องการความช่วยเหลือ",
    shortLabel: "สิ่งที่ต้องการ",
    description: "เลือกสิ่งที่ต้องการเร่งด่วน เช่น อพยพ น้ำดื่ม อาหาร หรือยารักษาโรค",
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
  // ขั้นที่ 1: เกิดเหตุอะไร (TF-50) — undefined = ยังไม่ได้ตอบ
  incidentType?: IncidentType;
  atScene?: boolean;
  // ขั้นที่ 2: รายละเอียดเหตุ — สัญญาณอันตราย ออกเองได้ไหม (TF-55) ระดับน้ำ (คำถามน้ำท่วม)
  dangerSigns?: string[];
  canSelfEvacuate?: boolean;
  waterLevel?: WaterLevel;
  // ขั้นที่ 3: ตำแหน่ง (TF-09)
  lat?: number;
  lng?: number;
  accuracyM?: number;
  // TF-65: ได้พิกัดมาจาก GPS / ปักเอง / ลิงก์ และผู้แจ้งเลือก "ปักหมุดไม่ได้ ส่งพร้อมที่อยู่แทน" หรือยัง
  locationSource?: WebLocationSource;
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
  // ขั้นที่ 2 (ต่อ): คำถามเฉพาะประเภทเหตุ (TF-51) และผู้ติดค้าง (TF-11)
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

/**
 * เปลี่ยนประเภทเหตุในร่าง (TF-66: ย้อนกลับไปเปลี่ยนได้)
 * คำตอบเฉพาะประเภทเดิมต้องหายทั้งหมด ไม่ให้หลุดไปกับเคสใหม่:
 * - details (คำถามจากทะเบียน), hasInjured, ระดับน้ำ (ถามเฉพาะน้ำท่วม)
 * - สัญญาณอันตรายที่ประเภทใหม่ไม่มี และสิ่งที่ต้องการที่ประเภทใหม่ไม่มี
 * คำตอบกลาง (อยู่ที่จุดเกิดเหตุ ออกเองได้ไหม จำนวนคน ตำแหน่ง ติดต่อ) เก็บไว้
 */
export function applyIncidentTypeToDraft(draft: SosDraft, incidentType: IncidentType): SosDraft {
  if (draft.incidentType === incidentType) return draft;
  const registry = INCIDENT_REGISTRY[incidentType];
  const signKeys = (
    registry.dangerSigns.length > 0 ? registry.dangerSigns : UNIVERSAL_DANGER_SIGNS
  ).map((sign) => sign.key);
  const allowedNeeds = new Set<Need>([
    ...(registry.needs.length > 0 ? registry.needs : Object.values(Need)),
    Need.OTHER,
  ]);
  const needs = draft.needs.filter((need) => allowedNeeds.has(need));
  return {
    ...draft,
    incidentType,
    details: {},
    hasInjured: false,
    waterLevel: incidentType === IncidentType.FLOOD ? draft.waterLevel : undefined,
    dangerSigns: draft.dangerSigns?.filter((key) => signKeys.includes(key)),
    needs,
    otherDetail: needs.includes(Need.OTHER) ? draft.otherDetail : "",
  };
}

export interface Step1ValidationErrors {
  incidentType?: string;
  atScene?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 1 "เกิดเหตุอะไร" (TF-50, TF-66)
 * - ถ้าตอบว่าไม่ได้อยู่ที่จุดเกิดเหตุ (atScene === false) จะไม่ผ่านและไม่สร้างเคส
 * - ยังไม่เลือกประเภท = น้ำท่วม (เหมือนเดิม) แต่ประเภทนั้นต้องเปิดรับแจ้งอยู่
 *   enabledTypes = รายการที่แอดมินเปิดไว้ (TF-30) ไม่ส่งมา = ไม่ตรวจ (เซิร์ฟเวอร์ตรวจซ้ำอยู่แล้ว)
 */
export function validateStep1Draft(
  draft: Pick<SosDraft, "incidentType" | "atScene">,
  enabledTypes?: readonly IncidentType[],
  t: SosText = SOS_TEXT_TH,
): {
  valid: boolean;
  errors: Step1ValidationErrors;
} {
  const errors: Step1ValidationErrors = {
    missingSummary: [],
  };
  const result = step1Schema
    .pick({ incidentType: true, atScene: true })
    .safeParse({ incidentType: draft.incidentType, atScene: draft.atScene });

  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] === "atScene" && !errors.atScene) {
        errors.atScene = schemaMessage(issue.message, t.v.atSceneOnly, t);
        errors.missingSummary.push(t.v.sumAtScene);
      } else if (issue.path[0] === "incidentType" && !errors.incidentType) {
        errors.incidentType = schemaMessage(issue.message, t.v.incidentInvalid, t);
        errors.missingSummary.push(t.v.sumIncident);
      }
    }
  } else if (enabledTypes && !enabledTypes.includes(draft.incidentType ?? IncidentType.FLOOD)) {
    errors.incidentType = t.v.incidentRequired;
    errors.missingSummary.push(t.v.sumIncident);
  }

  return {
    valid: errors.missingSummary.length === 0,
    errors,
  };
}

export interface Step2ValidationErrors {
  dangerSigns?: string;
  canSelfEvacuate?: string;
  waterLevel?: string;
  totalPeople?: string;
  questionErrors?: Record<string, string>;
  missingSummary: string[];
}

/**
 * ตรวจคำตอบเรื่องอันตรายในขั้นที่ 2 ด้วย step1Schema จาก src/lib/domain
 * - ต้องตอบเรื่องสัญญาณอันตราย (ติ๊ก หรือกด "ไม่มี") และออกเองได้ไหม ระดับน้ำไม่บังคับ
 */
function validateDangerAnswers(
  draft: Pick<SosDraft, "dangerSigns" | "canSelfEvacuate" | "waterLevel">,
  errors: Step2ValidationErrors,
  t: SosText,
): void {
  const validWaterLevels = Object.values(WaterLevel) as string[];

  if (!Array.isArray(draft.dangerSigns)) {
    errors.dangerSigns = t.v.dangerRequired;
    errors.missingSummary.push(t.v.sumDanger);
  }

  if (typeof draft.canSelfEvacuate !== "boolean") {
    errors.canSelfEvacuate = t.v.selfEvacRequired;
    errors.missingSummary.push(t.v.sumSelfEvac);
  }

  // ระดับน้ำไม่บังคับ ผิดได้แค่กรณีค่าไม่อยู่ในรายการ
  if (draft.waterLevel && !validWaterLevels.includes(draft.waterLevel)) {
    errors.waterLevel = t.v.waterLevelInvalid;
    errors.missingSummary.push(t.v.sumWaterLevel);
  }

  if (errors.missingSummary.length === 0) {
    const result = step1Schema
      .pick({ dangerSigns: true, canSelfEvacuate: true, waterLevel: true })
      .safeParse({
        dangerSigns: draft.dangerSigns,
        canSelfEvacuate: draft.canSelfEvacuate,
        waterLevel: draft.waterLevel,
      });
    if (!result.success) {
      errors.dangerSigns = schemaMessage(result.error.issues[0]?.message, t.v.dangerInvalid, t);
      errors.missingSummary.push(t.v.sumDanger);
    }
  }
}

export interface Step3ValidationErrors {
  location?: string;
  addressLine?: string;
  landmark?: string;
  missingSummary: string[];
}

/**
 * ตรวจสอบข้อมูลขั้นที่ 3 (พิกัดและจุดสังเกต) ด้วย step2Schema จาก src/lib/domain
 * - พิกัด (lat, lng) ต้องอยู่ในขอบเขตประเทศไทย
 * - จุดสังเกต (landmark) บังคับต้องระบุเพื่อให้ทีมกู้ภัยสังเกตเห็นได้เมื่อป้ายบ้านจมน้ำ
 */
export function validateStep3Draft(
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
  t: SosText = SOS_TEXT_TH,
): {
  valid: boolean;
  errors: Step3ValidationErrors;
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

  const errors: Step3ValidationErrors = {
    missingSummary: [],
  };

  if (typeof draft.lat !== "number" || typeof draft.lng !== "number") {
    errors.location = t.v.locationRequired;
    errors.missingSummary.push(t.v.sumLocation);
  } else if (needsPinOrFallback) {
    errors.location = t.v.locationInaccurate;
    errors.missingSummary.push(t.v.sumLocation);
  } else {
    const latCheck = latSchema.safeParse(draft.lat);
    const lngCheck = lngSchema.safeParse(draft.lng);
    if (!latCheck.success || !lngCheck.success) {
      errors.location = schemaMessage(
        latCheck.error?.issues[0]?.message ?? lngCheck.error?.issues[0]?.message,
        t.v.locationOutsideThailand,
        t,
      );
      errors.missingSummary.push(t.v.sumLocation);
    }
  }

  if (needsAddress) {
    errors.addressLine = t.v.addressRequired;
    errors.missingSummary.push(t.v.sumAddress);
  }

  if (!draft.landmark || draft.landmark.trim().length === 0) {
    errors.landmark = t.v.landmarkRequired;
    errors.missingSummary.push(t.v.sumLandmark);
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
}, t: SosText = SOS_TEXT_TH): GpsStatusBanner | null {
  if (params.gpsError === "PERMISSION_DENIED") {
    return {
      tone: "warning",
      desktopText: t.gps.deniedDesktop,
      mobileText: t.gps.deniedMobile,
    };
  }

  if (params.gpsError) {
    return {
      tone: "warning",
      desktopText: t.gps.failedDesktop,
      mobileText: t.gps.failedMobile,
    };
  }

  if (typeof params.lat === "number" && typeof params.lng === "number") {
    if (isInaccurateGps(params.accuracyM)) {
      const rounded = Math.round(params.accuracyM!).toLocaleString(
        t.locale === "en" ? "en-US" : "th-TH",
      );
      return {
        tone: "error",
        desktopText: format(t.gps.inaccurateDesktop, {
          message: t.v.locationInaccurate,
          meters: rounded,
        }),
        mobileText: t.v.locationInaccurate,
      };
    }

    if (isLowGpsAccuracy(params.accuracyM)) {
      const rounded = Math.round(params.accuracyM!);
      return {
        tone: "warning",
        desktopText: format(t.gps.lowDesktop, { meters: rounded }),
        mobileText: format(t.gps.lowMobile, { meters: rounded }),
      };
    }

    if (typeof params.accuracyM === "number" && Number.isFinite(params.accuracyM)) {
      const rounded = Math.round(params.accuracyM);
      return {
        tone: "success",
        desktopText: format(t.gps.okDesktop, { meters: rounded }),
        mobileText: format(t.gps.okMobile, { meters: rounded }),
      };
    }

    return {
      tone: "success",
      desktopText: t.gps.pinnedDesktop,
      mobileText: t.gps.pinnedMobile,
    };
  }

  return null;
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
 * ตรวจสอบข้อมูลขั้นที่ 2 "รายละเอียดเหตุ" (TF-66 รวมคำถามเดิมของขั้น 1 และ 3)
 * เกณฑ์ผ่าน:
 * - ตอบสัญญาณอันตราย (ติ๊ก หรือกด "ไม่มี") และออกเองได้ไหม (TF-55)
 * - คำถามที่บังคับ (required: true) ของประเภทเหตุนั้นต้องตอบครบและถูกต้องตามชนิดข้อมูล (TF-51)
 * - จำนวนคนรวม (ผู้ใหญ่ + ผู้สูงอายุ + ผู้ป่วยติดเตียง + เด็กเล็ก) ต้องมีอย่างน้อย 1 คน (TF-11)
 */
export function validateStep2Draft(
  draft: Pick<SosDraft, "adults" | "elderly" | "bedridden" | "children" | "pets"> &
    Partial<
      Pick<
        SosDraft,
        "incidentType" | "details" | "canSelfEvacuate" | "waterLevel" | "hasInjured" | "dangerSigns"
      >
    >,
  t: SosText = SOS_TEXT_TH,
): {
  valid: boolean;
  totalPeople: number;
  errors: Step2ValidationErrors;
} {
  const errors: Step2ValidationErrors = {
    missingSummary: [],
  };
  validateDangerAnswers(draft, errors, t);
  const people = validatePeopleAndQuestions(draft, t);
  errors.missingSummary.push(...people.errors.missingSummary);
  if (people.errors.totalPeople) errors.totalPeople = people.errors.totalPeople;
  if (people.errors.questionErrors) errors.questionErrors = people.errors.questionErrors;

  return {
    valid: errors.missingSummary.length === 0,
    totalPeople: people.totalPeople,
    errors: errors.missingSummary.length === 0 ? { missingSummary: [] } : errors,
  };
}

/**
 * คำถามเฉพาะประเภทจากทะเบียน + จำนวนผู้ติดค้าง (ส่วนหนึ่งของขั้นที่ 2)
 */
function validatePeopleAndQuestions(
  draft: Pick<SosDraft, "adults" | "elderly" | "bedridden" | "children" | "pets"> &
    Partial<
      Pick<SosDraft, "incidentType" | "details" | "canSelfEvacuate" | "waterLevel" | "hasInjured">
    >,
  t: SosText,
): {
  valid: boolean;
  totalPeople: number;
  errors: Step2ValidationErrors;
} {
  const totalPeople = getTotalPeopleCount(draft);
  const result = step3Schema.safeParse({
    adults: draft.adults,
    elderly: draft.elderly,
    bedridden: draft.bedridden,
    children: draft.children,
    pets: draft.pets,
  });

  const errors: Step2ValidationErrors = {
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

    // ออกเองได้ไหม (FLOOD) ตรวจในส่วนสัญญาณอันตรายของขั้นเดียวกันแล้ว (validateDangerAnswers)
    if (q.key === "canSelfEvacuate") {
      continue;
    }

    const isEmpty = val === undefined || val === "" || (Array.isArray(val) && val.length === 0);

    if (q.required && isEmpty) {
      const label = pickText(q.label, t.locale);
      questionErrors[q.key] = format(t.v.questionRequired, { label });
      errors.missingSummary.push(label);
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
            questionErrors[q.key] = format(t.v.questionChoiceInvalid, { label: pickText(q.label, t.locale) });
            errors.missingSummary.push(pickText(q.label, t.locale));
          }
        } else {
          if (typeof val !== "string" || !q.options.some((o) => o.value === val)) {
            questionErrors[q.key] = format(t.v.questionChoiceInvalid, { label: pickText(q.label, t.locale) });
            errors.missingSummary.push(pickText(q.label, t.locale));
          }
        }
      } else if (q.kind === "number") {
        if (typeof val !== "number" || !Number.isInteger(val) || val < q.min || val > q.max) {
          questionErrors[q.key] = format(t.v.questionNumberRange, {
            label: pickText(q.label, t.locale),
            min: q.min,
            max: q.max,
          });
          errors.missingSummary.push(pickText(q.label, t.locale));
        }
      } else if (q.kind === "boolean") {
        if (typeof val !== "boolean") {
          questionErrors[q.key] = format(t.v.questionRequired, { label: pickText(q.label, t.locale) });
          errors.missingSummary.push(pickText(q.label, t.locale));
        }
      } else if (q.kind === "text") {
        if (typeof val !== "string" || val.length > q.maxLength) {
          questionErrors[q.key] = format(t.v.questionTextTooLong, {
            label: pickText(q.label, t.locale),
            max: q.maxLength,
          });
          errors.missingSummary.push(pickText(q.label, t.locale));
        }
      }
    }
  }

  if (!result.success) {
    errors.totalPeople = t.v.peopleRequired;
    errors.missingSummary.push(t.v.sumPeople);
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
export function validateStep4Draft(
  draft: Pick<SosDraft, "needs" | "otherDetail">,
  t: SosText = SOS_TEXT_TH,
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
          otherDetail: t.v.otherDetailRequired,
          missingSummary: [t.v.sumOtherDetail],
        },
      };
    }

    if (draft.otherDetail.length > 200) {
      return {
        valid: false,
        errors: {
          otherDetail: t.v.otherDetailTooLong,
          missingSummary: [t.v.sumOtherDetailTooLong],
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
      otherDetail: t.v.otherDetailRequired,
      missingSummary: [t.v.sumOtherDetail],
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
  t: SosText = SOS_TEXT_TH,
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
    errors.name = t.v.nameRequired;
    errors.missingSummary.push(t.v.sumName);
  }

  const cleanedPhone = (draft.phone ?? "").replace(/[\s\-]/g, "");
  if (cleanedPhone.length === 0) {
    errors.phone = t.v.phoneRequired;
    errors.missingSummary.push(t.v.sumPhone);
  }

  if ((draft.notes ?? "").length > 500) {
    errors.notes = t.v.notesTooLong;
    errors.missingSummary.push(t.v.sumNotesTooLong);
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
        errors.name = schemaMessage(issue.message, t.v.nameRequired, t);
        errors.missingSummary.push(t.v.sumName);
      } else if (field === "phone" && !errors.phone) {
        errors.phone = schemaMessage(issue.message, t.v.phoneInvalid, t);
        errors.missingSummary.push(t.v.sumPhoneInvalid);
      } else if (field === "notes" && !errors.notes) {
        errors.notes = schemaMessage(issue.message, t.v.notesTooLong, t);
        errors.missingSummary.push(t.v.sumNotes);
      }
    }
  }

  if (draft.consent !== true) {
    errors.consent = t.v.consentRequired;
    errors.missingSummary.push(t.v.sumConsent);
  }
  if (draft.healthConsent !== true) {
    errors.healthConsent = t.v.healthConsentRequired;
    errors.missingSummary.push(t.v.sumHealthConsent);
  }

  const photos = draft.photos ?? [];
  if (photos.length > MAX_SOS_PHOTOS) {
    errors.photos = format(t.v.photosTooMany, { max: MAX_SOS_PHOTOS });
    errors.missingSummary.push(format(t.v.sumPhotosTooMany, { max: MAX_SOS_PHOTOS }));
  } else if (photos.some((p) => p.compressedBytes > MAX_PHOTO_BYTES)) {
    errors.photos = t.v.photoTooLarge;
    errors.missingSummary.push(t.v.sumPhotoTooLarge);
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
  { legacy = false }: { legacy?: boolean } = {},
): SosDraft {
  const initial = createInitialSosDraft();
  if (!storage) return initial;

  try {
    const raw = storage.getItem(legacy ? LEGACY_SOS_DRAFT_STORAGE_KEY : SOS_DRAFT_STORAGE_KEY);
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

    const locationSource = locationSourceSchema.safeParse(parsed.locationSource).data;

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

    const savedStep = isValidStepNumber(parsed.currentStep) ? parsed.currentStep : 1;
    const rawStep = legacy ? LEGACY_STEP_TO_STEP[savedStep] : savedStep;

    // ตัด urgency ของร่างรุ่นเก่าทิ้ง ไม่ให้หลุดไปกับคำขอ
    const { urgency: _legacyUrgency, ...rest } = parsed as Partial<SosDraft> & {
      urgency?: unknown;
    };
    void _legacyUrgency;

    const draft: SosDraft = {
      ...initial,
      ...rest,
      currentStep: rawStep,
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
    // ร่างเก่า (ก่อน TF-66): คำถามย้ายขั้น จึงพากลับไปขั้นแรกที่ยังไม่ครบ
    // ร่างปัจจุบัน: ขั้น 1 ไม่ครบหรือตอบว่าไม่ได้อยู่ที่จุดเกิดเหตุ ให้กลับมาเริ่มที่ขั้นที่ 1 (เหมือนเดิม)
    const limit = legacy ? firstIncompleteStep(draft) : validateStep1Draft(draft).valid ? 5 : 1;
    return {
      ...draft,
      currentStep: Math.min(rawStep, limit) as SosStepNumber,
    };
  } catch {
    return initial;
  }
}

/** ขั้นแรกที่ยังกรอกไม่ครบ (นับแค่ขั้น 1–3 ที่ต้องผ่านก่อนไปต่อ) — ครบหมด = 5 */
function firstIncompleteStep(draft: SosDraft): SosStepNumber {
  if (!validateStep1Draft(draft).valid) return 1;
  if (!validateStep2Draft(draft).valid) return 2;
  if (!validateStep3Draft(draft).valid) return 3;
  return 5;
}

/**
 * ย้ายร่างก่อน TF-66 (คีย์ v1) มาเป็นคีย์ v2 พร้อมแปลงเลขขั้น แล้วลบคีย์เก่าเสมอ
 * - มีร่าง v2 อยู่แล้ว: ใช้ v2 ทิ้ง v1
 * - JSON เสีย: ทิ้ง v1 เริ่มฟอร์มใหม่ (ไม่ทำให้หน้าพัง)
 */
export function migrateLegacySosDraft(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): void {
  try {
    const legacy = storage.getItem(LEGACY_SOS_DRAFT_STORAGE_KEY);
    if (legacy === null) return;
    if (storage.getItem(SOS_DRAFT_STORAGE_KEY) === null) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(legacy);
      } catch {
        // JSON เสีย ทิ้งไป
      }
      if (typeof parsed === "object" && parsed !== null) {
        const draft = loadSosDraft(storage, { legacy: true });
        storage.setItem(SOS_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      }
    }
    storage.removeItem(LEGACY_SOS_DRAFT_STORAGE_KEY);
  } catch {
    // พื้นที่เก็บข้อมูลใช้ไม่ได้ (โหมดส่วนตัว) — ฟอร์มยังเริ่มใหม่ได้ตามปกติ
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
    migrateLegacySosDraft(window.localStorage);
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
export function formatStepProgressText(step: SosStepNumber, t: SosText = SOS_TEXT_TH): string {
  return format(t.stepProgress, { step, total: SOS_STEPS.length });
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
      status: "photo_pending";
      idempotencyKey: string;
      requestBody: string;
      caseCode: string;
      trackingToken: string;
      confirmationToken?: string;
    }
  | {
      status: "submitted";
      caseCode: string;
      trackingToken?: string;
      confirmationToken?: string;
      idempotencyKey: string;
      successMessage: string;
    };

/** เวลารอสูงสุดของคำขอส่ง SOS หลัก (12 วิ) เพื่อไม่ให้ปุ่มหมุนค้างหลายนาทีบนเน็ตช้าแล้วส่งเข้าคิว TF-15 */
export const SOS_SUBMIT_TIMEOUT_MS = 12_000;

/** เวลารอสูงสุดของคำขออัปโหลดรูปตามหลังเคส (12 วิ) — หากหมดเวลาจะเก็บคิวส่งรูปซ้ำโดยเคสไม่ล้ม */
export const SOS_PHOTO_UPLOAD_TIMEOUT_MS = 12_000;

/** เวลาที่รอเกินแล้วแสดงปุ่มโทร 1669 และส่งทาง SMS บนขั้นที่ 5 ทันที (5 วิ) */
export const SOS_SLOW_SUBMIT_NOTICE_MS = 5_000;

export interface SubmitSosDraftOptions {
  draft: SosDraft;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  inFlightRef?: { current: boolean };
  fetchImpl?: typeof fetch;
  generateIdempotencyKey?: () => string;
  timeoutMs?: number;
  photoTimeoutMs?: number;
  /** TF-63: ข้อความตามภาษาของหน้า และภาษาผู้แจ้งที่เก็บกับเคส (reporter_locale) */
  text?: SosText;
}

interface CaseSubmitApiResponse {
  caseCode?: string;
  trackingToken?: string;
  confirmationToken?: string;
  error?: string;
  photoWarning?: string;
  photosPending?: boolean;
}

/** ครอบ fetch ด้วย AbortController + timeout rejection เพื่อกันค้างบนเครือข่ายช้ามาก */
async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new DOMException("Request timed out", "TimeoutError");
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetchImpl(input, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function postCasePayload(
  fetchImpl: typeof fetch,
  idempotencyKey: string,
  body: string,
  timeoutMs: number,
): Promise<{ response: Response; data: CaseSubmitApiResponse }> {
  const response = await fetchWithTimeout(
    fetchImpl,
    "/api/cases",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body,
    },
    timeoutMs,
  );
  const data = (await response.json()) as CaseSubmitApiResponse;
  return { response, data };
}

const _defaultInFlightRef = { current: false };

/**
 * ส่งคำขอความช่วยเหลือ SOS ไปยัง POST /api/cases:
 * 1. ป้องกันการกดส่งซ้ำขณะกำลังส่ง (inFlightRef lock) และผูก Idempotency-Key ประจำร่าง
 * 2. ตรวจความครบถ้วนทุกขั้น (รวมถึงพิกัดและจุดสังเกตในขั้นที่ 3 — ถ้าไม่มีตำแหน่งจะตอบ error ไม่ขึ้นกล่องสีเขียว)
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
      timeoutMs = SOS_SUBMIT_TIMEOUT_MS,
      photoTimeoutMs = SOS_PHOTO_UPLOAD_TIMEOUT_MS,
      text: t = SOS_TEXT_TH,
    } = options;
    const list = (items: string[], joiner: string) => items.join(joiner);

    const check5 = validateStep5Draft(draft, t);
    if (!check5.valid) {
      return {
        status: "invalid_step",
        step: 5,
        step5Errors: check5.errors,
        error: format(t.submit.invalidStep5, {
          items: list(check5.errors.missingSummary, t.listComma),
        }),
      };
    }

    const check1 = validateStep1Draft(draft, undefined, t);
    if (!check1.valid) {
      return {
        status: "invalid_step",
        step: 1,
        step1Errors: check1.errors,
        error: format(t.submit.invalidStep1, {
          items: list(check1.errors.missingSummary, t.listAnd),
        }),
      };
    }

    const check2 = validateStep2Draft(draft, t);
    if (!check2.valid) {
      return {
        status: "invalid_step",
        step: 2,
        step2Errors: check2.errors,
        error: format(t.submit.invalidStep2, {
          items: list(check2.errors.missingSummary, t.listComma),
        }),
      };
    }

    const check4 = validateStep4Draft(draft, t);
    if (!check4.valid) {
      return {
        status: "invalid_step",
        step: 4,
        step4Errors: check4.errors,
        error: t.submit.invalidStep4,
      };
    }

    const check3 = validateStep3Draft(draft, t);
    if (!check3.valid || typeof draft.lat !== "number" || typeof draft.lng !== "number") {
      return {
        status: "invalid_step",
        step: 3,
        step3Errors: check3.errors,
        error: format(t.submit.invalidStep3, {
          items: list(check3.errors.missingSummary, t.listAnd),
        }),
      };
    }

    const normalizedPhone = check5.normalizedPhone ?? normalizePhoneInput(draft.phone);
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

    const basePayload = {
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
      // TF-63: ภาษาของฟอร์มที่ผู้แจ้งใช้ (กู้ภัยเห็นป้าย / ลิงก์ติดตามพาไปภาษานี้)
      reporterLocale: t.locale,
    };
    const hasPhotos = nextDraft.photos.length > 0;
    const caseRequestBody = JSON.stringify(basePayload);
    const fullRequestBody = hasPhotos
      ? JSON.stringify({
          ...basePayload,
          photos: nextDraft.photos.map((photo) => photo.dataUrl),
        })
      : caseRequestBody;

    let caseData: CaseSubmitApiResponse;
    try {
      // ขั้น 1 (TF-69): ส่งเคสโดยไม่มีรูปก่อนเสมอเพื่อให้ถึงเซิร์ฟเวอร์เร็วแม้เน็ตช้ามาก
      const { response, data } = await postCasePayload(
        fetchImpl,
        idempotencyKey,
        caseRequestBody,
        timeoutMs,
      );

      if (!response.ok) {
        if (data.photosPending && data.caseCode && data.trackingToken) {
          return {
            status: "photo_pending",
            idempotencyKey,
            requestBody: fullRequestBody,
            caseCode: data.caseCode,
            trackingToken: data.trackingToken,
            confirmationToken: data.confirmationToken,
          };
        }
        return {
          status: "api_error",
          // ข้อความจากเซิร์ฟเวอร์เป็นภาษาไทย — หน้าอังกฤษใช้ข้อความกลางแทน
          error: (t.locale === "th" ? data.error : undefined) ?? t.submit.apiError,
          idempotencyKey,
        };
      }

      caseData = data;
    } catch {
      return {
        status: "network_error",
        error: t.submit.networkError,
        idempotencyKey,
        requestBody: fullRequestBody,
      };
    }

    const caseCode = caseData.caseCode ?? "";
    let finalCaseData: CaseSubmitApiResponse = caseData;
    let photoWarning = caseData.photoWarning;

    // ขั้น 2 (TF-69): เมื่อสร้างเคสได้รหัสแล้วค่อยอัปโหลดรูปด้วย Idempotency-Key เดิม — รูปล้มต้องไม่ทำให้เคสล้ม
    if (hasPhotos) {
      try {
        const { response: photoResponse, data: photoData } = await postCasePayload(
          fetchImpl,
          idempotencyKey,
          fullRequestBody,
          photoTimeoutMs,
        );
        if (photoResponse.ok) {
          finalCaseData = {
            ...caseData,
            ...photoData,
            caseCode: photoData.caseCode ?? caseData.caseCode,
            trackingToken: photoData.trackingToken ?? caseData.trackingToken,
            confirmationToken: photoData.confirmationToken ?? caseData.confirmationToken,
          };
          photoWarning = photoData.photoWarning ?? photoWarning;
        } else {
          const isPermanent4xx =
            photoResponse.status >= 400 &&
            photoResponse.status < 500 &&
            photoResponse.status !== 429;
          if (isPermanent4xx) {
            photoWarning =
              (t.locale === "th" ? photoData.error : undefined) ?? t.submit.photoRejected;
          } else if (caseData.trackingToken) {
            return {
              status: "photo_pending",
              idempotencyKey,
              requestBody: fullRequestBody,
              caseCode: photoData.caseCode ?? caseCode,
              trackingToken: photoData.trackingToken ?? caseData.trackingToken,
              confirmationToken: photoData.confirmationToken ?? caseData.confirmationToken,
            };
          } else {
            photoWarning = t.submit.photoFailed;
          }
        }
      } catch {
        if (caseData.trackingToken) {
          return {
            status: "photo_pending",
            idempotencyKey,
            requestBody: fullRequestBody,
            caseCode,
            trackingToken: caseData.trackingToken,
            confirmationToken: caseData.confirmationToken,
          };
        }
        photoWarning = t.submit.photoFailed;
      }
    }

    // ส่งสำเร็จแล้วต้องล้างข้อมูลร่างในเครื่องทันทีเพื่อไม่ให้ค้างหรือส่งซ้ำ
    clearSosDraft(storage);

    const finalCode = finalCaseData.caseCode ?? caseCode;
    return {
      status: "submitted",
      caseCode: finalCode,
      trackingToken: finalCaseData.trackingToken,
      confirmationToken: finalCaseData.confirmationToken,
      idempotencyKey,
      successMessage: photoWarning
        ? format(t.submit.successWithWarning, {
            code: finalCode,
            warning: t.locale === "th" ? photoWarning : t.submit.photoFailed,
          })
        : format(t.submit.success, { code: finalCode }),
    };
  } finally {
    inFlightRef.current = false;
  }
}
