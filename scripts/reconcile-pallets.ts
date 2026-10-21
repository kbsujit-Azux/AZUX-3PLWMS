/**
 * ============================================================
 *  RECONCILE — Refresh pallet and inbound-line pack data
 * ============================================================
 *
 *  Purpose: A pallet's weight and case pack must come from the Item
 *           Master, not from whatever the ASN happened to carry. A pallet
 *           built before the Item Master had a unit weight ends up with
 *           weightLbs = 0 and casePack = 1, which shows up on screen as
 *           "0 lb" and "24 cases @ 1/case".
 *
 *  It:
 *    • recomputes every pallet's weightLbs  = units x unit weight
 *    • recomputes every pallet's casePack   = catalogue case quantity
 *    • recomputes every inbound line's weightLbsPerUnit and unitsPerPallet
 *      from the Item Master
 *
 *  Only the derived pack fields are touched — the physical counts
 *  (units, received quantities) are never changed.
 *
 *  Usage:
 *    npm run reconcile:pallets
 *    npm run reconcile:pallets -- --dry-run
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

/** Units per pack (carton) for an item. */
function packSizeOf(master: any): number {
  const inner = master.packHierarchy?.find((h: any) => h.packLevel === "inner");
  return inner?.qtyPerParent || master.caseQty || master.innerPackQty || 1;
}

async function main() {
  console.log("Reconcile pallet + inbound-line pack data from the Item Master");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const [palletSnap, itemSnap, shipSnap] = await Promise.all([
    db.collection("pallets").get(),
    db.collection("itemMaster").get(),
    db.collection("inboundShipments").get(),
  ]);

  const masters = new Map(itemSnap.docs.map((d) => [d.id, d.data() as any]));
  const batch = db.batch();

  /* ── Pallets ── */
  let palletFixed = 0;
  console.log("\n── pallets ────────────────────────────────");
  for (const doc of palletSnap.docs) {
    const p = doc.data() as any;
    const master = masters.get(p.sku);
    if (!master) {
      console.log(`  ? ${p.id} — no Item Master record, skipped`);
      continue;
    }
    const casePack = packSizeOf(master);
    const weightLbs = +((Number(p.units) || 0) * (Number(master.weightLbs) || 0)).toFixed(1);

    const casePackChanged = p.casePack !== casePack;
    const weightChanged = (Number(p.weightLbs) || 0) !== weightLbs;
    if (!casePackChanged && !weightChanged) continue;

    palletFixed++;
    console.log(
      `  ~ ${p.id} (${p.sku}): casePack ${p.casePack} → ${casePack}, weightLbs ${p.weightLbs} → ${weightLbs}`,
    );
    if (!DRY_RUN) {
      batch.update(doc.ref, { casePack, weightLbs, updatedAt: new Date().toISOString() });
    }
  }

  /* ── Inbound lines ── */
  let lineFixed = 0;
  console.log("\n── inbound lines ──────────────────────────");
  for (const doc of shipSnap.docs) {
    const s = doc.data() as any;
    const lines: any[] = Array.isArray(s.lines) ? [...s.lines] : [];
    let changed = false;

    lines.forEach((line, idx) => {
      const master = masters.get(line.sku);
      if (!master) return;
      const unitsPerPallet = packSizeOf(master);
      const weightLbsPerUnit = Number(master.weightLbs) || 0;
      const patch: Record<string, any> = {};
      if (line.unitsPerPallet !== unitsPerPallet) patch.unitsPerPallet = unitsPerPallet;
      if ((line.weightLbsPerUnit || 0) !== weightLbsPerUnit) {
        patch.weightLbsPerUnit = weightLbsPerUnit;
      }
      if (!line.itemStyle && master.itemStyle) patch.itemStyle = master.itemStyle;
      if (!line.uom && master.uom) patch.uom = master.uom;
      if (Object.keys(patch).length === 0) return;
      lines[idx] = { ...line, ...patch };
      changed = true;
      lineFixed++;
      console.log(
        `  ~ ${s.id} line ${idx + 1} (${line.sku}): ${JSON.stringify(patch)}`,
      );
    });

    if (changed && !DRY_RUN) {
      batch.update(doc.ref, { lines, updatedAt: new Date().toISOString() });
    }
  }

  if (!DRY_RUN) {
    await batch.commit();
    console.log(
      `\nCommitted ${palletFixed} pallet(s) and ${lineFixed} line(s) updated.`,
    );
  } else {
    console.log(
      `\nDry run — ${palletFixed} pallet(s) and ${lineFixed} line(s) would be updated.`,
    );
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Reconcile failed:", e);
  process.exit(1);
});
