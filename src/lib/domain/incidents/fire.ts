import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

const FIRE_OFFICIAL_SOURCE = "https://www.disaster.go.th/apiv1/clickdownload/download/1606";

export const fire: IncidentDefinition = {
  code: IncidentType.FIRE,
  label: { th: "ไฟไหม้", en: "Fire" },
  // TF-66: หัวข้อตัวนับคนในขั้นรายละเอียดเหตุ
  peopleLabel: { th: "จำนวนผู้ติดค้าง", en: "People trapped" },
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
      key: "buildingFloor",
      kind: "number",
      label: { th: "ชั้นที่เกิดเหตุเพลิงไหม้", en: "Floor of fire incident" },
      min: 1,
      max: 99,
      required: true,
      dependsOn: { key: "fireLocation", value: "HIGH_RISE" },
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
      label: { th: "มีคนติดอยู่ในกองไฟหรือควันหนาแน่น", en: "Someone is trapped in the fire or thick smoke" },
      source: FIRE_OFFICIAL_SOURCE,
    },
  ],
  needs: [
    Need.EVACUATE_BEDRIDDEN,
    Need.MEDICINE,
    Need.CUT_POWER,
    Need.DRINKING_WATER,
    Need.OTHER,
  ],
  waitingAdvice: [
    {
      text: { th: "หมอบคลานต่ำใต้กลุ่มควัน และใช้ผ้าชุบน้ำปิดจมูกและปาก", en: "Crawl low beneath the smoke and cover your nose and mouth with a wet cloth." },
      source: FIRE_OFFICIAL_SOURCE,
    },
    {
      text: { th: "ห้ามใช้ลิฟต์โดยเด็ดขาด ให้ใช้บันไดหนีไฟเพื่อออกจากอาคาร", en: "Never use the elevator. Use the fire escape stairs to leave the building." },
      source: FIRE_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "หากติดอยู่ในห้อง ให้ปิดประตู ใช้ผ้าชุบน้ำอุดตามช่องว่าง และส่งสัญญาณขอความช่วยเหลือที่หน้าต่าง", en: "If you are trapped in a room, close the door, seal the gaps with wet cloth, and signal for help at the window.",
      },
      source: FIRE_OFFICIAL_SOURCE,
    },
  ],
};
