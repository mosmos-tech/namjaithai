import { describe, it, expect } from "vitest";
import { sosSchema, step2Schema, step3Schema, step4Schema, step5Schema } from "../sos-schema";
import { Urgency, WaterLevel, Need } from "../enums";

const validBase = {
  urgency: Urgency.RED,
  waterLevel: WaterLevel.WAIST_CHEST,
  lat: 13.75,
  lng: 100.52,
  accuracyM: 15,
  province: "กรุงเทพมหานคร",
  district: "บางรัก",
  subdistrict: "มหาพฤฒาราม",
  landmark: "หน้าวัดใหญ่",
  adults: 2,
  elderly: 0,
  bedridden: 0,
  children: 0,
  pets: 0,
  needs: [Need.EVACUATION_BOAT],
  otherDetail: undefined,
  name: "สมชาย ใจดี",
  phone: "0812345678",
  lineId: undefined,
  notes: undefined,
};

describe("sosSchema — ข้อมูลถูกต้อง", () => {
  it("ผ่าน validate ฟอร์มครบ", () => {
    expect(sosSchema.safeParse(validBase).success).toBe(true);
  });

  it("ไม่มี province/district/subdistrict ก็ผ่าน (optional)", () => {
    const data = { ...validBase, province: undefined, district: undefined, subdistrict: undefined };
    expect(sosSchema.safeParse(data).success).toBe(true);
  });

  it("needs ว่างได้", () => {
    expect(sosSchema.safeParse({ ...validBase, needs: [] }).success).toBe(true);
  });
});

