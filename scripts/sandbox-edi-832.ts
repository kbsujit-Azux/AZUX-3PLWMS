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
  const { setDoc, doc, collection, serverTimestamp } = await import("firebase/firestore");

  const tenantId = "acme";
  const warehouseId = "atl1";
  const now = new Date().toISOString();

  const sampleItems = [
    { sku: "SBX-832-001", description: "Sandbox Item A (EDI 832)", upc: "012345678905", weightLbs: 2.5, lengthIn: 10, widthIn: 6, heightIn: 4, tenantId, warehouseId, source: "EDI832", updatedAt: now },
    { sku: "SBX-832-002", description: "Sandbox Item B (EDI 832)", upc: "098765432109", weightLbs: 5.0, lengthIn: 12, widthIn: 8, heightIn: 6, tenantId, warehouseId, source: "EDI832", updatedAt: now },
  ];

  for (const item of sampleItems) {
    await setDoc(doc(db, "itemMaster", item.sku), item, { merge: true });
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
