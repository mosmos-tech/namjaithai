import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "no-store" };
const date = z.iso.date();
const filters = z
  .object({
    actor: z.string().trim().max(100),
    from: z.union([date, z.literal("")]),
    to: z.union([date, z.literal("")]),
    offset: z.coerce.number().int().min(0).max(100000),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to);

export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (user?.role !== "ADMIN" || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }
  const params = request.nextUrl.searchParams;
  const parsed = filters.safeParse({
    actor: params.get("actor") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    offset: params.get("offset") ?? "0",
  });
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_filter" }, { status: 400, headers });
  const { actor, from, to, offset } = parsed.data;
  const db = await createClient();
  let query = db
    .from("audit_logs")
    .select(
      actor
        ? "id,action,created_at,actor_user_id,target_user_id,case_id,actor:users!audit_logs_actor_user_id_fkey!inner(display_name),target:users!audit_logs_target_user_id_fkey(display_name),case:cases!audit_logs_case_id_fkey(case_code)"
        : "id,action,created_at,actor_user_id,target_user_id,case_id,actor:users!audit_logs_actor_user_id_fkey(display_name),target:users!audit_logs_target_user_id_fkey(display_name),case:cases!audit_logs_case_id_fkey(case_code)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 50);
  if (actor) query = query.ilike("actor.display_name", `%${actor.replace(/[%_\\]/g, "\\$&")}%`);
  if (from) query = query.gte("created_at", new Date(`${from}T00:00:00+07:00`).toISOString());
  if (to)
    query = query.lt(
      "created_at",
      new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000).toISOString(),
    );
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "load_failed" }, { status: 500, headers });
  return NextResponse.json({ logs: data.slice(0, 50), hasMore: data.length > 50 }, { headers });
}
