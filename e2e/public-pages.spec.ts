import { test, expect } from "@playwright/test";

// B. หน้าแรก · C. /hotlines · D. /survival · K. /dev/db (TF-02, TF-06)

test("หน้าแรกเปิดได้และแสดงปุ่มขอความช่วยเหลือ", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /ต้องการความช่วยเหลือ/ })).toBeVisible();
});

test.describe("/hotlines เบอร์สายด่วน", () => {
  const NUMBERS = ["1784", "1669", "199", "191", "1182"];

  test("มีครบ 5 สายด่วน และแต่ละใบกดโทรได้", async ({ page }) => {
    await page.goto("/hotlines");
    await expect(
      page.getByRole("heading", { level: 1, name: "เบอร์สายด่วนฉุกเฉิน" }),
    ).toBeVisible();
    const main = page.getByRole("main");
    for (const number of NUMBERS) {
      await expect(main.locator(`a[href="tel:${number}"]`)).toBeVisible();
    }
  });

  test("การ์ดสูงเท่ากันและปุ่มโทรอยู่ระดับเดียวกันในแถวเดียวกัน (TF-06)", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "มือถือการ์ดเรียงแถวละใบ");
    await page.goto("/hotlines");
    // หาการ์ดจากโครงสร้าง (ไม่ใช้ class CSS): ไล่ขึ้นจากปุ่มโทรจนเจอกล่องที่อยู่ในตาราง 5 ใบ
    const boxes = await page.getByRole("main").evaluate((main, numbers) => {
      return numbers.map((number) => {
        const link = main.querySelector(`a[href="tel:${number}"]`)!;
        let card = link as Element;
        while (card.parentElement && card.parentElement.children.length < numbers.length) {
          card = card.parentElement;
        }
        const c = card.getBoundingClientRect();
        const l = link.getBoundingClientRect();
        return { card: { y: c.y, height: c.height }, link: { y: l.y } };
      });
    }, NUMBERS);
    // จัดกลุ่มตามแถว (ด้านบนของการ์ดเท่ากัน)
    const rows = new Map<number, typeof boxes>();
    for (const b of boxes)
      rows.set(Math.round(b.card.y), [...(rows.get(Math.round(b.card.y)) ?? []), b]);
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      for (const b of row) {
        expect(
          Math.abs(b.card.height - row[0].card.height),
          "ความสูงการ์ดต่างกัน (px)",
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(b.link.y - row[0].link.y),
          "ปุ่มโทรไม่อยู่ระดับเดียวกัน (px)",
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test("ปุ่มโทรสูงอย่างน้อย 48px (TF-06)", async ({ page }) => {
    await page.goto("/hotlines");
    for (const number of NUMBERS) {
      const box = await page.getByRole("main").locator(`a[href="tel:${number}"]`).boundingBox();
      expect(box!.height, `ปุ่มโทร ${number}`).toBeGreaterThanOrEqual(48);
    }
  });

  test("ลิงก์ disaster.go.th เปิดแท็บใหม่", async ({ page }) => {
    await page.goto("/hotlines");
    const link = page.getByRole("link", { name: /disaster\.go\.th/ });
    await expect(link).toHaveAttribute("href", "https://www.disaster.go.th");
    await expect(link).toHaveAttribute("target", "_blank");
  });
});

test.describe("/survival คู่มือเอาตัวรอด", () => {
  test("3 ช่วง กดเปิดและปิดได้", async ({ page }) => {
    await page.goto("/survival");
    for (const phase of ["ก่อนน้ำจะมา", "ระหว่างน้ำท่วม", "หลังน้ำลด"]) {
      const details = page.locator("details").filter({ hasText: phase });
      await details.getByText(phase).click();
      await expect(details).toHaveAttribute("open", "");
      await details.getByText(phase).click();
      await expect(details).not.toHaveAttribute("open");
    }
  });

  test("เช็กลิสต์ 72 ชม. มี 12 รายการ ติ๊กได้และติ๊กออกได้ (TF-06)", async ({ page }) => {
    await page.goto("/survival");
    const boxes = page.getByRole("checkbox");
    await expect(boxes).toHaveCount(12);
    const water = page.getByRole("checkbox", { name: /น้ำดื่มสำรอง/ });
    await water.check();
    await expect(water).toBeChecked();
    await water.uncheck();
    await expect(water).not.toBeChecked();
  });

  test("ติ๊กแล้วรีโหลดหน้า รายการที่ติ๊กยังอยู่", async ({ page }) => {
    await page.goto("/survival");
    await page.getByRole("checkbox", { name: /ไฟฉาย/ }).check();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /ไฟฉาย/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /น้ำดื่มสำรอง/ })).not.toBeChecked();
  });
});

test("/dev/db ต่อฐานข้อมูลในเครื่องได้ (TF-02)", async ({ page }) => {
  await page.goto("/dev/db");
  await expect(page.getByText("เชื่อมต่อฐานข้อมูลสำเร็จ")).toBeVisible();
});
