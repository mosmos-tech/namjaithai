import { z } from "zod";
import { CaseStatus } from "./case-status";
import type { Urgency } from "./enums";

// ── ข้อมูลที่ผู้แจ้งพิมพ์/ส่งมาเพื่อเปิดหน้าติดตาม ───────────────────────────────
// รหัสเคสจาก create_sos_case(): FL-YYMM-NNNN (เลขรันเกิน 9999 ได้ เลยรับ 4 หลักขึ้นไป)
// รับตัวพิมพ์เล็ก/ช่องว่างหัวท้ายด้วย เพราะผู้สูงอายุอาจพิมพ์ fl-2610-0042
export const caseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^FL-\d{4}-\d{4,}$/, "รหัสเคสไม่ถูกต้อง (ตัวอย่าง FL-2610-0042)");

export const phoneLast4Schema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "กรุณาใส่เบอร์โทร 4 ตัวท้าย (ตัวเลข 4 หลัก)");

// tracking_token = gen_random_bytes(16) แบบ hex → 32 ตัว
export const trackingTokenSchema = z.string().regex(/^[0-9a-f]{32}$/, "ลิงก์ติดตามไม่ถูกต้อง");

export const trackLookupSchema = z.object({
  caseCode: caseCodeSchema,
  phoneLast4: phoneLast4Schema,
});

// ── ข้อมูลที่ /api/track ตอบกลับ (ไม่มีชื่อ/เบอร์/พิกัดของผู้แจ้ง) ──────────────
export type CaseEventType =
  | "CREATED"
  | "ACCEPTED"
  | "RELEASED"
  | "ASSIGNED"
  | "STATUS_CHANGED"
  | "REPORTER_UPDATED"
  | "CANCELLED"
  | "MERGED_DUPLICATE"
  | "MARKED_UNREACHABLE"
  | "AUTO_ESCALATED"
  | "NOTE_ADDED";

export type TrackedCase = {
  caseCode: string;
  trackingToken: string;
  status: CaseStatus;
  urgency: Urgency;
  createdAt: string;
  lastStatusUpdatedAt: string;
  area: { province: string | null; district: string | null; subdistrict: string | null };
  // null = ยังไม่มีทีมรับ; unitName เป็น null ได้ถ้ามีกู้ภัยรับแต่ไม่ได้ผูกหน่วย
  team: { unitName: string | null; contactPhone: string | null } | null;
  timeline: { type: CaseEventType; toStatus: CaseStatus | null; at: string }[];
};

// ── ข้อความสถานะที่ผู้แจ้งเห็น ──────────────────────────────────────────────
// กติกาการ์ด TF-13: ใช้คำว่า "ทีมกำลังมา" เฉพาะเมื่อมีคนกดรับเคสแล้วเท่านั้น
// ห้ามทำให้คนที่รออยู่เข้าใจผิดว่ามีคนกำลังมา ทั้งที่ยังไม่มีใครรับ

export const TRACK_STEPS = ["รับแจ้ง", "ทีมรับเคส", "กำลังมา", "ถึงแล้ว", "สำเร็จ"] as const;

export type StatusTone = "waiting" | "progress" | "success" | "closed";

export type ReporterStatusView = {
  badge: string;
  title: string;
  description: string;
  tone: StatusTone;
  // จำนวนขั้นใน TRACK_STEPS ที่ผ่านแล้ว และขั้นถัดไปกำลังเกิดอยู่หรือยัง (โชว์ไอคอนหมุน/นำทาง)
  // null = เคสปิดแบบไม่สำเร็จ ไม่ต้องโชว์แถบขั้น
  progress: { done: number; active: boolean } | null;
};

