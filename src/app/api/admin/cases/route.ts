import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { createClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "no-store" };
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    caseId: z.uuid(),
    version: z.number().int().positive(),
    unitId: z.uuid(),
  }),
  z.object({
    action: z.literal("merge"),
    caseId: z.uuid(),
    version: z.number().int().positive(),
    primaryId: z.uuid(),
  }),
  z.object({
    action: z.literal("unreachable"),
    caseId: z.uuid(),
    version: z.number().int().positive(),
    reason: z.string().trim().min(3).max(300),
  }),
]);
async function authorized() {
  const user = await getCurrentAppUser();
  return user?.role === "ADMIN" && user.status === "ACTIVE";
}
export async function GET(request: NextRequest) {
  if (!(await authorized()))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const db = await createClient();
  const contacts = request.nextUrl.searchParams.get("contacts");
  if (contacts) {
    if (!z.uuid().safeParse(contacts).success)
      return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
    const { data, error } = await db.rpc("admin_reveal_case_contacts", { p_case_id: contacts });
    return NextResponse.json(error ? { error: "load_failed" } : { contacts: data }, {
      status: error ? 500 : 200,
      headers: noStore,
    });
  }
  const nearby = request.nextUrl.searchParams.get("nearby");
  if (nearby) {
    if (!z.uuid().safeParse(nearby).success)
      return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
    const { data, error } = await db.rpc("admin_nearby_cases", { p_case_id: nearby });
    return NextResponse.json(error ? { error: "load_failed" } : { cases: data }, {
      status: error ? 500 : 200,
      headers: noStore,
    });
  }
  const closed = request.nextUrl.searchParams.get("closed") === "1";
  const offset = Math.min(
    100000,
    Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0),
  );
  const filter = request.nextUrl.searchParams.get("filter");
  let query = db
    .from("cases")
    .select(
      "id,case_code,status,urgency,incident_type,created_at,province,district,landmark,assigned_unit_id,assigned_rescuer_id,duplicate_of_case_id,version,is_demo",
    )
    .order("created_at")
    .order("id")
    .range(offset, offset + 49);
  query = closed
    ? query.in("status", ["RESOLVED", "CANCELLED", "DUPLICATE", "UNREACHABLE"])
    : query.in("status", ["NEW", "ACCEPTED", "EN_ROUTE", "ON_SITE", "AWAITING_CONFIRMATION"]);
  if (["RED", "YELLOW", "GREEN"].includes(filter ?? "")) query = query.eq("urgency", filter!);
  if (filter === "UNASSIGNED") query = query.is("assigned_rescuer_id", null);
  const [cases, units] = await Promise.all([
    query,
    db
      .from("units")
      .select("id,name,province,source")
      .eq("is_active", true)
      .neq("source", "OSM")
      .order("name")
      .limit(1000),
  ]);
  if (cases.error || units.error)
    return NextResponse.json({ error: "load_failed" }, { status: 500, headers: noStore });
  return NextResponse.json({ cases: cases.data, units: units.data }, { headers: noStore });
}
export async function POST(request: NextRequest) {
  if (!(await authorized()))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const input = parsed.data;
  const { error } = await (
    await createClient()
  ).rpc("admin_case_action", {
    p_action: input.action,
    p_case_id: input.caseId,
    p_version: input.version,
    p_unit_id: input.action === "assign" ? input.unitId : null,
    p_primary_id: input.action === "merge" ? input.primaryId : null,
    p_reason: input.action === "unreachable" ? input.reason : null,
  });
  if (error)
    return NextResponse.json(
      { error: error.code === "40001" ? "stale" : "action_failed" },
      { status: error.code === "40001" ? 409 : 400, headers: noStore },
    );
  return NextResponse.json({ ok: true }, { headers: noStore });
}
