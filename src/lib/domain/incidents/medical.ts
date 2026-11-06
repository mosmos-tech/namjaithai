import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

export const medical: IncidentDefinition = {
  code: IncidentType.MEDICAL,
  label: { th: "เจ็บป่วยฉุกเฉิน" },
  icon: "HeartPulse",
  capabilities: [UnitCapability.EMS],
  questions: [
    {
      key: "symptomGroup",
      kind: "choice",
      label: { th: "อาการสำคัญของผู้ป่วย", en: "Primary symptom" },
      required: true,
      sensitive: true,
      options: [
        { value: "BREATHING", label: { th: "หายใจลำบาก / หอบเหนื่อย", en: "Difficulty breathing" } },
        { value: "CHEST_HEART", label: { th: "เจ็บแน่นหน้าอก / โรคหัวใจ", en: "Chest pain / heart condition" } },
        { value: "STROKE_SEIZURE", label: { th: "แขนขาอ่อนแรง / ชัก / ซึมลง", en: "Weakness / seizure / drowsiness" } },
        { value: "INJURY_BLEEDING", label: { th: "บาดแผล / เลือดออก / กระดูกหัก", en: "Wound / bleeding / fracture" } },
        { value: "OTHER_SYMPTOM", label: { th: "อาการเจ็บป่วยฉุกเฉินอื่นๆ", en: "Other emergency symptom" } },
      ],
    },
    {
      key: "patientCount",
      kind: "number",
      label: { th: "จำนวนผู้ป่วยที่ต้องนำส่ง", en: "Number of patients" },
      min: 1,
      max: 99,
      required: true,
    },
    {
      key: "hasChronicCondition",
      kind: "boolean",
      label: { th: "มีโรคประจำตัวที่ต้องแจ้งทีมกู้ชีพไหม", en: "Any chronic condition to inform EMS?" },
      required: false,
      sensitive: true,
    },
  ],
  dangerSigns: [...UNIVERSAL_DANGER_SIGNS],
  needs: [
    Need.MEDICINE,
    Need.EVACUATE_BEDRIDDEN,
    Need.OTHER,
  ],
  waitingAdvice: [],
};
