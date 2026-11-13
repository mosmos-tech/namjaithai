import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { saveEvidence } from "./helpers/evidence";
import { gzipSync } from "node:zlib";
import { goToStep5 } from "./helpers/sos";
import { adminDb, closeTestCases, randomPhone } from "./helpers/db";

async function offlineReady(page: Page) {
  await page.goto("/");
  await page.getByTestId("onboarding-skip").click();
  await expect(page.getByRole("status").filter({ hasText: "พร้อมเปิดฟอร์ม SOS" })).toBeVisible({
    timeout: 60_000,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
  });
}

test("เปิดครั้งแรกแล้วปิดเน็ต ยังเปิดฟอร์ม SOS สายด่วน คู่มือได้", async ({ page, context }) => {
  await offlineReady(page);
  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto("/request");
  // TF-66: ขั้น 1 เลือกประเภทเหตุ (ใช้รายการที่จำไว้ในเครื่องตอนออนไลน์)
  await expect(reopened.getByRole("radio", { name: "น้ำท่วม" })).toBeVisible();
  await expect
    .poll(() =>
      reopened
        .locator('img[src^="/brand/"]')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await reopened.screenshot({ path: test.info().outputPath("offline-sos.png"), fullPage: true });
  const next = reopened.getByRole("button", { name: /^ถัดไป/ }).filter({ visible: true });
  await next.click();
  await expect(reopened.getByText("ขั้นที่ 2 จาก 5")).toBeVisible();
  await reopened.getByRole("checkbox", { name: "ไม่มีข้อใดเลย" }).click();
  await reopened.getByRole("radio", { name: "ได้ ออกเองได้" }).click();
  await next.click();
  await expect
    .poll(() => reopened.evaluate(() => localStorage.getItem("namjaithai-sos-draft-v2")))
    .not.toBeNull();
  await reopened.reload();
  await expect(reopened.getByRole("heading", { name: "คุณอยู่ที่ไหน?" })).toBeVisible();
  await expect(reopened.getByText(/แผนที่ต้องใช้อินเทอร์เน็ต/)).toBeVisible();
  await reopened.goto("/");
  const openMenu = reopened.getByRole("button", { name: "เปิดเมนู" });
  if (await openMenu.isVisible()) await openMenu.click();
  await reopened.getByRole("link", { name: "เบอร์สายด่วน", exact: true }).click();
  await expect(reopened.getByRole("heading", { name: "เบอร์สายด่วนฉุกเฉิน" })).toBeVisible();
  await expect(reopened.getByRole("link", { name: /1669/ }).first()).toHaveAttribute(
    "href",
    "tel:1669",
  );
  await reopened.goto("/survival");
  await expect(reopened.getByRole("heading", { level: 1 })).toBeVisible();
  const checkbox = reopened.getByRole("checkbox").first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await reopened.screenshot({ path: test.info().outputPath("offline-guide.png"), fullPage: true });
  expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test("TF-63 หน้าภาษาอังกฤษ /en/request และ /en/hotlines เปิดได้ตอนออฟไลน์", async ({
  page,
  context,
}) => {
  await offlineReady(page);
  await context.setOffline(true);
  const form = await context.newPage();
  await form.goto("/en/request");
  await expect(form.getByText("Step 1 of 5")).toBeVisible();
  await expect(form.getByRole("radio", { name: "Flood" })).toBeVisible();
  // แถบโทรของหน้าอังกฤษเป็นลิงก์ tel: ธรรมดา ใช้ได้แม้ออฟไลน์
  await expect(form.locator('a[href="tel:1669"]:visible').first()).toBeVisible();
  const hotlines = await context.newPage();
  await hotlines.goto("/en/hotlines");
  await expect(
    hotlines.getByRole("heading", { name: "Emergency hotlines in Thailand" }),
  ).toBeVisible();
  await expect(hotlines.getByTestId("hotline-1155")).toContainText("Tourist Police");
  await expect(hotlines.getByRole("link", { name: "Call 1155" })).toHaveAttribute(
    "href",
    "tel:1155",
  );
});

test("TF-46 เปิดหน้าแรกและเลือก SOS ขณะออฟไลน์", async ({ page, context }) => {
  await offlineReady(page);
  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.getByText("ไม่มีข้อมูลล่าสุด")).toBeVisible();
  await reopened
    .getByRole("link", { name: /แจ้งขอความช่วยเหลือ/ })
    .last()
    .click();
  // TF-66: ปุ่ม SOS เปิดฟอร์มตรงๆ เลือกประเภทเหตุในขั้นที่ 1
  await expect(reopened.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
  await expect(reopened.getByRole("radio", { name: "น้ำท่วม" })).toBeVisible();
});

test("ไม่แคชข้อมูลบัญชี เคส หรือ API", async ({ page }) => {
  await offlineReady(page);
  await page.evaluate(async () => {
    await fetch("/api/track/FL-2611-0000?t=" + "a".repeat(32));
  });
  const urls = await page.evaluate(async () => {
    const result: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      result.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
    }
    return result;
  });
  expect(urls).toEqual(
    expect.arrayContaining(["/request", "/hotlines", "/survival", "/en/request", "/en/hotlines"]),
  );
  expect(urls.some((url) => /\.(?:woff2?|ttf|otf)$/i.test(url))).toBe(false);
  expect(urls.some((url) => /^(\/en)?\/(api|auth|track|admin|unit|my-cases)(\/|$)/.test(url))).toBe(
    false,
  );
});

test("Android กดติดตั้งได้ และการปิดแถบจำไว้ครบ 7 วัน", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByTestId("onboarding-skip").click();
  const prompt = async () => {
    await expect(page.getByRole("status").filter({ hasText: "พร้อมเปิดฟอร์ม SOS" })).toBeVisible({
      timeout: 60_000,
    });
    return page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          document.documentElement.dataset.prompted = "yes";
        },
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });
  };
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await prompt();
  await page.getByRole("button", { name: "เพิ่มหน้าจอหลัก", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-prompted", "yes");
  await expect(page.getByRole("complementary", { name: "เพิ่มลงหน้าจอหลัก" })).toHaveCount(0);
  await page.reload();
  await prompt();
  await expect(page.getByRole("complementary", { name: "เพิ่มลงหน้าจอหลัก" })).toHaveCount(0);
  await page.evaluate(() =>
    localStorage.setItem("namjaithai:pwa-dismissed-at", String(Date.now() - 7 * 86400000 - 1)),
  );
  await page.reload();
  await prompt();
  await expect(page.getByRole("button", { name: "เพิ่มหน้าจอหลัก", exact: true })).toBeVisible();
  await context.close();
});

