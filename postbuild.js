import fs from "fs";
import path from "path";

const clientDir = path.join(process.cwd(), "dist", "client");
const assetsDir = path.join(clientDir, "assets");

if (!fs.existsSync(clientDir)) {
  console.error("dist/client directory does not exist!");
  process.exit(1);
}

// Find the main JS and CSS files
const files = fs.readdirSync(assetsDir);
const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
const cssFile = files.find((f) => f.startsWith("styles-") && f.endsWith(".css"));

if (!jsFile) {
  console.error("Could not find index-*.js in dist/client/assets!");
  process.exit(1);
}

// Read root index.html
let html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");

// Replace the script tag with the bundled one
html = html.replace(
  '<script type="module" src="/src/start.tsx"></script>',
  `<script type="module" src="/assets/${jsFile}"></script>`,
);

// Add the stylesheet link if found
if (cssFile) {
  const cssLink = `<link rel="stylesheet" href="/assets/${cssFile}" />`;
  html = html.replace("</head>", `  ${cssLink}\n  </head>`);
}

// Write to dist/client/index.html
fs.writeFileSync(path.join(clientDir, "index.html"), html);
console.log(`Successfully generated dist/client/index.html pointing to assets/${jsFile}`);
