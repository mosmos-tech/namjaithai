import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

const ROAD_ACCIDENT_OFFICIAL_SOURCE =
  "https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=23085";

export const roadAccident: IncidentDefinition = {
  code: IncidentType.ROAD_ACCIDENT,
  label: { th: "อุบัติเหตุทางถนน", en: "Road accident" },
  // TF-66: หัวข้อตัวนับคนในขั้นรายละเอียดเหตุ
  peopleLabel: { th: "จำนวนผู้บาดเจ็บหรือผู้ป่วย", en: "Injured or sick people" },
  icon: "CarFront",
  capabilities: [UnitCapability.EMS, UnitCapability.EXTRICATION],
  questions: [
    {
      key: "vehicleTypes",
      kind: "choice",
      multiple: true,
      label: { th: "ประเภทยานพาหนะที่เกิดเหตุ", en: "Vehicle types" },
      required: true,
      options: [
        { value: "CAR", label: { th: "รถยนต์", en: "Car" } },
        { value: "MOTORCYCLE", label: { th: "จักรยานยนต์", en: "Motorcycle" } },
        { value: "TRUCK", label: { th: "รถบรรทุก", en: "Truck" } },
        { value: "BUS", label: { th: "รถโดยสาร", en: "Bus" } },
        { value: "OTHER", label: { th: "อื่นๆ", en: "Other" } },
      ],
    },
    {
      key: "isTrapped",
      kind: "boolean",
      label: { th: "มีคนติดค้างในยานพาหนะไหม", en: "Anyone trapped in the vehicle?" },
      required: true,
    },
    {
      key: "injuredCount",
      kind: "number",
      label: { th: "จำนวนผู้บาดเจ็บ", en: "Number of injured people" },
      min: 0,
      max: 99,
      required: true,
      sensitive: true,
    },
  ],
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    {
      key: "TRAPPED_IN_VEHICLE",
      label: { th: "มีผู้ติดค้างอยู่ในยานพาหนะ", en: "Someone is trapped inside a vehicle" },
      source: ROAD_ACCIDENT_OFFICIAL_SOURCE,
    },
  ],
  needs: [
    Need.MEDICINE,
    Need.EVACUATE_BEDRIDDEN,
    Need.FLASHLIGHT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [
    {
      text: {
        th: "ห้ามเคลื่อนย้ายผู้บาดเจ็บเองโดยไม่จำเป็น เพราะอาจทำให้กระดูกคอหรือไขสันหลังบาดเจ็บรุนแรงขึ้น", en: "Do not move the injured person yourself unless necessary, as it may make neck or spinal injuries worse.",
      },
      source: ROAD_ACCIDENT_OFFICIAL_SOURCE,
    },
    {
      text: { th: "เปิดไฟฉุกเฉินหรือวางสิ่งกีดขวางเตือนระยะไกล ป้องกันการเกิดอุบัติเหตุซ้ำซ้อน", en: "Turn on hazard lights or place warning objects far ahead to prevent another accident." },
      source: ROAD_ACCIDENT_OFFICIAL_SOURCE,
    },
    {
      text: { th: "ดับเครื่องยนต์ และห้ามสูบบุหรี่หรือจุดไฟในบริเวณที่เกิดเหตุเด็ดขาด", en: "Turn off the engine, and never smoke or light a fire at the scene." },
      source: ROAD_ACCIDENT_OFFICIAL_SOURCE,
    },
  ],
};
