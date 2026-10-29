import { z } from "zod";

// ── พิกัด ────────────────────────────────────────────────────────────────────
// กรอบสี่เหลี่ยมคร่าวๆ ครอบประเทศไทย ใช้กันพิกัดผิดชัดๆ ก่อนถึงฐานข้อมูล
// (จุดที่อยู่ในกรอบแต่นอกประเทศ เช่น ในลาว ฐานข้อมูลจะตอบว่าไม่พบพื้นที่เอง)
export const latSchema = z
  .number()
  .min(5, "พิกัดอยู่นอกประเทศไทย (ละติจูดต้องอยู่ระหว่าง 5–21°)")
  .max(21, "พิกัดอยู่นอกประเทศไทย (ละติจูดต้องอยู่ระหว่าง 5–21°)");

export const lngSchema = z
  .number()
  .min(97, "พิกัดอยู่นอกประเทศไทย (ลองจิจูดต้องอยู่ระหว่าง 97–106°)")
  .max(106, "พิกัดอยู่นอกประเทศไทย (ลองจิจูดต้องอยู่ระหว่าง 97–106°)");

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

// ── รูปแบบข้อมูลที่ API ตอบกลับ ─────────────────────────────────────────────
export type AdminArea = { code: number; nameTh: string; nameEn: string };

export type LocatedArea = {
  province: { code: number; nameTh: string };
  district: { code: number; nameTh: string };
  subdistrict: { code: number; nameTh: string };
  // 0 = อยู่ในเขตตำบลพอดี, มากกว่า 0 = จุดอยู่นอกเส้นขอบ (เช่น ริมทะเล) เลยเลือกตำบลที่ใกล้สุด
  distanceM: number;
};
