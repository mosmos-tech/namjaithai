import { Need } from "../enums";
import {
  IncidentType,
  TF55_TRIAGE_TABLE_SOURCE,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

export const waterRescue: IncidentDefinition = {
  code: IncidentType.WATER_RESCUE,
  label: { th: "ตกน้ำ / จมน้ำ" },
  icon: "LifeBuoy",
  capabilities: [UnitCapability.WATER_RESCUE, UnitCapability.BOAT, UnitCapability.EMS],
  questions: [
    {
      key: "victimsInWater",
      kind: "number",
      label: { th: "จำนวนคนที่ตกน้ำหรือติดอยู่ในน้ำ", en: "Number of people in water" },
      min: 1,
      max: 99,
      required: true,
    },
    {
      key: "waterBodyType",
      kind: "choice",
      label: { th: "ลักษณะแหล่งน้ำ", en: "Type of water body" },
      required: true,
      options: [
        { value: "CANAL_RIVER", label: { th: "คลอง / แม่น้ำ", en: "Canal / river" } },
        { value: "POND_POOL", label: { th: "บ่อน้ำ / สระน้ำ", en: "Pond / pool" } },
        { value: "FLOOD_CURRENT", label: { th: "น้ำหลาก / กระแสน้ำเชี่ยว", en: "Flash flood / strong current" } },
        { value: "SEA", label: { th: "ทะเล / ชายฝั่ง", en: "Sea / coast" } },
      ],
    },
    {
      key: "isFloatingVisible",
      kind: "boolean",
      label: { th: "ยังมองเห็นตัวผู้ประสบภัยเหนือน้ำไหม", en: "Is the person still visible above water?" },
      required: true,
    },
  ],
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    { key: "PERSON_IN_WATER", label: { th: "มีคนอยู่ในน้ำ" }, source: TF55_TRIAGE_TABLE_SOURCE },
  ],
  needs: [
    Need.EVACUATION_BOAT,
    Need.LIFE_JACKET,
    Need.MEDICINE,
    Need.OTHER,
  ],
  waitingAdvice: [],
};
