import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "."),
  envDir: path.resolve(__dirname, ".."),
  base: "/",
  plugins: [tailwindcss(), viteReact(), VitePWA({
    registerType: "auto",
    includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
    manifest: false,
    workbox: {
      globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-cache",
            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "gstatic-fonts-cache",
            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /^https:\/\/firebase.*/i,
          handler: "NetworkFirst",
          options: {
            cacheName: "firebase-cache",
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../src"),
    },
  },
  build: {
    outDir: "../dist-rfgun",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
      output: {
        manualChunks: (id: string): string | undefined => {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) return "firebase";
            if (id.includes("react") || id.includes("react-dom")) return "vendor";
            if (id.includes("@radix-ui")) return "radix-ui";
            if (id.includes("lucide-react")) return "lucide";
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4000,
  },
});
