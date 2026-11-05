import { test, expect, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";

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
  await expect(reopened.getByRole("checkbox", { name: "ไม่มีข้อใดเลย" })).toBeVisible();
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
  await reopened.getByRole("checkbox", { name: "ไม่มีข้อใดเลย" }).click();
  await reopened.getByRole("radio", { name: "ได้ ออกเองได้" }).click();
  await reopened.getByRole("button", { name: /^ถัดไป/ }).click();
  await expect
    .poll(() => reopened.evaluate(() => localStorage.getItem("namjaithai-sos-draft-v1")))
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
  await expect(reopened.getByRole("heading", { name: "เลือกประเภทเหตุ" })).toBeVisible();
  await reopened.getByRole("link", { name: /^น้ำท่วม/ }).click();
  await expect(reopened.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
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
  expect(urls).toEqual(expect.arrayContaining(["/request", "/hotlines", "/survival"]));
  expect(urls.some((url) => /\.(?:woff2?|ttf|otf)$/i.test(url))).toBe(false);
  expect(urls.some((url) => /^\/(api|auth|track|admin|unit|my-cases)(\/|$)/.test(url))).toBe(false);
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
