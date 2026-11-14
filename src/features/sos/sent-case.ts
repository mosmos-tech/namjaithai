import { rememberDeviceCase } from "./device-cases";
import type { IncidentType } from "@/lib/domain/incidents/types";

/**
 * จำเคสที่เพิ่งส่งสำเร็จไว้ใน sessionStorage เพื่อให้หน้า /sos/sent แสดงรหัสเคสได้ทันที
 * โดยไม่ต้องถามฐานข้อมูล และไม่ต้องใส่ token/เบอร์ลงใน URL
 *
 * ใช้ sessionStorage (ไม่ใช่ localStorage) เพราะอยู่แค่แท็บนี้ ปิดแท็บแล้วหาย
 * กดรีเฟรชหน้าก็ยังเห็นรหัสเคสอยู่
 *
 * ฟอร์ม SOS (TF-11) เรียกหลัง POST /api/cases สำเร็จ:
 *   rememberSentCase({ caseCode, trackingToken, phoneLast4 });
 *   router.push("/sos/sent");
 */

export type SentCase = {
  caseCode: string;
  incidentType?: IncidentType;
  trackingToken: string;
  confirmationToken?: string;
  phoneLast4: string;
  /** TF-80: เคสถึงแล้วแต่รูปมีปัญหา */
  photoWarning?: string;
};

const STORAGE_KEY = "namjaithai:sent-case";

export function rememberSentCase(sent: SentCase): void {
  try {
    if (sent.confirmationToken)
      rememberDeviceCase(window.localStorage, {
        caseCode: sent.caseCode,
        trackingToken: sent.trackingToken,
        confirmationToken: sent.confirmationToken,
      });
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sent));
  } catch {
    // โหมดส่วนตัวบางเบราว์เซอร์เขียน storage ไม่ได้ หน้า /sos/sent จะพาไปกรอกที่ /track แทน
  }
}

// useSyncExternalStore ต้องได้ object ตัวเดิมถ้าข้อมูลไม่เปลี่ยน ไม่งั้นจะ render วนไม่หยุด
let cachedRaw: string | null = null;
let cachedSent: SentCase | null = null;

export function getSentCaseSnapshot(): SentCase | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedSent = raw ? (JSON.parse(raw) as SentCase) : null;
    }
  } catch {
    cachedSent = null;
  }
  return cachedSent;
}

// ฝั่งเซิร์ฟเวอร์ไม่มี sessionStorage
export function getSentCaseServerSnapshot(): SentCase | null {
  return null;
}

// sessionStorage ไม่มี event เวลาแท็บเดียวกันเขียน และหน้านี้ไม่ได้แก้ค่าเอง เลยไม่ต้องฟังอะไร
export function subscribeSentCase(): () => void {
  return () => {};
}

/**
 * TF-80: เปิดหน้า /sos/sent ได้ไหม ก่อนพาผู้แจ้งไป (ส่งสำเร็จแล้วแต่เน็ตหลุดพอดี ห้ามเห็นหน้า error)
 * - "network": ดึงหน้าจากเซิร์ฟเวอร์ได้
 * - "cache": ไม่มีเน็ต แต่ service worker เก็บหน้าไว้ (TF-41) — เปิดแบบโหลดทั้งหน้าให้ service worker ตอบ
 * - null: เปิดไม่ได้ ให้ฟอร์มแสดงรหัสเคสใหญ่แทน
 */
export async function sentPageAvailability(path: string): Promise<"network" | "cache" | null> {
  try {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
    if (response.ok) return "network";
  } catch {
    // เน็ตหลุด — ลองแคชของ service worker
  }
  try {
    if (navigator.serviceWorker?.controller && (await caches.match(path))) return "cache";
  } catch {
    // เบราว์เซอร์ไม่มี Cache Storage
  }
  return null;
}
