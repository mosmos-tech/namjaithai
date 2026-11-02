/* Build template; emitted to public/sw.js by scripts/pwa/build.mjs. */
/* global __CACHE_VERSION__, __STATIC_ASSETS__ */
const CACHE = "namjaithai-public-" + __CACHE_VERSION__;
const ASSETS = __STATIC_ASSETS__;
const PAGES = ["/", "/request", "/sos", "/hotlines", "/survival"];
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
      // Omit session cookies: cached HTML must never contain a signed-in account.
      for (const url of [...ASSETS, ...PUBLIC_ASSETS, ...PAGES]) {
        const response = await fetch(new Request(url, { credentials: "omit", cache: "reload" }));
        if (!response.ok || response.redirected) throw new Error("Offline cache unavailable");
        await cache.put(url, response);
      }
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
  if (ASSETS.includes(url.pathname) || PUBLIC_ASSETS.includes(url.pathname)) {
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
