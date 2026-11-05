import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/features/auth/server/app-user";
import { manageableUnits } from "@/features/auth/server/unit-invites";
import {
  deliverMemberLineNotifications,
  type NotificationClient,
} from "@/features/notifications/line-worker";
import { memberReviewSchema, type UnitMemberStatus } from "@/lib/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type MemberRow = {
  id: string;
  unit_id: string;
  user_id: string;
  role_in_unit: string;
  status: UnitMemberStatus;
  duty_status: string;
  is_on_duty: boolean;
  approved_at: string | null;
  expires_at: string | null;
  created_at: string;
  user: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    line_user_id: string | null;
    role: string;
    status: string;
  } | null;
};

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const units = await manageableUnits(user);
  const ids = units.map((unit) => unit.id);
  if (!ids.length) {
    return NextResponse.json({ units: [], members: [] });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("unit_members")
    .select(
      "id, unit_id, user_id, role_in_unit, status, duty_status, is_on_duty, approved_at, expires_at, created_at, user:users!unit_members_user_id_fkey(id, display_name, avatar_url, line_user_id, role, status)",
    )
    .in("unit_id", ids)
    .eq("role_in_unit", "MEMBER")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as MemberRow[];
  const rescuerIds = [
    ...new Set(rows.filter((row) => row.status === "APPROVED").map((row) => row.user_id)),
  ];
  const { data: cases, error: casesError } = rescuerIds.length
    ? await admin
        .from("cases")
        .select("case_code, status, assigned_unit_id, assigned_rescuer_id")
        .in("assigned_unit_id", ids)
        .in("assigned_rescuer_id", rescuerIds)
        .in("status", ["ACCEPTED", "EN_ROUTE", "ON_SITE"])
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (casesError) return NextResponse.json({ error: "load_failed" }, { status: 500 });
  const members = rows.map((row) => ({
    id: row.id,
    unit_id: row.unit_id,
    user_id: row.user_id,
    display_name: row.user?.display_name ?? "ผู้สมัครกู้ภัย",
    avatar_url: row.user?.avatar_url ?? null,
    has_line: Boolean(row.user?.line_user_id),
    status: row.status,
    duty_status: row.duty_status,
    cases: (cases ?? [])
      .filter(
        (item) => item.assigned_unit_id === row.unit_id && item.assigned_rescuer_id === row.user_id,
      )
      .map((item) => ({ code: item.case_code, status: item.status })),
    is_on_duty: row.is_on_duty,
    approved_at: row.approved_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
  }));

  return NextResponse.json({ units, members });
}

async function handleReview(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || user.status !== "ACTIVE" || !["ADMIN", "UNIT_LEAD"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = memberReviewSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const { unitId, memberIds, decision } = parsed.data;
  const units = await manageableUnits(user);
  if (!units.some((unit) => unit.id === unitId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_unit_members", {
    p_unit_id: unitId,
    p_member_ids: memberIds,
    p_decision: decision,
  });

  if (error) {
    return NextResponse.json({ error: "review_failed" }, { status: 500 });
  }

  if (process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN) {
    await deliverMemberLineNotifications({
      db: createAdminClient() as unknown as NotificationClient,
      token: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
      baseUrl: process.env.APP_BASE_URL ?? request.nextUrl.origin,
    }).catch(() => null);
  }

  const updated = Array.isArray(data) ? data : [];
  return NextResponse.json({ updated, count: updated.length });
}

export async function POST(request: NextRequest) {
  return handleReview(request);
}

export async function PATCH(request: NextRequest) {
  return handleReview(request);
}
