import { expect, test } from "@playwright/test";
import { goToStep5, openFreshSosForm } from "./helpers/sos";
import { adminDb } from "./helpers/db";

test("ต้องยินยอมแยกก่อนส่ง และยังโทรสายด่วนได้", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openFreshSosForm(page);
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill("0812345678");
  for (const name of [/^ยินยอมให้ใช้ข้อมูลเพื่อ/, /^ยินยอมให้ใช้ข้อมูลสุขภาพ/]) {
    const text = page.getByRole("checkbox", { name }).locator("xpath=..//span");
    const lines = await text.evaluate((element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height / parseFloat(style.lineHeight);
    });
    expect(lines).toBeLessThanOrEqual(2.1);
  }
  await page.getByTestId("step5-submit-button").click();
  await expect(page.getByTestId("step5-missing-alert")).toContainText("ความยินยอม");
  await expect(page.getByRole("link", { name: "โทรสายด่วนกู้ชีพ 1669" })).toBeVisible();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByTestId("step5-submit-button").click();
  await expect(page.getByTestId("step5-missing-alert")).toContainText("ความยินยอมข้อมูลสุขภาพ");
  await expect(page.getByRole("link", { name: "นโยบายความเป็นส่วนตัว" }).first()).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test("หน้านโยบายและลิงก์ในหน้าเข้าสู่ระบบเข้าถึงได้", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "นโยบายความเป็นส่วนตัว" }).click();
  await expect(page.getByRole("heading", { name: "นโยบายความเป็นส่วนตัว" })).toBeVisible();
  await expect(page.getByText(/ระบบลบอัตโนมัติอยู่ระหว่างพัฒนา/)).toBeVisible();
});

test("API ปฏิเสธคำขอไร้ความยินยอม และบันทึกหลักฐานเมื่อยินยอม", async ({ request }) => {
  const phone = `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const payload = {
    dangerSigns: [],
    canSelfEvacuate: true,
    lat: 14.35,
    lng: 100.75,
    landmark: "จุดทดสอบ",
    adults: 1,
    elderly: 0,
    bedridden: 0,
    children: 0,
    pets: 0,
    hasInjured: true,
    needs: [],
    name: "ทดสอบ",
    phone,
  };
  const noConsent = await request.post("/api/cases", { data: payload });
  expect(noConsent.status()).toBe(400);
  const noHealth = await request.post("/api/cases", { data: { ...payload, consent: true } });
  expect(noHealth.status()).toBe(400);
  const accepted = await request.post("/api/cases", {
    data: { ...payload, consent: true, healthConsent: true, duplicateAction: "CREATE_NEW" },
  });
  expect(accepted.status()).toBe(201);
  const body = await accepted.json();
  const { data, error } = await adminDb()
    .from("cases")
    .select("consent_version, consented_at, health_consented_at")
    .eq("id", body.caseId)
    .single();
  expect(error).toBeNull();
  expect(data?.consent_version).toBe("2026-11-06");
  expect(data?.consented_at).toBeTruthy();
  expect(data?.health_consented_at).toBeTruthy();
});
