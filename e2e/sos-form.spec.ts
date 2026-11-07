import { test, expect } from "@playwright/test";
import { adminDb, countCasesByPhone, createCaseViaApi, randomPhone } from "./helpers/db";
import { applySession, createAccount } from "./helpers/accounts";
import {
  backButton,
  answerStep1,
  expectStep,
  goToStep5,
  nextButton,
  openFreshSosForm,
  readDraft,
  seedLocationIntoDraft,
} from "./helpers/sos";

// E. ฟอร์ม SOS 5 ขั้น (TF-08 ขั้น 1, TF-11 ขั้น 3–5, TF-16 เคสซ้ำ)

test.describe("ขั้นที่ 1 สถานการณ์ (TF-08, TF-50, TF-55)", () => {
  test.beforeEach(async ({ page }) => openFreshSosForm(page));

  test("TF-50: กริด 8 ประเภท ปุ่มสูงอย่างน้อย 56px และไม่มีการ์ดแดง/เหลือง/เขียวให้เลือก", async ({
    page,
  }) => {
    const grid = page.getByTestId("incident-type-grid");
    await expect(grid).toBeVisible();

    const expectedTypes = [
      "น้ำท่วม",
      "ไฟไหม้",
      "อุบัติเหตุทางถนน",
      "เจ็บป่วยฉุกเฉิน",
      "ตกน้ำ / จมน้ำ",
      "อาคารถล่ม / ติดใต้ซาก",
      "สัตว์อันตราย",
      "เหตุอื่นๆ",
    ];
    const buttons = grid.getByRole("radio");
    await expect(buttons).toHaveCount(8);

    for (let i = 0; i < expectedTypes.length; i++) {
      const btn = buttons.nth(i);
      await expect(btn).toHaveText(expectedTypes[i]);
      const box = await btn.boundingBox();
      expect(box!.height, `ปุ่ม ${expectedTypes[i]} ต้องสูง >= 56px`).toBeGreaterThanOrEqual(56);
    }

    for (const word of ["วิกฤต", "เร่งด่วน", "ทั่วไป"]) {
      await expect(page.getByRole("radio", { name: new RegExp(`^${word}`) })).toHaveCount(0);
    }
    await expect(page.getByText(/เคสสีแดง|เลือกสี/)).toHaveCount(0);
  });

  test("TF-50: ตอบว่าไม่ได้อยู่ที่จุดเกิดเหตุ แสดงเบอร์สายด่วนแทน และไม่สร้างเคส", async ({
    page,
    isMobile,
  }) => {
    await page.getByRole("radio", { name: "ไม่ได้อยู่ที่จุดเกิดเหตุ" }).click();

    const hotlinesBox = page.getByTestId("not-at-scene-hotlines");
    await expect(hotlinesBox).toBeVisible();
    await expect(hotlinesBox.getByRole("heading", { name: /แจ้งแทนคนอื่นไม่ได้/ })).toBeVisible();
    await expect(hotlinesBox.getByRole("link", { name: /โทร 1669/ })).toHaveAttribute(
      "href",
      "tel:1669",
    );
    await expect(hotlinesBox.getByRole("link", { name: /โทร 1784/ })).toHaveAttribute(
      "href",
      "tel:1784",
    );

    // ปุ่มถัดไปหายไป ไม่ให้ไปขั้น 2 หรือสร้างเคส
    await expect(nextButton(page)).toHaveCount(0);

    // บนจอคอม แม้กดขั้นอื่นในการ์ดด้านซ้ายก็จะถูกกันไว้ที่ขั้น 1
    if (!isMobile) {
      await page.getByRole("button", { name: /ผู้ติดค้าง/ }).click();
      await expectStep(page, 1);
    }

    // ยิง API ตรงด้วย atScene: false ก็ต้องถูกปฏิเสธและไม่เกิดเคสใหม่ในฐานข้อมูล
    const phone = randomPhone();
    const res = await page.request.post("/api/cases", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {
        consent: true,
        healthConsent: true,
        atScene: false,
        dangerSigns: [],
        canSelfEvacuate: false,
        lat: 13.7563,
        lng: 100.5018,
        landmark: "หน้าวัด",
        adults: 1,
        elderly: 0,
        bedridden: 0,
        children: 0,
        pets: 0,
        needs: [],
        name: "ทดสอบ แจ้งแทน",
        phone,
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).fields).toContain("atScene");
    expect(await countCasesByPhone(phone)).toBe(0);
  });

  test("TF-50: เปิดลิงก์ ?type=FLOOD แล้วเลือกประเภทน้ำท่วมไว้ให้", async ({ page }) => {
    await openFreshSosForm(page, "/request?type=FLOOD");
    const grid = page.getByTestId("incident-type-grid");
    await expect(grid.getByRole("radio", { name: "น้ำท่วม" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(grid.getByRole("radio", { name: "ไฟไหม้" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("ไม่ตอบแล้วกดถัดไป บอกว่าขาดอะไร และยังอยู่ขั้น 1", async ({ page }) => {
    await nextButton(page).click();
    await expect(
      page.getByRole("alert").filter({ hasText: 'กรุณาเลือกข้อที่ตรง หรือกด "ไม่มีข้อใดเลย"' }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "กรุณาตอบว่าออกจากที่นั่นเองได้ไหม" }),
    ).toBeVisible();
    await expectStep(page, 1);
  });

  test("TF-55: ผู้แจ้งไม่เห็นตัวเลือกสีความเร่งด่วน", async ({ page }) => {
    for (const word of ["วิกฤต", "เร่งด่วน", "ทั่วไป"]) {
      await expect(page.getByRole("radio", { name: new RegExp(`^${word}`) })).toHaveCount(0);
    }
    await expect(page.getByText(/เคสสีแดง|เลือกสี/)).toHaveCount(0);
  });

  test("TF-55: ติ๊กสัญญาณอันตรายแล้วแถบโทร 1669 ขึ้นค้างบนสุดทุกขั้น", async ({ page }) => {
    const bar = page.getByTestId("danger-call-bar");
    await expect(bar).toHaveCount(0);
    await answerStep1(page, { dangerSigns: ["มีคนหายใจผิดปกติ"] });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: /โทร 1669/ })).toHaveAttribute("href", "tel:1669");

    await nextButton(page).click();
    await expectStep(page, 2);
    await expect(bar).toBeVisible();
    await seedLocationIntoDraft(page);
    for (const step of [3, 4, 5]) {
      await nextButton(page).click();
      await expectStep(page, step);
      await expect(bar).toBeVisible();
      // แถบต้องอยู่บนสุดของจอ แม้เลื่อนลงล่างสุด
      await page.mouse.wheel(0, 4000);
      await expect.poll(async () => (await bar.boundingBox())?.y).toBeLessThanOrEqual(1);
      const callButton = bar.getByRole("link", { name: /โทร 1669/ });
      await expect
        .poll(() =>
          callButton.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const topmost = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            return topmost === element || element.contains(topmost);
          }),
        )
        .toBe(true);
    }
  });

  test("TF-55: กด ไม่มีข้อใดเลย แล้วแถบโทรหาย", async ({ page }) => {
    await page.getByRole("checkbox", { name: "มีคนหมดสติ", exact: true }).click();
    await expect(page.getByTestId("danger-call-bar")).toBeVisible();
    await page.getByRole("checkbox", { name: "ไม่มีข้อใดเลย" }).click();
    await expect(page.getByTestId("danger-call-bar")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "มีคนหมดสติ", exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("ระดับน้ำ (มือถือและจอคอม): เลือกได้ และกดซ้ำเพื่อยกเลิก", async ({ page }) => {
    const roof = page.getByRole("radio", { name: "บนหลังคา / ดาดฟ้า" });
    await expect(roof).toBeVisible();
    await roof.click();
    await expect(roof).toHaveAttribute("aria-checked", "true");
    await roof.click();
    await expect(roof).toHaveAttribute("aria-checked", "false");
  });

  test("ตอบแล้วไปขั้น 2 ได้ (ไม่ต้องตอบระดับน้ำ)", async ({ page }) => {
    await answerStep1(page);
    await nextButton(page).click();
    await expectStep(page, 2);
  });

  test("ปิดหน้าแล้วเปิดใหม่ ค่าที่ตอบยังอยู่ (TF-08)", async ({ page }) => {
    await answerStep1(page, { dangerSigns: ["มีคนเจ็บหน้าอก"], canSelfEvacuate: false });
    await page.getByRole("radio", { name: "ถูกน้ำล้อม / ตัดขาด" }).click();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "มีคนเจ็บหน้าอก" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("radio", { name: "ไม่ได้ ติดอยู่" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("radio", { name: "ถูกน้ำล้อม / ตัดขาด" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("ปุ่มทุกข้อในขั้น 1 สูงอย่างน้อย 48px", async ({ page }) => {
    const buttons = page.getByRole("main").locator('[role="checkbox"], [role="radio"]');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) {
      expect((await buttons.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(48);
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

  test("จอคอม: การ์ดรายการขั้น กดข้ามไปขั้นอื่นโดยยังไม่ตอบ จะถูกกันไว้", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "จอคอมเท่านั้น");
    await page.getByRole("button", { name: /ผู้ติดค้าง/ }).click();
    await expectStep(page, 1);
    await expect(
      page.getByRole("alert").filter({ hasText: "กรุณาตอบว่าออกจากที่นั่นเองได้ไหม" }),
    ).toBeVisible();
  });

  test("/sos กับ /request เป็นฟอร์มเดียวกัน", async ({ page }) => {
    await page.goto("/sos");
    await expectStep(page, 1);
    await expect(page.getByRole("heading", { name: "ตอนนี้มีข้อใดต่อไปนี้ไหม?" })).toBeVisible();
  });
});

test.describe("ขั้นที่ 2–4", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshSosForm(page);
    await answerStep1(page);
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

  test("คำขอถึงแล้วแต่ส่งรูปไม่สำเร็จ แสดงรหัสเคสและเก็บรูปเดิมรอส่งซ้ำ", async ({
    page,
    context,
  }) => {
    await seedLocationIntoDraft(page);
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบส่งรูปซ้ำ");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "blue";
      ctx.fillRect(0, 0, 8, 8);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: "retry.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
    await expect(page.getByRole("button", { name: /^ลบรูป retry\./ })).toBeVisible();
    let succeed = false;
    const requests: { key: string; body: string | null }[] = [];
    await context.route("**/api/cases", async (route) => {
      requests.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      await route.fulfill({
        status: succeed ? 200 : 503,
        contentType: "application/json",
        body: JSON.stringify({
          caseCode: "FL-TEST-PENDING",
          trackingToken: "a".repeat(32),
          ...(succeed ? {} : { photosPending: true, error: "ส่งรูปยังไม่สำเร็จ" }),
        }),
      });
    });
    await submit(page).click();
    await expect(
      page.getByRole("heading", { name: "ส่งคำขอถึงระบบแล้ว — กำลังส่งรูป" }),
    ).toBeVisible();
    await expect(page.getByText(/รหัสเคส: FL-TEST-PENDING/)).toBeVisible();
    succeed = true;
    await page.getByRole("button", { name: "ลองส่งอีกครั้ง" }).click();
    await expect(
      page.getByRole("heading", { name: "ส่งถึงระบบแล้ว รอทีมกู้ภัยรับเคส" }),
    ).toBeVisible();
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(
      requests.every(
        (request) => request.key === requests[0].key && request.body === requests[0].body,
      ),
    ).toBe(true);
    expect(JSON.parse(requests[0].body!).photos).toHaveLength(1);
  });

  test("แนบรูปแล้วส่ง SOS เก็บรูปส่วนตัว ส่งซ้ำไม่เพิ่มรูป และผู้รับเคสเปิดดูได้", async ({
    page,
    context,
  }) => {
    await seedLocationIntoDraft(page);
    const phone = randomPhone();
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ รูป SOS");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "blue";
      ctx.fillRect(0, 0, 8, 8);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
    await expect(page.getByRole("button", { name: /^ลบรูป photo\./ })).toBeVisible();
    const sent = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/api/cases"),
    );
    await submit(page).click();
    const request = await sent;
    await expect(page.getByText(/รหัสเคสของคุณคือ FL-/)).toBeVisible({ timeout: 20_000 });
    const replay = await page.request.post("/api/cases", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": request.headers()["idempotency-key"],
      },
      data: request.postData()!,
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).replayed).toBe(true);
    const db = adminDb();
    const { data: contacts } = await db
      .from("case_contacts")
      .select("case_id")
      .eq("phone", phone)
      .throwOnError();
    expect(contacts).toHaveLength(1);
    const { data: media } = await db
      .from("case_media")
      .select("storage_path")
      .eq("case_id", contacts![0].case_id)
      .throwOnError();
    expect(media).toHaveLength(1);
    const { data: blob, error } = await db.storage
      .from("case-media")
      .download(media![0].storage_path);
    expect(error).toBeNull();
    expect(blob!.size).toBeGreaterThan(0);
    const rescuer = await createAccount({ displayName: "กู้ภัยทดสอบรูป", role: "RESCUER" });
    const { data: unit } = await db
      .from("units")
      .insert({ name: `TF24-photo-${crypto.randomUUID()}`, province: "เลย" })
      .select("id")
      .single()
      .throwOnError();
    await db
      .from("unit_members")
      .insert({
        unit_id: unit!.id,
        user_id: rescuer.id,
        role_in_unit: "MEMBER",
        status: "APPROVED",
      })
      .throwOnError();
    await db
      .from("cases")
      .update({ status: "ACCEPTED", assigned_unit_id: unit!.id, assigned_rescuer_id: rescuer.id })
      .eq("id", contacts![0].case_id)
      .throwOnError();
    await applySession(context, rescuer);
    await page.goto(`/rescue/cases/${contacts![0].case_id}`);
    const casePhoto = page.getByRole("img", { name: "รูปประกอบเหตุ" });
    await expect(casePhoto).toBeVisible();
    await expect
      .poll(() => casePhoto.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await db.from("cases").update({ status: "RESOLVED" }).eq("id", contacts![0].case_id);
    await db.from("units").update({ is_active: false }).eq("id", unit!.id);
    await db.from("users").update({ status: "SUSPENDED" }).eq("id", rescuer.id);
  });

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
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
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
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
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
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
    await submit(page).click();
    await expect(page.getByRole("button", { name: /อัปเดตเคสเดิม/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /สร้างใหม่/ })).toBeVisible();
  });
});

test.describe("TF-51: ขั้น 3–4 วาดจากทะเบียน + API รับ details", () => {
  test("TF-51: ขั้น 3 วาดคำถามเฉพาะประเภท (ไม่เกิน 3 ข้อ: ตัวเลข/ตัวเลือก/ใช่-ไม่ใช่) และขั้น 4 ความต้องการเปลี่ยนตามประเภท + อื่นๆ พิมพ์เอง", async ({
    page,
  }) => {
    await openFreshSosForm(page);

    // เลือกประเภท "อุบัติเหตุทางถนน" (ROAD_ACCIDENT)
    await page.getByTestId("incident-type-ROAD_ACCIDENT").click();
    await page.getByRole("radio", { name: "อยู่ที่จุดเกิดเหตุ", exact: true }).click();
    await answerStep1(page);
    await nextButton(page).click();
    await expectStep(page, 2);

    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await expectStep(page, 3);

    // ตรวจว่าขั้น 3 แสดงคำถามเฉพาะประเภทไม่เกิน 3 ข้อ (ROAD_ACCIDENT มี 3 ข้อ: ตัวเลข, ตัวเลือก, ใช่-ไม่ใช่)
    const questionsSection = page.getByTestId("step3-incident-questions");
    await expect(questionsSection).toBeVisible();
    const questionCards = questionsSection.locator('[data-testid^="incident-question-"]');
    const qCount = await questionCards.count();
    expect(qCount).toBeGreaterThanOrEqual(1);
    expect(qCount).toBeLessThanOrEqual(3);

    // กดถัดไปโดยยังไม่ตอบคำถามบังคับของ ROAD_ACCIDENT ต้องแจ้งเตือนและยังอยู่ขั้น 3
    await nextButton(page).click();
    await expectStep(page, 3);
    await expect(page.getByTestId("step3-missing-alert")).toBeVisible();

    // ตอบคำถามทั้ง 3 ชนิด (ตัวเลข, ตัวเลือก, ใช่-ไม่ใช่)
    await page.getByTestId("question-injuredCount-input").fill("2");
    await page.getByTestId("question-vehicleType-option-MOTORCYCLE").click();
    await page.getByTestId("question-isTrapped-yes").click();

    await nextButton(page).click();
    await expectStep(page, 4);

    // ขั้น 4: ความต้องการของ ROAD_ACCIDENT ต้องไม่มี "เรืออพยพด่วน" แต่มี "ยารักษาโรค/ปฐมพยาบาล" และ "อื่นๆ (พิมพ์เอง)"
    await expect(page.getByTestId("need-option-EVACUATION_BOAT")).toHaveCount(0);
    await expect(page.getByTestId("need-option-MEDICINE")).toBeVisible();
    const otherBtn = page.getByTestId("need-option-OTHER");
    await expect(otherBtn).toBeVisible();

    await otherBtn.click();
    await page.getByTestId("other-detail-input").fill("ต้องการเครื่องตัดถ่างด่วน");
    await nextButton(page).click();
    await expectStep(page, 5);
  });

  test("TF-51: API /api/cases ตอบ 400 เมื่อส่ง details ไม่ตรงประเภทเหตุ", async ({ page }) => {
    const phone = randomPhone();

    // ส่ง waterLevel ของ FLOOD มาในเคส ROAD_ACCIDENT -> ต้องได้ 400
    const resMismatch = await page.request.post("/api/cases", {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-Forwarded-For": `10.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      },
      data: {
        consent: true,
        healthConsent: true,
        incidentType: "ROAD_ACCIDENT",
        atScene: true,
        dangerSigns: [],
        canSelfEvacuate: false,
        details: {
          waterLevel: "ROOF",
        },
        lat: 13.7563,
        lng: 100.5018,
        landmark: "แยกอโศก",
        adults: 1,
        elderly: 0,
        bedridden: 0,
        children: 0,
        pets: 0,
        needs: [],
        name: "ทดสอบ API 400",
        phone,
      },
    });
    expect(resMismatch.status()).toBe(400);
    expect((await resMismatch.json()).fields).toContain("details");
    expect(await countCasesByPhone(phone)).toBe(0);
  });

  test("TF-51: ส่งฟอร์ม SOS สำเร็จอย่างน้อย 3 ประเภทเหตุ (FLOOD, ROAD_ACCIDENT, ANIMAL) และแยกข้อมูลสุขภาพออกจาก cases.details", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // 1. ประเภทที่ 1: น้ำท่วม (FLOOD)
    await openFreshSosForm(page, "/request?type=FLOOD");
    await page.getByRole("radio", { name: "อยู่ที่จุดเกิดเหตุ", exact: true }).click();
    await answerStep1(page, { canSelfEvacuate: false });
    await page.getByRole("radio", { name: "ระดับเอว–หน้าอก" }).click();
    await nextButton(page).click();
    await expectStep(page, 2);
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await expectStep(page, 3);
    await page.getByTestId("question-hasInjured-yes").click();
    await nextButton(page).click();
    await expectStep(page, 4);
    await page.getByTestId("need-option-EVACUATION_BOAT").click();
    await nextButton(page).click();
    await expectStep(page, 5);
    const phoneFlood = randomPhone();
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง น้ำท่วม");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phoneFlood);
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
    await page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" }).click();
    await expect(page.getByText(/รหัสเคสของคุณคือ FL-\d{4}-\d{4,}/)).toBeVisible({
      timeout: 15_000,
    });
    expect(await countCasesByPhone(phoneFlood)).toBe(1);

    // 2. ประเภทที่ 2: อุบัติเหตุทางถนน (ROAD_ACCIDENT)
    await openFreshSosForm(page, "/request?type=ROAD_ACCIDENT");
    await page.getByRole("radio", { name: "อยู่ที่จุดเกิดเหตุ", exact: true }).click();
    await answerStep1(page, { canSelfEvacuate: false });
    await nextButton(page).click();
    await expectStep(page, 2);
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await expectStep(page, 3);
    await page.getByTestId("question-injuredCount-input").fill("2");
    await page.getByTestId("question-vehicleType-option-CAR").click();
    await page.getByTestId("question-isTrapped-yes").click();
    await nextButton(page).click();
    await expectStep(page, 4);
    await page.getByTestId("need-option-MEDICINE").click();
    await nextButton(page).click();
    await expectStep(page, 5);
    const phoneRoad = randomPhone();
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง อุบัติเหตุ");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phoneRoad);
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
    const roadResPromise = page.waitForResponse(
      (r) => r.url().endsWith("/api/cases") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" }).click();
    const roadRes = await roadResPromise;
    expect(roadRes.status()).toBe(201);
    const roadBody = (await roadRes.json()) as { caseCode: string };
    await expect(page.getByText(/รหัสเคสของคุณคือ FL-\d{4}-\d{4,}/)).toBeVisible({
      timeout: 15_000,
    });
    expect(await countCasesByPhone(phoneRoad)).toBe(1);

    // ตรวจในฐานข้อมูลว่า ROAD_ACCIDENT เก็บ vehicleType/isTrapped ใน cases.details และแยก injuredCount ไป case_sensitive_details
    const { data: roadCase, error: roadErr } = await adminDb()
      .from("cases")
      .select("incident_type, details, case_sensitive_details(details)")
      .eq("case_code", roadBody.caseCode)
      .single();
    expect(roadErr).toBeNull();
    expect(roadCase?.incident_type).toBe("ROAD_ACCIDENT");
    expect(roadCase?.details).toMatchObject({
      vehicleType: "CAR",
      isTrapped: true,
    });
    expect(roadCase?.details).not.toHaveProperty("injuredCount");
    const roadSensitive = (
      roadCase?.case_sensitive_details as unknown as { details: Record<string, unknown> } | null
    )?.details;
    expect(roadSensitive).toMatchObject({
      injuredCount: 2,
    });

    // 3. ประเภทที่ 3: สัตว์อันตราย (ANIMAL)
    await openFreshSosForm(page, "/request?type=ANIMAL");
    await page.getByRole("radio", { name: "อยู่ที่จุดเกิดเหตุ", exact: true }).click();
    await answerStep1(page, { canSelfEvacuate: true });
    await nextButton(page).click();
    await expectStep(page, 2);
    await seedLocationIntoDraft(page);
    await nextButton(page).click();
    await expectStep(page, 3);
    await page.getByTestId("question-animalType-option-SNAKE").click();
    await page.getByTestId("question-isInsideHome-yes").click();
    await page.getByTestId("question-hasBittenOrStung-no").click();
    await nextButton(page).click();
    await expectStep(page, 4);
    await page.getByTestId("need-option-OTHER").click();
    await page.getByTestId("other-detail-input").fill("งูเห่าอยู่ในห้องครัว");
    await nextButton(page).click();
    await expectStep(page, 5);
    const phoneAnimal = randomPhone();
    await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้แจ้ง สัตว์อันตราย");
    await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phoneAnimal);
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
    await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
    await page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" }).click();
    await expect(page.getByText(/รหัสเคสของคุณคือ FL-\d{4}-\d{4,}/)).toBeVisible({
      timeout: 15_000,
    });
    expect(await countCasesByPhone(phoneAnimal)).toBe(1);
  });
});
