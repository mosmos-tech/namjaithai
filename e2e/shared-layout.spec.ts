import { test, expect } from "@playwright/test";

// A. ส่วนที่ทุกหน้าสาธารณะใช้ร่วมกัน: แถบสายด่วน, navbar, footer (TF-06)

test.describe("แถบสายด่วนและ navbar", () => {
  test("แถบสายด่วนกดโทรได้ 1784 / 1669 / 199", async ({ page }) => {
    await page.goto("/hotlines");
    const bar = page.locator("header");
    for (const number of ["1784", "1669", "199"]) {
      await expect(bar.locator(`a[href="tel:${number}"]`)).toBeVisible();
    }
  });

  test("navbar จอคอม: 4 ลิงก์และโลโก้ไปหน้าถูก", async ({ page, isMobile }) => {
    test.skip(isMobile, "จอคอมเท่านั้น (มือถือใช้เมนูแฮมเบอร์เกอร์)");
    await page.goto("/hotlines");
    const nav = page.getByRole("navigation");
    for (const [name, href] of [
      ["แจ้งขอความช่วยเหลือ", "/request"],
      ["ติดตามเคส", "/track"],
      ["เบอร์สายด่วน", "/hotlines"],
      ["คู่มือเอาตัวรอด", "/survival"],
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
    await nav.getByRole("link", { name: "คู่มือเอาตัวรอด", exact: true }).click();
    await expect(page).toHaveURL(/\/survival$/);
    await page.getByRole("navigation").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("navbar มือถือ: ปุ่มเมนูเปิด/ปิด แสดงลิงก์ครบ", async ({ page, isMobile }) => {
    test.skip(!isMobile, "มือถือเท่านั้น");
    await page.goto("/hotlines");
    await page.getByRole("button", { name: "เปิดเมนู" }).click();
    const nav = page.getByRole("navigation");
    for (const name of [
      "แจ้งขอความช่วยเหลือ",
      "ติดตามเคส",
      "เบอร์สายด่วน",
      "คู่มือเอาตัวรอด",
      "เข้าสู่ระบบ",
    ]) {
      await expect(nav.getByRole("link", { name, exact: true }).last()).toBeVisible();
    }
    await page.getByRole("button", { name: "ปิดเมนู" }).click();
    await expect(page.getByRole("button", { name: "เปิดเมนู" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "คู่มือเอาตัวรอด", exact: true }).last(),
    ).toBeHidden();
  });

  test("ปุ่มเข้าสู่ระบบ (ไม่ล็อกอิน) พาไปหน้า /login", async ({ page, isMobile }) => {
    await page.goto("/hotlines");
    if (isMobile) {
      const menu = page.getByRole("button", { name: "เปิดเมนู" });
      await expect(menu).toBeEnabled();
      await menu.click();
      await expect(page.getByRole("button", { name: "ปิดเมนู" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
    await page
      .getByRole("link", { name: "เข้าสู่ระบบ", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("footer", () => {
  test("มีข้อความแจ้งว่าไม่ใช่หน่วยงานรัฐ และเบอร์ฉุกเฉิน", async ({ page }) => {
    await page.goto("/hotlines");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText(/ไม่ใช่หน่วยงานรัฐ/)).toBeVisible();
    await expect(footer.getByText(/1669/).first()).toBeVisible();
  });

  test("ลิงก์ นโยบายความเป็นส่วนตัว เปิดได้", async ({ page }) => {
    await page.goto("/hotlines");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "นโยบายความเป็นส่วนตัว" })
      .click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/404|could not be found/i);
  });
});

test.describe("ไม่มีเลื่อนแนวนอน (TF-06: ใช้ได้บนจอมือถือ)", () => {
  for (const path of ["/", "/hotlines", "/survival", "/request", "/track", "/sos/sent", "/login"]) {
    test(`หน้า ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "ความกว้างที่ล้นจอ (px)").toBeLessThanOrEqual(0);
    });
  }
});
