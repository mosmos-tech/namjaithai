import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, deleteAccount, type TestAccount } from "./helpers/accounts";

let admin: TestAccount;
let user: TestAccount;
let caseCode: string;
test.beforeAll(async () => {
  const tag = `T35${crypto.randomUUID().slice(0, 8)}`;
  caseCode = tag;
  admin = await createAccount({ displayName: `${tag} admin`, role: "ADMIN" });
  user = await createAccount({ displayName: `${tag} user`, role: "USER" });
  const db = adminDb();
  await db
    .from("cases")
    .insert({
      case_code: caseCode,
      urgency: "RED",
      status: "NEW",
      lat: 12.24,
      lng: 102.51,
      landmark: "TF35",
      province: "ตราด",
      incident_type: "FLOOD",
      last_status_updated_at: new Date(Date.now() - 11 * 60_000).toISOString(),
    })
    .throwOnError();
  await db.rpc("tf35_escalate_stale_cases").throwOnError();
});
test.afterAll(async () => {
  await Promise.all([admin, user].filter(Boolean).map(deleteAccount));
});
test("แอดมินเห็นเคสแดงที่รอนานและคนทั่วไปเรียกข้อมูลไม่ได้", async ({ page, context }) => {
  await applySession(context, admin);
  await page.goto("/admin");
  const alerts = page.getByRole("region", { name: "แจ้งเตือนเคสค้าง" });
  await expect(alerts.getByText(caseCode, { exact: true })).toBeVisible();
  await expect(
    alerts.locator("li").filter({ hasText: caseCode }).getByText("ยังไม่มีทีมรับเคส"),
  ).toBeVisible();
  await applySession(context, user);
  expect((await context.request.get("/api/stale-alerts")).status()).toBe(403);
});

test("แจ้งเตือนเมื่อโหลดรายการเคสค้างไม่สำเร็จ", async ({ page, context }) => {
  await applySession(context, admin);
  await page.route("**/api/stale-alerts", async (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("alert").filter({ hasText: "โหลดแจ้งเตือนเคสค้างไม่สำเร็จ" }),
  ).toBeVisible();
});
