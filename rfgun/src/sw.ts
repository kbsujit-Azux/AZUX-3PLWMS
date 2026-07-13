/// <reference lib="webworker" />

const CACHE_NAME = "azux-rf-shell-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/src/main.tsx",
  "/src/App.tsx",
  "/src/index.css",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json",
];

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event: any) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached: any) => {
        const fetchPromise = fetch(request).then((response: any) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache: any) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  if (url.hostname.includes("googleapis.com") || url.hostname.includes("firebase")) {
    event.respondWith(
      fetch(request).then((response: any) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache: any) => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(fetch(request));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

export {};
