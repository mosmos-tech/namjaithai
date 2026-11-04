import { test, expect } from "@playwright/test";
import { countCasesByPhone, createCaseViaApi, randomPhone } from "./helpers/db";
import {
  backButton,
  chooseUrgency,
  expectStep,
  goToStep5,
  nextButton,
  openFreshSosForm,
  readDraft,
  seedLocationIntoDraft,
} from "./helpers/sos";

// E. ฟอร์ม SOS 5 ขั้น (TF-08 ขั้น 1, TF-11 ขั้น 3–5, TF-16 เคสซ้ำ)

test.describe("ขั้นที่ 1 ความเร่งด่วน (TF-08)", () => {
  test.beforeEach(async ({ page }) => openFreshSosForm(page));

  test("ไม่เลือกแล้วกดถัดไป บอกว่าขาดอะไร และยังอยู่ขั้น 1", async ({ page }) => {
    await nextButton(page).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "กรุณาเลือกความเร่งด่วน 1 ข้อ" }),
    ).toBeVisible();
    await expectStep(page, 1);
  });

  test("เลือกความเร่งด่วนได้ทีละ 1 ข้อ", async ({ page }) => {
    await chooseUrgency(page, "วิกฤต");
    await expect(page.getByRole("radio", { name: /^วิกฤต/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await chooseUrgency(page, "ทั่วไป");
    await expect(page.getByRole("radio", { name: /^ทั่วไป/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("radio", { name: /^วิกฤต/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("ระดับน้ำ (จอคอม): เลือกได้ และกดซ้ำเพื่อยกเลิก", async ({ page, isMobile }) => {
    test.skip(isMobile, "Figma มือถือไม่มีคำถามระดับน้ำ");
    const roof = page.getByRole("radio", { name: "บนหลังคา / ดาดฟ้า" });
    await roof.click();
    await expect(roof).toHaveAttribute("aria-checked", "true");
    await roof.click();
    await expect(roof).toHaveAttribute("aria-checked", "false");
  });

  test("ระดับน้ำไม่แสดงบนมือถือ", async ({ page, isMobile }) => {
    test.skip(!isMobile, "มือถือเท่านั้น");
    await expect(page.getByText("ระดับน้ำรอบตัวคุณตอนนี้")).toBeHidden();
  });

  test("เลือกแล้วไปขั้น 2 ได้ และแถบความคืบหน้าถูก", async ({ page }) => {
    await chooseUrgency(page, "วิกฤต");
    await nextButton(page).click();
    await expectStep(page, 2);
  });

  test("ปิดหน้าแล้วเปิดใหม่ ค่าที่เลือกยังอยู่ (TF-08)", async ({ page, isMobile }) => {
    await chooseUrgency(page, "เร่งด่วน");
    if (!isMobile) await page.getByRole("radio", { name: "ถูกน้ำล้อม / ตัดขาด" }).click();
    await page.reload();
    await expect(page.getByRole("radio", { name: /^เร่งด่วน/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    if (!isMobile) {
      await expect(page.getByRole("radio", { name: "ถูกน้ำล้อม / ตัดขาด" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
  });

  test("มือถือ: แถบบนมีปุ่มกลับหน้าแรก และปุ่มโทร 1669", async ({ page, isMobile }) => {
    test.skip(!isMobile, "มือถือเท่านั้น");
    await expect(page.getByRole("link", { name: "โทรสายด่วนกู้ชีพ 1669" })).toHaveAttribute(
      "href",
      "tel:1669",
    );
    await page.getByRole("link", { name: "กลับหน้าแรก" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("จอคอม: การ์ดรายการขั้น กดข้ามไปขั้นอื่นโดยยังไม่เลือก จะถูกกันไว้", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "จอคอมเท่านั้น");
    await page.getByRole("button", { name: /ผู้ติดค้าง/ }).click();
    await expectStep(page, 1);
    await expect(
      page.getByRole("alert").filter({ hasText: "กรุณาเลือกความเร่งด่วน" }),
    ).toBeVisible();
  });

  test("/sos กับ /request เป็นฟอร์มเดียวกัน", async ({ page }) => {
    await page.goto("/sos");
    await expectStep(page, 1);
    await expect(page.getByRole("radio", { name: /^วิกฤต/ })).toBeVisible();
  });
});

test.describe("ขั้นที่ 2–4", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshSosForm(page);
    await chooseUrgency(page, "วิกฤต");
    await nextButton(page).click();
    await expectStep(page, 2);
  });

  test("ขั้น 2: พิกัดและที่อยู่ (TF-09) ตรวจสอบความถูกต้องและไปขั้น 3 ได้", async ({
    page,
    isMobile,
  }) => {
    // กดถัดไปโดยยังไม่ระบุพิกัดหรือจุดสังเกต ต้องแจ้งเตือนและยังอยู่ขั้น 2
    await nextButton(page).click();
    await expect(page.getByText("ยังไปขั้นถัดไปไม่ได้:")).toBeVisible();
    await expectStep(page, 2);

    if (isMobile) await page.getByRole("button", { name: "ย้อนกลับ" }).first().click();
    else await backButton(page).click();
    await expectStep(page, 1);
    await nextButton(page).click();
    await expectStep(page, 2);

    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await expectStep(page, 3);
  });

  test("ขั้น 3: ผู้ติดค้าง 5 กลุ่ม ปุ่ม + − ใหญ่อย่างน้อย 48px (TF-11)", async ({ page }) => {
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await expectStep(page, 3);
    for (const group of [
      "ผู้ใหญ่",
      "ผู้สูงอายุ",
      "ผู้ป่วยติดเตียง / พิการ",
      "เด็กเล็ก",
      "สัตว์เลี้ยง",
    ]) {
      for (const action of ["เพิ่มจำนวน", "ลดจำนวน"]) {
        const box = await page.getByRole("button", { name: `${action}${group}` }).boundingBox();
        expect(box!.width, `${action}${group}`).toBeGreaterThanOrEqual(48);
        expect(box!.height, `${action}${group}`).toBeGreaterThanOrEqual(48);
      }
    }
  });

  test("ขั้น 3: กด + − แล้วจำนวนเปลี่ยน และไม่ติดลบ", async ({ page }) => {
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    const plus = page.getByRole("button", { name: "เพิ่มจำนวนเด็กเล็ก" });
    const minus = page.getByRole("button", { name: "ลดจำนวนเด็กเล็ก" });
    await plus.click();
    await plus.click();
    await expect.poll(async () => (await readDraft(page))?.children).toBe(2);
    await minus.click();
    await minus.click();
    await expect.poll(async () => (await readDraft(page))?.children).toBe(0);
    // เหลือ 0 แล้วปุ่มลดถูกปิด จึงกดให้ติดลบไม่ได้
    await expect(minus).toBeDisabled();
  });

  test("ขั้น 3: เหลือ 0 คนแล้วกดถัดไป ไปต่อไม่ได้ (TF-11)", async ({ page }) => {
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await page.getByRole("button", { name: "ลดจำนวนผู้ใหญ่" }).click();
    await nextButton(page).click();
    await expectStep(page, 3);
    await expect(page.getByText("ยังไปขั้นถัดไปไม่ได้:")).toBeVisible();
  });

  test("ขั้น 4: เลือก/ยกเลิกสิ่งที่ต้องการได้", async ({ page }) => {
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await nextButton(page).click();
    await expectStep(page, 4);
    const water = page.getByRole("button", { name: /น้ำดื่มสะอาด/ });
    await water.click();
    await expect(water).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/เลือกแล้ว\s*1\s*รายการ/)).toBeVisible();
    await water.click();
    await expect(water).toHaveAttribute("aria-pressed", "false");
  });

  test("ขั้น 4: เลือก อื่นๆ ต้องพิมพ์ก่อนไปต่อ และพิมพ์ได้ไม่เกิน 200 ตัวอักษร (TF-11)", async ({
    page,
  }) => {
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await nextButton(page).click();
    await page.getByRole("button", { name: /อื่นๆ/ }).click();
    const box = page.getByPlaceholder(/ต้องการอินซูลิน/);
    await expect(box).toBeVisible();
    await nextButton(page).click();
    await expectStep(page, 4);
    await expect(page.getByText("ยังไปขั้นถัดไปไม่ได้", { exact: false }).first()).toBeVisible();
    await box.fill("ก".repeat(250));
    await expect(box).toHaveValue("ก".repeat(200));
    await nextButton(page).click();
    await expectStep(page, 5);
  });
});

test.describe("ขั้นที่ 5 ข้อมูลติดต่อและการส่ง", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshSosForm(page);
    await goToStep5(page);
  });

  const submit = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" });

  test("ไม่กรอกชื่อและเบอร์ ขึ้น error ทั้งสองช่อง", async ({ page }) => {
    await submit(page).click();
    await expect(page.getByText("กรุณาระบุชื่อ").first()).toBeVisible();
    await expect(page.getByText(/กรุณาระบุเบอร์โทร/).first()).toBeVisible();
  });

  test("เบอร์ผิดรูปแบบขึ้น error, รูปแบบ 081-234-5678 รับได้ (TF-11)", async ({ page }) => {
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ");
    const phone = page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678");
    await phone.fill("12345");
    await submit(page).click();
    await expect(
      page.getByText("กรุณาระบุเบอร์โทรศัพท์ไทยที่ถูกต้อง", { exact: false }).first(),
    ).toBeVisible();
    await phone.fill("081-234-5678");
    await submit(page).click();
    await expect(
      page.getByText("กรุณาระบุเบอร์โทรศัพท์ไทยที่ถูกต้อง", { exact: false }),
    ).toHaveCount(0);
  });

  test("แนบรูปได้ ลบได้ ไม่เกิน 3 รูป และรูปถูกบีบเหลือไม่เกิน 500 KB (TF-11)", async ({
    page,
  }) => {
    test.setTimeout(90_000); // บีบรูปใหญ่ 3 รูปในเบราว์เซอร์ใช้เวลา (ช้าลงเมื่อรันหลาย test พร้อมกัน)
    // ภาพทดสอบ PNG ขนาดใหญ่ (สร้างบน canvas ในหน้าเว็บ ไม่ต้องมีไฟล์ในโปรเจกต์)
    const big = await page.evaluate(async () => {
      // จุดสีสุ่มทุกพิกเซล บีบยาก ไฟล์จึงใหญ่เกิน 500 KB แน่นอน
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 900;
      const ctx = c.getContext("2d")!;
      const img = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i++)
        img.data[i] = i % 4 === 3 ? 255 : (Math.random() * 256) | 0;
      ctx.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const file = (name: string) => ({ name, mimeType: "image/png", buffer: Buffer.from(big) });
    expect(big.length, "ภาพทดสอบต้องใหญ่กว่า 500 KB").toBeGreaterThan(500 * 1024);

    const input = page.locator('input[type="file"]');
    for (const name of ["a.png", "b.png", "c.png"]) {
      await input.setInputFiles(file(name));
      // บีบแล้วระบบแปลงเป็น JPEG ชื่อไฟล์จึงเปลี่ยนนามสกุล
      const base = name.replace(/\.png$/, "");
      await expect(page.getByRole("button", { name: new RegExp(`^ลบรูป ${base}\\.`) })).toBeVisible(
        {
          timeout: 15_000,
        },
      );
    }
    // ครบ 3 รูปแล้ว ปุ่มเพิ่มรูปหายไป และช่องเลือกไฟล์ถูกปิด
    await expect(page.getByRole("button", { name: /แตะเพื่อถ่ายรูปหรือเลือกรูป/ })).toHaveCount(0);
    await expect(input).toBeDisabled();

    const photos = ((await readDraft(page))?.photos ?? []) as { compressedBytes: number }[];
    expect(photos).toHaveLength(3);
    for (const p of photos) expect(p.compressedBytes).toBeLessThanOrEqual(500 * 1024);

    await page.getByRole("button", { name: /^ลบรูป b\./ }).click();
    await expect(page.getByRole("button", { name: /^ลบรูป b\./ })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /แตะเพื่อถ่ายรูปหรือเลือกรูป \(1 รูปที่เหลือ\)/ }),
    ).toBeVisible();
  });

  test("ยังไม่มีตำแหน่งแล้วกดส่ง ต้องบอกว่ายังส่งไม่ได้ และไม่เกิดเคสใหม่", async ({ page }) => {
    await page.evaluate(() => {
      const key = "namjaithai-sos-draft-v1";
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      delete draft.lat;
      delete draft.lng;
      delete draft.landmark;
      localStorage.setItem(key, JSON.stringify(draft));
    });
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ ไม่มีตำแหน่ง");
    const phone = randomPhone();
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
    await submit(page).click();
    await expect(page.getByText(/ยังส่งคำขอไม่ได้/).first()).toBeVisible();
    await expect(page.getByText(/ส่งคำขอสำเร็จ/)).toHaveCount(0);
    expect(await countCasesByPhone(phone)).toBe(0);
  });

  test("ส่งสำเร็จ เห็นรหัสเคสทันที ร่างถูกล้าง และกดส่งซ้ำไม่เกิดเคสซ้ำ", async ({ page }) => {
    await seedLocationIntoDraft(page);
    await expectStep(page, 5);
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ ส่งสำเร็จ");
    const phone = randomPhone();
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
    // กดสองครั้งติดกันเร็วๆ (นิ้วสั่น) ต้องได้เคสเดียว
    await submit(page).evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
    await expect(page.getByText(/รหัสเคสของคุณคือ FL-\d{4}-\d{4,}/)).toBeVisible({
      timeout: 15_000,
    });
    // นับเฉพาะเคสของเบอร์นี้ (test มือถือ/จอคอมรันพร้อมกัน นับทั้งตารางจะปนกัน)
    expect(await countCasesByPhone(phone)).toBe(1);
    expect(await readDraft(page)).toBeNull();
  });

  test("เบอร์ซ้ำกับเคสที่ยังเปิดอยู่ ขึ้นตัวเลือก อัปเดตเคสเดิม / สร้างใหม่ (TF-16)", async ({
    page,
    baseURL,
  }) => {
    test.fail(
      true,
      "บั๊ก E2E-2: API ตอบ 409 แต่หน้าเว็บไม่แสดงปุ่มเลือก (DuplicateCasePrompt ไม่ได้ถูกใช้)",
    );
    const existing = await createCaseViaApi(baseURL!);
    await seedLocationIntoDraft(page);
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ เบอร์ซ้ำ");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(existing.phone);
    await submit(page).click();
    await expect(page.getByRole("button", { name: /อัปเดตเคสเดิม/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /สร้างใหม่/ })).toBeVisible();
  });
});
