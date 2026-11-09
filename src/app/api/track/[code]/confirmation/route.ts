import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { caseCodeSchema, trackingTokenSchema } from "@/lib/domain";

const decisionSchema = z.object({ decision: z.enum(["CONFIRM", "NOT_RECEIVED"]) });
const headers = { "Cache-Control": "no-store" };

type Context = RouteContext<"/api/track/[code]/confirmation">;

export async function GET(_request: Request, context: Context) {
  const code = caseCodeSchema.safeParse((await context.params).code);
  if (!code.success) return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
  const actor = await getCurrentAppUser();
  if (!actor || actor.status !== "ACTIVE")
    return Response.json({ account: "signed_out" }, { headers });
  const { data, error } = await (
    await createClient()
  ).rpc("can_confirm_case_as_reporter", { p_case_code: code.data });
  if (error) return Response.json({ error: "ตรวจสอบสิทธิ์ไม่สำเร็จ" }, { status: 500, headers });
  return Response.json({ account: data === true ? "owner" : "other" }, { headers });
}

export async function POST(request: Request, context: Context) {
  const code = caseCodeSchema.safeParse((await context.params).code);
  const input = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!code.success || !input.success)
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
  const rawToken = request.headers.get("X-Confirmation-Token");
  let result;
  if (rawToken !== null) {
    const token = trackingTokenSchema.safeParse(rawToken);
    if (!token.success)
      return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
    result = await createAdminClient().rpc("reporter_confirm_case", {
      p_case_code: code.data,
      p_token: token.data,
      p_decision: input.data.decision,
    });
  } else {
    const actor = await getCurrentAppUser();
    if (!actor || actor.status !== "ACTIVE")
      return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401, headers });
    result = await (
      await createClient()
    ).rpc("confirm_case_as_reporter", {
      p_case_code: code.data,
      p_decision: input.data.decision,
    });
  }
  if (result.error)
    return Response.json(
      { error: "ไม่สามารถยืนยันเคสได้" },
      { status: result.error.code === "42501" ? 404 : 500, headers },
    );
  if (result.data?.status === "STALE")
    return Response.json({ error: "สถานะเคสเปลี่ยนแล้ว กรุณาโหลดใหม่" }, { status: 409, headers });
  return Response.json(result.data, { headers });
}
