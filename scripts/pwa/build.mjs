import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Build-derived hashes keep the shell and its immutable Next assets in one cache version.
const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
const files = await readdir(".next/static", { recursive: true });
const assets = files
  .filter((file) => /\.(?:js|css|woff2?|ttf|otf)$/.test(file))
  .map((file) => "/_next/static/" + file.split(path.sep).join("/"));
const brandFiles = await readdir("public/brand");
assets.push(
  ...brandFiles.filter((file) => /\.(?:svg|png|webp)$/.test(file)).map((file) => "/brand/" + file),
);
const template = await readFile("scripts/pwa/service-worker.js", "utf8");
await writeFile(
  "public/sw.js",
  template
    .replace("/* global __CACHE_VERSION__, __STATIC_ASSETS__ */", "")
    .replaceAll("__CACHE_VERSION__", JSON.stringify(buildId))
    .replaceAll("__STATIC_ASSETS__", JSON.stringify(assets)),
);
console.log(`PWA: generated service worker for ${assets.length} static assets`);
