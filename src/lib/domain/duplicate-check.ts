import { z } from "zod";
import { CaseStatus } from "./case-status";
import { type Urgency, type WaterLevel } from "./enums";

/**
 * ระยะห่างสูงสุด (เมตร) ที่ถือว่าอาจเป็นเคสซ้ำในจุดเดียวกัน ตามเกณฑ์ผ่าน TF-16 (< 50 ม.)
 */
export const DUPLICATE_DISTANCE_THRESHOLD_M = 50;

/**
 * ช่วงเวลาสูงสุด (ชั่วโมง) สำหรับตรวจเคสใกล้กันในระยะ 50 เมตร ตามเกณฑ์ผ่าน TF-16 (24 ชม.)
 */
export const DUPLICATE_WINDOW_HOURS = 24;

/**
 * ทางเลือกเมื่อระบบตรวจพบว่าอาจเป็นเคสซ้ำ:
 * - ASK: ค่าเริ่มต้นตอนกดส่งฟอร์ม ถ้าระบบพบเคสซ้ำจะถามผู้แจ้งก่อน
 * - UPDATE_EXISTING: ผู้แจ้งเลือก "อัปเดตเคสเดิม"
 * - CREATE_NEW: ผู้แจ้งเลือก "สร้างใหม่" (ระบบจะสร้างเคสใหม่และทำเครื่องหมายให้แอดมินเห็น)
 */
export const DuplicateAction = {
  ASK: "ASK",
  UPDATE_EXISTING: "UPDATE_EXISTING",
  CREATE_NEW: "CREATE_NEW",
} as const;
export type DuplicateAction = (typeof DuplicateAction)[keyof typeof DuplicateAction];

export const DuplicateMatchReason = {
  SAME_PHONE: "SAME_PHONE",
  NEARBY_50M: "NEARBY_50M",
  BOTH: "BOTH",
} as const;
export type DuplicateMatchReason =
  (typeof DuplicateMatchReason)[keyof typeof DuplicateMatchReason];

export const duplicateActionLabels: Record<
  Exclude<DuplicateAction, "ASK">,
  string
> = {
  UPDATE_EXISTING: "อัปเดตเคสเดิม",
  CREATE_NEW: "สร้างใหม่",
};

const duplicateActionValues = Object.values(DuplicateAction) as [
  DuplicateAction,
  ...DuplicateAction[],
];

export const duplicateResolutionSchema = z.object({
  duplicateAction: z
    .enum(duplicateActionValues, {
      error: "ตัวเลือกจัดการเคสซ้ำไม่ถูกต้อง",
    })
    .optional(),
  targetCaseId: z.string().uuid("รหัสอ้างอิงเคสเดิมไม่ถูกต้อง").optional(),
});

export type DuplicateResolutionInput = z.infer<typeof duplicateResolutionSchema>;

/**
 * สถานะเคสที่ยังเปิดอยู่ (ยังไม่ปิดด้วย RESOLVED / CANCELLED / DUPLICATE / UNREACHABLE)
 */
const OPEN_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set([
  CaseStatus.NEW,
  CaseStatus.ACCEPTED,
  CaseStatus.EN_ROUTE,
  CaseStatus.ON_SITE,
]);

export function isCaseOpenForDuplicateCheck(status: CaseStatus): boolean {
  return OPEN_CASE_STATUSES.has(status);
}

/**
 * คำนวณระยะห่างระหว่างพิกัด 2 จุดบนพื้นโลกเป็นหน่วยเมตร (Haversine formula)
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusM = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusM * c;
}

export interface ExistingCaseForDuplicateCheck {
  caseId: string;
  caseCode: string;
  status: CaseStatus;
  urgency: Urgency;
  waterLevel?: WaterLevel | null;
  lat: number;
  lng: number;
  phone: string;
  landmark?: string;
  createdAt: Date | string;
}

export interface DuplicateCandidateMatch {
  caseId: string;
  caseCode: string;
  status: CaseStatus;
  urgency: Urgency;
  waterLevel?: WaterLevel | null;
  createdAt: string;
  matchReason: DuplicateMatchReason;
  distanceM: number;
}

/**
 * ตรวจสอบว่าคำขอสร้างเคสใหม่เข้าข่ายเคสซ้ำหรือไม่:
 * 1. เบอร์โทรศัพท์เดียวกันมีเคสที่ยังเปิดอยู่ (NEW, ACCEPTED, EN_ROUTE, ON_SITE)
 * 2. หรือมีเคสที่ยังเปิดอยู่ ห่างไม่ถึง 50 เมตร และแจ้งไว้ภายใน 24 ชั่วโมงที่ผ่านมา
 *
 * ลำดับความสำคัญ: หากมีหลายเคส จะเลือกเคสที่เบอร์ตรงกันก่อน แล้วเรียงตามระยะทางที่ใกล้ที่สุด
 */
