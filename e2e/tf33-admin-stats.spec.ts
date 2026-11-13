import { expect, test } from "@playwright/test";
import { adminDb } from "./helpers/db";
import { applySession, createAccount } from "./helpers/accounts";

test("TF-33 แอดมินดูสรุปและกรองสถิติตามจังหวัดและช่วงวัน", async ({ page, context }, info) => {
  const admin = await createAccount({ displayName: "TF33 admin", role: "ADMIN" });
  const year = 2200 + Math.floor(Math.random() * 100);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  const tag = crypto.randomUUID().slice(0, 8);
  const db = adminDb();
  await db
    .from("cases")
    .insert([
      {
        case_code: `TF33-${tag}-1`,
        urgency: "RED",
        status: "RESOLVED",
        lat: 12.6,
        lng: 102.1,
        landmark: "TF33",
        province: "จันทบุรี",
        incident_type: "FLOOD",
        created_at: `${date}T02:00:00Z`,
      },
      {
        case_code: `TF33-${tag}-2`,
        urgency: "GREEN",
        status: "RESOLVED",
        lat: 12.6,
        lng: 102.1,
        landmark: "TF33",
        province: "จันทบุรี",
        incident_type: "FIRE",
        created_at: `${date}T03:00:00Z`,
      },
      {
        case_code: `TF33-${tag}-3`,
        urgency: "RED",
        status: "RESOLVED",
        lat: 12.6,
        lng: 102.1,
        landmark: "TF33",
        province: "ตราด",
        incident_type: "FLOOD",
        created_at: `${date}T04:00:00Z`,
      },
    ])
    .throwOnError();
  await applySession(context, admin);
  if (info.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin");
  const region = page.getByRole("region", { name: "สถิติห้องสั่งการ" });
  await expect(region.getByText("เคสที่เปิดอยู่")).toBeVisible();
  await expect(region.getByText("วิกฤตรอคนรับ")).toBeVisible();
  await expect(region.getByText("กำลังช่วยเหลือ")).toBeVisible();
  await expect(region.getByText("ปิดแล้ววันนี้")).toBeVisible();
  await region
    .getByRole("combobox", { name: "จังหวัดของสถิติ", exact: true })
    .selectOption("จันทบุรี");
  await region.getByLabel("ตั้งแต่วันที่").fill(date);
  await region.getByLabel("ถึงวันที่").fill(date);
  await region.getByRole("button", { name: "แสดงสถิติ" }).click();
  await expect(region.getByRole("heading", { name: "สถิติแยกประเภทเหตุ" })).toBeVisible();
  await expect(region.getByRole("region", { name: "สถิติแยกจังหวัด" })).toContainText("จันทบุรี");
  await expect(region.getByRole("region", { name: "สถิติแยกจังหวัด" })).not.toContainText("ตราด");
  await expect(region.getByRole("region", { name: "สถิติแยกสี" }).locator("dd")).toHaveText([
    "1",
    "1",
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
