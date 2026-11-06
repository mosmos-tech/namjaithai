import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { manageableUnits } from "@/features/auth/server/unit-invites";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const units = await manageableUnits(user);
  const ids = units.map((unit) => unit.id);
  const admin = createAdminClient();
  const { data, error } = ids.length
    ? await admin
        .from("invites")
        .select("id, unit_id, token, max_uses, used_count, expires_at, is_active, created_at")
        .in("unit_id", ids)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (error) return NextResponse.json({ error: "load_failed" }, { status: 500 });
  return NextResponse.json({ units, invites: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { unitId, expiresAt, maxUses } = body as Record<string, unknown>;
  const count = Number(maxUses);
  const expiry = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  if (typeof unitId !== "string" || !Number.isInteger(count) || count < 1 || count > 500 || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 90 * 86400000) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const units = await manageableUnits(user);
  if (!units.some((unit) => unit.id === unitId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from("invites")
    .insert({ unit_id: unitId, token: randomBytes(32).toString("hex"), created_by: user.id, max_uses: count, expires_at: new Date(expiry).toISOString() })
    .select("id, unit_id, token, max_uses, used_count, expires_at, is_active, created_at")
    .single();
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });
  return NextResponse.json({ invite: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const inviteId = request.nextUrl.searchParams.get("id");
  if (!inviteId) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const ids = (await manageableUnits(user)).map((unit) => unit.id);
  if (!ids.length) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { error } = await admin
    .from("invites")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .in("unit_id", ids)
    .eq("is_active", true);
  if (error) return NextResponse.json({ error: "revoke_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
