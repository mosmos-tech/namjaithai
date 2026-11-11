import { readdir, readFile, writeFile } from "node:fs/promises";

const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
const template = await readFile("scripts/pwa/service-worker.js", "utf8");
const queue = (await readFile("src/features/sos/offline-queue-core.js", "utf8")).replaceAll(
  "export async function",
  "async function",
);
// TF-68: ฟอร์ม SOS วาดหลัง hydrate เสร็จ ไอคอนใน /brand จึงไม่อยู่ใน HTML ให้ service worker หาเจอ
// เก็บทุกไฟล์ใน public/brand ไว้ใช้ตอนออฟไลน์ (ไฟล์เล็ก รวมราว 100 KB)
const brandAssets = (await readdir("public/brand")).sort().map((name) => `/brand/${name}`);
await writeFile(
  "public/sw.js",
  queue +
    "\n" +
    template
      .replaceAll("__CACHE_VERSION__", JSON.stringify(buildId))
      .replaceAll("__BRAND_ASSETS__", JSON.stringify(brandAssets)),
);
