import { expect, type Page } from "@playwright/test";
import { randomBangkokPoint } from "./db";

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

// ขั้นที่ 1: เลือกความเร่งด่วนจากชื่อการ์ด (ใช้คำแรก "วิกฤต" / "เร่งด่วน" / "ทั่วไป")
export async function chooseUrgency(page: Page, word: "วิกฤต" | "เร่งด่วน" | "ทั่วไป") {
  await page.getByRole("radio", { name: new RegExp(`^${word}`) }).click();
}

/**
 * เตรียมพิกัดสำหรับเทสต์ขั้นอื่นโดยไม่พึ่ง GPS หรือแผนที่ภายนอก
 * หลัง reload ต้องรอให้ฟอร์มคืนค่าร่าง: HTML แรกแสดงขั้น 1 ก่อน hydration
 * ไม่เช่นนั้นปุ่ม "ถัดไป" จะกดขั้น 1 แทนขั้นที่บันทึกไว้
 */
export async function seedLocationIntoDraft(page: Page) {
  const point = randomBangkokPoint();
  const step = await page.evaluate(
    ({ key, point }) => {
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(
        key,
        JSON.stringify({ ...draft, ...point, accuracyM: 10, landmark: "หน้าร้านสะดวกซื้อ (E2E)" }),
      );
      return draft.currentStep ?? 1;
    },
    { key: DRAFT_KEY, point },
  );
  await page.reload();
  await expectStep(page, step);
  if (step === 2) {
    await expect(page.getByRole("textbox", { name: /จุดสังเกต/ })).toHaveValue(
      "หน้าร้านสะดวกซื้อ (E2E)",
    );
  }
  return point;
}

export async function readDraft(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), DRAFT_KEY);
}

// พาจากขั้น 1 ไปถึงขั้น 5 แบบกรอกค่าที่ถูกต้อง
export async function goToStep5(page: Page) {
  await chooseUrgency(page, "เร่งด่วน");
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
