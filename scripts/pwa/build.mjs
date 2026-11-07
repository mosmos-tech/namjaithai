import { readFile, writeFile } from "node:fs/promises";

const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
const template = await readFile("scripts/pwa/service-worker.js", "utf8");
const queue = (await readFile("src/features/sos/offline-queue-core.js", "utf8")).replaceAll(
  "export async function",
  "async function",
);
await writeFile(
  "public/sw.js",
  queue + "\n" + template.replaceAll("__CACHE_VERSION__", JSON.stringify(buildId)),
);
