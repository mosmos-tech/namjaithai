import { NextResponse, type NextRequest } from "next/server";
import { resolveGoogleMapsLink } from "@/lib/domain";

/**
 * GET /api/geo/gmaps?url=https://maps.app.goo.gl/...
 * แปลงลิงก์ Google Maps (ทั้งลิงก์เต็มและลิงก์ย่อ) เป็นพิกัด { lat, lng, resolvedUrl }
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const result = await resolveGoogleMapsLink(url);

  if (!result.ok) {
    const status = result.code === "RESOLVE_FAILED" ? 502 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    lat: result.lat,
    lng: result.lng,
    resolvedUrl: result.resolvedUrl,
  });
}

/**
 * POST /api/geo/gmaps
 * Body: { "url": "https://maps.app.goo.gl/..." }
 * รองรับการส่งลิงก์ผ่าน POST JSON จากฟอร์มปักหมุด (TF-09)
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง กรุณาส่งเป็น JSON", code: "INVALID_URL" },
      { status: 400 },
    );
  }

  const url =
    typeof body === "object" &&
    body !== null &&
    "url" in body &&
    typeof (body as { url: unknown }).url === "string"
      ? (body as { url: string }).url
      : "";

  const result = await resolveGoogleMapsLink(url);

  if (!result.ok) {
    const status = result.code === "RESOLVE_FAILED" ? 502 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    lat: result.lat,
    lng: result.lng,
    resolvedUrl: result.resolvedUrl,
  });
}
