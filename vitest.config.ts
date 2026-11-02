import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ เป็น Playwright (npm run e2e) ไม่ใช่ unit test ของ Vitest
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
