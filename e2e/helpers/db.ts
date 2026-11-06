import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ตัวช่วยคุยกับฐานข้อมูลในเครื่องสำหรับ E2E (ใช้ service key ข้าม RLS)
 * ใช้เตรียมข้อมูลหรือจำลองสิ่งที่คนอื่นทำ (เช่น ทีมกู้ภัยเปลี่ยนสถานะเคส)
 * กันพลาด: ยอมทำงานเฉพาะ Supabase ในเครื่อง (127.0.0.1 / localhost) เท่านั้น
 */
export function adminDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("E2E ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY");
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`E2E ใช้ได้กับ Supabase ในเครื่องเท่านั้น (ตอนนี้ชี้ไปที่ ${host})`);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// เบอร์มือถือไทยสุ่ม (ไม่ซ้ำกันทุกครั้ง เลี่ยงการตรวจเคสซ้ำด้วยเบอร์ของ TF-16)
export function randomPhone(): string {
  return `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

// พิกัดไม่ซ้ำสำหรับแต่ละเคสใน test: เลี่ยงการตรวจเคสซ้ำด้วยระยะ 50 ม. ของ TF-16
// เดิมสุ่มในกรุงเทพฯ ช่องเล็ก พอรันร้อยกว่าเคสมีโอกาสสุ่มได้จุดใกล้กันจน test ล้มแบบสุ่ม
// ตอนนี้ใช้ตารางช่องละ 0.001° (≈110 ม.) ในภาคกลาง 1,800 × 1,800 ช่อง:
// - รอบเดียวกันไม่ซ้ำช่องแน่นอน: worker แต่ละตัวได้ช่วงของตัวเอง แล้วนับต่อไปทีละช่อง
// - ต่างรอบ (เคสค้างในฐานข้อมูลในเครื่อง) เริ่มที่จุดสุ่มจาก global-setup โอกาสชนน้อยมาก
const GRID_SIZE = 1800;
const GRID_STEP = 0.001;
const POINTS_PER_WORKER = 100_003;
let pointCounter = 0;

export function uniqueTestPoint(): { lat: number; lng: number } {
  const seed = Number(process.env.E2E_LOCATION_SEED ?? 0);
  const worker = Number(process.env.TEST_WORKER_INDEX ?? 0);
  const cell = (seed + worker * POINTS_PER_WORKER + pointCounter++) % (GRID_SIZE * GRID_SIZE);
  return {
    lat: Number((13.8 + Math.floor(cell / GRID_SIZE) * GRID_STEP).toFixed(6)),
    lng: Number((99.6 + (cell % GRID_SIZE) * GRID_STEP).toFixed(6)),
  };
}

export type CreatedCase = { caseCode: string; trackingToken: string; phone: string };

// สร้างเคสผ่าน API จริง (/api/cases) แบบเดียวกับที่ฟอร์มส่ง
export async function createCaseViaApi(
  baseURL: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedCase> {
  const phone = (overrides.phone as string) ?? randomPhone();
  const res = await fetch(new URL("/api/cases", baseURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      // แต่ละเคสมาจาก "คนละเครื่อง" ไม่งั้นทั้งชุด test ชนเพดาน IP ละ 20 เคส/ชม. (TF-12)
      "X-Forwarded-For": `10.48.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    },
    body: JSON.stringify({
      // TF-55: ระบบคำนวณระดับจากคำตอบ (ส่ง urgency มาก็ถูกเมิน)
      dangerSigns: [],
      canSelfEvacuate: false,
      ...uniqueTestPoint(),
      landmark: "จุดสังเกตทดสอบ E2E",
      adults: 1,
      elderly: 0,
      bedridden: 0,
      children: 0,
      pets: 0,
      needs: [],
      name: "ทดสอบ E2E",
      duplicateAction: "CREATE_NEW",
      phone,
      ...overrides,
    }),
  });
  const body = (await res.json()) as { caseCode?: string; trackingToken?: string; error?: string };
  if (!res.ok || !body.caseCode || !body.trackingToken) {
    throw new Error(`สร้างเคสทดสอบไม่สำเร็จ (${res.status}): ${body.error ?? ""}`);
  }
  return { caseCode: body.caseCode, trackingToken: body.trackingToken, phone };
}

// จำนวนเคสที่แจ้งด้วยเบอร์นี้ (ใช้เช็กว่าเกิดเคสใหม่/เคสซ้ำหรือไม่ โดยไม่ปนกับ test อื่นที่รันพร้อมกัน)
export async function countCasesByPhone(phone: string): Promise<number> {
  const { count, error } = await adminDb()
    .from("case_contacts")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone);
  if (error) throw error;
  return count ?? 0;
}
