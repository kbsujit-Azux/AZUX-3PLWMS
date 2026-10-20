/**
 * ============================================================
 *  RECONCILE — Rebuild inventory from the put-away pallets
 * ============================================================
 *
 *  Purpose: The inventory on-hand is derived from the pallets that are
 *           physically stored in a location. This script rebuilds the
 *           inventory records/batches from the pallet records so the
 *           Inventory screen always matches reality.
 *
 *  It:
 *    • creates a batch for every pallet that is put away but has no batch
 *    • updates the qty/location of batches whose pallet changed
 *    • removes batches whose pallet was deleted or is no longer stored
 *    • reports the resulting on-hand per SKU
 *
 *  Usage:
 *    npm run reconcile:inventory
 *    npm run reconcile:inventory -- --dry-run
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

/** A pallet counts as on-hand when it is physically stored somewhere. */
function isStored(p: any): boolean {
  return !!p.location && p.status !== "void";
}

async function main() {
  console.log("Reconcile inventory from the put-away pallets");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const [palletSnap, invSnap, itemSnap] = await Promise.all([
    db.collection("pallets").get(),
    db.collection("inventoryItems").get(),
    db.collection("itemMaster").get(),
  ]);

  const pallets = palletSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const stored = pallets.filter(isStored);
  const palletById = new Map(pallets.map((p) => [p.id, p]));
  const masterBySku = new Map(itemSnap.docs.map((d) => [d.id, d.data() as any]));

  console.log(`\n  pallets: ${pallets.length} (${stored.length} stored in a location)`);
  console.log(`  inventory records: ${invSnap.size}`);

  // Group the stored pallets by SKU
  const bySku = new Map<string, any[]>();
  for (const p of stored) {
    const list = bySku.get(p.sku) ?? [];
    list.push(p);
    bySku.set(p.sku, list);
  }

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const [sku, skuPallets] of bySku) {
    const invRef = db.collection("inventoryItems").doc(sku);
    const invDoc = invSnap.docs.find((d) => d.id === sku);
    const current = invDoc ? (invDoc.data() as any) : null;
    const master = masterBySku.get(sku);

    // Existing batches for these pallets
    const existing: any[] = Array.isArray(current?.batches) ? current.batches : [];
    const byPallet = new Map(existing.map((b) => [b.palletId, b]));

    const batches: any[] = [];
    for (const p of skuPallets) {
      const prev = byPallet.get(p.id);
      const batch = {
        batchId: prev?.batchId ?? `${sku}-${p.id}`,
        palletId: p.id,
        receivedAt: prev?.receivedAt ?? p.builtAt ?? new Date().toISOString(),
        qty: Number(p.units) || 0,
        location: p.location,
        poNumber: p.poNumber ?? prev?.poNumber ?? "",
        ediSource: p.ediSource ?? prev?.ediSource ?? "MANUAL",
        qtyAllocated: prev?.qtyAllocated ?? 0,
        ...(prev?.pickTicketNum !== undefined ? { pickTicketNum: prev.pickTicketNum } : {}),
      };
      batches.push(batch);
      if (!prev) created++;
      else if (prev.qty !== batch.qty || prev.location !== batch.location) updated++;
    }

    // Keep any batch whose pallet still exists and is still stored.
    const keptExisting = existing.filter(
      (b) => palletById.has(b.palletId) && isStored(palletById.get(b.palletId)),
    );

    const record = current
      ? {
          ...current,
          batches: [...keptExisting, ...batches],
        }
      : {
          sku,
          upc: master?.upc ?? "",
          itemStyle: master?.itemStyle ?? "",
          description: master?.description ?? "",
          category: master?.category ?? "General",
          uom: master?.uom ?? "EA",
          unitCost: master?.unitCost ?? 0,
          unitPrice: master?.unitPrice ?? 0,
          caseQty: master?.caseQty ?? 1,
          weightLbs: master?.weightLbs ?? 0,
          tenantId: skuPallets[0]?.tenantId,
          warehouseId: skuPallets[0]?.warehouseId,
          batches,
          status: "active",
        };

    // Collapse any duplicate batches for the same pallet.
    const seen = new Set<string>();
    record.batches = (record.batches ?? []).filter((b: any) => {
      const key = b.palletId ?? b.batchId;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (current) {
      removed += existing.length - keptExisting.length;
    }

    const onHand = batches.reduce((s, b) => s + b.qty, 0);
    console.log(
      `  ${sku.padEnd(20)} ${batches.length} batch(es)  on-hand ${onHand} u  ${created ? "(new)" : ""}${updated ? " (updated)" : ""}`,
    );

    if (!DRY_RUN) {
      // `set(..., { merge: true })` merges arrays element-by-element and
      // would duplicate batches. `update()` replaces the whole array.
      if (invDoc) {
        await invRef.update({
          batches: record.batches,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await invRef.set(record);
      }
    }
  }

  // Remove inventory records that have no batches left at all
  for (const doc of invSnap.docs) {
    const x = doc.data() as any;
    const batches = Array.isArray(x.batches) ? x.batches : [];
    const keep = batches.filter((b: any) => palletById.has(b.palletId) && isStored(palletById.get(b.palletId)));
    if (keep.length !== batches.length) {
      console.log(`  ${doc.id}: ${batches.length - keep.length} stale batch(es) removed`);
      removed += batches.length - keep.length;
      if (!DRY_RUN) {
        if (keep.length === 0) await doc.ref.delete();
        else await doc.ref.set({ batches: keep }, { merge: true });
      }
    }
  }

  console.log(
    `\n  ${created} batch(es) created, ${updated} updated, ${removed} removed${DRY_RUN ? " (DRY RUN — nothing written)" : ""}`,
  );

  /* ── Location occupancy: recount from the pallets actually stored ── */
  const locSnap = await db.collection("locationMaster").get();
  const actualByLoc = new Map<string, number>();
  for (const p of stored) {
    actualByLoc.set(p.location, (actualByLoc.get(p.location) ?? 0) + 1);
  }
  let locFixed = 0;
  for (const doc of locSnap.docs) {
    const loc = doc.data() as any;
    const actual = actualByLoc.get(doc.id) ?? 0;
    const recorded = Number(loc.occupiedPallets) || 0;
    if (actual === recorded) continue;
    locFixed++;
    console.log(
      `  location ${doc.id}: occupancy ${recorded} → ${actual}`,
    );
    if (!DRY_RUN) {
      await doc.ref.set(
        { occupiedPallets: actual, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }
  }
  if (locFixed) {
    console.log(`  ${locFixed} location occupancy counter(s) corrected`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Reconcile failed:", e);
  process.exit(1);
});
