import { test, expect } from "@playwright/test";

test("TF-46 สรุปตัวเลขตามจังหวัดและแสดงข้อมูลไม่พร้อมเมื่อออฟไลน์", async ({
  page,
  context,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("namjaithai-onboarding-seen-v1", "true"));
  await page.route("**/api/situation-summary", async (route) =>
    route.fulfill({
      json: {
        generatedAt: new Date().toISOString(),
        types: [
          { code: "FLOOD", enabled: true },
          { code: "FIRE", enabled: false },
        ],
        provinces: [
          {
            name: "กรุงเทพมหานคร",
            teams: 2,
            waiting: 3,
            rescued: 4,
            incidents: [{ code: "FLOOD", label: "น้ำท่วม", waiting: 3 }],
          },
          {
            name: "นครปฐม",
            teams: 5,
            waiting: 6,
            rescued: 7,
            incidents: [{ code: "FIRE", label: "ไฟไหม้", waiting: 6 }],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const board = page.getByRole("region", { name: "● สถานการณ์ตอนนี้" });
  await expect(board).toContainText("ทีมกู้ภัยออนไลน์");
  await expect(board).toContainText("3");
  await page.getByLabel("เลือกจังหวัด").selectOption("นครปฐม");
  await expect(board).toContainText("ไฟไหม้");
  await expect(board).toContainText("6");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("home.png"), fullPage: true });
  await context.setOffline(true);
  await expect(board).toContainText("ไม่มีข้อมูลล่าสุด");
});

test("TF-46 / TF-66 ปุ่ม SOS เปิดฟอร์มที่ขั้นเลือกประเภท และไม่เปิดเหตุที่ยังไม่รองรับ", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("namjaithai-onboarding-seen-v1", "true"));
  await page.goto("/");
  await page
    .getByRole("link", { name: /แจ้งขอความช่วยเหลือ/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/request$/);
  await expect(page.getByRole("heading", { name: "เกิดเหตุอะไรขึ้น?" })).toBeVisible();
  const grid = page.getByTestId("incident-type-grid");
  await expect(grid.getByRole("radio", { name: "น้ำท่วม" })).toBeVisible();
  // อาคารถล่มยังปิดรับแจ้ง (TF-53) ไม่มีในกริด
  await expect(grid.getByRole("radio", { name: "อาคารถล่ม / ติดใต้ซาก" })).toHaveCount(0);
});

test("TF-66 ลิงก์เก่า /incidents พาไปฟอร์มแจ้งเหตุ", async ({ page }) => {
  await page.goto("/incidents");
  await expect(page).toHaveURL(/\/request$/);
  await expect(page.getByRole("heading", { name: "เกิดเหตุอะไรขึ้น?" })).toBeVisible();
});

test("TF-46 API ส่งเฉพาะข้อมูลสรุปและเก็บแคช 30 วินาที", async ({ request }) => {
  const first = await request.get("/api/situation-summary");
  expect(first.status()).toBe(200);
  expect(first.headers()["cache-control"]).toContain("s-maxage=30");
  const data = await first.json();
  expect(data.provinces.length).toBeGreaterThan(0);
  expect(data.provinces[0]).toEqual(
    expect.objectContaining({
      name: expect.any(String),
      teams: expect.any(Number),
      waiting: expect.any(Number),
      rescued: expect.any(Number),
      incidents: expect.any(Array),
    }),
  );
  expect(Object.keys(data.provinces[0]).sort()).toEqual([
    "incidents",
    "name",
    "rescued",
    "teams",
    "waiting",
  ]);
  const second = await request.get("/api/situation-summary");
  expect((await second.json()).generatedAt).toBe(data.generatedAt);
});

test("TF-46 / TF-66 เลือกน้ำท่วมได้เมื่อโหลดสถานะไม่สำเร็จ", async ({ page }) => {
  await page.route(/\/rest\/v1\/incident_types/, (route) => route.abort());
  await page.goto("/request");
  const grid = page.getByTestId("incident-type-grid");
  await expect(grid.getByRole("radio", { name: "น้ำท่วม" })).toBeVisible();
  await expect(page.getByTestId("incident-fallback-hotlines")).toBeVisible({ timeout: 10_000 });
  await grid.getByRole("radio", { name: "น้ำท่วม" }).click();
  await page
    .getByRole("button", { name: /^ถัดไป/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByText("ขั้นที่ 2 จาก 5")).toBeVisible();
});

test("TF-46 / TF-66 เคารพสถานะปิดรับจากเซิร์ฟเวอร์เมื่อออนไลน์", async ({ page }) => {
  // แอดมินปิดทุกประเภท (รวมน้ำท่วม): ไม่มีให้เลือก ไปต่อไม่ได้ และแนะนำโทรสายด่วน
  await page.route(/\/rest\/v1\/incident_types/, (route) => route.fulfill({ json: [] }));
  await page.goto("/request");
  const grid = page.getByTestId("incident-type-grid");
  await expect(page.getByTestId("incident-fallback-hotlines")).toBeVisible();
  await expect(grid.getByRole("radio")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^ถัดไป/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "กรุณาเลือกประเภทเหตุ" })).toBeVisible();
  await expect(page.getByText("ขั้นที่ 1 จาก 5")).toBeVisible();
});
