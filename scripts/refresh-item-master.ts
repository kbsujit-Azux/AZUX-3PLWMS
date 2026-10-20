/**
 * ============================================================
 *  REFRESH — Sync Item Master core fields from the seed
 * ============================================================
 *
 *  Problem: several Item Master documents were created through the
 *           "Add SKU" dialog, which pre-fills caseQty=1, weightLbs=0.5 and
 *           12x10x8 dimensions. Those placeholder values are wrong for
 *           real SKUs and they feed the Pallet Build Engine, so the
 *           "pallets to build" recommendation is calculated from bad data.
 *
 *  Fix: copy the authoritative core fields (identity, pack quantity,
 *       dimensions, weight, pricing, freight) from the seed catalogue,
 *       while PRESERVING the enriched fields an operator has set
 *       (GTIN hierarchy, apparel matrix, pallet build config, velocity
 *       classification, substitutions, compliance extras).
 *
 *  Usage:
 *    npm run refresh:item-master
 *    npm run refresh:item-master -- --dry-run
 * ============================================================
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { itemMaster as seedCatalogue } from "../src/lib/master-data";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes("--dry-run");

/** Firestore rejects `undefined` anywhere in the document tree. */
function stripUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
}

/** Fields owned by the seed catalogue — always overwritten. */
const CORE_FIELDS = [
  "upc",
  "itemStyle",
  "description",
  "category",
  "uom",
  "tenantId",
  "caseQty",
  "unitCost",
  "unitPrice",
  "weightLbs",
  "lengthIn",
  "widthIn",
  "heightIn",
  "caseLengthIn",
  "caseWidthIn",
  "caseHeightIn",
  "caseWeightLbs",
  "cbmPerCase",
  "nmfc",
  "freightClass",
  "basePackLevel",
  "innerPackQty",
  "masterPackQty",
  "masterLengthIn",
  "masterWidthIn",
  "masterHeightIn",
  "masterWeightLbs",
  "masterCbm",
] as const;

/** Fields owned by the operator — never overwritten. */
const PRESERVED_FIELDS = [
  "packHierarchy",
  "apparelAttrs",
  "palletBuild",
  "velocity",
  "substitutions",
  "gtin",
  "countryOfOrigin",
  "harmonizedCode",
  "brand",
  "manufacturer",
  "manufacturerSku",
  "lotControl",
  "expiryControl",
  "serialControl",
  "shelfLifeDays",
  "storageTempMin",
  "storageTempMax",
  "storageTempUnit",
  "hazmat",
  "active",
  "source",
  "effectiveAt",
] as const;

async function main() {
  console.log("Refresh Item Master core fields from the seed catalogue");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const snap = await db.collection("itemMaster").get();
  const batch = db.batch();
  let updated = 0;

  for (const doc of snap.docs) {
    const current = doc.data() as any;
    const seed = (seedCatalogue as any[]).find((i) => i.sku === doc.id);

    if (!seed) {
      console.log(`  ${doc.id}: no seed entry — left untouched`);
      continue;
    }
    // Build the new document: preserved operator fields win, core fields
    // are taken from the seed.
    const merged: Record<string, any> = {};
    for (const f of PRESERVED_FIELDS) {
      if (current[f] !== undefined) merged[f] = current[f];
    }
    for (const f of CORE_FIELDS) {
      const v = (seed as any)[f];
      if (v !== undefined) merged[f] = v;
    }

    // Rebuild the GTIN hierarchy so the pack quantities match the real case qty
    if (Array.isArray(merged.packHierarchy) && merged.packHierarchy.length >= 2) {
      merged.packHierarchy = merged.packHierarchy.map((h: any, idx: number) =>
        idx === 0
          ? { ...h }
          : {
              ...h,
              qtyPerParent: seed.caseQty,
              packLengthIn: seed.caseLengthIn,
              packWidthIn: seed.caseWidthIn,
              packHeightIn: seed.caseHeightIn,
              packWeightLbs: seed.caseWeightLbs,
            },
      );
    }

    // Report what changed
    const changes: string[] = [];
    for (const f of CORE_FIELDS) {
      const before = current[f];
      const after = merged[f];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push(`${f}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      }
    }

    if (changes.length === 0) {
      console.log(`  ${doc.id}: already up to date`);
      continue;
    }

    updated++;
    console.log(`  ${doc.id}:`);
    changes.forEach((c) => console.log(`      ${c}`));

    if (!DRY_RUN) {
      batch.set(doc.ref, merged, { merge: true });
    }
  }

  if (!DRY_RUN && updated > 0) {
    await batch.commit();
    console.log(`\nCommitted ${updated} updated record(s).`);
  }

  /* Insert catalogue SKUs that are missing from Firestore entirely */
  const missing = (seedCatalogue as any[]).filter(
    (s) => !snap.docs.some((d) => d.id === s.sku),
  );
  if (missing.length) {
    console.log(`\n── Adding ${missing.length} missing catalogue SKU(s) ──`);
    for (const s of missing) {
      console.log(`  + ${s.sku} (${s.description})`);
      if (!DRY_RUN) {
        await db.collection("itemMaster").doc(s.sku).set(stripUndefinedDeep(s), { merge: true });
      }
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Refresh failed:", e);
  process.exit(1);
});
