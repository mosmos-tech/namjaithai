import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { caseCodeSchema, trackingTokenSchema } from "@/lib/domain";

const decisionSchema = z.object({ decision: z.enum(["CONFIRM", "NOT_RECEIVED"]) });
export async function POST(
  request: Request,
  context: RouteContext<"/api/track/[code]/confirmation">,
) {
  const code = caseCodeSchema.safeParse((await context.params).code);
  const token = trackingTokenSchema.safeParse(request.headers.get("X-Tracking-Token"));
  const input = decisionSchema.safeParse(await request.json().catch(() => null));
  const headers = { "Cache-Control": "no-store" };
  if (!code.success || !token.success || !input.success)
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
  const { data, error } = await createAdminClient().rpc("reporter_confirm_case", {
    p_case_code: code.data,
    p_token: token.data,
    p_decision: input.data.decision,
  });
  if (error)
    return Response.json(
      { error: "ไม่สามารถยืนยันเคสได้" },
      { status: error.code === "42501" ? 404 : 500, headers },
    );
  if (data?.status === "STALE")
    return Response.json({ error: "สถานะเคสเปลี่ยนแล้ว กรุณาโหลดใหม่" }, { status: 409, headers });
  return Response.json(data, { headers });
}
