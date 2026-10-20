import { describe, it, expect } from "vitest";
import { sosSchema, step3Schema, step4Schema, step5Schema } from "../sos-schema";
import { Urgency, WaterLevel, Need } from "../enums";

const validBase = {
  urgency: Urgency.RED,
  waterLevel: WaterLevel.WAIST,
  lat: 13.75,
  lng: 100.52,
  province: "กรุงเทพมหานคร",
  district: "บางรัก",
  subdistrict: "มหาพฤฒาราม",
  landmark: "หน้าวัดใหญ่",
  adults: 2,
  elderly: 0,
  bedridden: 0,
  children: 0,
  pets: 0,
  needs: [Need.BOAT],
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
});

describe("sosSchema — ขั้น 3: ผู้ติดค้าง", () => {
  it("ไม่มีคนเลย ไม่ผ่าน", () => {
    const result = step3Schema.safeParse({
      adults: 0, elderly: 0, bedridden: 0, children: 0, pets: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ต้องมีผู้ติดค้างอย่างน้อย 1 คน");
    }
  });

  it("มีแค่สัตว์เลี้ยงไม่นับ ต้องมีคน", () => {
    const result = step3Schema.safeParse({
      adults: 0, elderly: 0, bedridden: 0, children: 0, pets: 3,
    });
    expect(result.success).toBe(false);
  });

  it("มีผู้สูงอายุ 1 คน ผ่าน", () => {
    expect(step3Schema.safeParse({
      adults: 0, elderly: 1, bedridden: 0, children: 0, pets: 0,
    }).success).toBe(true);
  });
});

describe("sosSchema — ขั้น 4: สิ่งที่ต้องการ", () => {
  it("เลือก OTHER โดยไม่กรอกรายละเอียด ไม่ผ่าน", () => {
    const result = step4Schema.safeParse({
      needs: [Need.OTHER],
      otherDetail: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ");
    }
  });

  it("เลือก OTHER พร้อมกรอกรายละเอียด ผ่าน", () => {
    expect(step4Schema.safeParse({
      needs: [Need.OTHER],
      otherDetail: "ต้องการเต็นท์พัก",
    }).success).toBe(true);
  });

  it("เลือก needs ว่างเปล่า ไม่ผ่าน", () => {
    expect(step4Schema.safeParse({ needs: [] }).success).toBe(false);
  });

  it("เลือก BOAT ไม่ต้องมี otherDetail", () => {
    expect(step4Schema.safeParse({ needs: [Need.BOAT] }).success).toBe(true);
  });
});

describe("sosSchema — ขั้น 5: เบอร์โทร", () => {
  it("เบอร์มือถือ 10 หลักถูกต้อง ผ่าน", () => {
    expect(step5Schema.safeParse({ name: "สมชาย", phone: "0812345678" }).success).toBe(true);
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

  it("ไม่มีชื่อ ไม่ผ่าน", () => {
    expect(step5Schema.safeParse({ name: "", phone: "0812345678" }).success).toBe(false);
  });
});

describe("sosSchema — full schema ตรวจ cross-step", () => {
  it("ไม่มีผู้ติดค้างเลย ไม่ผ่าน full schema", () => {
    const data = { ...validBase, adults: 0, elderly: 0, bedridden: 0, children: 0 };
    expect(sosSchema.safeParse(data).success).toBe(false);
  });

  it("OTHER ไม่มี otherDetail ไม่ผ่าน full schema", () => {
    const data = { ...validBase, needs: [Need.OTHER], otherDetail: undefined };
    expect(sosSchema.safeParse(data).success).toBe(false);
  });
});
