import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { createClient } from "@/lib/supabase/server";
export async function GET() {
  const user = await getCurrentAppUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD", "RESCUER"].includes(user.role))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const { data, error } = await (await createClient()).rpc("tf35_stale_alerts");
  return Response.json(error ? { error: "load_failed" } : { alerts: data }, {
    status: error ? 500 : 200,
    headers,
  });
}
