import { Need } from "../enums";
import {
  IncidentType,
  TF55_TRIAGE_TABLE_SOURCE,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

export const fire: IncidentDefinition = {
  code: IncidentType.FIRE,
  label: { th: "ไฟไหม้" },
  icon: "Flame",
  capabilities: [UnitCapability.FIRE_SUPPRESSION, UnitCapability.EMS],
  questions: [
    {
      key: "fireLocation",
      kind: "choice",
      label: { th: "ลักษณะสถานที่เกิดเพลิงไหม้", en: "Type of structure on fire" },
      required: true,
      options: [
        { value: "HOUSE", label: { th: "บ้านพักอาศัย / ทาวน์เฮาส์", en: "House / townhouse" } },
        { value: "HIGH_RISE", label: { th: "อาคารสูง / คอนโด / หอพัก", en: "High-rise / apartment" } },
        { value: "COMMERCIAL", label: { th: "ร้านค้า / โกดัง / โรงงาน", en: "Shop / warehouse / factory" } },
        { value: "GRASS_FOREST", label: { th: "หญ้า / ป่า / พื้นที่โล่ง", en: "Grass / forest / open area" } },
        { value: "VEHICLE", label: { th: "ยานพาหนะ", en: "Vehicle" } },
      ],
    },
    {
      key: "isTrappedInSmoke",
      kind: "boolean",
      label: { th: "มีคนติดอยู่ในอาคารหรือกลุ่มควันไหม", en: "Anyone trapped in building or smoke?" },
      required: true,
    },
    {
      key: "hasInjured",
      kind: "boolean",
      label: { th: "มีผู้บาดเจ็บหรือสำลักควันไหม", en: "Anyone burned or suffering smoke inhalation?" },
      required: false,
      sensitive: true,
    },
  ],
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    {
      key: "TRAPPED_IN_FIRE",
      label: { th: "มีคนติดอยู่ในกองไฟหรือควันหนาแน่น" },
      source: TF55_TRIAGE_TABLE_SOURCE,
    },
  ],
  needs: [
    Need.EVACUATE_BEDRIDDEN,
    Need.MEDICINE,
    Need.CUT_POWER,
    Need.DRINKING_WATER,
    Need.OTHER,
  ],
  waitingAdvice: [],
};
