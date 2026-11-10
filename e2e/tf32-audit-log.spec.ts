import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, deleteAccount, type TestAccount } from "./helpers/accounts";

let admin: TestAccount;
let actor: TestAccount;
let ordinary: TestAccount;
let caseCode: string;
let caseId: string;
test.beforeAll(async ({}, info) => {
  const tag = `T32${info.project.name[0]}${crypto.randomUUID().slice(0, 7)}`;
  admin = await createAccount({ displayName: `${tag} admin`, role: "ADMIN" });
  actor = await createAccount({ displayName: `${tag} ผู้ทำรายการ`, role: "USER" });
  ordinary = await createAccount({ displayName: `${tag} สมาชิก`, role: "USER" });
  caseCode = tag;
  const db = adminDb();
  const { data: item } = await db
    .from("cases")
    .insert({
      case_code: caseCode,
      urgency: "RED",
      lat: 13.8,
      lng: 100.5,
      landmark: "audit test",
      province: "กรุงเทพมหานคร",
      incident_type: "FLOOD",
    })
    .select("id")
    .single()
    .throwOnError();
  caseId = item!.id;
  await db
    .from("audit_logs")
    .insert([
      {
        actor_user_id: actor.id,
        action: "CASE_CONTACT_REVEALED",
        target_type: "case",
        target_id: item!.id,
        case_id: item!.id,
        created_at: "2026-04-09T17:00:00Z",
      },
      {
        actor_user_id: actor.id,
        action: "MEMBER_APPROVED",
        target_type: "user",
        target_user_id: ordinary.id,
        created_at: "2026-04-10T16:59:59Z",
      },
      {
        actor_user_id: actor.id,
        action: "MEMBER_SUSPENDED",
        target_type: "user",
        target_user_id: ordinary.id,
        created_at: "2026-04-10T17:00:00Z",
      },
    ])
    .throwOnError();
});
test.afterAll(async () => {
  await Promise.all([admin, actor, ordinary].filter(Boolean).map(deleteAccount));
});

test("แอดมินเห็นการเปิดข้อมูลติดต่อและการอนุมัติ กรองชื่อและวันตามเวลาไทย", async ({
  page,
  context,
}) => {
  await applySession(context, admin);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/audit");
  await page.getByLabel("ชื่อผู้ทำรายการ").fill(actor.displayName);
  await page.getByLabel("ตั้งแต่วันที่").fill("2026-04-10");
  await page.getByLabel("ถึงวันที่").fill("2026-04-10");
  await page.getByRole("button", { name: "ค้นหา" }).click();
  const region = page.getByRole("region", { name: "รายการบันทึกการตรวจสอบ" });
  await expect(region.getByText("เปิดดูข้อมูลติดต่อ")).toBeVisible();
  await expect(region.getByText(`เคส: ${caseCode}`, { exact: true })).toBeVisible();
  await expect(region.getByText("อนุมัติสมาชิก")).toBeVisible();
  await expect(region.getByText(ordinary.displayName, { exact: false })).toBeVisible();
  await expect(region.getByText("ระงับสมาชิก")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const response = await context.request.get(
    `/api/admin/audit?actor=${encodeURIComponent(actor.displayName)}&from=2026-04-10&to=2026-04-10`,
  );
  const body = await response.json();
  expect(body.logs).toHaveLength(2);
  expect(JSON.stringify(body)).not.toContain("phone");
  expect(
    (await context.request.get("/api/admin/audit?from=2026-04-11&to=2026-04-10")).status(),
  ).toBe(400);
});

test("ผู้ใช้ทั่วไปเปิด API และหน้าของแอดมินไม่ได้", async ({ page, context }) => {
  await applySession(context, ordinary);
  expect((await context.request.get("/api/admin/audit")).status()).toBe(403);
  await page.goto("/admin/audit");
  await expect(page).not.toHaveURL(/\/admin\/audit/);
});

test("การกดแสดงเบอร์จริงสร้างรายการที่ตรวจสอบได้ทุกครั้ง", async ({ page, context }) => {
  await applySession(context, admin);
  await adminDb()
    .from("case_contacts")
    .insert({ case_id: caseId, name: "ผู้ทดสอบ", phone: "0812345678", phone_last4: "5678" })
    .throwOnError();
  for (let i = 0; i < 2; i++) {
    expect((await context.request.get(`/api/admin/cases?contacts=${caseId}`)).status()).toBe(200);
  }
  await page.goto("/admin/audit");
  await page.getByLabel("ชื่อผู้ทำรายการ").fill(admin.displayName);
  await page.getByRole("button", { name: "ค้นหา" }).click();
  const region = page.getByRole("region", { name: "รายการบันทึกการตรวจสอบ" });
  await expect(region.getByText("เปิดดูข้อมูลติดต่อ")).toHaveCount(2);
  await expect(region.getByText(`เคส: ${caseCode}`, { exact: true })).toHaveCount(2);
  await expect(region).not.toContainText("0812345678");
});
