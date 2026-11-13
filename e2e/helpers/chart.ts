import { expect, type Page } from "@playwright/test";

/**
 * ป้ายแกน X ของกราฟผลงาน (HelpedChart) ที่มองเห็นอยู่ — ตรวจว่าตัวหนังสือไม่ต่ำกว่า 12px
 * ป้ายไม่ทับกัน และไม่ล้นจอ (ป้ายมีชื่อเดือน เช่น "12 ต.ค." กว้างกว่าแท่ง)
 */
export async function expectReadableAxis(page: Page): Promise<string[]> {
  const labels = await page
    .getByTestId("chart-axis-labels")
    .locator("span")
    .evaluateAll((items) =>
      items
        .filter((item) => getComputedStyle(item).visibility === "visible")
        .map((item) => {
          // วัดขนาดตัวหนังสือจริง (span กว้างเท่าช่องแท่ง แต่ตัวหนังสือล้นออกได้)
          const range = document.createRange();
          range.selectNodeContents(item);
          const box = range.getBoundingClientRect();
          return {
            text: item.textContent ?? "",
            size: parseFloat(getComputedStyle(item).fontSize),
            left: box.left,
            right: box.right,
          };
        }),
    );
  const width = await page.evaluate(() => innerWidth);
  for (const [index, label] of labels.entries()) {
    expect(label.size, label.text).toBeGreaterThanOrEqual(12);
    expect(label.left, label.text).toBeGreaterThanOrEqual(0);
    expect(label.right, label.text).toBeLessThanOrEqual(width);
    const next = labels[index + 1];
    if (next) expect(label.right, `${label.text} ชน ${next.text}`).toBeLessThan(next.left);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return labels.map((label) => label.text);
}
