import { readFileSync, writeFileSync } from "node:fs";

const htmlPath = "dist-rfgun/index.html";

let html = readFileSync(htmlPath, "utf-8");

const seen = new Set();

html = html.replace(/<link rel="manifest" href="([^"]+)">\s*/g, (match, href) => {
  if (seen.has(href)) return "";
  seen.add(href);
  return match;
});

html = html.replace(/<link rel="manifest" href="([^"]+)"><\/head>/g, (match, href) => {
  if (seen.has(href)) return "</head>";
  seen.add(href);
  return match;
});

html = html.replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>\s*/g, "");

writeFileSync(htmlPath, html);
console.log("Cleaned injected PWA tags from dist-rfgun/index.html");
