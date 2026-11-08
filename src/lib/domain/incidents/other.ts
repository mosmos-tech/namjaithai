import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  type IncidentDefinition,
} from "./types";

const OTHER_OFFICIAL_SOURCE =
  "https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf";

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
      key: "otherDescription",
      kind: "text",
      maxLength: 200,
      label: { th: "รายละเอียดเหตุเพิ่มเติม", en: "Additional description" },
      placeholder: { th: "พิมพ์รายละเอียดสั้นๆ ไม่เกิน 200 ตัวอักษร", en: "Up to 200 characters" },
      required: false,
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
      key: "SEVERE_HAZARD",
      label: { th: "มีอันตรายร้ายแรงต่อชีวิตหรือสารเคมีอันตราย" },
      source: OTHER_OFFICIAL_SOURCE,
    },
  ],
  needs: [
    Need.EVACUATE_BEDRIDDEN,
    Need.MEDICINE,
    Need.DRINKING_WATER,
    Need.FOOD,
    Need.FLASHLIGHT_POWER,
    Need.CUT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [
    {
      text: {
        th: "ตั้งสติ อยู่ในพื้นที่ปลอดภัย และแจ้งข้อมูลตำแหน่งและสถานการณ์แก่เจ้าหน้าที่อย่างชัดเจน",
      },
      source: OTHER_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "หากมีผู้บาดเจ็บ ให้สังเกตสัญญาณชีพและอาการ ห้ามเคลื่อนย้ายผู้บาดเจ็บหากไม่จำเป็น",
      },
      source: OTHER_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "หากมีสายไฟขาดหรือวัตถุอันตราย ให้อยู่ห่างอย่างน้อย 8–10 เมตร และกันผู้อื่นออกจากพื้นที่",
      },
      source: OTHER_OFFICIAL_SOURCE,
    },
  ],
};
