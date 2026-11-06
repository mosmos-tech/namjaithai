import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

export const animal: IncidentDefinition = {
  code: IncidentType.ANIMAL,
  label: { th: "สัตว์อันตราย" },
  icon: "PawPrint",
  capabilities: [UnitCapability.ANIMAL_CAPTURE],
  questions: [
    {
      key: "animalType",
      kind: "choice",
      label: { th: "ชนิดสัตว์อันตราย", en: "Type of dangerous animal" },
      required: true,
      options: [
        { value: "SNAKE", label: { th: "งู", en: "Snake" } },
        { value: "MONITOR_LIZARD", label: { th: "ตะกวด", en: "Monitor lizard" } },
        { value: "CROCODILE", label: { th: "จระเข้", en: "Crocodile" } },
        { value: "WASPS_BEES", label: { th: "ต่อ / แตน / ผึ้งรังใหญ่", en: "Wasps / hornets / bees" } },
        { value: "OTHER_ANIMAL", label: { th: "สัตว์อันตรายอื่นๆ", en: "Other dangerous animal" } },
      ],
    },
    {
      key: "isInsideHome",
      kind: "boolean",
      label: { th: "สัตว์ยังอยู่ในบ้านหรือพื้นที่ปิดไหม", en: "Is the animal still inside the house?" },
      required: true,
    },
    {
      key: "hasBittenOrStung",
      kind: "boolean",
      label: { th: "มีคนถูกกัดหรือต่อยไหม", en: "Has anyone been bitten or stung?" },
      required: true,
      sensitive: true,
    },
  ],
  dangerSigns: [...UNIVERSAL_DANGER_SIGNS],
  needs: [
    Need.MEDICINE,
    Need.FLASHLIGHT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [],
};