describe("step2Schema — ขอบเขตประเทศไทย", () => {
  it("พิกัดในไทย ผ่าน", () => {
    expect(step2Schema.safeParse({ lat: 13.75, lng: 100.52, landmark: "วัด" }).success).toBe(true);
  });

  it("lat น้อยกว่า 5 ไม่ผ่าน", () => {
    const r = step2Schema.safeParse({ lat: 4.9, lng: 100.52, landmark: "วัด" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("5–21°");
  });

  it("lat มากกว่า 21 ไม่ผ่าน", () => {
    expect(step2Schema.safeParse({ lat: 21.1, lng: 100.52, landmark: "วัด" }).success).toBe(false);
  });

  it("lng น้อยกว่า 97 ไม่ผ่าน", () => {
    const r = step2Schema.safeParse({ lat: 13.75, lng: 96.9, landmark: "วัด" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("97–106°");
  });

  it("lng มากกว่า 106 ไม่ผ่าน", () => {
    expect(step2Schema.safeParse({ lat: 13.75, lng: 106.1, landmark: "วัด" }).success).toBe(false);
  });

  it("accuracyM เป็น optional", () => {
    expect(step2Schema.safeParse({ lat: 13.75, lng: 100.52, landmark: "วัด" }).success).toBe(true);
    expect(step2Schema.safeParse({ lat: 13.75, lng: 100.52, landmark: "วัด", accuracyM: 50 }).success).toBe(true);
  });

  it("landmark ที่มีช่องว่างขอบถูก trim แล้วผ่าน", () => {
    const r = step2Schema.safeParse({ lat: 13.75, lng: 100.52, landmark: "  หน้าวัด  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.landmark).toBe("หน้าวัด");
  });

  it("landmark เป็นช่องว่างล้วน ไม่ผ่าน", () => {
    expect(step2Schema.safeParse({ lat: 13.75, lng: 100.52, landmark: "   " }).success).toBe(false);
  });
});

describe("step3Schema — ผู้ติดค้าง", () => {
  it("ไม่มีคนเลย ไม่ผ่าน", () => {
    const r = step3Schema.safeParse({ adults: 0, elderly: 0, bedridden: 0, children: 0, pets: 0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("ต้องมีผู้ติดค้างอย่างน้อย 1 คน");
  });

  it("มีแค่สัตว์เลี้ยง (ไม่มีคน) ไม่ผ่าน", () => {
    expect(step3Schema.safeParse({ adults: 0, elderly: 0, bedridden: 0, children: 0, pets: 3 }).success).toBe(false);
  });

  it("มีผู้สูงอายุ 1 คน ผ่าน", () => {
    expect(step3Schema.safeParse({ adults: 0, elderly: 1, bedridden: 0, children: 0, pets: 0 }).success).toBe(true);
  });

  it("จำนวนเกิน 99 ไม่ผ่าน", () => {
    expect(step3Schema.safeParse({ adults: 100, elderly: 0, bedridden: 0, children: 0, pets: 0 }).success).toBe(false);
  });

  it("จำนวน 99 ผ่าน (max)", () => {
    expect(step3Schema.safeParse({ adults: 99, elderly: 0, bedridden: 0, children: 0, pets: 0 }).success).toBe(true);
  });
});

describe("step4Schema — สิ่งที่ต้องการ", () => {
  it("needs ว่างเปล่า ผ่าน (ไม่บังคับ)", () => {
    expect(step4Schema.safeParse({ needs: [] }).success).toBe(true);
  });

  it("เลือก Need ใหม่ที่ถูกต้อง", () => {
    expect(step4Schema.safeParse({ needs: [Need.EVACUATION_BOAT, Need.FOOD] }).success).toBe(true);
  });

  it("เลือก OTHER โดยไม่กรอกรายละเอียด ไม่ผ่าน", () => {
    const r = step4Schema.safeParse({ needs: [Need.OTHER], otherDetail: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ");
  });

  it("เลือก OTHER พร้อมรายละเอียด ผ่าน", () => {
    expect(step4Schema.safeParse({ needs: [Need.OTHER], otherDetail: "ต้องการเต็นท์" }).success).toBe(true);
  });

  it("otherDetail เกิน 200 ตัวอักษร ไม่ผ่าน", () => {
    expect(step4Schema.safeParse({ needs: [Need.OTHER], otherDetail: "x".repeat(201) }).success).toBe(false);
  });
});

describe("step5Schema — ชื่อและเบอร์", () => {
  it("เบอร์มือถือ 10 หลัก ผ่าน", () => {
    expect(step5Schema.safeParse({ name: "สมชาย", phone: "0812345678" }).success).toBe(true);
  });

  it("เบอร์มีขีด 081-234-5678 ผ่านและเก็บเป็น 0812345678", () => {
    const r = step5Schema.safeParse({ name: "สมชาย", phone: "081-234-5678" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("0812345678");
  });

  it("เบอร์มีช่องว่าง 081 234 5678 ผ่านและ normalize", () => {
    const r = step5Schema.safeParse({ name: "สมชาย", phone: "081 234 5678" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("0812345678");
  });

  it("เบอร์บ้านกรุงเทพ ผ่าน", () => {
    expect(step5Schema.safeParse({ name: "สมชาย", phone: "021234567" }).success).toBe(true);
  });

  it("เบอร์สั้นเกิน ไม่ผ่าน", () => {
    expect(step5Schema.safeParse({ name: "สมชาย", phone: "081234" }).success).toBe(false);
  });

  it("เบอร์ต่างประเทศ +66 ไม่ผ่าน", () => {
    expect(step5Schema.safeParse({ name: "สมชาย", phone: "+66812345678" }).success).toBe(false);
  });

  it("ชื่อที่มีช่องว่างขอบถูก trim แล้วผ่าน", () => {
    const r = step5Schema.safeParse({ name: "  สมชาย  ", phone: "0812345678" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("สมชาย");
  });

  it("ชื่อเป็นช่องว่างล้วน ไม่ผ่าน", () => {
    expect(step5Schema.safeParse({ name: "   ", phone: "0812345678" }).success).toBe(false);
  });
});

describe("sosSchema — WaterLevel ROOF", () => {
  it("waterLevel ROOF ผ่าน", () => {
    expect(sosSchema.safeParse({ ...validBase, waterLevel: WaterLevel.ROOF }).success).toBe(true);
  });

  it("waterLevel ABOVE_HEAD ไม่รู้จัก ไม่ผ่าน", () => {
    expect(sosSchema.safeParse({ ...validBase, waterLevel: "ABOVE_HEAD" }).success).toBe(false);
  });
});
