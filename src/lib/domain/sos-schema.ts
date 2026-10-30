import { z } from "zod";
import "./zod-locale";
import { Urgency, WaterLevel, Need } from "./enums";
import { latSchema, lngSchema } from "./geo";

const urgencyValues = Object.values(Urgency) as [Urgency, ...Urgency[]];
const waterLevelValues = Object.values(WaterLevel) as [WaterLevel, ...WaterLevel[]];
const needValues = Object.values(Need) as [Need, ...Need[]];

// เบอร์โทรไทย: มือถือ 06x-09x (10 หลัก) หรือบ้าน/สำนักงาน 02x-05x (9-10 หลัก)
const thaiPhoneRegex = /^(0[6-9]\d{8}|0[2-5]\d{7,8})$/;

// ── ขั้น 1: ความเร่งด่วนและระดับน้ำ ─────────────────────────────────────────
export const step1Schema = z.object({
  urgency: z.enum(urgencyValues, { error: "กรุณาเลือกระดับความเร่งด่วน" }),
  waterLevel: z.enum(waterLevelValues, { error: "กรุณาเลือกระดับน้ำ" }),
});

// ── ขั้น 2: ตำแหน่ง ──────────────────────────────────────────────────────────
// province/district/subdistrict เป็น optional เพราะเซิร์ฟเวอร์จะเติมจากพิกัดทีหลัง
// ตอนออฟไลน์ geocode ไม่ได้ เลยต้องไม่บังคับกรอกหน้าฟอร์ม
export const step2Schema = z.object({
  lat: latSchema,
  lng: lngSchema,
  accuracyM: z.number().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  subdistrict: z.string().optional(),
  // landmark บังคับและ trim ก่อนตรวจ — ป้องกันส่งช่องว่างเปล่า
  landmark: z
    .string({ error: "กรุณาระบุจุดสังเกต" })
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "กรุณาระบุจุดสังเกต")),
});

// ── ขั้น 3: ผู้ติดค้าง ───────────────────────────────────────────────────────
const peopleCount = z
  .number({ error: "กรุณาระบุจำนวนเป็นตัวเลข" })
  .int("จำนวนต้องเป็นจำนวนเต็ม")
  .min(0, "จำนวนติดลบไม่ได้")
  .max(99, "จำนวนต้องไม่เกิน 99");

// แยก base (ZodObject) ไว้สำหรับ merge ทีหลัง เพราะ .refine() คืน ZodEffects merge ไม่ได้
export const step3BaseSchema = z.object({
  adults: peopleCount,
  elderly: peopleCount,
  bedridden: peopleCount,
  children: peopleCount,
  pets: peopleCount,
});

export const step3Schema = step3BaseSchema.refine(
  (d) => d.adults + d.elderly + d.bedridden + d.children > 0,
  { message: "ต้องมีผู้ติดค้างอย่างน้อย 1 คน", path: ["adults"] },
);

// ── ขั้น 4: สิ่งที่ต้องการ ───────────────────────────────────────────────────
// needs เป็น optional (ไม่บังคับ min 1) เพราะอาจไม่รู้ว่าต้องการอะไรตอนออฟไลน์
export const step4BaseSchema = z.object({
  needs: z.array(z.enum(needValues, { error: "ไม่มีตัวเลือกนี้ในรายการสิ่งที่ต้องการ" }), {
    error: "กรุณาระบุสิ่งที่ต้องการ",
  }),
  otherDetail: z.string().max(200, "รายละเอียดอื่นๆ ต้องไม่เกิน 200 ตัวอักษร").optional(),
});

export const step4Schema = step4BaseSchema.refine(
  (d) => !d.needs.includes(Need.OTHER) || (d.otherDetail?.trim().length ?? 0) > 0,
  { message: "กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ", path: ["otherDetail"] },
);

// ── ขั้น 5: ข้อมูลติดต่อ ─────────────────────────────────────────────────────
export const step5Schema = z.object({
  // trim ก่อนตรวจ — ป้องกันส่งช่องว่างเปล่า
  name: z
    .string({ error: "กรุณาระบุชื่อ" })
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "กรุณาระบุชื่อ")),
  // ตัดช่องว่างและขีดก่อนตรวจและเก็บ เพื่อรับ 081-234-5678 และเก็บเป็น 0812345678
  phone: z
    .string({ error: "กรุณาระบุเบอร์โทรศัพท์" })
    .transform((s) => s.replace(/[\s\-]/g, ""))
    .pipe(
      z
        .string()
        .regex(thaiPhoneRegex, "กรุณาระบุเบอร์โทรศัพท์ไทยที่ถูกต้อง (เช่น 0812345678)"),
    ),
  lineId: z.string().optional(),
  notes: z.string().max(500, "รายละเอียดเพิ่มเติมต้องไม่เกิน 500 ตัวอักษร").optional(),
});

// ── ฟอร์ม SOS ครบทุกขั้น ─────────────────────────────────────────────────────
// merge ใช้ base schema (ZodObject) ไม่ใช่ refined เพราะ ZodEffects merge ไม่ได้
export const sosSchema = step1Schema
  .merge(step2Schema)
  .merge(step3BaseSchema)
  .merge(step4BaseSchema)
  .merge(step5Schema)
  .refine((d) => d.adults + d.elderly + d.bedridden + d.children > 0, {
    message: "ต้องมีผู้ติดค้างอย่างน้อย 1 คน",
    path: ["adults"],
  })
  .refine(
    (d) =>
      !d.needs.includes(Need.OTHER) ||
      (d.otherDetail?.trim().length ?? 0) > 0,
    {
      message: "กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ",
      path: ["otherDetail"],
    },
  );

export type SosFormData = z.infer<typeof sosSchema>;
export type Step1Data = z.infer<typeof step1Schema>;
export type Step2Data = z.infer<typeof step2Schema>;
export type Step3Data = z.infer<typeof step3Schema>;
export type Step4Data = z.infer<typeof step4Schema>;
export type Step5Data = z.infer<typeof step5Schema>;
