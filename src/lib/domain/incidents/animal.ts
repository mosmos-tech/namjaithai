import { Need } from "../enums";
import {
  IncidentType,
  UNIVERSAL_DANGER_SIGNS,
  UnitCapability,
  type IncidentDefinition,
} from "./types";

const ANIMAL_OFFICIAL_SOURCE = "https://ddc.moph.go.th/odpc3/news.php?deptcode=odpc3&news=29303";

export const animal: IncidentDefinition = {
  code: IncidentType.ANIMAL,
  label: { th: "สัตว์อันตราย", en: "Dangerous animal" },
  // TF-66: หัวข้อตัวนับคนในขั้นรายละเอียดเหตุ
  peopleLabel: { th: "จำนวนคนที่ต้องการความช่วยเหลือ", en: "People who need help" },
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
  dangerSigns: [
    ...UNIVERSAL_DANGER_SIGNS,
    {
      key: "VENOMOUS_BITE",
      label: { th: "ถูกสัตว์มีพิษกัด/ต่อย และมีอาการแน่นหน้าอก หายใจลำบาก หรือบวมเฉียบพลัน", en: "Bitten or stung by a venomous animal with chest tightness, difficulty breathing, or sudden swelling" },
      source: ANIMAL_OFFICIAL_SOURCE,
    },
  ],
  needs: [
    Need.MEDICINE,
    Need.FLASHLIGHT_POWER,
    Need.OTHER,
  ],
  waitingAdvice: [
    {
      text: {
        th: "ถอยห่างจากสัตว์ ไม่พยายามจับหรือตีด้วยตนเอง และคอยสังเกตตำแหน่งจากระยะปลอดภัย", en: "Move away from the animal. Do not try to catch or hit it yourself, and keep watching where it is from a safe distance.",
      },
      source: ANIMAL_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "หากถูกงูกัด ให้ล้างแผลด้วยน้ำสะอาด ดามอวัยวะให้อยู่นิ่งระดับต่ำกว่าหัวใจ ห้ามขันชะเนาะและห้ามกรีดแผล", en: "If bitten by a snake, wash the wound with clean water and splint the limb so it stays still below heart level. Do not apply a tourniquet and do not cut the wound.",
      },
      source: ANIMAL_OFFICIAL_SOURCE,
    },
    {
      text: {
        th: "จดจำลักษณะ สี หรือถ่ายภาพสัตว์จากระยะปลอดภัยเพื่อช่วยแพทย์ในการเลือกเซรุ่มแก้พิษ", en: "Remember the animal's appearance and color, or photograph it from a safe distance, to help doctors choose the right antivenom.",
      },
      source: ANIMAL_OFFICIAL_SOURCE,
    },
  ],
};
