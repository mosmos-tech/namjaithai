import { z } from "zod";
import "./zod-locale";

// ── พิกัด ────────────────────────────────────────────────────────────────────
// กรอบสี่เหลี่ยมคร่าวๆ ครอบประเทศไทย ใช้กันพิกัดผิดชัดๆ ก่อนถึงฐานข้อมูล
// (จุดที่อยู่ในกรอบแต่นอกประเทศ เช่น ในลาว ฐานข้อมูลจะตอบว่าไม่พบพื้นที่เอง)
export const latSchema = z
  .number({ error: "กรุณาระบุตำแหน่ง (พิกัด)" })
  .min(5, "พิกัดอยู่นอกประเทศไทย (ละติจูดต้องอยู่ระหว่าง 5–21°)")
  .max(21, "พิกัดอยู่นอกประเทศไทย (ละติจูดต้องอยู่ระหว่าง 5–21°)");

export const lngSchema = z
  .number({ error: "กรุณาระบุตำแหน่ง (พิกัด)" })
  .min(97, "พิกัดอยู่นอกประเทศไทย (ลองจิจูดต้องอยู่ระหว่าง 97–106°)")
  .max(106, "พิกัดอยู่นอกประเทศไทย (ลองจิจูดต้องอยู่ระหว่าง 97–106°)");

// ── ที่มาและความแม่นยำของพิกัด (TF-65) ────────────────────────────────────────
// เก็บกับเคสให้ทีมกู้ภัยรู้ว่าเชื่อพิกัดได้แค่ไหน
export const LocationSource = {
  GPS: "GPS",
  MANUAL_PIN: "MANUAL_PIN",
  GMAPS_LINK: "GMAPS_LINK",
} as const;
export type LocationSource = (typeof LocationSource)[keyof typeof LocationSource];

// GPS ที่คลาดเคลื่อนเกินนี้ (เช่น MacBook ที่เดาจาก Wi-Fi ได้ ±16 กม.) ไม่ปักหมุดให้
// ผู้แจ้งต้องปักเอง วางลิงก์ หรือกด "ส่งพร้อมที่อยู่แทน" (ต้องกรอกที่อยู่) — ไม่บล็อกการขอความช่วยเหลือ
export const GPS_MAX_ACCEPTABLE_ACCURACY_M = 1000;

export const INACCURATE_LOCATION_MESSAGE =
  "ตำแหน่งจากอุปกรณ์นี้ไม่แม่น กรุณาแตะบนแผนที่ วางลิงก์ Google Maps หรือกรอกที่อยู่";

export const ADDRESS_REQUIRED_FOR_INACCURATE_GPS_MESSAGE =
  "ตำแหน่งจากอุปกรณ์ไม่แม่น กรุณากรอกที่อยู่ให้ทีมกู้ภัยหาเจอ";

export function isInaccurateGps(accuracyM: number | null | undefined): boolean {
  return typeof accuracyM === "number" && accuracyM > GPS_MAX_ACCEPTABLE_ACCURACY_M;
}

/**
 * ความคลาดเคลื่อนที่เก็บกับเคสตามวิธีได้พิกัด
 * ปักเอง/วางลิงก์ = ผู้แจ้งยืนยันจุดเอง ไม่มีค่าความคลาดเคลื่อน (null) แม้ร่างจะมีค่า GPS เก่าค้างอยู่
 */
export function accuracyForLocationSource(
  source: LocationSource | undefined,
  accuracyM: number | undefined,
): number | undefined {
  return source === LocationSource.MANUAL_PIN || source === LocationSource.GMAPS_LINK
    ? undefined
    : accuracyM;
}

export const accuracyMSchema = z.number().min(0, "ค่าความคลาดเคลื่อนต้องไม่ติดลบ");

export const locationSourceSchema = z.enum(
  Object.values(LocationSource) as [LocationSource, ...LocationSource[]],
  { error: "ไม่รู้จักวิธีระบุตำแหน่งนี้" },
);

// ค่าจาก URL เป็นข้อความเสมอ แปลงเป็นตัวเลขก่อน แล้วค่อยใช้กติกาเดียวกับฟอร์ม
// ข้อความว่างต้องไม่กลายเป็น 0 เลยเช็กก่อนแปลง
const numberFromString = z
  .string()
  .trim()
  .min(1, "กรุณาระบุพิกัด")
  .transform(Number)
  .pipe(z.number({ error: "พิกัดต้องเป็นตัวเลข" }));

export const reverseGeocodeQuerySchema = z.object({
  lat: numberFromString.pipe(latSchema),
  lng: numberFromString.pipe(lngSchema),
});

// ── รหัสพื้นที่ (ตามกรมการปกครอง) ──────────────────────────────────────────
// จังหวัด 2 หลัก (10 = กรุงเทพฯ), อำเภอ 4 หลัก (1001), ตำบล 6 หลัก (100101)
const codeSchema = (digits: number, label: string) =>
  z
    .string()
    .regex(new RegExp(`^\\d{${digits}}$`), `รหัส${label}ต้องเป็นตัวเลข ${digits} หลัก`)
    .transform(Number);

export const provinceCodeSchema = codeSchema(2, "จังหวัด");
export const districtCodeSchema = codeSchema(4, "อำเภอ");
export const subdistrictCodeSchema = codeSchema(6, "ตำบล");

// ── รูปแบบข้อมูลที่ API ตอบกลับ ─────────────────────────────────────────────
export type AdminArea = { code: number; nameTh: string; nameEn: string };

export type LocatedArea = {
  province: { code: number; nameTh: string };
  district: { code: number; nameTh: string };
  subdistrict: { code: number; nameTh: string };
  // 0 = อยู่ในเขตตำบลพอดี, มากกว่า 0 = จุดอยู่นอกเส้นขอบ (เช่น ริมทะเล) เลยเลือกตำบลที่ใกล้สุด
  distanceM: number;
};

// กรอบสี่เหลี่ยมครอบตำบล ใช้เลื่อนแผนที่ไปที่ตำบลที่ผู้แจ้งเลือก (TF-65)
export type AreaBounds = { west: number; south: number; east: number; north: number };
