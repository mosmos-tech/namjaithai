import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // e2e/ เป็น Playwright (npm run e2e) ไม่ใช่ unit test ของ Vitest
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
