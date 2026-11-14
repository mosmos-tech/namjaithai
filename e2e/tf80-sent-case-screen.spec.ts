import { expect, test, type Page } from "@playwright/test";
import { adminDb, closeTestCases, randomPhone, uniqueTestPoint } from "./helpers/db";
import { expectSentCase, goToStep5, openFreshSosForm } from "./helpers/sos";

/**
 * TF-80 หน้าส่งเคสสำเร็จ: ส่ง SOS แล้วไปหน้ารหัสเคสใหญ่เอง (ไม่ต้องกดลิงก์เล็ก)
 * รหัสใหญ่ไม่ตกบรรทัดแม้จอ 360px · คัดลอกได้ · ปุ่มหลัก "ติดตามเคส" ไปหน้าสถานะภาษาเดียวกัน
 * ปุ่มรอง "กลับหน้าหลัก" · ลิงก์เล็ก "แก้ไขเคส" ไปทางแก้ไขเดิมในหน้าติดตาม · แถบโทรสายด่วนยังอยู่
 */
const DRAFT_KEY = "namjaithai-sos-draft-v2";
const caseCodes: string[] = [];

test.afterAll(async () => {
  if (!caseCodes.length) return;
  const { data } = await adminDb().from("cases").select("id").in("case_code", caseCodes);
  await closeTestCases((data ?? []).map((row) => row.id));
});

/** รหัสอยู่บรรทัดเดียว และหน้าไม่ล้นจอ */
async function expectCodeOnOneLine(page: Page) {
  const code = page.getByTestId("sent-case-code");
  const { height, fontSize } = await code.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    fontSize: parseFloat(getComputedStyle(el).fontSize),
  }));
  expect(height).toBeLessThan(fontSize * 1.5);
  expect(await code.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("ส่ง SOS แล้วเห็นรหัสเคสใหญ่ กดติดตามเคสไปถึงหน้าสถานะ", async ({
  page,
  context,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 740 });
  await openFreshSosForm(page);
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง TF-80");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  await page.getByTestId("step5-submit-button").click();

  const caseCode = await expectSentCase(page);
  caseCodes.push(caseCode);
  await expect(page.getByText("จดรหัสนี้ไว้ หรือแคปหน้าจอเก็บไว้")).toBeVisible();
  await expectCodeOnOneLine(page);
  // แถบโทรสายด่วนยังอยู่
  await expect(page.locator('a[href="tel:1669"]').first()).toBeVisible();

  if (!isMobile) {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "คัดลอกรหัสเคส" }).click();
    await expect(page.getByRole("button", { name: "คัดลอกแล้ว" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(caseCode);
  }
  await expect(page.getByRole("link", { name: "กลับหน้าหลัก" })).toHaveAttribute("href", "/");
  const edit = page.getByRole("link", { name: "แก้ไขเคส" });
  await expect(edit).toHaveAttribute(
    "href",
    new RegExp(`/track/${caseCode}\\?t=.+#reporter-actions$`),
  );

  const track = page
    .getByTestId("sent-case-card")
    .getByRole("link", { name: "ติดตามเคส", exact: true });
  expect((await track.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  await track.click();
  await expect(page).toHaveURL(new RegExp(`/track/${caseCode}\\?t=`));
  await expect(page.getByTestId("track-panel")).toContainText("กำลังหาทีมกู้ภัยที่ใกล้คุณที่สุด");
});

test("จอ 360×640: รหัสเคสและปุ่มติดตามเคสอยู่ในจอแรกโดยไม่ต้องเลื่อน", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openFreshSosForm(page);
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง TF-80 จอเล็ก");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  await page.getByTestId("step5-submit-button").click();
  caseCodes.push(await expectSentCase(page));

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const code = page.getByTestId("sent-case-code");
  const track = page
    .getByTestId("sent-case-card")
    .getByRole("link", { name: "ติดตามเคส", exact: true });
  await expect(code).toBeInViewport({ ratio: 1 });
  await expect(track).toBeInViewport({ ratio: 1 });
  // รหัสยังใหญ่อ่านง่าย (ไม่เล็กกว่า 30px) และอยู่บรรทัดเดียว
  expect(
    await code.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(30);
  await expectCodeOnOneLine(page);
});

test("ลิงก์แก้ไขเคสพาไปส่วนแก้ไขเดิมในหน้าติดตาม", async ({ page }) => {
  await openFreshSosForm(page);
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง TF-80 แก้ไข");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  await page.getByTestId("step5-submit-button").click();
  caseCodes.push(await expectSentCase(page));

  await page.getByRole("link", { name: "แก้ไขเคส" }).click();
  const actions = page.getByRole("region", { name: "จัดการคำขอของคุณ" });
  await expect(actions).toBeFocused();
  await expect(actions).toBeInViewport();
});

test("หน้า /en: ส่งแล้วเห็นรหัสเคสใหญ่ภาษาอังกฤษ และติดตามเคสในหน้าอังกฤษ", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 740 });
  const ip = `10.80.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.route("**/api/cases", (route) =>
    route.fallback({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }),
  );
  await page.goto("/en/request");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);
  const next = () => page.getByRole("button", { name: /^Next/ }).filter({ visible: true }).click();
  await page.getByRole("radio", { name: "Flood" }).click();
  await page.getByRole("radio", { name: "I am at the scene" }).click();
  await next();
  await page.getByRole("checkbox", { name: "None of these" }).click();
  await page.getByRole("radio", { name: "No, I am trapped" }).click();
  await page.getByRole("radio", { name: "Waist to chest deep" }).click();
  await next();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await page.evaluate(
    ({ key, point }) => {
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(
        key,
        JSON.stringify({ ...draft, ...point, accuracyM: 10, landmark: "Hotel TF-80" }),
      );
      window.dispatchEvent(new Event("storage"));
    },
    { key: DRAFT_KEY, point: uniqueTestPoint() },
  );
  await expect(page.locator("#sos-landmark")).toHaveValue("Hotel TF-80");
  await next();
  await next();
  await page.getByLabel(/^Your name or a contact name/).fill("Tourist TF-80");
  await page.getByLabel(/^Phone number to call you back/).fill(randomPhone());
  await page.getByRole("checkbox", { name: /^I consent to the use of my information/ }).check();
  await page.getByRole("checkbox", { name: /^I consent to the use of health information/ }).check();
  await page.getByRole("button", { name: "Request help now" }).click();

  const caseCode = await expectSentCase(page);
  caseCodes.push(caseCode);
  await expect(page).toHaveURL(/\/en\/sos\/sent$/);
  await expect(page.getByText("Write this code down or take a screenshot")).toBeVisible();
  await expectCodeOnOneLine(page);
  await expect(page.getByRole("link", { name: "Edit my request" })).toBeVisible();
  await page.getByRole("link", { name: "Track my case" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/track/${caseCode}\\?t=`));
  await expect(page.getByTestId("track-panel")).toContainText("Waiting for a team");
});
