import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleReporterCase, type ReporterRpcClient } from "@/features/sos/server/reporter-case";

async function respond(
  request: NextRequest,
  ctx: RouteContext<"/api/track/[code]/reporter">,
  mutation?: unknown,
) {
  const result = await handleReporterCase({
    caseCode: (await ctx.params).code,
    token: request.headers.get("X-Tracking-Token") ?? "",
    mutation,
    supabase: createAdminClient() as unknown as ReporterRpcClient,
  });
  return Response.json(result.body, { status: result.status, headers: result.headers });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/track/[code]/reporter">) {
  return respond(request, ctx);
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/track/[code]/reporter">) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
  }
  if (body === null || typeof body !== "object")
    return Response.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  return respond(request, ctx, body);
}
