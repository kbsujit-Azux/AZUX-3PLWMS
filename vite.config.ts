import { defineConfig } from "vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/",
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    TanStackRouterVite(),
    viteReact(),
  ],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.html",
      output: {
        manualChunks: (id: string): string | undefined => {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) return "firebase";
            if (id.includes("react") || id.includes("react-dom")) return "vendor";
            if (id.includes("@radix-ui")) return "radix-ui";
            if (id.includes("@tanstack")) return "tanstack";
            if (id.includes("recharts")) return "recharts";
            if (id.includes("lucide-react")) return "lucide";
            if (id.includes("sonner")) return "sonner";
            if (id.includes("date-fns")) return "date-fns";
            if (id.includes("zod")) return "zod";
            if (id.includes("cmdk")) return "cmdk";
            if (id.includes("embla-carousel-react")) return "embla";
            if (id.includes("react-hook-form")) return "react-hook-form";
            if (id.includes("@hookform/resolvers")) return "hookform-resolvers";
            if (id.includes("class-variance-authority")) return "cva";
            if (id.includes("clsx")) return "clsx";
            if (id.includes("tailwind-merge")) return "tailwind-merge";
            if (id.includes("vaul")) return "vaul";
            if (id.includes("input-otp")) return "input-otp";
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  },
});



