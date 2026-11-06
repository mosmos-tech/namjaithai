import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { UnitCapability } from "@/lib/domain/incidents";
import { createClient } from "@/lib/supabase/server";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_unit"),
    name: z.string().trim().min(1).max(150),
    province: z.string().min(1).max(100),
    leaderId: z.uuid(),
  }),
  z.object({ action: z.literal("assign_leader"), unitId: z.uuid(), userId: z.uuid() }),
  z.object({
    action: z.literal("user_status"),
    userId: z.uuid(),
    status: z.enum(["ACTIVE", "SUSPENDED"]),
  }),
  z.object({
    action: z.literal("capabilities"),
    unitId: z.uuid(),
    capabilities: z.array(z.enum(UnitCapability)).max(7),
  }),
  z.object({
    action: z.literal("incident_type"),
    code: z.string().regex(/^[A-Z_]+$/),
    enabled: z.boolean(),
  }),
]);
const noStore = { "Cache-Control": "no-store" };
async function isAdmin() {
  const user = await getCurrentAppUser();
  return user?.status === "ACTIVE" && user.role === "ADMIN";
}
export async function GET(request: NextRequest) {
  const actor = await getCurrentAppUser();
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const search = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const db = await createClient();
  let userQuery = db
    .from("users")
    .select("id,display_name,role,status")
    .order("display_name")
    .limit(80);
  if (search) userQuery = userQuery.ilike("display_name", `%${search.replace(/[%_\\]/g, "\\$&")}%`);
  const [users, units, capabilities, incidents, provinces] = await Promise.all([
    userQuery,
    db.from("units").select("id,name,province,lead_user_id,is_active").order("name").limit(300),
    db.from("unit_capabilities").select("unit_id,capability"),
    db.from("incident_types").select("code,is_enabled").order("sort_order"),
    db.from("provinces").select("name_th").order("name_th"),
  ]);
  if ([users, units, capabilities, incidents, provinces].some((result) => result.error))
    return NextResponse.json({ error: "load_failed" }, { status: 500, headers: noStore });
  return NextResponse.json(
    {
      currentUserId: actor.id,
      users: users.data,
      units: units.data,
      capabilities: capabilities.data,
      incidents: incidents.data,
      provinces: provinces.data,
    },
    { headers: noStore },
  );
}
export async function POST(request: NextRequest) {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const { action, ...input } = parsed.data;
  const { data, error } = await (
    await createClient()
  ).rpc("admin_manage", { p_action: action, p_input: input });
  if (error)
    return NextResponse.json(
      { error: "action_failed" },
      { status: error.code === "42501" ? 403 : 400, headers: noStore },
    );
  return NextResponse.json({ result: data }, { headers: noStore });
}