const STATUS_VIEW: Record<CaseStatus, ReporterStatusView> = {
  NEW: {
    badge: "รอทีมรับเคส",
    title: "กำลังหาทีมกู้ภัยที่ใกล้คุณที่สุด",
    description: "ระบบแจ้งทีมในพื้นที่แล้ว ระหว่างรอให้ขึ้นที่สูงและเปิดเสียงโทรศัพท์ไว้",
    tone: "waiting",
    progress: { done: 1, active: true },
  },
  ACCEPTED: {
    badge: "ทีมรับเคสแล้ว",
    title: "ทีมกู้ภัยรับเคสของคุณแล้ว",
    description: "ทีมกำลังเตรียมออกเดินทาง และจะโทรหาคุณก่อนออกเดินทาง",
    tone: "progress",
    progress: { done: 2, active: false },
  },
  EN_ROUTE: {
    badge: "กำลังเดินทาง",
    title: "ทีมกู้ภัยกำลังมาหาคุณ",
    description: "อยู่ในที่ปลอดภัย เปิดเสียงโทรศัพท์ไว้ ทีมอาจโทรถามทาง",
    tone: "progress",
    progress: { done: 2, active: true },
  },
  ON_SITE: {
    badge: "ทีมถึงแล้ว",
    title: "ทีมกู้ภัยถึงจุดของคุณแล้ว",
    description: "ส่งสัญญาณให้ทีมเห็น เช่น โบกผ้าสีสด หรือเปิดไฟฉาย",
    tone: "progress",
    progress: { done: 4, active: false },
  },
  RESOLVED: {
    badge: "ช่วยเหลือสำเร็จ",
    title: "ช่วยเหลือสำเร็จแล้ว",
    description: "ขอบคุณที่แจ้งเข้ามา ขอให้ปลอดภัย",
    tone: "success",
    progress: { done: 5, active: false },
  },
  CANCELLED: {
    badge: "ปิดเคสแล้ว",
    title: "ยกเลิกคำขอแล้ว",
    description: "ถ้ายังต้องการความช่วยเหลือ แจ้งใหม่ได้ทันที หรือโทร 1669 / 1784",
    tone: "closed",
    progress: null,
  },
  DUPLICATE: {
    badge: "ปิดเคสแล้ว",
    title: "เคสนี้ซ้ำกับเคสที่แจ้งไว้แล้ว",
    description: "ทีมรวมไปดูแลในเคสเดิม ถ้ายังต้องการความช่วยเหลือ โทร 1669 / 1784",
    tone: "closed",
    progress: null,
  },
  UNREACHABLE: {
    badge: "ปิดเคสแล้ว",
    title: "ทีมติดต่อคุณไม่ได้",
    description: "ถ้ายังต้องการความช่วยเหลือ แจ้งใหม่ได้ทันที หรือโทร 1669 / 1784",
    tone: "closed",
    progress: null,
  },
};

export function reporterStatusView(status: CaseStatus): ReporterStatusView {
  return STATUS_VIEW[status];
}

// เคสที่ปิดแล้วไม่ต้องดึงข้อมูลใหม่อีก
export function isClosedStatus(status: CaseStatus): boolean {
  return STATUS_VIEW[status].tone === "success" || STATUS_VIEW[status].tone === "closed";
}

const STATUS_CHANGED_LABEL: Partial<Record<CaseStatus, string>> = {
  [CaseStatus.EN_ROUTE]: "ทีมออกเดินทาง",
  [CaseStatus.ON_SITE]: "ทีมถึงจุดของคุณ",
  [CaseStatus.RESOLVED]: "ช่วยเหลือสำเร็จ",
};

const EVENT_LABEL: Record<CaseEventType, string> = {
  CREATED: "รับแจ้งเคสแล้ว",
  ACCEPTED: "ทีมกู้ภัยรับเคส",
  ASSIGNED: "มอบหมายทีมกู้ภัยแล้ว",
  RELEASED: "ทีมคืนเคส กำลังหาทีมใหม่",
  STATUS_CHANGED: "อัปเดตสถานะ",
  REPORTER_UPDATED: "คุณอัปเดตข้อมูลเคส",
  CANCELLED: "ยกเลิกคำขอ",
  MERGED_DUPLICATE: "รวมกับเคสที่แจ้งไว้แล้ว",
  MARKED_UNREACHABLE: "ทีมติดต่อคุณไม่ได้",
  AUTO_ESCALATED: "ระบบเร่งหาทีมเพิ่ม",
  NOTE_ADDED: "ทีมเพิ่มบันทึก",
};

export function timelineLabel(type: CaseEventType, toStatus: CaseStatus | null): string {
  if (type === "STATUS_CHANGED" && toStatus) {
    return STATUS_CHANGED_LABEL[toStatus] ?? EVENT_LABEL.STATUS_CHANGED;
  }
  return EVENT_LABEL[type];
}

// ── ลิงก์และข้อความแชร์ ─────────────────────────────────────────────────────
export function trackPath(caseCode: string, trackingToken: string): string {
  return `/track/${encodeURIComponent(caseCode)}?t=${trackingToken}`;
}

// ข้อความที่ส่งเข้า LINE: รหัสเคสอยู่บรรทัดแรก ญาติจะได้เห็นทันทีในแชต
export function lineShareText(caseCode: string, trackUrl: string): string {
  return [
    `ฉันแจ้งขอความช่วยเหลือน้ำท่วมแล้ว รหัสเคส ${caseCode}`,
    `ติดตามสถานะได้ที่ ${trackUrl}`,
    "(น้ำใจไทย SOS)",
  ].join("\n");
}

// ลิงก์แชร์ของ LINE เปิดแอป LINE ให้เลือกคนส่งได้เลย (มือถือ) หรือเปิดหน้า LINE บนเว็บ (คอม)
export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}
