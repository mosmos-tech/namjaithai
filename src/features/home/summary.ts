import { INCIDENT_REGISTRY, type IncidentType } from "@/lib/domain/incidents";
import { createAdminClient } from "@/lib/supabase/admin";

// Share one in-flight request and its result per server instance for 30 seconds.
let cached: { expiresAt: number; value: Promise<unknown> } | null = null;
export function getSituationSummary(): Promise<unknown> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = (async () => {
    const { data, error } = await createAdminClient().rpc("public_situation_summary");
    if (error) throw new Error("Unable to load situation summary");
    const summary = data as {
      provinces: { incidents: { code: IncidentType; waiting: number }[] }[];
    };
    return {
      ...summary,
      provinces: summary.provinces.map((province) => ({
        ...province,
        incidents: province.incidents.map((incident) => ({
          ...incident,
          label: INCIDENT_REGISTRY[incident.code]?.label.th ?? incident.code,
        })),
      })),
    };
  })();
  cached = { expiresAt: Date.now() + 30_000, value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}
