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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS.filter((a) => !a.includes("src/")))),
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

  // Bypass cache for Firestore API requests
  if (url.hostname.includes("firebase") || url.hostname.includes("googleapis.com")) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.origin === self.location.origin) {
    // Bypass cache for HTML (dynamic content)
    if (url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.includes("index.html")) {
      event.respondWith(fetch(request));
      return;
    }
    
    event.respondWith(
      fetch(request).then((response: any) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache: any) => cache.put(request, clone));
        }
        return response;
      }),
    );
    return;
  }

  event.respondWith(fetch(request));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key))),
    );
  }
});

export {};
