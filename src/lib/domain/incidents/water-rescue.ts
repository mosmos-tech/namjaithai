import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

const WATER_RESCUE_OFFICIAL_SOURCE =
  "https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=35920";

export const waterRescue: IncidentDefinition = {
  code: IncidentType.WATER_RESCUE,
  label: { th: "ตกน้ำ / จมน้ำ" },
  // TF-66: หัวข้อตัวนับคนในขั้นรายละเอียดเหตุ
  peopleLabel: { th: "จำนวนผู้ติดค้าง", en: "People trapped" },
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
    {
      key: "submersionDuration",
      kind: "choice",
      label: { th: "จมหายไปนานเท่าใดโดยประมาณ", en: "Estimated time underwater" },
      required: true,
      dependsOn: { key: "isFloatingVisible", value: false },
      options: [
        { value: "UNDER_5_MIN", label: { th: "ไม่เกิน 5 นาที", en: "Under 5 minutes" } },
        { value: "5_TO_15_MIN", label: { th: "5–15 นาที", en: "5–15 minutes" } },
        { value: "OVER_15_MIN", label: { th: "มากกว่า 15 นาที", en: "Over 15 minutes" } },
        { value: "UNKNOWN", label: { th: "ไม่ทราบเวลาแน่ชัด", en: "Unknown time" } },
      ],
    },
  ],
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    {
      key: "PERSON_IN_WATER",
      label: { th: "มีคนอยู่ในน้ำหรือจมหายไป" },
      source: WATER_RESCUE_OFFICIAL_SOURCE,
    },
  ],
  needs: [
    Need.EVACUATION_BOAT,
    Need.LIFE_JACKET,
    Need.MEDICINE,
    Need.OTHER,
  ],
  waitingAdvice: [
    {
      text: {
        th: "ใช้หลัก ตะโกน โยน ยื่น — ตะโกนขอความช่วยเหลือ โยนสิ่งของที่ลอยน้ำได้ หรือยื่นไม้ยาว/เชือกให้เกาะ",
      },
      source: WATER_RESCUE_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "ห้ามกระโดดลงน้ำไปช่วยเองโดยเด็ดขาด หากไม่ได้รับการฝึกฝน เพราะอาจถูกกอดจมน้ำไปด้วยกัน",
      },
      source: WATER_RESCUE_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "เมื่อช่วยขึ้นมาได้และหมดสติไม่หายใจ ให้รีบทำ CPR กดหน้าอกทันทีพร้อมโทร 1669",
      },
      source: WATER_RESCUE_OFFICIAL_SOURCE,
    },
  ],
};
