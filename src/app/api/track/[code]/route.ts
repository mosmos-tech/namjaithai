import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleTrackCase, type TrackCaseRpcClient } from "@/features/sos/server/track-case";

/**
 * GET /api/track/FL-2610-0042?t=<tracking token>
 * หน้าติดตามเคสเรียกทุก 20 วินาที (polling) แทน Realtime เพื่อไม่กินโควตา
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/track/[code]">,
): Promise<Response> {
  const result = await handleTrackCase({
    caseCode: (await ctx.params).code,
    proof: { trackingToken: request.nextUrl.searchParams.get("t") ?? "" },
    headers: request.headers,
    supabase: createAdminClient() as unknown as TrackCaseRpcClient,
  });
  return Response.json(result.body, { status: result.status, headers: result.headers });
}
