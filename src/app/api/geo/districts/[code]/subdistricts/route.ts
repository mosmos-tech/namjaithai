import { listSubdistricts } from "@/features/geo/queries";
import { badRequest, listResponse } from "@/features/geo/http";
import { districtCodeSchema } from "@/lib/domain";

// GET /api/geo/districts/1001/subdistricts → ตำบล/แขวงในอำเภอนั้น
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/geo/districts/[code]/subdistricts">,
) {
  const parsed = districtCodeSchema.safeParse((await ctx.params).code);
  if (!parsed.success) return badRequest(parsed.error);
  return listResponse(await listSubdistricts(parsed.data));
}
