import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test (TF-48) — เปิดเว็บจริงในเบราว์เซอร์แล้วกดแบบผู้ใช้
 * รัน: npm run e2e (ไม่เห็นจอ) · npm run e2e:headed (เห็นเบราว์เซอร์กด) · npm run e2e:ui (UI mode)
 *
 * ต้องเปิด Supabase ในเครื่องก่อน (npm run db:start) — test ใช้ฐานข้อมูลในเครื่องเท่านั้น
 * อ่านคีย์จาก .env.local แบบเดียวกับ npm run dev (ใน CI ส่งมาทาง env)
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // ไม่มีไฟล์ (เช่นใน CI) ใช้ env ที่มีอยู่แล้ว
}

const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // ฟอร์ม SOS เก็บร่างใน localStorage ของแต่ละ context อยู่แล้ว รันขนานกันได้
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // ไม่ลองซ้ำ: test ที่ผ่านบ้างไม่ผ่านบ้างคือบั๊ก ต้องแก้ ไม่ใช่ซ่อนด้วยการลองใหม่
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: `http://localhost:${PORT}`,
    // ใช้ Google Chrome ที่ติดตั้งในเครื่อง (และในเครื่อง CI ของ GitHub) ไม่ต้องโหลดเบราว์เซอร์เพิ่ม
    channel: "chrome",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "mobile",
      // ขนาดจอ/user agent ของ iPhone SE แต่รันบน Chromium (ไม่ได้ทดสอบ Safari จริง)
      use: { ...devices["iPhone SE (3rd gen)"], defaultBrowserType: "chromium", channel: "chrome" },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    // ในเครื่องถ้าเปิด npm run dev ค้างไว้แล้วใช้ตัวนั้นเลย
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
