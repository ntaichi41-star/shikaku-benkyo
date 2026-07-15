/* ============================================================================
   Service Worker — Issue 7 (PWA)
   キャッシュファースト＋バックグラウンド更新（stale-while-revalidate）。
   GitHub Pagesのサブパス配信を想定し、パスはすべて相対にすること。
   ============================================================================ */
"use strict";

const CACHE_VERSION = "v1";
const CACHE_NAME = "shikaku-cache-" + CACHE_VERSION;

// SW自身の場所（scope）を起点に相対解決するので、サブパス配信でも壊れない
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./data/minpo.json",
  "./data/gyosei.json",
  "./data/takken.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 1件失敗しても他をブロックしないよう個別にaddする
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[sw] precache failed:", url, err);
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("shikaku-cache-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET以外・他オリジンへのリクエストはSWを介さずそのまま
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

// キャッシュファースト＋裏で更新（stale-while-revalidate）
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // キャッシュがあれば即返す。更新はバックグラウンドで進める
    event_noop(networkFetch);
    return cached;
  }

  // キャッシュが無ければネットワークを待つ。オフラインでナビゲーションならindex.htmlで代替
  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  if (request.mode === "navigate") {
    const fallback = await cache.match("./index.html");
    if (fallback) return fallback;
  }

  return new Response("Offline", { status: 503, statusText: "Offline" });
}

// バックグラウンド更新のPromiseを握りつぶす（未処理rejection防止用の明示的no-op）
function event_noop(promise) {
  if (promise && typeof promise.catch === "function") {
    promise.catch(() => {});
  }
}
