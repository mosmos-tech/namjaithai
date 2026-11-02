import { test, expect } from "@playwright/test";

// I. /login · J. หน้าที่ต้องล็อกอิน (TF-17)
// ไม่ทดสอบล็อกอิน LINE จริง (ต้องใช้บัญชี LINE) — ทดสอบแค่ทางเข้าและการพาไป /login

test.describe("/login หน้าเข้าใช้งาน", () => {
  test("มีแค่ 2 ทาง: ขอความช่วยเหลือ กับ LINE และไม่มีฟอร์มสมัคร (TF-17)", async ({ page }) => {
    await page.goto("/login");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: /^ขอความช่วยเหลือ/ })).toHaveAttribute(
      "href",
      "/request",
    );
    await expect(main.getByRole("link", { name: "เข้าสู่ระบบด้วย LINE" })).toHaveAttribute(
      "href",
      "/auth/line",
    );
    await expect(main.getByRole("textbox")).toHaveCount(0);
    await expect(main.locator("form")).toHaveCount(0);
    // ข้อความนี้มีสองแบบ (มือถือ/จอคอม) แสดงทีละแบบตามขนาดจอ
    await expect(main.getByText("ไม่มีการสมัครสมาชิกบนเว็บ").filter({ visible: true })).toHaveCount(
      1,
    );
  });

  test("ปุ่มขอความช่วยเหลือพาไปฟอร์ม SOS", async ({ page }) => {
    await page.goto("/login");
    await page
      .getByRole("main")
      .getByRole("link", { name: /^ขอความช่วยเหลือ/ })
      .click();
    await expect(page).toHaveURL(/\/request$/);
    await expect(page.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
  });

  test("มาจากหน้าที่ต้องล็อกอิน (?next=) ปุ่ม LINE พกหน้าเดิมไปด้วย", async ({ page }) => {
    await page.goto("/login?next=/rescue");
    await expect(page.getByRole("link", { name: "เข้าสู่ระบบด้วย LINE" })).toHaveAttribute(
      "href",
      "/auth/line?next=%2Frescue",
    );
  });

  test("ลิงก์ next ที่พาออกนอกเว็บถูกตัดทิ้ง", async ({ page }) => {
    await page.goto("/login?next=//evil.example.com");
    await expect(page.getByRole("link", { name: "เข้าสู่ระบบด้วย LINE" })).toHaveAttribute(
      "href",
      "/auth/line",
    );
  });

  for (const [code, message] of [
    ["cancelled", "ยกเลิกการเข้าสู่ระบบด้วย LINE แล้ว"],
    ["line", "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ"],
    ["profile", "ไม่สามารถอ่านข้อมูลบัญชี LINE ได้"],
    ["inactive", "บัญชีนี้ยังใช้งานไม่ได้"],
  ]) {
    test(`?error=${code} แสดงข้อความที่ถูก`, async ({ page }) => {
      await page.goto(`/login?error=${code}`);
      await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    });
  }

  test("มือถือมีแค่ navbar ไม่มีแถบสายด่วน (Figma MC4)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "มือถือเท่านั้น");
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "เปิดเมนู" })).toBeVisible();
    await expect(page.getByText("สายด่วนฉุกเฉิน โทรได้ไม่ต้องใช้เน็ต")).toHaveCount(0);
  });
});

test.describe("หน้าที่ต้องล็อกอิน: ไม่ล็อกอินถูกพาไป /login (TF-17)", () => {
  for (const path of ["/my-cases", "/rescue", "/unit", "/admin"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
      await expect(page.getByRole("link", { name: "เข้าสู่ระบบด้วย LINE" })).toHaveAttribute(
        "href",
        `/auth/line?next=${encodeURIComponent(path)}`,
      );
    });
  }
});
