/**
 * ============================================================
 *  REPAIR — Restore inbound shipment line data
 * ============================================================
 *
 *  Problem: an earlier build wrote the inbound `lines` array using a dotted
 *  field path (`lines.0.receivedQty`). Firestore's `update()` interprets
 *  that as a MAP key path, so the `lines` array was replaced by an object
 *  containing only index 0 and only the fields that were written — every
 *  other line and every other field of the targeted line was lost.
 *
 *  Fix: rebuild each shipment's `lines` array from its Work Order (same
 *  source data) enriched with the Item Master, then re-apply the pallet
 *  build state from the `pallets` collection.
 *
 *  Usage:
 *    npm run repair:inbound-lines
 *    npm run repair:inbound-lines -- --dry-run
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

async function main() {
  console.log("Repair inbound shipment line data");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const [inboundSnap, woSnap, itemSnap, palletSnap] = await Promise.all([
    db.collection("inboundShipments").get(),
    db.collection("workOrders").get(),
    db.collection("itemMaster").get(),
    db.collection("pallets").get(),
  ]);

  const workOrders = new Map(woSnap.docs.map((d) => [d.id, d.data() as any]));
  const items = new Map(itemSnap.docs.map((d) => [d.id, d.data() as any]));

  /** palletId → { shipmentId, units } */
  const palletsByShipment = new Map<string, any[]>();
  palletSnap.docs.forEach((d) => {
    const p = d.data() as any;
    const sid = p.shipmentId ?? p.inboundShipmentId;
    if (!sid) return;
    const list = palletsByShipment.get(sid) ?? [];
    list.push(p);
    palletsByShipment.set(sid, list);
  });

  const now = new Date().toISOString();
  const batch = db.batch();
  let repaired = 0;

  for (const doc of inboundSnap.docs) {
    const shipment = doc.data() as any;
    const wo = workOrders.get(doc.id);

    // Detect the corruption: `lines` is not an array.
    const isCorrupt = !Array.isArray(shipment.lines);
    const woLines: any[] = Array.isArray(wo?.lines) ? wo.lines : [];

    if (!isCorrupt && woLines.length === 0) {
      console.log(`  ${doc.id}: no work order lines to rebuild from — SKIPPED`);
      continue;
    }
    if (!isCorrupt) {
      // Valid shipment — refresh ONLY the pack-related fields in place so no
      // operator data (descriptions, received quantities, notes) is lost.
      const currentLines: any[] = [...(shipment.lines as any[])];
      let touched = 0;
      currentLines.forEach((l: any, idx: number) => {
        const item = items.get(l.sku);
        if (!item) return;
        const patch: Record<string, any> = {};
        if (l.unitsPerPallet !== item.caseQty) {
          patch.unitsPerPallet = item.caseQty;
        }
        if (l.weightLbsPerUnit !== item.weightLbs) {
          patch.weightLbsPerUnit = item.weightLbs;
        }
        if (l.itemStyle !== item.itemStyle) patch.itemStyle = item.itemStyle;
        if (l.uom !== item.uom) patch.uom = item.uom;
        if (Object.keys(patch).length) {
          currentLines[idx] = { ...l, ...patch };
          touched++;
        }
      });
      if (touched > 0) {
        console.log(`  ${doc.id}: refreshed pack fields on ${touched} line(s)`);
        if (!DRY_RUN) {
          batch.update(doc.ref, { lines: currentLines, updatedAt: now });
        }
        repaired++;
      } else {
        console.log(`  ${doc.id}: already up to date`);
      }
      continue;
    }

    // Rebuild the lines array from the work order + item master.
    const lines = woLines.map((wl, idx) => {
      const item = items.get(wl.sku);
      const existing = (shipment.lines as any)?.[String(idx)] ?? {};
      const palletIds: string[] = Array.isArray(existing.palletIds) ? existing.palletIds : [];
      const palletUnits = (palletsByShipment.get(doc.id) ?? [])
        .filter((p) => palletIds.includes(p.id))
        .reduce((sum, p) => sum + (Number(p.units) || 0), 0);

      const qtyExpected = Number(wl.qtyExpected) || 0;
      // The received quantity reflects the ACTUAL units held by the linked
      // pallets (not capped at the expected quantity) so over-receipts stay
      // visible and pallet deletions are reflected immediately.
      const received =
        palletUnits > 0 ? palletUnits : Math.max(Number(existing.receivedQty) || 0, 0);

      return {
        lineNo: idx + 1,
        sku: wl.sku,
        upc: wl.upc ?? item?.upc ?? "",
        itemStyle: item?.itemStyle ?? "",
        description: wl.description || item?.description || "",
        lot: wl.lot ?? "",
        expirationDate: "2030-12-31",
        qtyExpected,
        cartonsExpected: Number(wl.cartons) || 0,
        uom: item?.uom ?? "EA",
        weightLbsPerUnit: Number(item?.weightLbs) || 0,
        // Units per pallet is driven by the Item Master case quantity.
        unitsPerPallet: Number(item?.caseQty) || Number(existing.unitsPerPallet) || 1,
        receivedQty,
        palletIds,
        status:
          receivedQty >= qtyExpected && qtyExpected > 0
            ? "received"
            : receivedQty > 0
              ? "partial"
              : "expected",
        poNumber: shipment.poNumber,
      };
    });

    const allReceived = lines.every((l) => l.status === "received");
    const shipmentStatus = allReceived ? "received" : "on_dock";

    console.log(
      `  ${doc.id}: rebuilt ${lines.length} line(s) → ${lines
        .map((l) => `${l.sku} ${l.receivedQty}/${l.qtyExpected}${l.palletIds.length ? ` [${l.palletIds.join(",")}]` : ""}`)
        .join(" | ")}`,
    );

    if (!DRY_RUN) {
      batch.update(doc.ref, {
        lines,
        status: shipmentStatus,
        updatedAt: now,
      });
    }
    repaired++;
  }

  if (!DRY_RUN && repaired > 0) {
    await batch.commit();
    console.log(`\nCommitted repairs for ${repaired} shipment(s).`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Repair failed:", e);
  process.exit(1);
});
