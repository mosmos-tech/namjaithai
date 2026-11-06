import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  type IncidentDefinition,
} from "./types";

export const other: IncidentDefinition = {
  code: IncidentType.OTHER,
  label: { th: "เหตุอื่นๆ" },
  icon: "CircleHelp",
  // ไม่ระบุความสามารถ = หน่วยไหนก็ช่วยได้
  capabilities: [],
  questions: [
    {
      key: "otherCategory",
      kind: "choice",
      label: { th: "ลักษณะเหตุที่ต้องการความช่วยเหลือ", en: "Type of assistance needed" },
      required: true,
      options: [
        { value: "TREE_FALLEN", label: { th: "ต้นไม้ล้มทับบ้าน / ขวางทาง", en: "Fallen tree on house / road" } },
        { value: "ELECTRIC_HAZARD", label: { th: "ไฟรั่ว / เสาไฟล้ม", en: "Electrical leak / fallen pole" } },
        { value: "STRANDED", label: { th: "ติดค้างต้องการความช่วยเหลือ", en: "Stranded / needs evacuation" } },
        { value: "GENERAL", label: { th: "เหตุฉุกเฉินอื่นๆ", en: "Other emergency" } },
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
  dangerSigns: [...UNIVERSAL_DANGER_SIGNS],
  needs: [
    Need.EVACUATE_BEDRIDDEN,
    Need.MEDICINE,
    Need.DRINKING_WATER,
    Need.FOOD,
    Need.FLASHLIGHT_POWER,
    Need.CUT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [],
};
