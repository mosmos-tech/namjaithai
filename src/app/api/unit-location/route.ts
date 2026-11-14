import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { createClient } from "@/lib/supabase/server";
const headers = { "Cache-Control": "no-store" };
const schema = z
  .object({
    unitId: z.uuid(),
    lat: z.number().min(5).max(21).nullable(),
    lng: z.number().min(97).max(106).nullable(),
  })
  .strict()
  .refine((x) => (x.lat === null) === (x.lng === null));
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const db = await createClient();
  let ids: string[] | null = null;
  if (user.role !== "ADMIN") {
    const { data, error } = await db
      .from("unit_members")
      .select("unit_id,expires_at")
      .eq("user_id", user.id)
      .eq("role_in_unit", "LEAD")
      .eq("status", "APPROVED");
    if (error) return Response.json({ error: "load_failed" }, { status: 500, headers });
    ids = (data ?? [])
      .filter((m) => !m.expires_at || Date.parse(m.expires_at) > Date.now())
      .map((m) => m.unit_id);
    if (!ids.length) return Response.json({ units: [] }, { headers });
  }
  let query = db
    .from("units")
    .select("id,name,province,location_lat,location_lng")
    .eq("is_active", true)
    .order("name");
  if (ids) query = query.in("id", ids);
  const { data, error } = await query;
  return Response.json(error ? { error: "load_failed" } : { units: data }, {
    status: error ? 500 : 200,
    headers,
  });
}
export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400, headers });
  const { error } = await (
    await createClient()
  ).rpc("set_own_unit_location", {
    p_unit_id: parsed.data.unitId,
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
  });
  return Response.json(error ? { error: "save_failed" } : { ok: true }, {
    status: error ? (error.code === "42501" ? 403 : 400) : 200,
    headers,
  });
}
