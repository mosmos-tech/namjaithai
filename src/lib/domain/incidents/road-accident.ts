import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

export const roadAccident: IncidentDefinition = {
  code: IncidentType.ROAD_ACCIDENT,
  label: { th: "อุบัติเหตุทางถนน" },
  icon: "CarFront",
  capabilities: [UnitCapability.EMS, UnitCapability.EXTRICATION],
  questions: [
    {
      key: "injuredCount",
      kind: "number",
      label: { th: "จำนวนผู้บาดเจ็บ", en: "Number of injured people" },
      min: 0,
      max: 99,
      required: true,
      sensitive: true,
    },
    {
      key: "vehicleType",
      kind: "choice",
      label: { th: "ประเภทยานพาหนะ", en: "Vehicle type" },
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
  ],
  dangerSigns: [...UNIVERSAL_DANGER_SIGNS],
  needs: [
    Need.MEDICINE,
    Need.EVACUATE_BEDRIDDEN,
    Need.FLASHLIGHT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [],
};
