import { Need, WATER_LEVEL_DISPLAY_ORDER, waterLevelLabel } from "../enums";
import {
  IncidentType,
  TF55_TRIAGE_TABLE_SOURCE,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

/**
 * สิ่งที่ควรทำระหว่างน้ำท่วม — ใช้ทั้งหน้า /survival และคำแนะนำระหว่างรอทีม
 * TODO(TF-54): ตรวจกับแหล่งทางการ (ปภ.) แล้วเปลี่ยน source เป็นแหล่งนั้น
 */
export const FLOOD_DURING_TIPS = [
  "อย่าเดินลุยน้ำที่ไม่รู้ความลึก — น้ำแค่ 15 ซม. อาจพัดให้ล้มได้",
  "ปิดสวิตช์ไฟฟ้าหลักทันทีที่น้ำเข้าบ้าน แล้วโทรแจ้งการไฟฟ้า 1182",
  "ห้ามขับรถผ่านถนนที่น้ำท่วม แม้รถจะดูสูงพอ",
  "ฟังประกาศจากวิทยุพกพาหรือ ปภ. อย่างสม่ำเสมอ",
  "หากติดอยู่บนหลังคา ให้สัญญาณด้วยนกหวีด 3 ครั้งต่อเนื่อง หรือโบกผ้าสีสด",
];

export const flood: IncidentDefinition = {
  code: IncidentType.FLOOD,
  label: { th: "น้ำท่วม" },
  icon: "Waves",
  capabilities: [UnitCapability.BOAT, UnitCapability.WATER_RESCUE, UnitCapability.EVACUATION],
  questions: [
    {
      key: "waterLevel",
      kind: "choice",
      label: { th: "ระดับน้ำรอบตัวคุณ" },
      // ไม่บังคับ แต่ถ้าไม่ตอบ computeTriage จะไม่ให้ระดับเขียว (ถือว่าไม่ทราบระดับน้ำ)
      required: false,
      options: WATER_LEVEL_DISPLAY_ORDER.map((level) => ({
        value: level,
        label: { th: waterLevelLabel[level] },
      })),
    },
    {
      key: "canSelfEvacuate",
      kind: "boolean",
      label: { th: "ออกจากที่นั่นเองได้ไหม" },
      required: true,
    },
    {
      key: "hasInjured",
      kind: "boolean",
      label: { th: "มีผู้บาดเจ็บ (ยังรู้สึกตัว)" },
      required: false,
      sensitive: true,
    },
  ],
  // TODO(TF-54): ตรวจกับต้นฉบับ CBD สพฉ. อีกรอบ
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    { key: "PERSON_IN_WATER", label: { th: "มีคนอยู่ในน้ำ" }, source: TF55_TRIAGE_TABLE_SOURCE },
  ],
  needs: Object.values(Need),
  // FEMA flood guidance; these items are separate from the legacy survival checklist.
  waitingAdvice: [
    {
      text: { th: "หลีกเลี่ยงการเดินหรือขับรถผ่านน้ำท่วม" },
      source: "https://www.ready.gov/floods",
    },
    {
      text: { th: "หากติดในอาคาร ให้ขึ้นไปยังจุดสูงที่ปลอดภัยและส่งสัญญาณขอความช่วยเหลือ" },
      source: "https://www.ready.gov/floods",
    },
    {
      text: {
        th: "อย่าสัมผัสอุปกรณ์ไฟฟ้าที่เปียกหรือขณะยืนอยู่ในน้ำ ปิดไฟเฉพาะเมื่อทำได้อย่างปลอดภัย",
      },
      source: "https://www.ready.gov/floods",
    },
  ],
};
