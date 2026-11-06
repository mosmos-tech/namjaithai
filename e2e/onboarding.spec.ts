import { test, expect } from "@playwright/test";

const ONBOARDING_KEY = "namjaithai-onboarding-seen-v1";

test.describe("TF-45: ป๊อปอัปวิธีใช้งาน 4 ขั้น", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("เกณฑ์ข้อ 1: ขึ้นเฉพาะการเปิดครั้งแรก กดข้ามแล้วไม่ขึ้นอีก", async ({ page }) => {
    const popup = page.getByTestId("onboarding-popup");
    await expect(popup).toBeVisible();
    await expect(page.getByText("ยินดีต้อนรับสู่ น้ำใจไทย SOS")).toBeVisible();
    await expect(page.getByTestId("onboarding-step-number")).toHaveText("01");
    await expect(page.getByText("จาก 04")).toBeVisible();

    // กดปุ่ม "ข้าม"
    await page.getByTestId("onboarding-skip").click();
    await expect(popup).not.toBeVisible();

    // รีโหลดหน้า ต้องไม่ขึ้นอีก
    await page.reload();
    await expect(popup).not.toBeVisible();
  });

  test("เกณฑ์ข้อ 1 (ต่อ): เดินหน้าจนถึงขั้น 4 แล้วกดเริ่มใช้งานแล้วไม่ขึ้นอีก", async ({
    page,
  }) => {
    const popup = page.getByTestId("onboarding-popup");
    await expect(popup).toBeVisible();

    // ขั้น 1
    await expect(page.getByTestId("onboarding-step-number")).toHaveText("01");

    // เดินหน้าขั้น 1 -> 2
    await page.getByTestId("onboarding-next").click();
    await expect(page.getByText("ตอบคำถามสั้นๆ")).toBeVisible();
    await expect(page.getByTestId("onboarding-step-number")).toHaveText("02");

    // เดินหน้าขั้น 2 -> 3
    await page.getByTestId("onboarding-next").click();
    await expect(page.getByText("ส่งตำแหน่งของคุณ")).toBeVisible();
    await expect(page.getByTestId("onboarding-step-number")).toHaveText("03");

    // เดินหน้าขั้น 3 -> 4
    await page.getByTestId("onboarding-next").click();
    await expect(page.getByText("ติดตามความช่วยเหลือ")).toBeVisible();
    await expect(page.getByTestId("onboarding-step-number")).toHaveText("04");

    // กดปุ่ม "เริ่มใช้งาน" ในขั้นสุดท้าย
    await page.getByTestId("onboarding-start").click();
    await expect(popup).not.toBeVisible();

    // รีโหลดหน้า ต้องไม่ขึ้นอีก
    await page.reload();
    await expect(popup).not.toBeVisible();
  });

  test("เกณฑ์ข้อ 2: ทุกขั้นแผ่นสูงเท่ากันและปุ่มอยู่ตำแหน่งเดียวกัน ไม่โดนตัด", async ({
    page,
  }) => {
    const popup = page.getByTestId("onboarding-popup");
    await expect(popup).toBeVisible();

    // ตรวจสอบขนาดแผ่นและตำแหน่งปุ่มทุกขั้น
    const cardHeights: number[] = [];
    const buttonYs: number[] = [];

    for (let step = 1; step <= 4; step++) {
      // กล่องป๊อปอัปสีขาวด้านใน (dialog card)
      const card = popup.locator("> div").nth(1);
      const cardBox = await card.boundingBox();
      expect(cardBox).not.toBeNull();
      cardHeights.push(Math.round(cardBox!.height));

      // ปุ่มหลัก (ถัดไป หรือ เริ่มใช้งาน)
      const primaryBtn =
        step === 4 ? page.getByTestId("onboarding-start") : page.getByTestId("onboarding-next");
      const btnBox = await primaryBtn.boundingBox();
      expect(btnBox).not.toBeNull();
      buttonYs.push(Math.round(btnBox!.y));

      // ปุ่มต้องมีความสูงอย่างน้อย 48px ตามกติกาความสะดวกสำหรับผู้ใช้มือถือ
      expect(btnBox!.height, `ความสูงปุ่มขั้นที่ ${step}`).toBeGreaterThanOrEqual(48);

      // ปุ่มต้องไม่ล้นจอ
      const viewport = page.viewportSize();
      if (viewport) {
        expect(btnBox!.y + btnBox!.height).toBeLessThanOrEqual(viewport.height + 1);
      }

      if (step < 4) {
        await page.getByTestId("onboarding-next").click();
      }
    }

    // ทุกขั้นความสูงแผ่นต้องเท่ากัน (ต่างกันไม่เกิน 1px)
    for (const h of cardHeights) {
      expect(
        Math.abs(h - cardHeights[0]),
        `ความสูงแผ่นต่างกันระหว่างขั้น: ${JSON.stringify(cardHeights)}`,
      ).toBeLessThanOrEqual(1);
    }

    // ทุกขั้นตำแหน่งปุ่มตามแนวตั้ง (Y) ต้องเท่ากัน ไม่ขยับโดด
    for (const y of buttonYs) {
      expect(
        Math.abs(y - buttonYs[0]),
        `ตำแหน่งปุ่มตามแนวตั้ง (Y) ไม่เท่ากันระหว่างขั้น: ${JSON.stringify(buttonYs)}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("เกณฑ์ข้อ 3: กด X ปิดได้ทุกขั้น เพื่อให้คนที่รีบกด SOS ได้ทันที", async ({ page }) => {
    test.slow();
    const popup = page.getByTestId("onboarding-popup");

    for (let targetStep = 1; targetStep <= 4; targetStep++) {
      if (targetStep > 1) {
        await page.evaluate((key) => localStorage.removeItem(key), ONBOARDING_KEY);
        await page.reload();
      }
      await expect(popup).toBeVisible();

      // เดินทางไปยังขั้นที่ต้องการทดสอบ
      for (let s = 1; s < targetStep; s++) {
        await page.getByTestId("onboarding-next").click();
      }

      // กดปุ่ม X ปิด (เลือกปุ่ม X ที่มองเห็นอยู่บนหน้าจอนั้น)
      const closeBtn = page.getByTestId("onboarding-close").filter({ visible: true });
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();

      // ป๊อปอัปต้องปิดลงทันที
      await expect(popup).not.toBeVisible();
    }

    // ตรวจสอบว่า localStorage บันทึกแล้ว และไม่เด้งซ้ำเมื่อรีโหลด
    await page.reload();
    await expect(popup).not.toBeVisible();
  });
});
