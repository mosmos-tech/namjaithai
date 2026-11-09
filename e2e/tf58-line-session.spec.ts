import { expect, test } from "@playwright/test";
import { adminDb, closeTestCases } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

let reporter: TestAccount;
let other: TestAccount;
let item: { id: string; case_code: string; tracking_token: string };
test.beforeAll(async () => {
  const tag = crypto.randomUUID().slice(0, 6);
  reporter = await createAccount({ displayName: `TF58 reporter ${tag}`, role: "USER" });
  other = await createAccount({ displayName: `TF58 other ${tag}`, role: "USER" });
  const code = `FL-2611-${Math.floor(Math.random() * 8_000_000) + 1_000_000}`;
  const result = await adminDb()
    .from("cases")
    .insert({
      case_code: code,
      urgency: "YELLOW",
      status: "AWAITING_CONFIRMATION",
      lat: 7.9,
      lng: 98.4,
      landmark: "TF58 LINE test",
      incident_type: "FLOOD",
      reporter_user_id: reporter.id,
    })
    .select("id,case_code,tracking_token")
    .single()
    .throwOnError();
  item = result.data!;
});
test.afterAll(async () => {
  if (item) await closeTestCases([item.id]);
  const ids = [reporter?.id, other?.id].filter(Boolean);
  if (ids.length) await adminDb().from("users").update({ status: "SUSPENDED" }).in("id", ids);
});

test("ลิงก์ LINE ใช้บัญชีเจ้าของยืนยัน โดยบัญชีอื่นหรือเบอร์สี่ตัวท้ายยืนยันไม่ได้", async ({
  page,
  context,
}, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 });
  const path = `/track/${item.case_code}?t=${item.tracking_token}`;
  await page.goto(path);
  const panel = page.getByRole("region", { name: "ยืนยันด้วยบัญชี LINE" });
  await expect(panel.getByRole("link", { name: "เข้าสู่ระบบด้วย LINE" })).toBeVisible();
  const href = await panel.getByRole("link", { name: "เข้าสู่ระบบด้วย LINE" }).getAttribute("href");
  expect(new URL(href!, "http://localhost:3000").searchParams.get("next")).toBe(path);
  await applySession(context, other);
  await page.goto(path);
  await expect(panel.getByText(/บัญชีนี้ไม่ใช่บัญชีที่ใช้แจ้งเคส/)).toBeVisible();
  const denied = await context.request.post(`/api/track/${item.case_code}/confirmation`, {
    data: { decision: "CONFIRM" },
  });
  expect(denied.status()).toBe(404);
  const { data: before } = await adminDb()
    .from("cases")
    .select("status")
    .eq("id", item.id)
    .single()
    .throwOnError();
  expect(before!.status).toBe("AWAITING_CONFIRMATION");
  await applySession(context, reporter);
  await page.goto(path);
  const confirmation = page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "ได้รับแล้ว" }).click();
  await expect(confirmation).toHaveCount(0);
  const { data: after } = await adminDb()
    .from("cases")
    .select("status,close_confirmation")
    .eq("id", item.id)
    .single()
    .throwOnError();
  expect(after).toMatchObject({ status: "RESOLVED", close_confirmation: "REPORTER_CONFIRMED" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
