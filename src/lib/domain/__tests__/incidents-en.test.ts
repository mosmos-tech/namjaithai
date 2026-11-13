import { describe, expect, it } from "vitest";
import {
  INCIDENT_REGISTRY,
  IncidentType,
  Need,
  needLabel,
  needLabelEn,
  WaterLevel,
  waterLevelLabel,
  waterLevelLabelEn,
  type LocalizedText,
} from "..";

/** ทุกข้อความใน 1 ประเภทเหตุ พร้อมตำแหน่ง (ใช้บอกว่าช่องไหนขาด) */
function textsOf(type: IncidentType): [string, LocalizedText][] {
  const def = INCIDENT_REGISTRY[type];
  return [
    ["label", def.label],
    ["peopleLabel", def.peopleLabel],
    ...def.questions.flatMap((q): [string, LocalizedText][] => [
      [`question ${q.key}`, q.label],
      ...(q.kind === "choice"
        ? q.options.map((o): [string, LocalizedText] => [`option ${q.key}.${o.value}`, o.label])
        : []),
      ...(q.kind === "text" && q.placeholder
        ? [[`placeholder ${q.key}`, q.placeholder] as [string, LocalizedText]]
        : []),
    ]),
    ...def.dangerSigns.map((d): [string, LocalizedText] => [`danger ${d.key}`, d.label]),
    ...def.waitingAdvice.map((a, i): [string, LocalizedText] => [`advice ${i + 1}`, a.text]),
  ];
}

describe("TF-63 ทะเบียนประเภทเหตุมีภาษาอังกฤษครบ", () => {
  it.each(Object.values(IncidentType))(
    "%s: ทุกคำถาม ตัวเลือก สัญญาณอันตราย คำแนะนำ มีภาษาอังกฤษ",
    (type) => {
      for (const [where, text] of textsOf(type)) {
        expect(text.th.trim(), `${type} ${where} (th)`).not.toBe("");
        expect(text.en?.trim(), `${type} ${where} (en)`).toBeTruthy();
        // คำแปลต้องไม่ใช่การคัดลอกภาษาไทยมา
        expect(text.en, `${type} ${where} (en ยังเป็นภาษาไทย)`).not.toMatch(/[฀-๿]/);
      }
    },
  );

  it("คำแนะนำระหว่างรอแปลครบทุกข้อ ไม่เพิ่มไม่ตัด (จำนวนข้อเท่าเดิม)", () => {
    for (const type of Object.values(IncidentType)) {
      const advice = INCIDENT_REGISTRY[type].waitingAdvice;
      expect(advice.filter((a) => a.text.en.trim()).length, type).toBe(advice.length);
    }
  });

  it("ระดับน้ำและสิ่งที่ต้องการมีภาษาอังกฤษครบทุกค่า", () => {
    for (const level of Object.values(WaterLevel)) {
      expect(waterLevelLabel[level]).toBeTruthy();
      expect(waterLevelLabelEn[level]?.trim(), level).toBeTruthy();
    }
    for (const need of Object.values(Need)) {
      expect(needLabel[need]).toBeTruthy();
      expect(needLabelEn[need]?.trim(), need).toBeTruthy();
    }
  });
});
