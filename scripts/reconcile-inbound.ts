/**
 * ============================================================
 *  RECONCILE — Sync inbound containers with their pallets
 * ============================================================
 *
 *  Purpose: The pallets are the source of truth for what was physically
 *           received. This recomputes every inbound container's line
 *           receipts (receivedQty, palletIds, status) and the container
 *           status from the pallets that actually exist.
 *
 *           Run this after any bulk pallet operation (import, delete,
 *           manual database edit) to guarantee the Inbound screen and the
 *           Pallet screen show the same state.
 *
 *  Usage:
 *    npm run reconcile:inbound
 *    npm run reconcile:inbound -- --dry-run
 * ============================================================
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes("--dry-run");

/** Mirrors syncInboundFromPallets() in src/lib/firestore-data.ts */
async function reconcile(shipmentId: string): Promise<string> {
  const shipSnap = await db.collection("inboundShipments").doc(shipmentId).get();
  if (!shipSnap.exists) return "missing";

  const ship = shipSnap.data() as any;
  const lines: any[] = Array.isArray(ship.lines) ? [...ship.lines] : [];

  const palletSnap = await db.collection("pallets").get();
  const pallets = palletSnap.docs
    .map((d) => d.data() as any)
    .filter((p) => (p.shipmentId ?? p.inboundShipmentId) === shipmentId);

  let changed = false;
  lines.forEach((line, idx) => {
    const linked = pallets.filter((p) => p.sku === line.sku);
    const units = linked.reduce((s, p) => s + (Number(p.units) || 0), 0);
    const qtyExpected = Number(line.qtyExpected) || 0;
    // The received quantity is the ACTUAL total in the linked pallets — it is
    // NOT capped at the expected quantity, so over-receipts stay visible and
    // a deleted pallet is reflected immediately.
    const received = units;
    const status =
      qtyExpected > 0 && received >= qtyExpected
        ? "received"
        : received > 0
          ? "partial"
          : "expected";
    const palletIds = linked.map((p) => p.id);

    if (
      line.receivedQty !== received ||
      line.status !== status ||
      JSON.stringify(line.palletIds ?? []) !== JSON.stringify(palletIds)
    ) {
      lines[idx] = { ...line, receivedQty: received, status, palletIds };
      changed = true;
    }
  });

  if (!changed) return "in-sync";

  const allReceived = lines.length > 0 && lines.every((l) => l.status === "received");
  const nextStatus = allReceived ? "received" : "on_dock";

  if (!DRY_RUN) {
    await db.collection("inboundShipments").doc(shipmentId).update({
      lines,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
  }
  return `updated → ${nextStatus}`;
}

async function main() {
  console.log("Reconcile inbound containers with their pallets");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const snap = await db.collection("inboundShipments").get();
  for (const doc of snap.docs) {
    const result = await reconcile(doc.id);
    const data = doc.data() as any;
    console.log(`  ${doc.id}: ${result}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Reconcile failed:", e);
  process.exit(1);
});