test("iPhone มีคำแนะนำแชร์ เพิ่มไปยังหน้าจอโฮม และปิดแถบได้", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByTestId("onboarding-skip").click();
  await page.getByRole("button", { name: "ดูวิธีเพิ่ม" }).click();
  await expect(page.getByRole("img", { name: /^ภาพปุ่มแชร์/ })).toBeVisible();
  await expect(page.getByText(/กดปุ่มแชร์.*เพิ่มไปยังหน้าจอโฮม/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "ปิดคำแนะนำเพิ่มหน้าจอหลัก" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "ดูวิธีเพิ่ม" })).toHaveCount(0);
  await context.close();
});

test("manifest มีไอคอนและเปิดแบบ standalone พร้อม apple touch icon", async ({ page }) => {
  await page.goto("/");
  const manifestLink = page.locator('link[rel="manifest"]');
  const url = await manifestLink.getAttribute("href");
  const response = await page.request.get(url!);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status()).toBe(200);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/pwa/apple-touch-icon.png",
  );
});

test("วัดขนาดหน้าแรกแบบ cold load รวมฟอนต์และรูป", async ({ page }) => {
  const sizes: Promise<{ type: string; bytes: number }>[] = [];
  page.on("response", (response) => {
    const type = response.request().resourceType();
    if (!["document", "script", "stylesheet", "font", "image"].includes(type)) return;
    sizes.push(
      response.body().then((body) => ({
        type,
        bytes:
          type === "font" || (type === "image" && !response.url().endsWith(".svg"))
            ? body.length
            : gzipSync(body).length,
      })),
    );
  });
  await page.goto("/", { waitUntil: "load" });
  await expect(page.getByTestId("onboarding-popup")).toBeVisible();
  await page
    .locator("img:visible")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())).then(
        () => undefined,
      ),
    );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const totals: Record<string, number> = {};
  for (const { type, bytes } of await Promise.all(sizes)) {
    totals[type] = (totals[type] ?? 0) + bytes;
  }
  const compressed = Object.values(totals).reduce((total, bytes) => total + bytes, 0);
  console.log(`Initial load: ${compressed} bytes`, totals);
  expect(compressed).toBeLessThanOrEqual(150_000);
});