export function findDuplicateCandidate(
  incoming: {
    phone: string;
    lat: number;
    lng: number;
  },
  existingCases: readonly ExistingCaseForDuplicateCheck[],
  now: Date = new Date(),
): DuplicateCandidateMatch | null {
  const normalizedPhone = incoming.phone.replace(/[\s\-]/g, "");
  const windowMs = DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;

  const matches: Array<
    DuplicateCandidateMatch & { isSamePhone: boolean; createdTimeMs: number }
  > = [];

  for (const item of existingCases) {
    if (!isCaseOpenForDuplicateCheck(item.status)) {
      continue;
    }

    const createdDate =
      item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
    const createdTimeMs = createdDate.getTime();
    const ageMs = now.getTime() - createdTimeMs;

    const itemPhone = item.phone.replace(/[\s\-]/g, "");
    const isSamePhone =
      normalizedPhone.length > 0 && itemPhone === normalizedPhone;

    const rawDistanceM = calculateDistanceMeters(
      incoming.lat,
      incoming.lng,
      item.lat,
      item.lng,
    );
    const distanceM = Math.round(rawDistanceM * 10) / 10;

    const isNearbyWithin24h =
      rawDistanceM < DUPLICATE_DISTANCE_THRESHOLD_M &&
      ageMs >= -60_000 &&
      ageMs <= windowMs;

    if (!isSamePhone && !isNearbyWithin24h) {
      continue;
    }

    const matchReason: DuplicateMatchReason =
      isSamePhone && isNearbyWithin24h
        ? DuplicateMatchReason.BOTH
        : isSamePhone
          ? DuplicateMatchReason.SAME_PHONE
          : DuplicateMatchReason.NEARBY_50M;

    matches.push({
      caseId: item.caseId,
      caseCode: item.caseCode,
      status: item.status,
      urgency: item.urgency,
      waterLevel: item.waterLevel ?? null,
      createdAt: createdDate.toISOString(),
      matchReason,
      distanceM,
      isSamePhone,
      createdTimeMs,
    });
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => {
    if (a.isSamePhone !== b.isSamePhone) {
      return a.isSamePhone ? -1 : 1;
    }
    if (a.distanceM !== b.distanceM) {
      return a.distanceM - b.distanceM;
    }
    return b.createdTimeMs - a.createdTimeMs;
  });

  const best = matches[0]!;
  return {
    caseId: best.caseId,
    caseCode: best.caseCode,
    status: best.status,
    urgency: best.urgency,
    waterLevel: best.waterLevel,
    createdAt: best.createdAt,
    matchReason: best.matchReason,
    distanceM: best.distanceM,
  };
}

/**
 * สร้างข้อความทำเครื่องหมายเคสที่อาจซ้ำให้แอดมินเห็น ตามดีไซน์ Figma (G2 · Possible duplicates)
 * เช่น "อาจซ้ำกับ FL-2610-0040 (ห่าง 30 ม.)"
 */
export function formatAdminDuplicateNotice(
  duplicateOfCaseCode: string,
  distanceM?: number | null,
): string {
  if (typeof distanceM === "number" && Number.isFinite(distanceM)) {
    const roundedMeters = Math.round(distanceM);
    return `อาจซ้ำกับ ${duplicateOfCaseCode} (ห่าง ${roundedMeters} ม.)`;
  }
  return `อาจซ้ำกับ ${duplicateOfCaseCode}`;
}
