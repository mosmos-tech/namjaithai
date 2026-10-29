import { listDistricts } from "@/features/geo/queries";
import { badRequest, listResponse } from "@/features/geo/http";
import { provinceCodeSchema } from "@/lib/domain";

// GET /api/geo/provinces/10/districts → อำเภอ/เขตในจังหวัดนั้น
export async function GET(_req: Request, ctx: RouteContext<"/api/geo/provinces/[code]/districts">) {
  const parsed = provinceCodeSchema.safeParse((await ctx.params).code);
  if (!parsed.success) return badRequest(parsed.error);
  return listResponse(await listDistricts(parsed.data));
}
