import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount, type TestAccount } from "./helpers/accounts";

test.describe.configure({ mode: "serial" });
let admin: TestAccount;
let user: TestAccount;
let first: string;
let second: string;
let primaryId: string;
let secondaryId: string;
let unitId: string;

test.beforeAll(async ({}, info) => {
  const tag = `T31${info.project.name[0]}${crypto.randomUUID().slice(0, 6)}`;
  first = `${tag}A`;
  second = `${tag}B`;
  admin = await createAccount({ displayName: `${tag} admin`, role: "ADMIN" });
  user = await createAccount({ displayName: `${tag} user`, role: "USER" });
  const db = adminDb();
  const unit = await db
    .from("units")
    .insert({ name: `${tag} ข้ามจังหวัด`, province: "ระยอง" })
    .select("id")
    .single()
    .throwOnError();
  unitId = unit.data!.id;
  const { data } = await db
    .from("cases")
    .insert([
      {
        case_code: first,
        urgency: "RED",
        lat: 12.24,
        lng: 102.51,
        landmark: "TF31 first",
        province: "ตราด",
        incident_type: "FLOOD",
        created_at: "2020-01-01T00:00:00Z",
      },
      {
        case_code: second,
        urgency: "YELLOW",
        lat: 12.24001,
        lng: 102.51,
        landmark: "TF31 second",
        province: "ตราด",
        incident_type: "FLOOD",
        created_at: "2020-01-02T00:00:00Z",
      },
    ])
    .select("id,case_code")
    .throwOnError();
  primaryId = data!.find((c) => c.case_code === first)!.id;
  secondaryId = data!.find((c) => c.case_code === second)!.id;
  await db
    .from("case_contacts")
    .insert({
      case_id: secondaryId,
      name: "TF31 ผู้ติดต่อ",
      phone: "0812345678",
      phone_last4: "5678",
    })
    .throwOnError();
});

test("แอดมินกรองรายการ เรียงตามเวลา รวมเคสและปิดพร้อมเหตุผล", async ({ page, context }, info) => {
  await applySession(context, admin);
  if (info.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/cases");
  await expect(page.getByRole("heading", { name: "จัดการเคส" })).toBeVisible();
  const list = page.getByRole("region", { name: "รายการเคส" });
  await expect(list.getByRole("button", { name: new RegExp(first) })).toBeVisible();
  const buttons = list.getByRole("button");
  expect(await buttons.nth(0).textContent()).toContain(first);
  expect(await buttons.nth(1).textContent()).toContain(second);
  await page.getByLabel("ตัวกรอง").selectOption("RED");
  await expect(list.getByRole("button", { name: new RegExp(second) })).toHaveCount(0);
  await page.getByLabel("ตัวกรอง").selectOption("");
  const detail = page.getByRole("region", { name: "รายละเอียดเคส" });
  await list.getByRole("button", { name: new RegExp(first) }).click();
  await detail.getByLabel("เลือกหน่วย").selectOption(unitId);
  await detail.getByRole("button", { name: "มอบหมาย", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("บันทึกเรียบร้อย");
  const assigned = await adminDb()
    .from("cases")
    .select("assigned_unit_id")
    .eq("id", primaryId)
    .single()
    .throwOnError();
  expect(assigned.data?.assigned_unit_id).toBe(unitId);
  await list.getByRole("button", { name: new RegExp(second) }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await detail
    .locator("div")
    .filter({ hasText: first })
    .getByRole("button", { name: "เลือกเป็นเคสหลัก" })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("บันทึกเรียบร้อย");
  await expect(list.getByRole("button", { name: new RegExp(second) })).toHaveCount(0);
  const { data: merged } = await adminDb()
    .from("cases")
    .select("status,duplicate_of_case_id")
    .eq("id", secondaryId)
    .single()
    .throwOnError();
  expect(merged).toMatchObject({ status: "DUPLICATE", duplicate_of_case_id: primaryId });
  await list.getByRole("button", { name: new RegExp(first) }).click();
  await detail.getByRole("button", { name: "แสดงข้อมูลติดต่อ" }).click();
  await expect(detail.getByText("TF31 ผู้ติดต่อ")).toBeVisible();
  await expect(detail.getByText("0812345678")).toBeVisible();
  const audited = await adminDb()
    .from("audit_logs")
    .select("id")
    .eq("case_id", primaryId)
    .eq("action", "CASE_CONTACT_REVEALED");
  expect(audited.data?.length).toBeGreaterThan(0);
  await expect(detail.getByRole("button", { name: "ปิดเคส" })).toBeDisabled();
  await detail.getByLabel(/เหตุผล/).fill("ติดต่อไม่ได้หลายครั้ง");
  page.once("dialog", (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "ปิดเคส" }).click();
  await expect(page.getByRole("status")).toContainText("บันทึกเรียบร้อย");
  await page.getByRole("button", { name: "ปิดแล้ว", exact: true }).click();
  await expect(list.getByRole("button", { name: new RegExp(first) })).toBeVisible();
  const { data: closed } = await adminDb()
    .from("cases")
    .select("status,resolution_note")
    .eq("id", primaryId)
    .single()
    .throwOnError();
  expect(closed).toMatchObject({ status: "UNREACHABLE", resolution_note: "ติดต่อไม่ได้หลายครั้ง" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test("ผู้ใช้ทั่วไปเรียก API แอดมินไม่ได้", async ({ context }) => {
  await applySession(context, user);
  const response = await context.request.get("/api/admin/cases");
  expect(response.status()).toBe(403);
});
