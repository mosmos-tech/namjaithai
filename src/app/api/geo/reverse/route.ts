import { NextResponse, type NextRequest } from "next/server";
import { locateAdminArea } from "@/features/geo/queries";
import { badRequest } from "@/features/geo/http";
import { reverseGeocodeQuerySchema } from "@/lib/domain";

// GET /api/geo/reverse?lat=13.7649&lng=100.5383 → จังหวัด/อำเภอ/ตำบลของพิกัดนั้น
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const parsed = reverseGeocodeQuerySchema.safeParse({
    lat: params.get("lat") ?? "",
    lng: params.get("lng") ?? "",
  });
  if (!parsed.success) return badRequest(parsed.error);

  const area = await locateAdminArea(parsed.data.lat, parsed.data.lng);
  if (!area) {
    return NextResponse.json({ error: "พิกัดนี้ไม่อยู่ในประเทศไทย" }, { status: 404 });
  }
  return NextResponse.json(area);
}
