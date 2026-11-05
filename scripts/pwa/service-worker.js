/* Build template; emitted to public/sw.js by scripts/pwa/build.mjs. */
/* global __CACHE_VERSION__ */
const CACHE = "namjaithai-public-" + __CACHE_VERSION__;

const PAGES = ["/", "/incidents", "/request", "/sos", "/hotlines", "/survival"];
const PUBLIC_ASSETS = [
  "/favicon.ico",
  "/manifest.webmanifest",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const downloads = new Map();
      function download(url) {
        if (!downloads.has(url)) {
          downloads.set(
            url,
            (async () => {
              const response = await fetch(
                new Request(url, { credentials: "omit", cache: "reload" }),
              );
              if (!response.ok || response.redirected)
                throw new Error("Offline cache unavailable: " + url);
              await cache.put(url, response.clone());
              return response;
            })(),
          );
        }
        return downloads.get(url);
      }

      const pages = await Promise.all(PAGES.map(async (url) => (await download(url)).text()));
      const assets = new Set();
      for (const html of pages) {
        for (const match of html.matchAll(/(?:src|href)="(\/(?:_next\/static|brand)\/[^"?#]+)"/g)) {
          assets.add(match[1]);
        }
      }
      await Promise.all(
        [...assets].map(async (url) => {
          const response = await download(url);
          if (!url.endsWith(".css")) return;
          const css = await response.text();
          await Promise.all(
            [...css.matchAll(/url\(["']?(\/_next\/static\/media\/[^)"'\s]+)["']?\)/g)]
              // The offline pages can use fallback fonts without downloading every variant.
              .filter((match) => !/\.(?:woff2?|ttf|otf)$/i.test(match[1]))
              .map((match) => download(match[1]).catch(() => undefined)),
          );
        }),
      );
      await Promise.all(PUBLIC_ASSETS.map((url) => download(url).catch(() => undefined)));

      // Do not force an update over open tabs: their JS must match their cached build.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("namjaithai-public-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never cache API responses, auth routes, tracking tokens, or authenticated pages.
  if (/^\/(?:_next\/static|brand)\//.test(url.pathname) || PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () =>
        (await caches.open(CACHE))
          .match(url.pathname)
          .then((cached) => cached || fetch(request)))(),
    );
    return;
  }
  if (request.mode === "navigate" && PAGES.includes(url.pathname) && !url.search) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await (await caches.open(CACHE)).match(url.pathname);
          return cached || Response.error();
        }
      })(),
    );
  }
  // RSC fetches remain network-only. Next falls back to a full navigation when
  // these fail offline, which uses the matching cached HTML above.
});
