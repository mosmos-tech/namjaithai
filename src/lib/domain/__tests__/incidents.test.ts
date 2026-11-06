import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as lucide from "lucide-react";
import { describe, it, expect } from "vitest";
import { Need, WaterLevel } from "../enums";
import { validateAndSplitIncidentDetails } from "../sos-schema";
import {
  FORBIDDEN_DETAIL_KEYS,
  INCIDENT_REGISTRY,
  INCIDENT_TYPE_ORDER,
  IncidentType,
  UnitCapability,
  type LocalizedText,
} from "../incidents";

const ALL_TYPES = Object.values(IncidentType);

// อ่านรายการรหัสจาก migration ของ TF-49 (insert into public.incident_types ...)
function migrationIncidentCodes(): string[] {
  const dir = path.join(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_tf49_incident_registry.sql"));
  if (!file) throw new Error("ไม่พบ migration ของ TF-49");
  const sql = readFileSync(path.join(dir, file), "utf8");
  const insert = sql.match(/insert into public\.incident_types[^;]+;/)?.[0] ?? "";
  return [...insert.matchAll(/\('([A-Z_]+)', (\d+),/g)]
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map((m) => m[1]);
}

// ข้อความทุกช่องในทะเบียน (ชื่อ คำถาม ตัวเลือก สัญญาณอันตราย คำแนะนำ)
function allTexts(): LocalizedText[] {
  return ALL_TYPES.flatMap((type) => {
    const def = INCIDENT_REGISTRY[type];
    return [
      def.label,
      ...def.questions.flatMap((q) => [
        q.label,
        ...(q.kind === "choice" ? q.options.map((o) => o.label) : []),
      ]),
      ...def.dangerSigns.map((s) => s.label),
      ...def.waitingAdvice.map((a) => a.text),
    ];
  });
}

describe("ทะเบียนประเภทเหตุ (TF-49)", () => {
  it("มีครบ 8 ประเภท และแต่ละไฟล์ประกาศรหัสตรงกับ key", () => {
    expect(ALL_TYPES).toHaveLength(8);
    expect(Object.keys(INCIDENT_REGISTRY).sort()).toEqual([...ALL_TYPES].sort());
    for (const type of ALL_TYPES) expect(INCIDENT_REGISTRY[type].code).toBe(type);
  });

  it("รหัสและลำดับใน incident_types (migration) ตรงกับโค้ด", () => {
    expect(migrationIncidentCodes()).toEqual(INCIDENT_TYPE_ORDER);
  });

  it("ทุกประเภทมีชื่อ ไอคอนที่มีอยู่จริงใน lucide-react และความสามารถทีมที่ถูกต้อง", () => {
    const capabilities = Object.values(UnitCapability);
    for (const type of ALL_TYPES) {
      const def = INCIDENT_REGISTRY[type];
      expect(def.label.th.trim(), type).not.toBe("");
      expect(lucide[def.icon as keyof typeof lucide], `${type}: ไอคอน ${def.icon}`).toBeDefined();
      for (const c of def.capabilities) expect(capabilities).toContain(c);
      // OTHER = หน่วยไหนก็ช่วยได้ ประเภทอื่นต้องระบุความสามารถที่ต้องใช้
      if (type !== IncidentType.OTHER) expect(def.capabilities.length, type).toBeGreaterThan(0);
    }
  });

  it("ข้อความทุกช่องเก็บเป็น { th, en } และมีภาษาไทยเสมอ", () => {
    for (const text of allTexts()) {
      expect(Object.keys(text).every((k) => k === "th" || k === "en")).toBe(true);
      expect(text.th.trim()).not.toBe("");
    }
  });

  it("FLOOD ใช้คำถามระดับน้ำและความต้องการชุดเดิมของฟอร์ม", () => {
    const flood = INCIDENT_REGISTRY.FLOOD;
    const water = flood.questions.find((q) => q.key === "waterLevel");
    expect(water?.kind).toBe("choice");
    expect(water?.kind === "choice" && water.options.map((o) => o.value).sort()).toEqual(
      Object.values(WaterLevel).sort(),
    );
    expect(flood.needs).toEqual(Object.values(Need));
    expect(flood.waitingAdvice.length).toBeGreaterThan(0);
  });

  it("key ของคำตอบไม่ซ้ำกันในประเภทเดียว และไม่ใช่ข้อมูลส่วนตัวที่ห้ามลง cases.details", () => {
    for (const type of ALL_TYPES) {
      const keys = INCIDENT_REGISTRY[type].questions.map((q) => q.key);
      expect(new Set(keys).size, type).toBe(keys.length);
      for (const q of INCIDENT_REGISTRY[type].questions) {
        if (q.sensitive) continue; // ข้อมูลสุขภาพไปลง case_sensitive_details
        expect(FORBIDDEN_DETAIL_KEYS as readonly string[], `${type}.${q.key}`).not.toContain(q.key);
      }
    }
  });

  it("key ต้องห้ามในโค้ดตรงกับ check constraint ล่าสุดในฐานข้อมูล", () => {
    // constraint ถูกสร้างใหม่ได้หลายรอบ (TF-49, TF-55, TF-51) ใช้ตัวที่อยู่ใน migration ล่าสุด
    const dir = path.join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    const matches = [...sql.matchAll(/details \?\| array\[([^\]]+)\]/g)];
    const list = matches.at(-1)?.[1] ?? "";
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...FORBIDDEN_DETAIL_KEYS]);
  });

  it("TF-51: แต่ละประเภทเหตุถามไม่เกิน 3 คำถาม และมีความต้องการตามประเภทพร้อม OTHER เสมอ", () => {
    for (const type of ALL_TYPES) {
      const def = INCIDENT_REGISTRY[type];
      expect(def.questions.length, `${type} มีคำถามเกิน 3 ข้อ`).toBeGreaterThanOrEqual(1);
      expect(def.questions.length, `${type} มีคำถามเกิน 3 ข้อ`).toBeLessThanOrEqual(3);
      expect(def.needs.length, `${type} ต้องมีรายการความต้องการ`).toBeGreaterThanOrEqual(2);
      expect(def.needs, `${type} ต้องมี OTHER เสมอ`).toContain(Need.OTHER);
    }

    // ความต้องการเปลี่ยนตามประเภทเหตุ (เช่น ROAD_ACCIDENT ไม่ได้มีตัวเลือกเหมือน FLOOD ทั้งหมด)
    expect(INCIDENT_REGISTRY.ROAD_ACCIDENT.needs).not.toEqual(INCIDENT_REGISTRY.FLOOD.needs);
    expect(INCIDENT_REGISTRY.ANIMAL.needs).not.toEqual(INCIDENT_REGISTRY.FLOOD.needs);
  });

  it("TF-51: validateAndSplitIncidentDetails ตรวจ details ตามประเภทด้วย Zod และแยกข้อมูลสุขภาพออกจาก publicDetails", () => {
    // ROAD_ACCIDENT: ถูกต้อง -> แยก injuredCount ไป sensitiveDetails, ที่เหลืออยู่ publicDetails
    const okRoad = validateAndSplitIncidentDetails(IncidentType.ROAD_ACCIDENT, {
      injuredCount: 2,
      vehicleType: "MOTORCYCLE",
      isTrapped: true,
    });
    expect(okRoad.ok).toBe(true);
    if (okRoad.ok) {
      expect(okRoad.publicDetails).toEqual({
        vehicleType: "MOTORCYCLE",
        isTrapped: true,
      });
      expect(okRoad.sensitiveDetails).toEqual({
        injuredCount: 2,
      });
    }

    // ส่ง key ของ FLOOD (waterLevel) มาใน ROAD_ACCIDENT -> ไม่ผ่าน
    const mismatchRoad = validateAndSplitIncidentDetails(IncidentType.ROAD_ACCIDENT, {
      waterLevel: WaterLevel.ROOF,
      injuredCount: 1,
      vehicleType: "CAR",
      isTrapped: false,
    });
    expect(mismatchRoad.ok).toBe(false);

    // ส่ง key ของ ROAD_ACCIDENT (vehicleType) มาใน FLOOD -> ไม่ผ่าน
    const mismatchFlood = validateAndSplitIncidentDetails(
      IncidentType.FLOOD,
      { vehicleType: "CAR" },
      { canSelfEvacuate: true },
    );
    expect(mismatchFlood.ok).toBe(false);
  });
});
