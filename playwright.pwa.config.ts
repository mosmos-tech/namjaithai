import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI provides env. */
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/pwa",
  testMatch: "pwa.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 2,
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    locale: "th-TH",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["iPhone SE (3rd gen)"], defaultBrowserType: "chromium", channel: "chrome" },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
