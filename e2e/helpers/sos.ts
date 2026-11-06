import { expect, type Page } from "@playwright/test";
import { uniqueTestPoint } from "./db";

const DRAFT_KEY = "namjaithai-sos-draft-v1";

// เปิดฟอร์ม SOS แบบเริ่มใหม่ (ล้างร่างที่ค้างจาก test อื่นในเบราว์เซอร์นี้)
export async function openFreshSosForm(page: Page, path = "/request") {
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
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
 * ขั้นที่ 1 (TF-55): ตอบสัญญาณอันตราย + ออกเองได้ไหม (ผู้แจ้งไม่เลือกสีแล้ว)
 * dangerSigns = ชื่อข้อที่จะติ๊ก เช่น "มีคนหมดสติ" (ไม่ส่ง = กด "ไม่มีข้อใดเลย")
 */
export async function answerStep1(
  page: Page,
  { dangerSigns = [], canSelfEvacuate = true }: { dangerSigns?: string[]; canSelfEvacuate?: boolean } = {},
) {
  if (dangerSigns.length === 0) {
    await page.getByRole("checkbox", { name: "ไม่มีข้อใดเลย" }).click();
  }
  for (const label of dangerSigns) {
    await page.getByRole("checkbox", { name: label, exact: true }).click();
  }
  await page.getByRole("radio", { name: canSelfEvacuate ? "ได้ ออกเองได้" : "ไม่ได้ ติดอยู่" }).click();
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
  if (currentStep === 2) {
    await expect(page.locator("#sos-landmark")).toHaveValue("หน้าร้านสะดวกซื้อ (E2E)");
  }
  return point;
}

export async function readDraft(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), DRAFT_KEY);
}

// พาจากขั้น 1 ไปถึงขั้น 5 แบบกรอกค่าที่ถูกต้อง
export async function goToStep5(page: Page) {
  await answerStep1(page);
  await nextButton(page).click();
  await expectStep(page, 2);
  await seedLocationIntoDraft(page);
  await nextButton(page).click();
  await expectStep(page, 3);
  await nextButton(page).click();
  await expectStep(page, 4);
  await nextButton(page).click();
  await expectStep(page, 5);
}
