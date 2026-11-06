import { Need } from "../enums";
import {
  IncidentType,
  TF55_TRIAGE_TABLE_SOURCE,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

export const collapse: IncidentDefinition = {
  code: IncidentType.COLLAPSE,
  label: { th: "อาคารถล่ม / ติดใต้ซาก" },
  icon: "Building2",
  capabilities: [UnitCapability.EXTRICATION, UnitCapability.EMS],
  questions: [
    {
      key: "trappedUnderDebris",
      kind: "number",
      label: { th: "จำนวนคนที่คาดว่าติดใต้ซากอาคาร", en: "Estimated number of people trapped" },
      min: 0,
      max: 99,
      required: true,
    },
    {
      key: "collapseType",
      kind: "choice",
      label: { th: "ลักษณะการถล่ม", en: "Collapse type" },
      required: true,
      options: [
        { value: "BUILDING_ROOF", label: { th: "หลังคา / โครงสร้างอาคารทรุดตัว", en: "Roof / building structure collapse" } },
        { value: "WALL_FENCE", label: { th: "กำแพง / ผนังพังทับ", en: "Wall / fence collapse" } },
        { value: "LANDSLIDE", label: { th: "ดินโคลนถล่มทับบ้าน", en: "Landslide / mudslide" } },
        { value: "SCAFFOLD_CRANE", label: { th: "นั่งร้าน / เขตก่อสร้างถล่ม", en: "Scaffolding / construction collapse" } },
      ],
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
      source: TF55_TRIAGE_TABLE_SOURCE,
    },
  ],
  needs: [
    Need.EVACUATE_BEDRIDDEN,
    Need.MEDICINE,
    Need.CUT_POWER,
    Need.FLASHLIGHT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [],
};
