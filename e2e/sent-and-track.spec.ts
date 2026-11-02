import { test, expect, type Page } from "@playwright/test";
import { adminDb, createCaseViaApi, type CreatedCase } from "./helpers/db";

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

    test("ปุ่ม ติดตามสถานะเคส พาไปหน้าติดตามพร้อม token", async ({ page }) => {
      await page.getByRole("link", { name: "ติดตามสถานะเคส" }).click();
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

    test("ปุ่มกลับหน้าแรก", async ({ page }) => {
      await page.getByRole("link", { name: "กลับหน้าแรก" }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  });

  test("ติ๊กถูกเล่นแอนิเมชัน แต่ไม่เล่นเมื่อเครื่องตั้ง reduce motion (TF-13)", async ({
    page,
    baseURL,
  }) => {
    const sent = await createCaseViaApi(baseURL!);
    const animations = () =>
      page.evaluate(() => document.getAnimations().filter((a) => a.playState !== "idle").length);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await rememberSent(page, sent);
    expect(await animations(), "ปกติต้องมีแอนิเมชันติ๊กถูก").toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.getByText(sent.caseCode, { exact: true })).toBeVisible();
    expect(await animations(), "ตั้ง reduce motion แล้วต้องไม่มีแอนิเมชัน").toBe(0);
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
    await expect(page.getByText(/^ระหว่างรอ: ขึ้นที่สูง/)).toBeVisible();
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
    await db
      .from("cases")
      .update({
        status: "EN_ROUTE",
        assigned_unit_id: unit!.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("case_code", c.caseCode);

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
