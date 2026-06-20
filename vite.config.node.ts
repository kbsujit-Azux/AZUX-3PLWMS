// Standalone Vite config for SELF-HOSTING on a Node.js server (Hostinger VPS, Docker, etc.).
// Used by `bun run build:node` instead of the default Lovable/Cloudflare config.
//
// To activate on your VPS / Docker build:
//   1. Rename vite.config.ts        -> vite.config.lovable.ts   (keep as backup)
//   2. Rename vite.config.node.ts   -> vite.config.ts
//   3. Run: bun install && bun run build && node .output/server/index.mjs
//
// This config targets node-server and produces a self-contained bundle in .output/.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      target: "node-server",
    }),
    viteReact(),
  ],
  build: {
    outDir: ".output",
  },
  server: {
    host: "0.0.0.0",
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  },
});