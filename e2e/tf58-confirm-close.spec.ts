import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";
test.describe.configure({ mode: "serial" });
let lead: TestAccount;
let unitId: string;
let cases: { id: string; case_code: string; tracking_token: string }[];
test.beforeAll(async () => {
  const db = adminDb();
  const tag = crypto.randomUUID().slice(0, 6);
  lead = await createAccount({ displayName: `TF58 ${tag}`, role: "UNIT_LEAD" });
  const unit = await db
    .from("units")
    .insert({ name: `TF58 ${tag}`, province: "ตราด" })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit.data!.id;
  await db
    .from("unit_members")
    .insert({ unit_id: unitId, user_id: lead.id, role_in_unit: "LEAD", status: "APPROVED" })
    .throwOnError();
  const base = Math.floor(Math.random() * 8_000_000) + 1_000_000;
  const result = await db
    .from("cases")
    .insert(
      [0, 1, 2].map((i) => ({
        case_code: `FL-2611-${base + i}`,
        urgency: "YELLOW",
        status: "AWAITING_CONFIRMATION",
        lat: 12.24 + i / 10000,
        lng: 102.51,
        landmark: "TF58 test",
        province: "ตราด",
        incident_type: "FLOOD",
        assigned_unit_id: unitId,
        last_status_updated_at:
          i === 2 ? new Date(Date.now() - 25 * 3600_000).toISOString() : new Date().toISOString(),
      })),
    )
    .select("id,case_code,tracking_token")
    .throwOnError();
  cases = result.data!;
});
test("เปิดเว็บจากเครื่องเดิมแล้วปฏิเสธ เคสกลับ NEW และหัวหน้าเห็นแจ้งเตือน", async ({
  page,
  context,
}, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 });
  const item = cases[0];
  await page.addInitScript(
    (ref) => localStorage.setItem("namjaithai:confirmation-cases", JSON.stringify([ref])),
    { caseCode: item.case_code, trackingToken: item.tracking_token },
  );
  await page.goto("/");
  const banner = page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "ยังไม่ได้รับ" }).click();
  await expect(banner).toHaveCount(0);
  const { data } = await adminDb()
    .from("cases")
    .select("status")
    .eq("id", item.id)
    .single()
    .throwOnError();
  expect(data!.status).toBe("NEW");
  await applySession(context, lead);
  await page.goto("/unit");
  const queue = page.getByRole("region", { name: "คิวยืนยันเคส" });
  await expect(queue.getByText(item.case_code)).toBeVisible();
  await expect(queue.getByText(/ผู้แจ้งระบุว่ายังไม่ได้รับ/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
test("ลิงก์จาก LINE ยืนยันเคส และเคสเกิน 24 ชั่วโมงเข้าคิวหัวหน้า", async ({ page, context }) => {
  const item = cases[1];
  await page.goto(`/track/${item.case_code}?t=${item.tracking_token}`);
  const actions = page.getByRole("region", { name: "ยืนยันการช่วยเหลือ" });
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "ได้รับแล้ว" }).click();
  await expect(actions).toHaveCount(0);
  const { data } = await adminDb()
    .from("cases")
    .select("status,close_confirmation")
    .eq("id", item.id)
    .single()
    .throwOnError();
  expect(data).toMatchObject({ status: "RESOLVED", close_confirmation: "REPORTER_CONFIRMED" });
  await applySession(context, lead);
  await page.goto("/unit");
  const row = page.getByRole("listitem").filter({ hasText: cases[2].case_code });
  await expect(row).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "ปิดโดยไม่ได้รับการยืนยัน" }).click();
  await expect(row).toHaveCount(0);
  const result = await adminDb()
    .from("cases")
    .select("status,close_confirmation")
    .eq("id", cases[2].id)
    .single()
    .throwOnError();
  expect(result.data).toMatchObject({ status: "RESOLVED", close_confirmation: "LEAD_UNCONFIRMED" });
});
