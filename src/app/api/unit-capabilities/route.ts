import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { UnitCapability } from "@/lib/domain/incidents";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "no-store" };
const schema = z
  .object({ unitId: z.uuid(), capabilities: z.array(z.enum(UnitCapability)).max(7) })
  .strict();

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  const db = await createClient();
  let ids: string[] | null = null;
  if (user.role !== "ADMIN") {
    const { data, error } = await db
      .from("unit_members")
      .select("unit_id,expires_at")
      .eq("user_id", user.id)
      .eq("role_in_unit", "LEAD")
      .eq("status", "APPROVED");
    if (error) return NextResponse.json({ error: "load_failed" }, { status: 500, headers });
    ids = (data ?? [])
      .filter((member) => !member.expires_at || Date.parse(member.expires_at) > Date.now())
      .map((member) => member.unit_id);
    if (!ids.length) return NextResponse.json({ units: [], capabilities: [] }, { headers });
  }
  let query = db.from("units").select("id,name").eq("is_active", true).order("name");
  if (ids) query = query.in("id", ids);
  const [units, capabilities] = await Promise.all([
    query,
    db.from("unit_capabilities").select("unit_id,capability"),
  ]);
  if (units.error || capabilities.error)
    return NextResponse.json({ error: "load_failed" }, { status: 500, headers });
  const allowed = new Set((units.data ?? []).map((unit) => unit.id));
  return NextResponse.json(
    {
      units: units.data,
      capabilities: (capabilities.data ?? []).filter((item) => allowed.has(item.unit_id)),
    },
    { headers },
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  const { error } = await (
    await createClient()
  ).rpc("set_unit_capabilities", {
    p_unit_id: parsed.data.unitId,
    p_capabilities: parsed.data.capabilities,
  });
  if (error)
    return NextResponse.json(
      { error: "save_failed" },
      { status: error.code === "42501" ? 403 : 400, headers },
    );
  return NextResponse.json({ ok: true }, { headers });
}
