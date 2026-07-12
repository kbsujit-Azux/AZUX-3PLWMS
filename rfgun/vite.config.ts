import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "."),
  envDir: path.resolve(__dirname, ".."),
  base: "/",
  plugins: [tailwindcss(), viteReact()],
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
