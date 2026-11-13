import type { CaseStatus } from "./case-status";
import { CASE_TRANSFER_TIMEOUT_MINUTES } from "./case-transfer";
import { urgencyLabel, type Urgency } from "./enums";
import { INCIDENT_REGISTRY, type IncidentType } from "./incidents";
import { formatThaiDateTime } from "./thai-date";
import { reporterStatusView, trackPath } from "./tracking";

// ── ข้อความ LINE (TF-34) ────────────────────────────────────────────────────
// ข้อความออกไปอยู่ในระบบของ LINE จึงใส่ได้แค่ รหัสเคส ประเภทเหตุ ระดับ อำเภอ/จังหวัด และลิงก์กลับเว็บ
// ห้ามมี ชื่อ เบอร์ อาการ ที่อยู่ละเอียด — ฟังก์ชันพวกนี้จึงรับเฉพาะค่าที่อนุญาตเท่านั้น
// ข้อความถึงผู้แจ้งไม่มีระดับความเร่งด่วน (ผู้แจ้งไม่เห็นระดับ ตามกติกา TF-55)

const HEADER = "น้ำใจไทย SOS";

function incidentText(type: string | null | undefined): string {
  return INCIDENT_REGISTRY[type as IncidentType]?.label.th ?? "เหตุฉุกเฉิน";
}

function areaText(district: string | null | undefined, province: string | null | undefined) {
  return [district, province].filter(Boolean).join(" ");
}

type CaseRef = {
  caseCode: string;
  trackingToken: string;
  incidentType: string | null;
  district: string | null;
  province: string | null;
  origin: string;
  /** TF-63: ภาษาฟอร์มที่ผู้แจ้งใช้ — ลิงก์ติดตามพาไปหน้าภาษาเดียวกัน */
  locale?: "th" | "en";
};

function trackUrl(input: CaseRef): string {
  const path = trackPath(input.caseCode, input.trackingToken);
  return new URL(input.locale === "en" ? `/en${path}` : path, input.origin).href;
}

/**
 * TF-25: สถานะกลับเป็น NEW ได้ทางเดียวคือทีมปล่อยเคส (ตอนแจ้งครั้งแรกไม่มีข้อความ LINE สถานะ)
 * จึงบอกผู้แจ้งตรงๆ ว่ากำลังหาทีมใหม่ ไม่ใช้คำว่า "รอทีมรับเคส" ที่ฟังเหมือนเพิ่งเริ่ม
 */
export const REPORTER_RELEASED_LINE_TEXT = "ทีมเดิมไม่สามารถไปได้ กำลังหาทีมใหม่ให้";

/** ผู้แจ้ง: สถานะเคสเปลี่ยน (เช่น มีทีมรับเคสแล้ว / ทีมปล่อยเคส) */
export function formatCaseStatusLine(
  input: CaseRef & { toStatus: CaseStatus; at: string | Date },
): string {
  const statusText =
    input.toStatus === "NEW"
      ? REPORTER_RELEASED_LINE_TEXT
      : reporterStatusView(input.toStatus).badge;
  return [
    `${HEADER} · เคส ${input.caseCode}`,
    `อัปเดตเมื่อ ${formatThaiDateTime(input.at)}: ${statusText}`,
    [incidentText(input.incidentType), areaText(input.district, input.province)]
      .filter(Boolean)
      .join(" · "),
    `ดูสถานะ: ${trackUrl(input)}`,
  ].join("\n");
}

/** ผู้แจ้ง: ทีมกู้ภัยแจ้งว่าช่วยเหลือเสร็จแล้ว ขอให้กดยืนยันปิดเคส (จุดเชื่อมให้ TF-58) */
export function formatCloseConfirmationLine(input: CaseRef): string {
  return [
    `${HEADER} · เคส ${input.caseCode}`,
    "ทีมกู้ภัยแจ้งว่าช่วยเหลือเสร็จแล้ว กรุณากดยืนยันที่ลิงก์ โดยเข้าสู่ระบบด้วยบัญชี LINE ที่ใช้แจ้งเคส",
    trackUrl(input),
  ].join("\n");
}

/**
 * หัวหน้าหน่วย (TF-59): ส่งต่อไม่สำเร็จ ไม่มีหน่วยกดรับในเวลาที่กำหนด เคสกลับเข้าคิวแล้ว
 * ลิงก์ไปหน้าเคสของกู้ภัย (ต้องล็อกอิน) ไม่ใช่หน้าติดตามของผู้แจ้ง
 */
export function formatTransferExpiredLine(
  input: Omit<CaseRef, "trackingToken"> & { caseId: string },
): string {
  return [
    `${HEADER} · เคส ${input.caseCode}`,
    `ส่งต่อไม่สำเร็จ: ไม่มีหน่วยกดรับภายใน ${CASE_TRANSFER_TIMEOUT_MINUTES} นาที เคสกลับเข้าคิวรอรับพร้อมแท็กอุปกรณ์ที่ต้องใช้`,
    [incidentText(input.incidentType), areaText(input.district, input.province)]
      .filter(Boolean)
      .join(" · "),
    `ดูเคส: ${new URL(`/rescue/cases/${encodeURIComponent(input.caseId)}`, input.origin).href}`,
  ].join("\n");
}

/**
 * กู้ภัย: เคสแดงใหม่ในพื้นที่ — หลายเคสในช่วง 5 นาทีรวมเป็นข้อความเดียว
 * latest = เคสล่าสุดในชุดนี้ (แสดงเป็นตัวอย่าง)
 */
export function formatRedAlertDigestLine(input: {
  caseCount: number;
  latest: {
    caseCode: string;
    incidentType: string | null;
    urgency: Urgency;
    district: string | null;
    province: string | null;
  };
  origin: string;
}): string {
  const { latest } = input;
  const summary = [latest.caseCode, incidentText(latest.incidentType), urgencyLabel[latest.urgency]]
    .filter(Boolean)
    .join(" · ");
  const area = areaText(latest.district, latest.province);
  const listUrl = new URL("/rescue/cases", input.origin).href;
  if (input.caseCount <= 1) {
    return ["🔴 เคสวิกฤตใหม่ในพื้นที่ของหน่วย", summary, area, `เปิดรายการเคส: ${listUrl}`]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `🔴 มีเคสแดงใหม่ ${input.caseCount} เคสในพื้นที่ของคุณ`,
    `ล่าสุด: ${summary}${area ? ` · ${area}` : ""}`,
    `เปิดรายการเคส: ${listUrl}`,
  ].join("\n");
}
