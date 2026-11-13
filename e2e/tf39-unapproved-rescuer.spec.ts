import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
import { adminDb, closeTestCases } from "./helpers/db";
import { saveEvidence } from "./helpers/evidence";

/**
 * TF-39 เกณฑ์ขอบเขตข้อ 4: กู้ภัยที่หัวหน้ายังไม่อนุมัติ (unit_members = PENDING)
 * เข้าหน้ากู้ภัยไม่ได้ และเรียก RPC / ตารางตรงๆ ด้วย session ของตัวเองก็ไม่ได้ข้อมูลเคส
 * มีกู้ภัยที่อนุมัติแล้วในหน่วยเดียวกันเป็นตัวเทียบ (เห็นเคสเดียวกันได้) กัน test ผ่านเพราะไม่มีข้อมูล
 * จังหวัดของไฟล์นี้เอง: จอคอม = นราธิวาส · มือถือ = ปัตตานี
 */
const PROVINCES = { desktop: "นราธิวาส", mobile: "ปัตตานี" } as const;
const POINTS = {
  desktop: { lat: 6.4255, lng: 101.8253 },
  mobile: { lat: 6.8696, lng: 101.2501 },
} as const;

let pending: TestAccount;
let approved: TestAccount;
let caseId: string;
let unitId: string;
const PHONE = "0893900039";

function clientOf(account: TestAccount) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => account.cookies, setAll: () => undefined } },
  );
}

test.beforeAll(async ({}, testInfo) => {
  const project = testInfo.project.name as keyof typeof PROVINCES;
  const tag = `TF39${project[0]}${crypto.randomUUID().slice(0, 6)}`;
  const db = adminDb();
  pending = await createAccount({ displayName: `${tag} รออนุมัติ`, role: "RESCUER" });
  approved = await createAccount({ displayName: `${tag} อนุมัติแล้ว`, role: "RESCUER" });
  const { data: unit } = await db
    .from("units")
    .insert({ name: `${tag} หน่วย`, province: PROVINCES[project] })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit!.id;
  await db
    .from("unit_members")
    .insert([
      { unit_id: unitId, user_id: pending.id, role_in_unit: "MEMBER", status: "PENDING" },
      { unit_id: unitId, user_id: approved.id, role_in_unit: "MEMBER", status: "APPROVED" },
    ])
    .throwOnError();
  const { data: item } = await db
    .from("cases")
    .insert({
      case_code: `${tag}-CASE`,
      urgency: "RED",
      ...POINTS[project],
      province: PROVINCES[project],
      landmark: `${tag} จุดสังเกต`,
      incident_type: "FLOOD",
      is_demo: false,
    })
    .select("id")
    .single()
    .throwOnError();
  caseId = item!.id;
  await db
    .from("case_contacts")
    .insert({ case_id: caseId, name: `${tag} ผู้แจ้ง`, phone: PHONE, phone_last4: "0039" })
    .throwOnError();
});

test.afterAll(async () => {
  const db = adminDb();
  if (caseId) await closeTestCases([caseId]);
  if (unitId) await db.from("units").update({ is_active: false }).eq("id", unitId);
  const ids = [pending, approved].filter(Boolean).map((account) => account.id);
  if (ids.length) await db.from("users").update({ status: "SUSPENDED" }).in("id", ids);
});

test("กู้ภัยที่ยังไม่อนุมัติเข้าหน้ากู้ภัยไม่ได้ทุกหน้า", async ({ page, context }) => {
  await applySession(context, pending);
  for (const path of ["/rescue", "/rescue/map", "/rescue/cases", "/rescue/my-tasks"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/my-cases\?denied=1$/);
  }
  await page.goto(`/rescue/cases/${caseId}`);
  await expect(page).toHaveURL(/\/my-cases\?denied=1$/);
  await expect(page.getByText("บัญชีของคุณไม่มีสิทธิ์เปิดหน้านั้น")).toBeVisible();
  await expect(page.getByText(PHONE)).toHaveCount(0);
  await saveEvidence(page, "4-unapproved-rescuer-denied", test.info());
});

test("กู้ภัยที่ยังไม่อนุมัติเรียก RPC และตารางตรงๆ ก็ไม่ได้ข้อมูลเคส", async ({}, testInfo) => {
  const project = testInfo.project.name as keyof typeof POINTS;
  const listQuery = {
    p_lat: POINTS[project].lat,
    p_lng: POINTS[project].lng,
    p_radius_m: null,
    p_sort: "PRIORITY",
    p_after_k1: null,
    p_after_k2: null,
    p_after_k3: null,
    p_after_id: null,
  };

  // ตัวเทียบ: กู้ภัยที่อนุมัติแล้วในหน่วยเดียวกันเห็นเคสนี้ในรายการ
  const allowed = await clientOf(approved).rpc("list_rescue_cases", listQuery);
  expect(allowed.error).toBeNull();
  expect((allowed.data as { id: string }[]).map((row) => row.id)).toContain(caseId);

  const db = clientOf(pending);
  const list = await db.rpc("list_rescue_cases", listQuery);
  expect(
    list.error !== null || !(list.data as { id: string }[]).some((row) => row.id === caseId),
  ).toBe(true);

  const cases = await db.from("cases").select("id, landmark").eq("id", caseId);
  expect(cases.data ?? []).toEqual([]);
  const contacts = await db.from("case_contacts").select("name, phone").eq("case_id", caseId);
  expect(contacts.data ?? []).toEqual([]);

  const reveal = await db.rpc("reveal_case_contact", { p_case_id: caseId });
  expect(reveal.error).not.toBeNull();
  expect(JSON.stringify(reveal.data ?? "")).not.toContain(PHONE);

  const { data: before } = await adminDb()
    .from("cases")
    .select("version")
    .eq("id", caseId)
    .single()
    .throwOnError();
  const accept = await db.rpc("accept_case", {
    p_case_id: caseId,
    p_expected_version: before!.version,
  });
  expect(accept.error).not.toBeNull();
  const { data: after } = await adminDb()
    .from("cases")
    .select("status, assigned_rescuer_id")
    .eq("id", caseId)
    .single()
    .throwOnError();
  expect(after).toEqual({ status: "NEW", assigned_rescuer_id: null });

  const team = await db.rpc("list_team_locations");
  expect(team.error !== null || (team.data as unknown[]).length === 0).toBe(true);
});