test("TF-15 เก็บคำขอออฟไลน์และส่งรหัสเดิมเมื่อกลับมาออนไลน์", async ({
  page,
  context,
  isMobile,
}) => {
  await offlineReady(page);
  await page.goto("/request");
  await page.getByRole("radio", { name: "อยู่ที่จุดเกิดเหตุ", exact: true }).click();
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ผู้ทดสอบ ออฟไลน์");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill("0812345678");
  await context.setOffline(true);
  await page.getByTestId("step5-submit-button").click();
  await expect(page.getByTestId("step5-missing-alert")).toContainText("ความยินยอม");
  await expect(page.getByRole("button", { name: /มี 1 คำขอรอส่ง/ })).toHaveCount(0);
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  await page.getByTestId("step5-submit-button").click();
  await expect(
    page.getByRole("heading", { name: /บันทึกไว้ในเครื่องแล้ว — ยังไม่ถึงทีมกู้ภัย/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /มี 1 คำขอรอส่ง/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "โทร 1669" })).toHaveAttribute("href", "tel:1669");
  await expect(page.getByRole("link", { name: "โทร 1784" })).toHaveAttribute("href", "tel:1784");
  // TF-36: มีเบอร์ gateway = ข้อความรูปแบบที่ระบบอ่านได้ ส่งถึงเบอร์ gateway
  const gateway = process.env.NEXT_PUBLIC_SMS_GATEWAY_NUMBER?.trim();
  await expect(page.getByRole("link", { name: "ส่งทาง SMS" })).toHaveAttribute(
    "href",
    gateway ? new RegExp(`^sms:${gateway}\\?body=SOS%20FLOOD%20`) : /^sms:/,
  );
  if (isMobile) await expect(page.getByText("เปิดหน้านี้ค้างไว้จนกว่าจะส่งสำเร็จ")).toBeVisible();
  const queued = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("namjaithai-offline-sos");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return await new Promise<{ id: string }>((resolve, reject) => {
      const req = db.transaction("queue").objectStore("queue").get("current");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
  expect(queued.id).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: /บันทึกไว้ในเครื่องแล้ว/ })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /มี 1 คำขอรอส่ง/ })).toBeVisible();
  await page.getByRole("link", { name: /มี 1 คำขอรอส่ง/ }).click();
  await expect(page.getByRole("heading", { name: /บันทึกไว้ในเครื่องแล้ว/ })).toBeVisible();
  let requests = 0;
  const keys: string[] = [];
  await context.route("**/api/cases", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ consent: true, healthConsent: true });
    keys.push(route.request().headers()["idempotency-key"]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ caseCode: "FL-TEST-1234", trackingToken: "a".repeat(32) }),
    });
  });
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "ส่งถึงระบบแล้ว รอทีมกู้ภัยรับเคส" })).toBeVisible(
    { timeout: 30000 },
  );
  await expect(page.getByText("FL-TEST-1234")).toBeVisible();
  expect(requests).toBe(1);
  expect(keys).toEqual([queued.id]);
  await expect(page.getByRole("button", { name: /มี 1 คำขอรอส่ง/ })).toHaveCount(0);
  await page.getByRole("link", { name: "ดูรายละเอียดและติดตามเคส" }).click();
  await expect(page).toHaveURL(/\/sos\/sent$/);
  await expect(page.getByText("FL-TEST-1234")).toBeVisible();
  const remaining = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("namjaithai-offline-sos");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("queue").objectStore("queue").get("current");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  });
  expect(remaining).toBeNull();
});

