import { describe, expect, it } from "vitest";
import { canUnitHandle, filterCasesByCapability, IncidentType, UnitCapability } from "../incidents";

describe("TF-52 unit capabilities", () => {
  it.each([
    [IncidentType.FLOOD, UnitCapability.BOAT],
    [IncidentType.FIRE, UnitCapability.FIRE_SUPPRESSION],
    [IncidentType.ROAD_ACCIDENT, UnitCapability.EXTRICATION],
    [IncidentType.MEDICAL, UnitCapability.EMS],
    [IncidentType.WATER_RESCUE, UnitCapability.WATER_RESCUE],
    [IncidentType.COLLAPSE, UnitCapability.EXTRICATION],
    [IncidentType.ANIMAL, UnitCapability.ANIMAL_CAPTURE],
  ])("matches %s when a relevant capability is present", (incident, capability) => {
    expect(canUnitHandle(incident, [capability])).toBe(true);
    expect(canUnitHandle(incident, [])).toBe(false);
  });
  it("allows OTHER even without capabilities", () =>
    expect(canUnitHandle(IncidentType.OTHER, [])).toBe(true));
  it("matches any relevant capability and filters only when enabled", () => {
    const cases = [
      { incident_type: IncidentType.FIRE },
      { incident_type: IncidentType.ANIMAL },
      { incident_type: IncidentType.OTHER },
    ];
    expect(canUnitHandle(IncidentType.FIRE, [UnitCapability.EMS])).toBe(true);
    expect(filterCasesByCapability(cases, [UnitCapability.EMS])).toEqual([cases[0], cases[2]]);
    expect(filterCasesByCapability(cases, [UnitCapability.EMS], false)).toEqual(cases);
  });
});
