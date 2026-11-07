import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

const COLLAPSE_OFFICIAL_SOURCE =
  "https://www.ddc.moph.go.th/uploads/publish/1666520250113085031.pdf";

export const collapse: IncidentDefinition = {
  code: IncidentType.COLLAPSE,
  label: { th: "อาคารถล่ม / ติดใต้ซาก" },
  icon: "Building2",
  capabilities: [UnitCapability.EXTRICATION, UnitCapability.EMS],
  questions: [
    {
      key: "collapseType",
      kind: "choice",
      label: { th: "ลักษณะการถล่ม", en: "Collapse type" },
      required: true,
      options: [
        {
          value: "BUILDING_ROOF",
          label: {
            th: "หลังคา / โครงสร้างอาคารทรุดตัว",
            en: "Roof / building structure collapse",
          },
        },
        { value: "WALL_FENCE", label: { th: "กำแพง / ผนังพังทับ", en: "Wall / fence collapse" } },
        { value: "LANDSLIDE", label: { th: "ดินโคลนถล่มทับบ้าน", en: "Landslide / mudslide" } },
        {
          value: "SCAFFOLD_CRANE",
          label: { th: "นั่งร้าน / เขตก่อสร้างถล่ม", en: "Scaffolding / construction collapse" },
        },
      ],
    },
    {
      key: "isTrappedUnderDebris",
      kind: "boolean",
      label: { th: "มีคนติดอยู่ใต้ซากปรักหักพังไหม", en: "Anyone trapped under debris?" },
      required: true,
    },
    {
      key: "trappedCount",
      kind: "number",
      label: { th: "จำนวนคนที่คาดว่าติดใต้ซาก", en: "Estimated number of people trapped" },
      min: 1,
      max: 99,
      required: true,
      dependsOn: { key: "isTrappedUnderDebris", value: true },
    },
    {
      key: "hasInjured",
      kind: "boolean",
      label: { th: "มีผู้บาดเจ็บไหม", en: "Anyone injured?" },
      required: false,
      sensitive: true,
    },
  ],
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    {
      key: "TRAPPED_UNDER_DEBRIS",
      label: { th: "มีคนติดอยู่ใต้ซากอาคารหรือดินถล่ม" },
      source: COLLAPSE_OFFICIAL_SOURCE,
    },
  ],
  needs: [
    Need.EVACUATE_BEDRIDDEN,
    Need.MEDICINE,
    Need.CUT_POWER,
    Need.FLASHLIGHT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [
    {
      text: {
        th: "ประเมินความปลอดภัยก่อนเข้าช่วย ระวังโครงสร้างทรุดตัวซ้ำ เสาไฟ หรือสายไฟที่ขาด",
      },
      source: COLLAPSE_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "หากติดใต้ซาก ให้ใช้ผ้าปิดจมูกและปาก เคาะท่อหรือผนังเป็นจังหวะเพื่อให้สัญญาณ หลีกเลี่ยงการตะโกนต่อเนื่องเพื่อไม่ให้สูดฝุ่น",
      },
      source: COLLAPSE_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "ห้ามจุดไฟแช็กหรือไม้ขีดไฟเด็ดขาด เพราะอาจมีแก๊สรั่วไหลใต้ซากปรักหักพัง",
      },
      source: COLLAPSE_OFFICIAL_SOURCE,
    },
  ],
};
