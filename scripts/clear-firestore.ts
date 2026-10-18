import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, deleteDoc, doc, writeBatch, getDocs } from "firebase/firestore";
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

const MASTER_COLLECTIONS = [
  "tenants",
  "warehouses",
  "itemMaster",
  "locationMaster",
  "chargeRules",
  "billingClients",
  "employees",
  "userPreferences",
  "allocationConfigs",
  "carrierServices",
  "carrierCredentials",
];

const OPERATIONAL_COLLECTIONS = [
  "inventoryItems",
  "pallets",
  "orders",
  "pickWaves",
  "pickTickets",
  "inboundShipments",
  "shipmentRecords",
  "billsOfLading",
  "outboundPallets",
  "workOrders",
  "inventoryTransactions",
  "inventoryBalances",
  "invoices",
  "billableEvents",
  "payments",
  "auditLogs",
  "ediLogs",
  "clientAllocationConfigs",
  "cartonizations",
  "carrierDispatches",
  "rmaOrders",
  "rmaLines",
  "rmaDispositions",
  "returnProcessingFees",
  "csvUploadHistory",
  "cycleCounts",
  "complianceDocuments",
  "serialInventory",
  "expiringLots",
  "expiringDocs",
  "recalls",
  "quarantineOrders",
  "carrierRateQuotes",
  "downstreamBols",
  "upchainBolLines",
];

async function clearCollection(collectionName: string): Promise<number> {
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);
  let count = 0;

  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    count++;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

async function main() {
  console.log("Clearing operational data from Firestore...\n");

  let totalDeleted = 0;

  for (const colName of OPERATIONAL_COLLECTIONS) {
    try {
      const deleted = await clearCollection(colName);
      console.log(`  ${colName}: ${deleted} documents deleted`);
      totalDeleted += deleted;
    } catch (e: any) {
      console.log(`  ${colName}: ${e.message || "Collection not found"}`);
    }
  }

  console.log(`\nTotal documents deleted: ${totalDeleted}`);
  console.log("\nMaster data collections preserved:");
  console.log(MASTER_COLLECTIONS.map((c) => `  - ${c}`).join("\n"));
}

main().catch(console.error);