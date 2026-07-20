/**
 * Seed script for new WMS 3PL collections.
 *
 * Usage:
 *   npm run seed:new-features
 *
 * This populates Firestore with sample data for:
 *   - cycleCounts
 *   - cycleCountLines
 *   - countSchedules
 *   - vasWorkOrders
 *   - vasWorkOrderLines
 *   - crossdockMatches
 *   - catchWeightItems
 *   - catchWeightLogs
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, writeBatch } from "firebase/firestore";
import { cycleCounts, countSchedules } from "./src/lib/counting-data";
import { vasWorkOrders, vasWorkOrderLines } from "./src/lib/vas-data";
import { crossdockMatches } from "./src/lib/crossdock-data";
import { catchWeightItems, catchWeightLogs } from "./src/lib/catch-weight-data";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "mock-api-key-value-for-dev",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "mock-project.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "wms-3pl-79a05",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "mock-project.appspot.com",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:mockappid",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

async function seedCollection(collectionName: string, data: any[], idField = "id") {
  const batch = writeBatch(db);
  for (const item of data) {
    const ref = doc(collection(db, collectionName), item[idField]);
    batch.set(ref, item);
  }
  await batch.commit();
  console.log(`Seeded ${data.length} documents to ${collectionName}`);
}

async function main() {
  console.log("Seeding new feature collections...");

  await seedCollection("cycleCounts", cycleCounts);
  await seedCollection("countSchedules", countSchedules);
  await seedCollection("vasWorkOrders", vasWorkOrders);
  await seedCollection("vasWorkOrderLines", vasWorkOrderLines);
  await seedCollection("crossdockMatches", crossdockMatches);
  await seedCollection("catchWeightItems", catchWeightItems);
  await seedCollection("catchWeightLogs", catchWeightLogs);

  console.log("Seeding complete!");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
