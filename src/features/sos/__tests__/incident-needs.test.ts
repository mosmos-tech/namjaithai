import { describe, expect, it } from "vitest";
import { IncidentType, Need, needLabel, needLabelEn, step4Schema } from "../../../lib/domain";
import { getNeedOptionsForIncident } from "../components/Step4Needs";

describe("TF-51 incident-specific needs", () => {
  const expected: Record<string, string[]> = {
    FLOOD: ["EVACUATION_BOAT", "LIFE_JACKET"],
    FIRE: ["FIRE_RESCUE", "AMBULANCE"],
    ROAD_ACCIDENT: ["AMBULANCE", "VEHICLE_EXTRICATION"],
    MEDICAL: ["AMBULANCE"],
    WATER_RESCUE: ["WATER_RESCUE", "LIFE_JACKET"],
    COLLAPSE: ["DEBRIS_RESCUE", "AMBULANCE"],
    ANIMAL: ["ANIMAL_RESPONSE"],
    OTHER: ["OTHER"],
  };

  for (const [type, required] of Object.entries(expected)) {
    it(`${type} exposes relevant, translated and valid options`, () => {
      const options = getNeedOptionsForIncident(type as IncidentType).map((option) => option.value);
      for (const code of required) expect(options).toContain(code);
      expect(options).toContain("OTHER");
      expect(step4Schema.safeParse({ needs: options.filter((code) => code !== "OTHER") }).success).toBe(true);
      for (const code of options) {
        expect(needLabel[code]).toBeTruthy();
        expect(needLabelEn[code]).toBeTruthy();
      }
    });
  }

  it("road accidents do not relabel a bedridden evacuation as an ambulance", () => {
    const road = getNeedOptionsForIncident(IncidentType.ROAD_ACCIDENT).map((option) => option.value);
    expect(road).not.toContain("EVACUATE_BEDRIDDEN");
    expect(road.slice(0, 2)).toEqual(["AMBULANCE", "VEHICLE_EXTRICATION"]);
    expect(step4Schema.safeParse({ needs: ["EVACUATE_BEDRIDDEN"] }).success).toBe(true);
    const restored = getNeedOptionsForIncident(IncidentType.ROAD_ACCIDENT, [Need.EVACUATE_BEDRIDDEN]);
    expect(restored.map((option) => option.value)).toContain(Need.EVACUATE_BEDRIDDEN);
  });
});
