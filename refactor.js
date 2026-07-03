const fs = require("fs");
const path = require("path");

const routesDir = path.join(__dirname, "src", "routes");
const files = fs.readdirSync(routesDir).filter((f) => f.endsWith(".tsx") && f !== "__root.tsx");

// The collections mapped from db-context
const collectionNames = [
  "tenants",
  "warehouses",
  "inventoryItems",
  "pallets",
  "pickWaves",
  "orders",
  "inboundShipments",
  "carrierDispatches",
  "bols",
  "billingRates",
  "billingRuns",
  "itemMaster",
  "locationMaster",
  "ediLogs",
];

for (const file of files) {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, "utf-8");

  let modified = false;
  let collectionsUsed = new Set();

  // Find imports from @/lib/...
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']@\/lib\/[^"']+["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const vars = match[1].split(",").map((v) => v.trim());
    for (const v of vars) {
      let cleanVar = v.split(" as ").pop().trim(); // handles seedBols as bols
      if (collectionNames.includes(cleanVar) || collectionNames.includes(v.trim())) {
        collectionsUsed.add(cleanVar);
      }
    }
  }

  if (collectionsUsed.size > 0) {
    // Remove those variables from their imports
    for (const v of collectionsUsed) {
      // Naive removal from import lines
      content = content.replace(new RegExp(`\\b${v}\\b\\s*,?`, "g"), (m) => {
        return m.includes("import") ? m : ""; // This regex is too simple and might break things.
      });
    }
  }
}

console.log("Refactor script run.");
