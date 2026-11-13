import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
const headers = { "Cache-Control": "no-store" };
async function allowed() {
  const user = await getCurrentAppUser();
  return user?.status === "ACTIVE" && (user.role === "UNIT_LEAD" || user.role === "ADMIN");
}
export async function GET() {
  if (!(await allowed())) return Response.json({ error: "forbidden" }, { status: 403, headers });
  const { data, error } = await (await createClient()).rpc("lead_confirmation_queue");
  return Response.json(error ? { error: "load_failed" } : { items: data }, {
    status: error ? 500 : 200,
    headers,
  });
}
export async function POST(request: Request) {
  if (!(await allowed())) return Response.json({ error: "forbidden" }, { status: 403, headers });
  const parsed = z
    .object({ caseId: z.uuid(), action: z.enum(["close", "acknowledge"]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400, headers });
  const db = await createClient();
  const { error } =
    parsed.data.action === "close"
      ? await db.rpc("lead_confirm_unverified", { p_case_id: parsed.data.caseId })
      : await db.rpc("acknowledge_lead_alert", { p_case_id: parsed.data.caseId });
  return Response.json(error ? { error: "action_failed" } : { ok: true }, {
    status: error ? 400 : 200,
    headers,
  });
}
