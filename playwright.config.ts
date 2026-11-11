import { spawnSync } from "node:child_process";
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

// TF-36: ค่าทดสอบของ SMS gateway ให้ dev server ที่ playwright เปิดเอง (ไม่มี API key = ไม่ส่ง SMS จริง)
process.env.HTTPSMS_WEBHOOK_SIGNING_KEY ||= "e2e-tf36-signing-key-not-secret";

const PORT = 3000;

// TF-68: ห้ามรัน E2E ตอนเปิด npm run dev ค้างไว้ — server ที่เปิดเองไม่มีค่าทดสอบของ SMS (TF-36)
// และอาจใช้ .env.local คนละชุด ทำให้ test ล้มแบบไม่เกี่ยวกับโค้ด จึงหยุดตั้งแต่แรกพร้อมบอกวิธีแก้
// เช็กครั้งเดียวในโปรเซสหลัก (worker โหลด config ซ้ำตอนที่ server ของ test เปิดอยู่แล้ว)
function portInUse(port: number): boolean {
  const probe = spawnSync(process.execPath, [
    "-e",
    `const s=require("node:net").connect(${port},"127.0.0.1");` +
      `s.on("connect",()=>process.exit(0));s.on("error",()=>process.exit(1));` +
      `setTimeout(()=>process.exit(1),1000);`,
  ]);
  return probe.status === 0;
}
if (!process.env.TEST_WORKER_INDEX && !process.env.E2E_PORT_CHECKED) {
  if (portInUse(PORT)) {
    throw new Error(
      `พอร์ต ${PORT} ถูกใช้อยู่ (น่าจะเปิด npm run dev ค้างไว้) — ปิดก่อนแล้วรัน E2E ใหม่ ` +
        `Playwright จะเปิด dev server ที่มีค่าทดสอบครบเอง (macOS/Linux: lsof -ti:${PORT} | xargs kill)`,
    );
  }
  process.env.E2E_PORT_CHECKED = "1";
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "pwa.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
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
    // TF-68: ไม่ใช้ server ที่เปิดค้างไว้ (เช็กพอร์ตด้านบนแล้ว) — ทุกรอบใช้ server ที่มีค่าทดสอบครบ
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
