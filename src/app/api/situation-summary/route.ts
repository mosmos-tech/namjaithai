import { NextResponse } from "next/server";
import { getSituationSummary } from "@/features/home/summary";

export async function GET() {
  try {
    const data = await getSituationSummary();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
    });
  } catch {
    return NextResponse.json(
      { error: "summary_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
