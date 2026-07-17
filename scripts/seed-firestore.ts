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
    console.log("Database already seeded. Skipping core seed.");
  } else {
    console.log("Seeding core WMS datasets...");

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

    console.log("Core WMS datasets seeded successfully!");
  }

  // Seed enterprise collections (always, even if core already seeded)
  console.log("Seeding enterprise collections...");

  const tenantPortalUsers = [
    { id: "tp-acme", tenantId: "acme", email: "portal@acme.com", name: "Acme Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "tp-northstar", tenantId: "northstar", email: "portal@northstar.com", name: "Northstar Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "tp-harborlite", tenantId: "harborlite", email: "portal@harborlite.com", name: "Harborlite Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "tp-verdant", tenantId: "verdant", email: "portal@verdant.com", name: "Verdant Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  const rmaOrders = [
    { id: "rma-001", tenantId: "acme", warehouseId: "atl1", rmaNumber: "RMA-2026-001", status: "draft", returnReason: "customer_return", customerName: "Acme Outdoor Co.", notes: "Customer returned defective tent", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "rma-002", tenantId: "acme", warehouseId: "atl1", rmaNumber: "RMA-2026-002", status: "received", returnReason: "damaged", customerName: "Acme Outdoor Co.", notes: "Damaged during transit", createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString() },
    { id: "rma-003", tenantId: "northstar", warehouseId: "ord2", rmaNumber: "RMA-2026-003", status: "inspected", returnReason: "wrong_item", customerName: "Northstar Apparel", notes: "Wrong size shipped", createdAt: new Date(Date.now() - 172800000).toISOString(), updatedAt: new Date().toISOString() },
  ];

  const rmaLines = [
    { id: "rl-001", rmaId: "rma-001", tenantId: "acme", sku: "ACM-TENT-2P-OLV", description: "Ridgeline 2-Person Tent, Olive", qtyExpected: 1, qtyReceived: 1, unitCost: 84.5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "rl-002", rmaId: "rma-002", tenantId: "acme", sku: "ACM-STV-CMP-01", description: "Compact Camp Stove, Single Burner", qtyExpected: 2, qtyReceived: 2, unitCost: 22.1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "rl-003", rmaId: "rma-003", tenantId: "northstar", sku: "NSA-HOOD-BLK-M", description: "Classic Pullover Hoodie, Black, M", qtyExpected: 3, qtyReceived: 3, unitCost: 14.2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  const rmaDispositions = [
    { id: "rd-001", rmaId: "rma-001", lineId: "rl-001", tenantId: "acme", dispositionType: "return_to_stock", status: "completed", qty: 1, processedBy: "warehouse-lead", processedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "rd-002", rmaId: "rma-002", lineId: "rl-002", tenantId: "acme", dispositionType: "quarantine", status: "in_progress", qty: 2, processedBy: "quality-inspector", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  const returnProcessingFees = [
    { id: "rf-001", tenantId: "acme", rmaId: "rma-001", lineId: "rl-001", feeType: "restocking", amount: 12.68, currency: "USD", description: "Restocking fee (15% of unit cost)", autoBilled: true, createdAt: new Date().toISOString() },
    { id: "rf-002", tenantId: "acme", rmaId: "rma-002", lineId: "rl-002", feeType: "inspection", amount: 5.0, currency: "USD", description: "Inspection fee", autoBilled: true, createdAt: new Date().toISOString() },
  ];

  const carrierCredentials = [
    { id: "cc-usps", tenantId: "acme", carrierId: "usps", carrierName: "USPS", apiKey: "", apiEndpoint: "https://api.usps.com", accountNumber: "ACME-USPS-001", scacCode: "USPS", enabled: true, supportedCountries: ["US"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "cc-ups", tenantId: "acme", carrierId: "ups", carrierName: "UPS", apiKey: "", apiEndpoint: "https://api.ups.com", accountNumber: "ACME-UPS-001", scacCode: "UPSN", enabled: true, supportedCountries: ["US", "CA"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "cc-fedex", tenantId: "acme", carrierId: "fedex", carrierName: "FedEx", apiKey: "", apiEndpoint: "https://api.fedex.com", accountNumber: "ACME-FDX-001", scacCode: "FXFE", enabled: true, supportedCountries: ["US", "CA"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  const enterpriseSeed: Record<string, any[]> = {
    tenantPortalUsers,
    rmaOrders,
    rmaLines,
    rmaDispositions,
    returnProcessingFees,
    carrierCredentials,
  };

  let batch = writeBatch(db);
  let count = 0;

  for (const [colName, items] of Object.entries(enterpriseSeed)) {
    for (const item of items) {
      let docRef;
      if (item.id) {
        docRef = doc(db, colName, String(item.id));
      } else if (item.rmaNumber) {
        docRef = doc(db, colName, String(item.rmaNumber));
      } else if (item.sku) {
        docRef = doc(db, colName, String(item.sku));
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

  console.log("Enterprise collections seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Error seeding database:", err);
  process.exit(1);
});
