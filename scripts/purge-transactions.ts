/**
 * ============================================================
 *  PURGE — Remove all transactional data, keep master data only
 * ============================================================
 *
 *  Purpose: The application must never show stale records. This script
 *           deletes every transactional collection so the app starts from
 *           a clean slate with only master data (tenants, warehouses,
 *           item master, location master, employees, billing config).
 *
 *  Master data that is KEPT:
 *    tenants, warehouses, clients, itemMaster, locationMaster,
 *    employees, users, tenantPortalUsers, carrierCredentials,
 *    carrierServices, billingClients, chargeRules, returnProcessingFees,
 *    rmaDispositions, cartonizations, counters
 *
 *  Transactional data that is DELETED:
 *    inboundShipments, workOrders, pallets, outboundPallets,
 *    inventoryItems, inventoryTransactions, orders, pickTickets,
 *    pickWaves, shipments, bols, invoices, invoicePayments,
 *    billableEvents, ediLogs, csvUploadHistory, rmaOrders, rmaLines,
 *    putawaySuggestions, palletBuildTemplates, slottingRules
 *
 *  Usage:
 *    npm run purge:transactions          # delete transactional data
 *    npm run purge:transactions -- --dry-run
 * ============================================================
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes("--dry-run");

/** Collections that must survive — master data only. */
export const MASTER_COLLECTIONS = [
  "tenants",
  "warehouses",
  "clients",
  "itemMaster",
  "locationMaster",
  "employees",
  "users",
  "tenantPortalUsers",
  "carrierCredentials",
  "carrierServices",
  "billingClients",
  "chargeRules",
  "returnProcessingFees",
  "rmaDispositions",
  "cartonizations",
  "counters",
];

async function main() {
  console.log("Purge transactional data (master data is preserved)");
  console.log(`Project: wms-3pl-79a05`);
  console.log(`Mode:    ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const cols = await db.listCollections();
  const toDelete: Array<{ id: string; count: number }> = [];

  for (const c of cols) {
    if (MASTER_COLLECTIONS.includes(c.id)) continue;
    const snap = await c.get();
    toDelete.push({ id: c.id, count: snap.size });
  }

  toDelete.sort((a, b) => b.count - a.count);

  console.log("\n── To be deleted ──────────────────────────────────");
  let total = 0;
  for (const { id, count } of toDelete) {
    console.log(`  ${id.padEnd(26)} ${count}`);
    total += count;
  }
  console.log(`  ${"TOTAL".padEnd(26)} ${total}`);

  if (DRY_RUN) {
    console.log("\nDry run — nothing deleted.");
    process.exit(0);
  }

  if (toDelete.length) {
    // Firestore batches are limited to 500 writes — delete in chunks.
    const CHUNK = 400;
    for (const { id } of toDelete) {
      const snap = await db.collection(id).get();
      if (snap.empty) continue;
      for (let i = 0; i < snap.docs.length; i += CHUNK) {
        const batch = db.batch();
        snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      console.log(`  deleted ${id} (${snap.size})`);
    }
  }

  console.log("\n── Master data preserved ──────────────────────────");
  for (const id of MASTER_COLLECTIONS) {
    const snap = await db.collection(id).get();
    if (snap.size) console.log(`  ${id.padEnd(26)} ${snap.size}`);
  }

  console.log("\nPurge complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Purge failed:", e);
  process.exit(1);
});
