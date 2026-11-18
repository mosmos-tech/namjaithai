import { test, expect, type Page } from "@playwright/test";
import {
  adminDb,
  createCaseViaApi,
  randomPhone,
  stepTestCase,
  type CreatedCase,
} from "./helpers/db";
import { openFreshSosForm, goToStep5, expectSentCase } from "./helpers/sos";

// F. /sos/sent · G. /track · H. /track/[code] (TF-13)

const SENT_KEY = "namjaithai:sent-case";

async function rememberSent(page: Page, sent: CreatedCase) {
  await page.goto("/sos/sent");
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: SENT_KEY,
    value: {
      caseCode: sent.caseCode,
      trackingToken: sent.trackingToken,
      phoneLast4: sent.phone.slice(-4),
    },
  });
  await page.reload();
}

test.describe("/sos/sent หน้าส่งสำเร็จ", () => {
  test("ไม่มีเคสในเครื่อง บอกว่าไม่พบ และมีลิงก์ไปติดตาม/แจ้งใหม่", async ({ page }) => {
    await page.goto("/sos/sent");
    await expect(page.getByRole("heading", { name: "ไม่พบเคสที่เพิ่งส่ง" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ติดตามเคส", exact: true }).last()).toHaveAttribute(
      "href",
      "/track",
    );
    await expect(
      page.getByRole("link", { name: "แจ้งขอความช่วยเหลือ", exact: true }).last(),
    ).toHaveAttribute("href", "/request");
  });

  test.describe("มีเคสที่เพิ่งส่ง", () => {
    let sent: CreatedCase;
    test.beforeEach(async ({ page, baseURL }) => {
      sent = await createCaseViaApi(baseURL!);
      await rememberSent(page, sent);
    });

    test("เห็นรหัสเคสและเบอร์ 4 ตัวท้ายทันที ปุ่มคัดลอกใช้ได้", async ({
      page,
      context,
      browserName,
    }) => {
      await expect(page.getByText(sent.caseCode, { exact: true })).toBeVisible();
      await expect(page.getByText(sent.phone.slice(-4), { exact: true })).toBeVisible();
      if (browserName === "chromium")
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "คัดลอกรหัสเคส" }).click();
      await expect(page.getByRole("button", { name: "คัดลอกแล้ว" })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sent.caseCode);
    });

    test("ปุ่ม ติดตามเคส พาไปหน้าติดตามพร้อม token", async ({ page }) => {
      await page
        .getByTestId("sent-case-card")
        .getByRole("link", { name: "ติดตามเคส", exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/track/${sent.caseCode}\\?t=${sent.trackingToken}$`),
      );
      await expect(page.getByText("รอทีมรับเคส")).toBeVisible();
    });

    test("ปุ่มแชร์ LINE เปิด LINE พร้อมรหัสเคสและลิงก์ติดตาม", async ({ page }) => {
      // ดักไว้ไม่ให้ไปเว็บ LINE จริง แล้วอ่านข้อความที่จะแชร์จาก URL ที่เบราว์เซอร์จะเปิด
      await page.route(/line\.me/, (route) => route.abort());
      const request = page.waitForRequest(/line\.me\/R\/share/);
      await page.getByRole("button", { name: "แชร์ให้ญาติทาง LINE" }).click();
      const shared = new URL((await request).url());
      const text = shared.searchParams.get("text") ?? "";
      expect(text).toContain(sent.caseCode);
      expect(text).toContain(`/track/${sent.caseCode}?t=${sent.trackingToken}`);
    });

    test("ปุ่มกลับหน้าหลัก", async ({ page }) => {
      await page.getByRole("link", { name: "กลับหน้าหลัก" }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  });

  test("ติ๊กถูกเล่นแอนิเมชัน แต่ไม่เล่นเมื่อเครื่องตั้ง reduce motion (TF-13)", async ({
    page,
    baseURL,
  }) => {
    const sent = await createCaseViaApi(baseURL!);
    // ดักนับว่าหน้าเว็บสั่ง element.animate() กี่ครั้ง ตั้งแต่ก่อนหน้าโหลด
    // (ไม่เช็กว่ากำลังเล่นอยู่ไหม เพราะแอนิเมชันยาวแค่ ~0.7 วิ เครื่องช้าจะจบก่อนเช็กทัน)
    await page.addInitScript(() => {
      const w = window as unknown as { __animateCalls: number };
      w.__animateCalls = 0;
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args: Parameters<Element["animate"]>) {
        w.__animateCalls++;
        return original.apply(this, args);
      };
    });
    const animateCalls = () =>
      page.evaluate(() => (window as unknown as { __animateCalls: number }).__animateCalls);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await rememberSent(page, sent);
    await expect(page.getByText(sent.caseCode, { exact: true })).toBeVisible();
    // เล่นครั้งเดียว = หลังเล่นแล้วไม่มีการสั่งเล่นเพิ่ม (ไม่วนซ้ำ)
    // ตอน dev จะนับได้ 4 เพราะ React StrictMode รัน effect 2 รอบ (รอบแรกถูกยกเลิกทันที) production ได้ 2
    await expect.poll(animateCalls, { message: "ปกติต้องเล่นแอนิเมชันติ๊กถูก" }).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    const afterFirstPlay = await animateCalls();
    await page.waitForTimeout(1500);
    expect(await animateCalls(), "เล่นครั้งเดียว ไม่วนซ้ำ").toBe(afterFirstPlay);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.getByText(sent.caseCode, { exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(await animateCalls(), "ตั้ง reduce motion แล้วต้องไม่เล่นแอนิเมชัน").toBe(0);
  });
});

test.describe("/track กรอกรหัสเคส", () => {
  const caseInput = (page: Page) => page.getByRole("textbox", { name: "รหัสเคส" });
  const last4Input = (page: Page) => page.getByRole("textbox", { name: "เบอร์โทร 4 ตัวท้าย" });
  const submit = (page: Page) => page.getByRole("button", { name: "ดูสถานะเคส" });

  test("ฟอร์มว่างกดดูสถานะ ขึ้น error รหัสเคสไม่ถูกต้อง", async ({ page }) => {
    await page.goto("/track");
    await submit(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "รหัสเคสไม่ถูกต้อง" })).toBeVisible();
  });

  test("ช่อง 4 ตัวท้ายรับเฉพาะตัวเลข ไม่เกิน 4 หลัก", async ({ page }) => {
    await page.goto("/track");
    await last4Input(page).pressSequentially("12ab345");
    await expect(last4Input(page)).toHaveValue("1234");
  });

  test("รหัสถูกแต่ 4 ตัวท้ายผิด บอกว่าไม่พบเคส", async ({ page, baseURL }) => {
    const c = await createCaseViaApi(baseURL!);
    await page.goto("/track");
    await caseInput(page).fill(c.caseCode);
    await last4Input(page).fill(c.phone.slice(-4) === "0000" ? "1111" : "0000");
    await submit(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "ไม่พบเคสนี้" })).toBeVisible();
  });

  test("ข้อมูลถูกต้อง (พิมพ์ตัวเล็กก็ได้) พาไปหน้าสถานะ และ 4 ตัวท้ายไม่อยู่ใน URL", async ({
    page,
    baseURL,
  }) => {
    const c = await createCaseViaApi(baseURL!);
    await page.goto("/track");
    await caseInput(page).fill(c.caseCode.toLowerCase());
    await last4Input(page).fill(c.phone.slice(-4));
    await submit(page).click();
    await expect(page).toHaveURL(new RegExp(`/track/${c.caseCode}\\?t=[0-9a-f]{32}$`));
    expect(page.url()).not.toContain(c.phone.slice(-4) + "&");
    expect(new URL(page.url()).searchParams.has("last4")).toBe(false);
    await expect(page.getByText("รอทีมรับเคส")).toBeVisible();
  });
});

test.describe("/track/[code] หน้าสถานะเคส", () => {
  let c: CreatedCase;
  test.beforeEach(async ({ baseURL }) => {
    c = await createCaseViaApi(baseURL!);
  });

  test("ลิงก์ไม่มี token ขึ้นฟอร์ม 4 ตัวท้าย และกรอกรหัสเคสไว้ให้", async ({ page }) => {
    await page.goto(`/track/${c.caseCode}`);
    await expect(page.getByRole("textbox", { name: "รหัสเคส" })).toHaveValue(c.caseCode);
    await expect(page.getByRole("textbox", { name: "เบอร์โทร 4 ตัวท้าย" })).toBeVisible();
  });

  test("token ผิด ขึ้น error และปุ่มกรอกรหัสเคสใหม่", async ({ page }) => {
    await page.goto(`/track/${c.caseCode}?t=${"0".repeat(32)}`);
    await expect(page.getByText(/ไม่พบเคสนี้/)).toBeVisible();
    await page.getByRole("link", { name: "กรอกรหัสเคสใหม่" }).click();
    await expect(page).toHaveURL(/\/track$/);
  });

  test("เคสใหม่: รอทีมรับเคส และไม่มีคำว่า กำลังมา (TF-13)", async ({ page }) => {
    await page.goto(`/track/${c.caseCode}?t=${c.trackingToken}`);
    await expect(page.getByText("รอทีมรับเคส")).toBeVisible();
    await expect(page.getByText(/^ระหว่างรอ: เปิดเสียงโทรศัพท์/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("กำลังมา");
    await expect(page.getByText(/ทีม(กู้ภัย)?กำลังมา/)).toHaveCount(0);
  });

  test("สถานะเปลี่ยนแล้วหน้าเปลี่ยนเองภายใน 30 วินาที โดยไม่ใช้ Realtime (TF-13)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const sockets: string[] = [];
    page.on("websocket", (ws) => sockets.push(ws.url()));

    await page.goto(`/track/${c.caseCode}?t=${c.trackingToken}`);
    await expect(page.getByText("รอทีมรับเคส")).toBeVisible();

    // จำลองทีมกู้ภัยรับเคสแล้วออกเดินทาง
    const db = adminDb();
    const { data: unit } = await db
      .from("units")
      .insert({
        name: `หน่วยทดสอบ E2E ${c.caseCode}`,
        province: "กรุงเทพมหานคร",
        contact_phone: "0351234567",
      })
      .select("id")
      .single();
    // TF-26: เลื่อนทีละขั้น (ข้ามขั้น NEW → EN_ROUTE ไม่ได้)
    await stepTestCase(c.caseCode, ["ACCEPTED", "EN_ROUTE"], {
      assigned_unit_id: unit!.id,
      accepted_at: new Date().toISOString(),
    });

    await expect(page.getByRole("heading", { name: "ทีมกู้ภัยกำลังมาหาคุณ" })).toBeVisible({
      timeout: 32_000,
    });
    await expect(page.getByText(`หน่วยทดสอบ E2E ${c.caseCode}`)).toBeVisible();
    await expect(page.getByRole("link", { name: /โทรหา/ })).toHaveAttribute(
      "href",
      "tel:0351234567",
    );
    expect(
      sockets.filter((u) => u.includes("realtime")),
      "ต้องไม่เปิด Realtime",
    ).toEqual([]);
  });

  test("ดูไทม์ไลน์ทั้งหมด เปิดและปิดได้", async ({ page }) => {
    await page.goto(`/track/${c.caseCode}?t=${c.trackingToken}`);
    const toggle = page.getByText("ดูไทม์ไลน์ทั้งหมด");
    await toggle.click();
    await expect(page.getByText("รับแจ้งเคสแล้ว")).toBeVisible();
    await toggle.click();
    await expect(page.getByText("รับแจ้งเคสแล้ว")).toBeHidden();
  });

  test("ปุ่มย้อนกลับไป /track", async ({ page }) => {
    await page.goto(`/track/${c.caseCode}?t=${c.trackingToken}`);
    await page.getByRole("link", { name: "กลับ", exact: true }).click();
    await expect(page).toHaveURL(/\/track$/);
  });

  test("หน้าสถานะเคสไม่ให้ search engine เก็บ", async ({ page }) => {
    await page.goto(`/track/${c.caseCode}?t=${c.trackingToken}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test("TF-53 คำแนะนำกับสายด่วนตรงประเภท โดยไม่แสดงคำแนะนำน้ำท่วมให้เหตุไฟไหม้", async ({
  page,
  baseURL,
}) => {
  const sent = await createCaseViaApi(baseURL!);
  await page.route("**/api/track/**", async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, incidentType: "FIRE" } });
  });
  await rememberSent(page, sent);
  await page.evaluate((key) => {
    const value = JSON.parse(sessionStorage.getItem(key)!);
    value.incidentType = "FIRE";
    sessionStorage.setItem(key, JSON.stringify(value));
  }, SENT_KEY);
  await page.reload();
  const sentAdvice = page.getByRole("region", { name: "ระหว่างรอทีม ควรทำอะไร" });
  await expect(sentAdvice.getByRole("link", { name: /199/ })).toHaveAttribute("href", "tel:199");
  await expect(sentAdvice).not.toContainText("หลีกเลี่ยงการเดินหรือขับรถผ่านน้ำท่วม");
  await page.goto(`/track/${sent.caseCode}?t=${sent.trackingToken}`);
  const trackedAdvice = page.getByRole("region", { name: "ระหว่างรอทีม ควรทำอะไร" });
  await expect(trackedAdvice.getByRole("link", { name: /199/ })).toBeVisible();
  await expect(trackedAdvice).not.toContainText("หลีกเลี่ยงการเดินหรือขับรถผ่านน้ำท่วม");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("TF-53 น้ำท่วมแสดงคำแนะนำและเบอร์ที่หน้าติดตาม", async ({ page, baseURL }) => {
  const sent = await createCaseViaApi(baseURL!);
  await page.goto(`/track/${sent.caseCode}?t=${sent.trackingToken}`);
  const advice = page.getByRole("region", { name: "ระหว่างรอทีม ควรทำอะไร" });
  await expect(advice).toContainText("หลีกเลี่ยงการเดินหรือขับรถผ่านน้ำท่วม");
  await expect(advice.getByRole("link", { name: /1784/ })).toHaveAttribute("href", "tel:1784");
});

test("TF-53 ส่งฟอร์มจริงแล้วดูคำแนะนำและหน้าส่งสำเร็จได้", async ({ page }) => {
  await openFreshSosForm(page);
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ TF-53");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  await page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" }).click();
  // TF-80: ส่งสำเร็จแล้วไปหน้ารหัสเคสใหญ่เอง
  await expectSentCase(page);
  await expect(
    page
      .getByRole("region", { name: "ระหว่างรอทีม ควรทำอะไร" })
      .getByRole("link", { name: /1784/ }),
  ).toBeVisible();
});
