import { NextResponse } from "next/server";
import { getSubdistrictBounds } from "@/features/geo/queries";
import { badRequest, listResponse } from "@/features/geo/http";
import { subdistrictCodeSchema } from "@/lib/domain";

// GET /api/geo/subdistricts/100101/bounds → กรอบตำบล { west, south, east, north } (TF-65)
export async function GET(_req: Request, ctx: RouteContext<"/api/geo/subdistricts/[code]/bounds">) {
  const parsed = subdistrictCodeSchema.safeParse((await ctx.params).code);
  if (!parsed.success) return badRequest(parsed.error);

  const bounds = await getSubdistrictBounds(parsed.data);
  if (!bounds) return NextResponse.json({ error: "ไม่พบตำบลนี้" }, { status: 404 });
  return listResponse(bounds);
}
