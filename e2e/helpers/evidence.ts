import type { Page, TestInfo } from "@playwright/test";

/**
 * TF-39: ภาพหลักฐานของเกณฑ์ขอบเขต — เก็บเฉพาะตอนสั่ง E2E_EVIDENCE=1 (รันปกติ/CI ไม่เขียนไฟล์)
 * เก็บ PNG ไว้ใน test-results/evidence/ แล้วแปลงเป็น webp ลง docs/e2e-scope/ (ดู docs/e2e-scope/README.md)
 * ชื่อไฟล์ = <ชื่อ>-<desktop|mobile> ตรงกับตารางใน README นั้น
 * ภาพใช้ข้อมูลทดสอบที่ test สร้างเองเท่านั้น
 */
export async function saveEvidence(page: Page, name: string, testInfo: TestInfo) {
  if (process.env.E2E_EVIDENCE !== "1") return;
  await page.screenshot({
    path: `test-results/evidence/${name}-${testInfo.project.name}.png`,
    animations: "disabled",
    fullPage: true,
  });
}
