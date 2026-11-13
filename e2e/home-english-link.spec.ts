import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * TF-63 หน้าแรก (ไม่แปล) มีทางไปฟอร์มภาษาอังกฤษ 2 ทาง
 * - ปุ่ม EN ใน Navbar (ผ่าน /api/lang จำภาษา แล้วไป /en/request)
 * - ลิงก์ "Request help in English" ใต้ปุ่ม SOS
 * ทั้งสองเป็นลิงก์ธรรมดา กดได้ตั้งแต่ก่อน JS โหลด
 */

async function home(page: Page) {
  await page.addInitScript(() => localStorage.setItem("namjaithai-onboarding-seen-v1", "true"));
  await page.goto("/");
}

function englishSwitch(page: Page) {
  return page.getByTestId("language-switch").getByRole("link", { name: "EN" });
}

/** เบราว์เซอร์ที่ปิด JS (เท่ากับกดตอน JS ยังไม่โหลด) ขนาดจอตาม project */
async function withoutJs(browser: Browser) {
  const context = await browser.newContext({
    ...test.info().project.use,
    javaScriptEnabled: false,
  });
  return { context, page: await context.newPage() };
}

test("กดปุ่ม EN ใน Navbar หน้าแรก ไปถึงฟอร์มภาษาอังกฤษ และจำภาษาไว้", async ({ page, context }) => {
  await home(page);
  await expect(englishSwitch(page)).toBeVisible();
  await englishSwitch(page).click();
  await expect(page).toHaveURL(/\/en\/request$/);
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === "nj_locale")?.value).toBe("en");
});

test("กดลิงก์ Request help in English ใต้ปุ่ม SOS ไปถึงฟอร์มภาษาอังกฤษ", async ({ page }) => {
  await home(page);
  const link = page.getByRole("link", { name: "Request help in English" });
  await expect(link).toHaveAttribute("href", "/en/request");
  await link.click();
  await expect(page).toHaveURL(/\/en\/request$/);
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
});

test("ลิงก์ภาษาอังกฤษทั้งสองกดได้ก่อน JS โหลด", async ({ browser }) => {
  for (const click of [
    (page: Page) => englishSwitch(page).click(),
    (page: Page) => page.getByRole("link", { name: "Request help in English" }).click(),
  ]) {
    const { context, page } = await withoutJs(browser);
    await page.goto("/");
    await click(page);
    await expect(page).toHaveURL(/\/en\/request$/);
    await context.close();
  }
});

test("Navbar หน้าแรกที่มีปุ่ม EN ไม่ล้นจอ 360px", async ({ page, isMobile }) => {
  test.skip(!isMobile, "เช็กเฉพาะจอมือถือ");
  await page.setViewportSize({ width: 360, height: 780 });
  await home(page);
  await expect(englishSwitch(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "เปิดเมนู" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