test("TF-15 ไม่ลบคำขอเมื่อเซิร์ฟเวอร์แจ้งข้อขัดแย้ง", async ({ page }) => {
  await page.goto("/request");
  let attempts = 0;
  await page.route("**/api/cases", async (route) => {
    attempts++;
    const status = attempts === 1 ? 409 : 201;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(
        status === 409
          ? { error: "พบเคสที่อาจซ้ำ" }
          : { caseCode: "FL-TEST-5678", trackingToken: "b".repeat(32) },
      ),
    });
  });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("namjaithai-offline-sos", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("queue");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").put(
        {
          id: "conflict-key",
          body: JSON.stringify({ phone: "0812345678" }),
          status: "pending",
          lastAttempt: new Date().toISOString(),
          lease: 0,
        },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    window.dispatchEvent(new Event("sos-queued"));
  });
  await expect(page.getByRole("alert").filter({ hasText: "พบเคสที่อาจซ้ำ" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ส่งคำขอไม่สำเร็จ/ })).toBeVisible();
  expect(attempts).toBe(1);
  await page.getByRole("button", { name: "ลองส่งอีกครั้ง" }).click();
  await expect(
    page.getByRole("heading", { name: "ส่งถึงระบบแล้ว รอทีมกู้ภัยรับเคส" }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

test("TF-66 ส่งคิวซ้ำแล้วเซิร์ฟเวอร์ตอบ 4xx ไม่หายเงียบ: ขึ้นหน้าส่งไม่สำเร็จพร้อมปุ่มโทรและ SMS", async ({
  page,
}) => {
  await page.goto("/request");
  // ประเภทเหตุถูกแอดมินปิดระหว่างที่คำขอรออยู่ในเครื่อง
  await page.route("**/api/cases", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "ประเภทเหตุนี้ปิดรับแจ้งชั่วคราว" }),
    }),
  );
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("namjaithai-offline-sos", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("queue");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").put(
        {
          id: "blocked-key",
          body: JSON.stringify({
            phone: "0812345678",
            incidentType: "FIRE",
            lat: 13.75,
            lng: 100.5,
            landmark: "หน้าวัด",
          }),
          status: "pending",
          lastAttempt: new Date().toISOString(),
          lease: 0,
        },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
  // ส่งจากเบื้องหลังตามรอบปกติ (ไม่ได้กดเอง) — หน้าส่งไม่สำเร็จต้องเปิดขึ้นเอง
  await page.reload();
  // รีโหลดอาจขัดจังหวะการส่งที่เริ่มก่อนหน้า ต้องเผื่อ lease 20 วินาทีและรอบตรวจซ้ำ 10 วินาที
  await expect(
    page.getByRole("heading", { name: "ส่งคำขอไม่สำเร็จ — ยังไม่ถึงทีมกู้ภัย" }),
  ).toBeVisible({ timeout: 35_000 });
  await expect(
    page.getByRole("alert").filter({ hasText: "ประเภทเหตุนี้ปิดรับแจ้งชั่วคราว" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "โทร 1669" })).toHaveAttribute("href", "tel:1669");
  await expect(page.getByRole("link", { name: "โทร 1784" })).toHaveAttribute("href", "tel:1784");
  await expect(page.getByRole("link", { name: "ส่งทาง SMS" })).toHaveAttribute("href", /^sms:/);
  // ไม่บอกว่า "ระบบจะลองส่งเอง" เพราะเซิร์ฟเวอร์ปฏิเสธถาวร
  await expect(page.getByText("ระบบจะลองส่งเมื่อกลับมาออนไลน์")).toHaveCount(0);

  // ลบคำขอเพื่อกรอกใหม่ได้ คิวในเครื่องว่าง
  await page.getByRole("button", { name: "ลบคำขอนี้แล้วกรอกใหม่" }).click();
  await expect(page.getByRole("button", { name: /ส่งคำขอไม่สำเร็จ/ })).toHaveCount(0);
  const remaining = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("namjaithai-offline-sos");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve) => {
      const read = db.transaction("queue").objectStore("queue").get("current");
      read.onsuccess = () => resolve(read.result ?? null);
    });
  });
  expect(remaining).toBeNull();
});

