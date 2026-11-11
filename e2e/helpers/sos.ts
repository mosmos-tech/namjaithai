import { expect, type Page } from "@playwright/test";
import { uniqueTestPoint } from "./db";

const DRAFT_KEY = "namjaithai-sos-draft-v2";

// เปิดฟอร์ม SOS แบบเริ่มใหม่ (ล้างร่างที่ค้างจาก test อื่นในเบราว์เซอร์นี้)
export async function openFreshSosForm(page: Page, path = "/request") {
  // ทุก test ส่งจาก 127.0.0.1 เหมือนกัน ใช้เพดาน 20 เคส/ชม./IP (TF-12) ร่วมกันแล้วชนใน CI
  // ใส่ IP ทดสอบแยกเฉพาะคำขอสร้างเคสจากฟอร์ม (test ที่ mock /api/cases เองตั้ง route ทีหลังจึงทำงานก่อน)
  const ip = `10.66.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.route("**/api/cases", (route) =>
    route.fallback({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }),
  );
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
  await waitForSosFormReady(page);
}

/**
 * TF-68: "ขั้นที่ 1 จาก 5" มาจากเซิร์ฟเวอร์ตั้งแต่ก่อน JS โหลด — กดปุ่มตอนนั้นการกดจะหายเงียบ
 * หน้าเว็บแสดง "กำลังโหลด..." จนกว่าจะ hydrate เสร็จ จึงรอให้ข้อความนั้นหายก่อนเริ่มกด
 */
export async function waitForSosFormReady(page: Page) {
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);
}

// ปุ่มถัดไปที่มองเห็นอยู่ (มือถือ/จอคอมใช้ข้อความต่างกัน เช่น "ถัดไป" กับ "ถัดไป: ตำแหน่ง")
export function nextButton(page: Page) {
  return page.getByRole("button", { name: /^ถัดไป/ }).filter({ visible: true });
}

export function backButton(page: Page) {
  return page
    .getByRole("button", { name: /ย้อนกลับ/ })
    .filter({ visible: true })
    .last();
}

export async function expectStep(page: Page, step: number) {
  await expect(page.getByText(`ขั้นที่ ${step} จาก 5`)).toBeVisible();
}

/**
 * ขั้นที่ 2 "รายละเอียดเหตุ" (TF-55 ย้ายมาใน TF-66): ตอบสัญญาณอันตราย + ออกเองได้ไหม
 * dangerSigns = ชื่อข้อที่จะติ๊ก เช่น "มีคนหมดสติ" (ไม่ส่ง = กด "ไม่มีข้อใดเลย")
 */
export async function answerDangerQuestions(
  page: Page,
  {
    dangerSigns = [],
    canSelfEvacuate = true,
  }: { dangerSigns?: string[]; canSelfEvacuate?: boolean } = {},
) {
  if (dangerSigns.length === 0) {
    await page.getByRole("checkbox", { name: "ไม่มีข้อใดเลย" }).click();
  }
  for (const label of dangerSigns) {
    await page.getByRole("checkbox", { name: label, exact: true }).click();
  }
  await page
    .getByRole("radio", { name: canSelfEvacuate ? "ได้ ออกเองได้" : "ไม่ได้ ติดอยู่" })
    .click();
}

// ขั้นที่ 1 → 2 (ไม่เลือกประเภท = น้ำท่วม)
export async function goToStep2(page: Page) {
  await nextButton(page).click();
  await expectStep(page, 2);
}

// ขั้นที่ 1 → 3 (ตำแหน่ง): ตอบรายละเอียดเหตุขั้นที่ 2 ด้วยค่าที่ถูกต้อง
export async function goToLocationStep(
  page: Page,
  answers?: Parameters<typeof answerDangerQuestions>[1],
) {
  await goToStep2(page);
  await answerDangerQuestions(page, answers);
  await nextButton(page).click();
  await expectStep(page, 3);
}

/**
 * ใส่ตำแหน่งลงร่างฟอร์มโดยตรง แทนการกดขั้นที่ 2 (TF-09 ยังไม่ได้ทำ ยังไม่มีแผนที่ให้ปักหมุด)
 * TODO(TF-09): เปลี่ยนเป็นกดดึง GPS / ปักหมุดจริงเมื่อขั้นตำแหน่งเสร็จ
 */
export async function seedLocationIntoDraft(page: Page) {
  const point = uniqueTestPoint();
  const currentStep = await page.evaluate(
    ({ key, point }) => {
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      const next = {
        ...draft,
        ...point,
        accuracyM: 10,
        landmark: "หน้าร้านสะดวกซื้อ (E2E)",
      };
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("storage"));
      return typeof next.currentStep === "number" ? next.currentStep : 1;
    },
    { key: DRAFT_KEY, point },
  );
  if (currentStep === 3) {
    await expect(page.locator("#sos-landmark")).toHaveValue("หน้าร้านสะดวกซื้อ (E2E)");
  }
  return point;
}

export async function readDraft(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), DRAFT_KEY);
}

// พาจากขั้น 1 ไปถึงขั้น 5 แบบกรอกค่าที่ถูกต้อง
export async function goToStep5(page: Page) {
  await goToLocationStep(page);
  await seedLocationIntoDraft(page);
  await nextButton(page).click();
  await expectStep(page, 4);
  await nextButton(page).click();
  await expectStep(page, 5);
}
