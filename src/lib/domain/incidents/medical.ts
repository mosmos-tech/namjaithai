import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

const MEDICAL_OFFICIAL_SOURCE =
  "https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf";

export const medical: IncidentDefinition = {
  code: IncidentType.MEDICAL,
  label: { th: "เจ็บป่วยฉุกเฉิน", en: "Medical emergency" },
  // TF-66: หัวข้อตัวนับคนในขั้นรายละเอียดเหตุ
  peopleLabel: { th: "จำนวนผู้บาดเจ็บหรือผู้ป่วย", en: "Injured or sick people" },
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
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    {
      key: "CRITICAL_MEDICAL_EMERGENCY",
      label: { th: "หมดสติ ปลุกไม่ตื่น หยุดหายใจ หรือเขียวคล้ำ", en: "Unconscious, cannot be woken, not breathing, or turning blue" },
      source: MEDICAL_OFFICIAL_SOURCE,
    },
  ],
  needs: [
    Need.MEDICINE,
    Need.EVACUATE_BEDRIDDEN,
    Need.OTHER,
  ],
  waitingAdvice: [
    {
      text: {
        th: "จัดผู้ป่วยให้นอนนิ่งๆ ในที่อากาศถ่ายเทสะดวก หากหมดสติแต่หายใจให้จัดท่านอนตะแคงกึ่งคว่ำ", en: "Keep the patient lying still in a well-ventilated place. If they are unconscious but breathing, place them in the recovery position (on their side).",
      },
      source: MEDICAL_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "หากผู้ป่วยหยุดหายใจหรือไม่รู้สึกตัว ให้เริ่มทำ CPR กดหน้าอกทันทีตามคำแนะนำของเจ้าหน้าที่ 1669", en: "If the patient stops breathing or is unresponsive, start CPR chest compressions right away, following the instructions of the 1669 operator.",
      },
      source: MEDICAL_OFFICIAL_SOURCE,
    },
    {
      text: { th: "ห้ามป้อนน้ำ ยา หรืออาหารแก่ผู้ป่วยที่หมดสติหรือซึมลงโดยเด็ดขาด", en: "Never give water, medicine, or food to a patient who is unconscious or becoming drowsy." },
      source: MEDICAL_OFFICIAL_SOURCE,
    },
  ],
};