test("TF-15 service worker ส่งคิวเมื่อแท็บปิดแล้วและเครือข่ายกลับมา", async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "ตรวจ Background Sync ผ่าน Chromium แบบเดสก์ท็อป");
  await offlineReady(page);
  const supported = await page.evaluate(
    async () => "sync" in (await navigator.serviceWorker.ready),
  );
  test.skip(!supported, "เบราว์เซอร์นี้ไม่มี Background Sync");
  await context.setOffline(true);
  await context.route("**/api/cases", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ caseCode: "FL-BACKGROUND", trackingToken: "c".repeat(32) }),
    });
  });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("namjaithai-offline-sos", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("queue");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").put(
        {
          id: "background-key",
          body: JSON.stringify({ phone: "0812345678" }),
          status: "pending",
          lastAttempt: new Date().toISOString(),
          lease: 0,
        },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync: { register(tag: string): Promise<void> };
    };
    await registration.sync.register("namjaithai-sos-queue");
  });
  const workerRequest = context.waitForEvent("request", {
    predicate: (request) => request.url().endsWith("/api/cases") && !!request.serviceWorker(),
    timeout: 30000,
  });
  await page.close();
  await context.setOffline(false);
  const request = await workerRequest;
  expect(request.headers()["idempotency-key"]).toBe("background-key");
  const reopened = await context.newPage();
  await reopened.goto("/request");
  await expect(
    reopened.getByRole("heading", { name: "ส่งถึงระบบแล้ว รอทีมกู้ภัยรับเคส" }),
  ).toBeVisible();
});

test("TF-24 คำขอถึงระบบแต่รูปยังไม่ส่ง แจ้งสถานะจริงและลองส่งรูปซ้ำ", async ({ page, context }) => {
  let succeed = false;
  await context.route("**/api/cases", async (route) => {
    await route.fulfill({
      status: succeed ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify({
        caseCode: "FL-TEST-PHOTO",
        trackingToken: "a".repeat(32),
        ...(succeed ? {} : { photosPending: true, error: "ส่งรูปยังไม่สำเร็จ" }),
      }),
    });
  });
  await page.goto("/request");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("namjaithai-offline-sos", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("queue");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").put(
        {
          id: "photo-retry-key",
          body: JSON.stringify({ phone: "0812345678", photos: ["test"] }),
          status: "pending",
          lastAttempt: new Date().toISOString(),
          lease: 0,
        },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    window.dispatchEvent(new Event("sos-queued"));
  });
  await expect(
    page.getByRole("heading", { name: "ส่งคำขอถึงระบบแล้ว — กำลังส่งรูป" }),
  ).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "ส่งรูปยังไม่สำเร็จ" })).toBeVisible();
  succeed = true;
  await page.getByRole("button", { name: "ลองส่งอีกครั้ง" }).click();
  await expect(
    page.getByRole("heading", { name: "ส่งถึงระบบแล้ว รอทีมกู้ภัยรับเคส" }),
  ).toBeVisible();
});

test("TF-15 ส่งคิวที่ยินยอมแล้วเข้า API จริงเพียงหนึ่งเคส", async ({ page, context }) => {
  const db = adminDb(); // ป้องกันไม่ให้ใช้ฐานที่ไม่ใช่ localhost
  const phone = randomPhone();
  await context.route("**/api/cases", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-forwarded-for": `10.71.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      },
    });
  });
  await offlineReady(page);
  await page.goto("/request");
  await page.getByRole("radio", { name: "อยู่ที่จุดเกิดเหตุ", exact: true }).click();
  await goToStep5(page);
  await page.evaluate(() => {
    // TF-39: ต้องเป็น key ปัจจุบัน (v2) — เดิมเขียนลง v1 ที่ฟอร์มไม่อ่านแล้ว พิกัดสุ่มจึงไม่ถูกใช้
    // ทุกรอบส่งที่จุดเดิม รอบที่สองชนการตรวจเคสซ้ำ ("พบเคสที่ยังเปิดอยู่ใกล้ตำแหน่งของคุณ") รันซ้ำไม่ได้
    const key = "namjaithai-sos-draft-v2";
    const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
    draft.lat = 14 + Math.random() * 0.4;
    draft.lng = 100 + Math.random() * 0.4;
    localStorage.setItem(key, JSON.stringify(draft));
    window.dispatchEvent(new Event("storage"));
  });
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ คิวออฟไลน์");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(phone);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 8, 8);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "offline.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(page.getByRole("button", { name: /^ลบรูป offline\./ })).toBeVisible();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  await context.setOffline(true);
  await page.getByTestId("step5-submit-button").click();
  await expect(page.getByRole("heading", { name: /บันทึกไว้ในเครื่องแล้ว/ })).toBeVisible();
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("namjaithai-offline-sos");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return await new Promise<string>((resolve, reject) => {
      const req = db.transaction("queue").objectStore("queue").get("current");
      req.onsuccess = () => resolve(req.result.id);
      req.onerror = () => reject(req.error);
    });
  });
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "ส่งถึงระบบแล้ว รอทีมกู้ภัยรับเคส" })).toBeVisible(
    { timeout: 30000 },
  );
  await saveEvidence(page, "5-offline-queue-sent", test.info());
  const result = await db
    .from("cases")
    .select("id,case_code,consent_version,consented_at,health_consented_at")
    .eq("idempotency_key", id);
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(1);
  expect(result.data![0]).toMatchObject({ consent_version: "2026-11-06" });
  expect(result.data![0].consented_at).toBeTruthy();
  expect(result.data![0].health_consented_at).toBeTruthy();
  const media = await db
    .from("case_media")
    .select("storage_path")
    .eq("case_id", result.data![0].id);
  expect(media.data).toHaveLength(1);
  const stored = await db.storage.from("case-media").download(media.data![0].storage_path);
  expect(stored.error).toBeNull();
  await expect(page.getByText(result.data![0].case_code)).toBeVisible();
  await closeTestCases([result.data![0].id]);
});

