import { expect, test, type Page } from "@playwright/test";
import { saveEvidence } from "./helpers/evidence";
import { expectStep, nextButton } from "./helpers/sos";

/**
 * TF-68: เครื่องช้า/เน็ตช้า — HTML มาแล้วแต่ JS ยังไม่มา (ยังไม่ hydrate)
 * ปุ่มที่ต้องใช้ JS ต้องยังกดไม่ได้ (ไม่ให้การกดหายเงียบ) มี "กำลังโหลด..." ให้เห็น/อ่านได้
 * แต่ลิงก์โทรสายด่วนต้องกดได้เสมอ และเกิน 5 วินาทีขึ้นทางเลือกโทร 1669 / ส่ง SMS
 */

/** กัก JS ของหน้าไว้จนกว่าจะเรียก release() — จำลองเน็ตช้าแบบควบคุมได้ ไม่ต้องเดาเวลา */
async function holdScripts(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/**/*.js", async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** ลิงก์กดได้จริง (ผ่านการตรวจ actionability ของ Playwright) และไม่อยู่ใน fieldset ที่ถูกปิด */
async function expectCallable(page: Page, name: string, href: RegExp) {
  const link = page.getByRole("link", { name, exact: true });
  await expect(link).toHaveAttribute("href", href);
  await link.click({ trial: true });
  expect(await link.evaluate((el) => el.closest("fieldset:disabled") === null)).toBe(true);
}

test("ฟอร์ม SOS ตอน JS ยังไม่มา: กำลังโหลด ปุ่มโทรกดได้ เกิน 5 วินาทีขึ้นโทร/SMS แล้วใช้ฟอร์มได้เมื่อพร้อม", async ({
  page,
  isMobile,
}) => {
  const release = await holdScripts(page);
  await page.goto("/request", { waitUntil: "commit" });

  const pending = page.getByTestId("hydration-pending");
  await expect(pending).toHaveRole("status");
  await expect(pending).toContainText("กำลังโหลด...");
  await expect(nextButton(page)).toHaveCount(0);
  // ปุ่มโทรกดได้ทันที: มือถือ = แถบบนของฟอร์ม · จอคอม = แถบสายด่วน
  // (ระบุตามขนาดจอ เพราะ CSS อาจยังโหลดไม่เสร็จตอนหา element ลิงก์ของอีกขนาดจอจึงอาจยังไม่ถูกซ่อน)
  await expectCallable(page, isMobile ? "โทรสายด่วนกู้ชีพ 1669" : "กู้ชีพ 1669", /^tel:1669$/);

  // ทางเลือกเมื่อโหลดช้า: ซ่อนไว้ก่อน แล้วโผล่เองเมื่อครบ 5 วินาที (CSS ไม่ต้องใช้ JS)
  const help = page.getByTestId("slow-load-help");
  await expect(help).toBeHidden();
  await expect(help).toBeVisible({ timeout: 10_000 });
  await expect(help).toContainText("ถ้าเว็บโหลดช้า โทร 1669 หรือส่ง SMS ได้ทันที");
  await expectCallable(page, "โทร 1669", /^tel:1669$/);
  await expectCallable(page, "ส่ง SMS", /^sms:/);
  await saveEvidence(page, "7-call-before-hydrate", test.info());

  // JS มาแล้ว: ข้อความโหลดหาย ฟอร์มใช้ได้
  release();
  await expect(pending).toHaveCount(0);
  await nextButton(page).click();
  await expectStep(page, 2);
});

test("/survival ตอน JS ยังไม่มา: ช่องติ๊กปิดไว้ ไม่ให้ติ๊กแล้วไม่บันทึก พร้อมแล้วติ๊กและรีโหลดยังอยู่", async ({
  page,
}) => {
  const release = await holdScripts(page);
  await page.goto("/survival", { waitUntil: "commit" });
  const flashlight = page.getByRole("checkbox", { name: /ไฟฉาย/ });
  await expect(page.getByTestId("hydration-pending")).toContainText("กำลังโหลด...");
  await expect(flashlight).toBeDisabled();

  release();
  await expect(flashlight).toBeEnabled();
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);
  await flashlight.check();
  await page.unroute("**/_next/static/**/*.js");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /ไฟฉาย/ })).toBeChecked();
});
