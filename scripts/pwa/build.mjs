import { readFile, writeFile } from "node:fs/promises";

const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
const template = await readFile("scripts/pwa/service-worker.js", "utf8");
await writeFile("public/sw.js", template.replaceAll("__CACHE_VERSION__", JSON.stringify(buildId)));
