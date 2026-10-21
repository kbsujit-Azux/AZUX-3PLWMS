/**
 * ============================================================
 *  AUDIT — Report Firestore state and data-correlation issues
 * ============================================================
 *
 *  Purpose: A read-only health check for the database. Prints the size of
 *           every collection and runs the full correlation checker so you
 *           can confirm the database is clean before/after a purge or a
 *           bulk operation.
 *
 *  Usage:
 *    npm run audit:data
 * ============================================================
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { checkDataIntegrity } from "../src/lib/data-integrity";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

async function main() {
  const get = async (name: string) => {
    const s = await db.collection(name).get();
    return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  };

  const cols = await db.listCollections();
  const rows: Array<[string, number]> = [];
  for (const c of cols) {
    const snap = await c.get();
    rows.push([c.id, snap.size]);
  }
  rows.sort((a, b) => b[1] - a[1]);

  console.log("=== Firestore collections ===");
  console.log("collection".padEnd(28) + "docs");
  console.log("-".repeat(38));
  let total = 0;
  for (const [id, n] of rows) {
    console.log(id.padEnd(28) + n);
    total += n;
  }
  console.log("-".repeat(38));
  console.log("TOTAL".padEnd(28) + total);

  const [pallets, inboundShipments, workOrders, inventoryItems, cartonizations, orders, itemMaster, locationMaster, tenants, warehouses, transactions] =
    await Promise.all([
      get("pallets"),
      get("inboundShipments"),
      get("workOrders"),
      get("inventoryItems"),
      get("cartonizations"),
      get("orders"),
      get("itemMaster"),
      get("locationMaster"),
      get("tenants"),
      get("warehouses"),
      get("inventoryTransactions"),
    ]);

  const issues = checkDataIntegrity({
    pallets,
    inboundShipments,
    workOrders,
    inventoryItems,
    cartonizations,
    orders,
    transactions,
    itemMaster: itemMaster as any,
    locationMaster: locationMaster as any,
    tenants,
    warehouses,
  });

  console.log("\n=== Data integrity ===");
  console.log(`Issues: ${issues.length}`);
  issues.forEach((i) =>
    console.log(`  [${i.severity.toUpperCase()}] ${i.type}: ${i.title} — ${i.recordId}`),
  );
  if (issues.length === 0) console.log("  ✓ All correlations are consistent.");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
