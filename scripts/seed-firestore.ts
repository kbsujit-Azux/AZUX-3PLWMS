import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { readFileSync } from "node:fs";

function loadEnv() {
  const content = readFileSync(new URL("../.env", import.meta.url), "utf-8");
  const env: Record<string, string> = {};
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length) {
      env[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    }
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

async function seed() {
  const { setDoc, doc, collection, writeBatch, getDocs } = await import("firebase/firestore");
  
  // Check if already seeded
  const tenantsSnap = await getDocs(collection(db, "tenants"));
  if (!tenantsSnap.empty) {
    console.log("Database already seeded. Skipping.");
    process.exit(0);
  }

  console.log("Seeding database...");

  // Import mock data
  const { tenants, warehouses, inventoryItems, pallets, pickWaves, orders, inboundShipments } = await import("../src/lib/mock-data.js");
  const { itemMaster, locationMaster } = await import("../src/lib/master-data.js");
  const { seedBols } = await import("../src/lib/bol-data.js");
  const { defaultRules: billingRates, seedInvoices: billingRuns } = await import("../src/lib/billing-data.js");
  const { employees } = await import("../src/lib/rf-employees.js");
  const { ediLogs } = await import("../src/lib/edi-data.js");
  const { shipments: carrierDispatches } = await import("../src/lib/shipment-data.js");

  const seedData: Record<string, any[]> = {
    tenants,
    warehouses,
    inventoryItems,
    pallets,
    pickWaves,
    orders,
    inboundShipments,
    carrierDispatches,
    bols: seedBols,
    billingRates,
    billingRuns,
    itemMaster,
    locationMaster,
    ediLogs,
    employees,
  };

  const batchSize = 500;
  const entries = Object.entries(seedData);
  let batch = writeBatch(db);
  let count = 0;

  for (const [colName, items] of entries) {
    for (const item of items) {
      let docRef;
      if (item.id) {
        docRef = doc(db, colName, String(item.id));
      } else if (item.badgeId) {
        docRef = doc(db, colName, String(item.badgeId));
      } else if (item.sku) {
        docRef = doc(db, colName, String(item.sku));
      } else if (item.palletId) {
        docRef = doc(db, colName, String(item.palletId));
      } else if (item.waveId) {
        docRef = doc(db, colName, String(item.waveId));
      } else if (item.shipmentId) {
        docRef = doc(db, colName, String(item.shipmentId));
      } else if (item.bolNumber) {
        docRef = doc(db, colName, String(item.bolNumber));
      } else {
        docRef = doc(collection(db, colName));
      }
      batch.set(docRef, item);
      count++;

      if (count >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log("Database seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Error seeding database:", err);
  process.exit(1);
});
