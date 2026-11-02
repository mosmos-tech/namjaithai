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
  trackingToken: string;
  phoneLast4: string;
};

const STORAGE_KEY = "namjaithai:sent-case";

export function rememberSentCase(sent: SentCase): void {
  try {
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
