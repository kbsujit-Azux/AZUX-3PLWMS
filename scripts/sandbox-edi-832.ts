import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { readFileSync } from "node:fs";

function loadEnv() {
  const content = readFileSync(new URL("../.env", import.meta.url), "utf-8");
  const env: Record<string, string> = {};
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length) env[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  });
  return env;
}

const env = loadEnv();
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

async function main() {
  const { setDoc, doc, deleteDoc } = await import("firebase/firestore");

  const tenantId = "acme";
  const warehouseId = "atl1";
  const now = new Date().toISOString();

  const sampleItems = [
    {
      sku: "SBX-832-001",
      upc: "012345678905",
      itemStyle: "SBX-STYLE-A",
      description: "Sandbox Item A (EDI 832)",
      category: "Accessories",
      uom: "EA",
      tenantId,
      packHierarchy: [],
      basePackLevel: "each" as any,
      caseQty: 1,
      caseWeightLbs: 2.5,
      cbmPerCase: 0.001,
      lengthIn: 10,
      widthIn: 6,
      heightIn: 4,
      weightLbs: 2.5,
      palletBuild: { ti: 10, hi: 5, maxWeightLbs: 1000 } as any,
      unitCost: 12.5,
      unitPrice: 24.99,
      nmfc: "116030",
      freightClass: "85" as any,
      lotControl: false,
      expiryControl: false,
      serialControl: false,
      hazmat: false,
      active: true,
      source: "EDI_832" as any,
      effectiveAt: now,
    },
    {
      sku: "SBX-832-002",
      upc: "098765432109",
      itemStyle: "SBX-STYLE-B",
      description: "Sandbox Item B (EDI 832)",
      category: "Accessories",
      uom: "EA",
      tenantId,
      packHierarchy: [],
      basePackLevel: "each" as any,
      caseQty: 1,
      caseWeightLbs: 5.0,
      cbmPerCase: 0.002,
      lengthIn: 12,
      widthIn: 8,
      heightIn: 6,
      weightLbs: 5.0,
      palletBuild: { ti: 8, hi: 4, maxWeightLbs: 1000 } as any,
      unitCost: 25.0,
      unitPrice: 49.99,
      nmfc: "116030",
      freightClass: "85" as any,
      lotControl: false,
      expiryControl: false,
      serialControl: false,
      hazmat: false,
      active: true,
      source: "EDI_832" as any,
      effectiveAt: now,
    },
  ];

  for (const item of sampleItems) {
    await setDoc(doc(db, "itemMaster", item.sku), item);
    console.log("Upserted itemMaster:", item.sku);
  }

  const logId = `EDI-SBX-832-${Date.now()}`;
  await setDoc(doc(db, "ediLogs", logId), {
    id: logId,
    txn: "832",
    direction: "inbound",
    partner: "SBX-PARTNER",
    documentRef: "SBX-CATALOG-001",
    tenantId,
    warehouseId,
    isaControl: "999999999",
    gsControl: "9999",
    segments: 12,
    bytes: 420,
    ackStatus: "AK",
    status: "processed",
    message: "Sandbox 832 ingested; 2 items upserted to itemMaster.",
    receivedAt: now,
  });
  console.log("EDI log written:", logId);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