// TF-80: ส่งสำเร็จแล้วเน็ตหลุดพอดีก่อนเปลี่ยนไปหน้ารหัสเคส — ผู้แจ้งต้องเห็นรหัสเคสเสมอ ไม่เห็นหน้า error
async function submitThenGoOffline(page: Page, context: BrowserContext) {
  await page.goto("/request");
  await page.evaluate(() => localStorage.removeItem("namjaithai-sos-draft-v2"));
  await page.reload();
  await expect(page.getByTestId("hydration-pending")).toHaveCount(0);
  await goToStep5(page);
  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ เน็ตหลุดหลังส่ง");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  let caseCode = "";
  await page.route("**/api/cases", async (route) => {
    // ส่งถึงเซิร์ฟเวอร์จริง แล้วตัดเน็ตก่อนคำตอบกลับมาถึงหน้าเว็บ
    const response = await route.fetch({
      headers: {
        ...route.request().headers(),
        "x-forwarded-for": `10.80.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      },
    });
    caseCode = ((await response.json()) as { caseCode: string }).caseCode;
    await context.setOffline(true);
    await route.fulfill({ response });
  });
  await page.getByTestId("step5-submit-button").click();
  await expect.poll(() => caseCode).toMatch(/^FL-/);
  return caseCode;
}

test("TF-80 ส่งสำเร็จแล้วเน็ตหลุดก่อนเปลี่ยนหน้า: เปิดหน้ารหัสเคสจากแคชได้", async ({
  page,
  context,
}) => {
  await offlineReady(page);
  const caseCode = await submitThenGoOffline(page, context);
  await expect(page).toHaveURL(/\/sos\/sent$/);
  await expect(page.getByTestId("sent-case-code")).toHaveText(caseCode);
  await expect(page.getByText("จดรหัสนี้ไว้ หรือแคปหน้าจอเก็บไว้")).toBeVisible();
  await context.setOffline(false);
  await closeCaseByCode(caseCode);
});

test("TF-80 ส่งสำเร็จแล้วเน็ตหลุดและไม่มีแคช: แสดงรหัสเคสใหญ่บนหน้าฟอร์มแทน", async ({
  browser,
}) => {
  // ไม่มี service worker (เช่น เปิดเว็บครั้งแรกแล้วส่งเลย) — ไปหน้า /sos/sent ไม่ได้
  const context = await browser.newContext({
    ...test.info().project.use,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const caseCode = await submitThenGoOffline(page, context);
  await expect(page.getByTestId("sent-case-code")).toHaveText(caseCode);
  await expect(page).toHaveURL(/\/request$/);
  await expect(page.getByText("จดรหัสนี้ไว้ หรือแคปหน้าจอเก็บไว้")).toBeVisible();
  await context.setOffline(false);
  await closeCaseByCode(caseCode);
  await context.close();
});

async function closeCaseByCode(caseCode: string) {
  const { data } = await adminDb().from("cases").select("id").eq("case_code", caseCode).single();
  if (data) await closeTestCases([data.id]);
}
