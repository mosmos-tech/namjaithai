"use client";
import { useState } from "react";
import {
  filterCasesByCapability,
  type IncidentType,
  type UnitCapability,
} from "@/lib/domain/incidents";

/** Presentation filter only. The API and RLS must still return all authorized cases. */
export function useCapabilityFilter<T extends { incident_type: IncidentType }>(
  cases: readonly T[],
  capabilities: readonly UnitCapability[],
) {
  const [enabled, setEnabled] = useState(true);
  return { enabled, setEnabled, cases: filterCasesByCapability(cases, capabilities, enabled) };
}
