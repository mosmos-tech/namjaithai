import { describe, it, expect } from "vitest";
import {
  sosSchema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  validateAndSplitIncidentDetails,
} from "../sos-schema";
import { WaterLevel, Need } from "../enums";
import { IncidentType } from "../incidents";

const validBase = {
  consent: true,
  healthConsent: true,
  dangerSigns: [],
  canSelfEvacuate: false,
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
    expect(
      step2Schema.safeParse({ lat: 13.75, lng: 100.52, landmark: "วัด", accuracyM: 50 }).success,
    ).toBe(true);
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
    expect(
      step3Schema.safeParse({ adults: 0, elderly: 0, bedridden: 0, children: 0, pets: 3 }).success,
    ).toBe(false);
  });

  it("มีผู้สูงอายุ 1 คน ผ่าน", () => {
    expect(
      step3Schema.safeParse({ adults: 0, elderly: 1, bedridden: 0, children: 0, pets: 0 }).success,
    ).toBe(true);
  });

  it("จำนวนเกิน 99 ไม่ผ่าน", () => {
    expect(
      step3Schema.safeParse({ adults: 100, elderly: 0, bedridden: 0, children: 0, pets: 0 })
        .success,
    ).toBe(false);
  });

  it("จำนวน 99 ผ่าน (max)", () => {
    expect(
      step3Schema.safeParse({ adults: 99, elderly: 0, bedridden: 0, children: 0, pets: 0 }).success,
    ).toBe(true);
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
    if (!r.success)
      expect(r.error.issues[0].message).toBe("กรุณาระบุรายละเอียดสิ่งที่ต้องการอื่นๆ");
  });

  it("เลือก OTHER พร้อมรายละเอียด ผ่าน", () => {
    expect(
      step4Schema.safeParse({ needs: [Need.OTHER], otherDetail: "ต้องการเต็นท์" }).success,
    ).toBe(true);
  });

  it("otherDetail เกิน 200 ตัวอักษร ไม่ผ่าน", () => {
    expect(
      step4Schema.safeParse({ needs: [Need.OTHER], otherDetail: "x".repeat(201) }).success,
    ).toBe(false);
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

describe("TF-54: incidentDetailsSchema และ validateAndSplitIncidentDetails", () => {
  it("ROAD_ACCIDENT รองรับ vehicleTypes แบบ multi-select", () => {
    const valid = validateAndSplitIncidentDetails(IncidentType.ROAD_ACCIDENT, {
      vehicleTypes: ["CAR", "MOTORCYCLE"],
      isTrapped: false,
      injuredCount: 1,
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.publicDetails.vehicleTypes).toEqual(["CAR", "MOTORCYCLE"]);
      expect(valid.sensitiveDetails.injuredCount).toBe(1);
    }

    // array ว่าง ไม่ผ่าน
    const emptyVehicles = validateAndSplitIncidentDetails(IncidentType.ROAD_ACCIDENT, {
      vehicleTypes: [],
      isTrapped: false,
      injuredCount: 0,
    });
    expect(emptyVehicles.ok).toBe(false);

    // ค่าที่ไม่ใช่ตัวเลือก ไม่ผ่าน
    const invalidVehicle = validateAndSplitIncidentDetails(IncidentType.ROAD_ACCIDENT, {
      vehicleTypes: ["SPACESHIP"],
      isTrapped: false,
      injuredCount: 0,
    });
    expect(invalidVehicle.ok).toBe(false);
  });

  it("OTHER รองรับ otherDescription ข้อความสั้น <= 200 ตัวอักษร", () => {
    const validOther = validateAndSplitIncidentDetails(IncidentType.OTHER, {
      otherCategory: "GENERAL",
      otherDescription: "มีลมพายุพัดหลังคาเปิด ปลั๊กไฟเปียกน้ำ",
    });
    expect(validOther.ok).toBe(true);
    if (validOther.ok) {
      expect(validOther.publicDetails.otherDescription).toBe(
        "มีลมพายุพัดหลังคาเปิด ปลั๊กไฟเปียกน้ำ",
      );
    }

    // ข้อความเกิน 200 ตัวอักษร ไม่ผ่าน
    const tooLongOther = validateAndSplitIncidentDetails(IncidentType.OTHER, {
      otherCategory: "GENERAL",
      otherDescription: "ก".repeat(201),
    });
    expect(tooLongOther.ok).toBe(false);
  });

  it("คำถามย่อยที่มี dependsOn: ไม่ต้องกรอกเมื่อเงื่อนไขไม่ตรง และต้องกรอกเมื่อเงื่อนไขตรง", () => {
    // 1. FIRE: fireLocation !== HIGH_RISE -> ไม่ต้องกรอก buildingFloor ก็ผ่าน
    const fireHouse = validateAndSplitIncidentDetails(IncidentType.FIRE, {
      fireLocation: "HOUSE",
      isTrappedInSmoke: false,
    });
    expect(fireHouse.ok).toBe(true);

    // FIRE: fireLocation === HIGH_RISE แต่ไม่กรอก buildingFloor -> ไม่ผ่าน
    const fireHighRiseMissing = validateAndSplitIncidentDetails(IncidentType.FIRE, {
      fireLocation: "HIGH_RISE",
      isTrappedInSmoke: false,
    });
    expect(fireHighRiseMissing.ok).toBe(false);

    // FIRE: fireLocation === HIGH_RISE และกรอก buildingFloor -> ผ่าน
    const fireHighRiseOk = validateAndSplitIncidentDetails(IncidentType.FIRE, {
      fireLocation: "HIGH_RISE",
      buildingFloor: 12,
      isTrappedInSmoke: true,
    });
    expect(fireHighRiseOk.ok).toBe(true);
    if (fireHighRiseOk.ok) {
      expect(fireHighRiseOk.publicDetails.buildingFloor).toBe(12);
    }

    // 2. WATER_RESCUE: isFloatingVisible === true -> ไม่ต้องตอบ submersionDuration ก็ผ่าน
    const waterVisible = validateAndSplitIncidentDetails(IncidentType.WATER_RESCUE, {
      victimsInWater: 1,
      waterBodyType: "CANAL_RIVER",
      isFloatingVisible: true,
    });
    expect(waterVisible.ok).toBe(true);

    // WATER_RESCUE: isFloatingVisible === false แต่ไม่ตอบ submersionDuration -> ไม่ผ่าน
    const waterInvisibleMissing = validateAndSplitIncidentDetails(IncidentType.WATER_RESCUE, {
      victimsInWater: 1,
      waterBodyType: "CANAL_RIVER",
      isFloatingVisible: false,
    });
    expect(waterInvisibleMissing.ok).toBe(false);

    // WATER_RESCUE: isFloatingVisible === false และตอบ submersionDuration -> ผ่าน
    const waterInvisibleOk = validateAndSplitIncidentDetails(IncidentType.WATER_RESCUE, {
      victimsInWater: 1,
      waterBodyType: "CANAL_RIVER",
      isFloatingVisible: false,
      submersionDuration: "5_TO_15_MIN",
    });
    expect(waterInvisibleOk.ok).toBe(true);
    if (waterInvisibleOk.ok) {
      expect(waterInvisibleOk.publicDetails.submersionDuration).toBe("5_TO_15_MIN");
    }

    // 3. COLLAPSE: isTrappedUnderDebris === false -> ไม่ต้องกรอก trappedCount ก็ผ่าน
    const collapseNoTrap = validateAndSplitIncidentDetails(IncidentType.COLLAPSE, {
      collapseType: "WALL_FENCE",
      isTrappedUnderDebris: false,
    });
    expect(collapseNoTrap.ok).toBe(true);

    // COLLAPSE: isTrappedUnderDebris === true แต่ไม่กรอก trappedCount -> ไม่ผ่าน
    const collapseTrapMissing = validateAndSplitIncidentDetails(IncidentType.COLLAPSE, {
      collapseType: "BUILDING_ROOF",
      isTrappedUnderDebris: true,
    });
    expect(collapseTrapMissing.ok).toBe(false);

    // COLLAPSE: isTrappedUnderDebris === true และกรอก trappedCount -> ผ่าน
    const collapseTrapOk = validateAndSplitIncidentDetails(IncidentType.COLLAPSE, {
      collapseType: "BUILDING_ROOF",
      isTrappedUnderDebris: true,
      trappedCount: 3,
    });
    expect(collapseTrapOk.ok).toBe(true);
    if (collapseTrapOk.ok) {
      expect(collapseTrapOk.publicDetails.trappedCount).toBe(3);
    }
  });

  it("แยกข้อมูลสุขภาพ sensitiveDetails อย่างเคร่งครัด (MEDICAL และ ANIMAL)", () => {
    // MEDICAL: symptomGroup และ hasChronicCondition ต้องไป sensitiveDetails เท่านั้น
    const medResult = validateAndSplitIncidentDetails(IncidentType.MEDICAL, {
      symptomGroup: "CHEST_HEART",
      patientCount: 1,
      hasChronicCondition: true,
    });
    expect(medResult.ok).toBe(true);
    if (medResult.ok) {
      expect(medResult.publicDetails).toEqual({
        patientCount: 1,
      });
      expect(medResult.sensitiveDetails).toEqual({
        symptomGroup: "CHEST_HEART",
        hasChronicCondition: true,
      });
      expect(medResult.publicDetails).not.toHaveProperty("symptomGroup");
      expect(medResult.publicDetails).not.toHaveProperty("hasChronicCondition");
    }

    // ANIMAL: hasBittenOrStung ต้องไป sensitiveDetails
    const animalResult = validateAndSplitIncidentDetails(IncidentType.ANIMAL, {
      animalType: "SNAKE",
      isInsideHome: true,
      hasBittenOrStung: true,
    });
    expect(animalResult.ok).toBe(true);
    if (animalResult.ok) {
      expect(animalResult.publicDetails).toEqual({
        animalType: "SNAKE",
        isInsideHome: true,
      });
      expect(animalResult.sensitiveDetails).toEqual({
        hasBittenOrStung: true,
      });
      expect(animalResult.publicDetails).not.toHaveProperty("hasBittenOrStung");
    }
  });

  it("ล้างค่าค้างของคำถามย่อยที่ถูกซ่อนก่อนตรวจ schema แม้ค่าเก่าจะนอกช่วง", () => {
    const fireResult = validateAndSplitIncidentDetails(IncidentType.FIRE, {
      fireLocation: "HOUSE",
      buildingFloor: 0, // นอกช่วง 1..100 แต่ถูกซ่อนเพราะไม่ใช่ HIGH_RISE
      isTrappedInSmoke: false,
    });
    expect(fireResult.ok).toBe(true);
    if (fireResult.ok) {
      expect(fireResult.publicDetails).toEqual({
        fireLocation: "HOUSE",
        isTrappedInSmoke: false,
      });
      expect(fireResult.publicDetails).not.toHaveProperty("buildingFloor");
    }
  });
});

