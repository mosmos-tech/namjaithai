import { describe, it, expect } from "vitest";
import { z } from "zod";
import { sosSchema } from "../sos-schema";

// ข้อความ error ทุกข้อต้องเป็นภาษาไทย เพราะ API ส่งกลับไปแสดงบนหน้าจอได้ตรงๆ
const hasEnglishWords = (s: string) => /\b(Invalid|expected|received|Too|must)\b/i.test(s);

describe("sosSchema — ข้อความ error เป็นภาษาไทย", () => {
  it("ส่งมาไม่ครบเลย: ทุกช่องได้ข้อความไทย", () => {
    const r = sosSchema.safeParse({});
    expect(r.success).toBe(false);
    const { fieldErrors } = z.flattenError(r.error!);
    const messages = Object.values(fieldErrors).flat() as string[];
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) expect(hasEnglishWords(m), m).toBe(false);
  });

  it("ช่องสำคัญได้ข้อความที่คนทั่วไปอ่านเข้าใจ", () => {
    const { fieldErrors } = z.flattenError(sosSchema.safeParse({}).error!);
    expect(fieldErrors.urgency).toEqual(["กรุณาเลือกระดับความเร่งด่วน"]);
    expect(fieldErrors.waterLevel).toBeUndefined(); // ไม่บังคับ
    expect(fieldErrors.lat).toEqual(["กรุณาระบุตำแหน่ง (พิกัด)"]);
    expect(fieldErrors.landmark).toEqual(["กรุณาระบุจุดสังเกต"]);
    expect(fieldErrors.phone).toEqual(["กรุณาระบุเบอร์โทรศัพท์"]);
  });

  it("ค่าผิดชนิด (ไม่ใช่แค่ขาด) ก็เป็นภาษาไทย", () => {
    const r = sosSchema.safeParse({
      urgency: "PURPLE",
      adults: -1,
      needs: ["X"],
      notes: "ก".repeat(501),
    });
    const messages = r.error!.issues.map((i) => i.message);
    for (const m of messages) expect(hasEnglishWords(m), m).toBe(false);
  });
});
