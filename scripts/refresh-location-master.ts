/**
 * ============================================================
 *  REFRESH — Sync the Location Master from the seed catalogue
 * ============================================================
 *
 *  Purpose: The Location Master in Firestore can drift from the catalogue
 *           (for example when the catalogue gained richer zones, slotting
 *           rules and zone adjacency). This copies the catalogue's
 *           descriptive and derived fields onto the stored records while
 *           PRESERVING the operational state the warehouse owns:
 *
 *            kept    → occupiedPallets, status, notes, lastCycleCount,
 *                      cycleCountFreqDays, putawaySequence
 *            updated → zone, type, tenantId, capacityPallets, pickable,
 *                      allowedItemStyles, dimensions, max pallet limits,
 *                      slottingRules, velocityMetrics, zoneAdjacency
 *
 *  Locations that exist only in Firestore (operator-created) are left alone.
 *
 *  Usage:
 *    npm run refresh:location-master
 *    npm run refresh:location-master -- --dry-run
 * ============================================================
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { locationMaster as seedCatalogue } from "../src/lib/master-data";

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

/** Operational state the warehouse owns — never overwritten. */
const PRESERVED = [
  "occupiedPallets",
  "status",
  "notes",
  "tenantId",
  "lastCycleCount",
  "cycleCountFreqDays",
  "putawaySequence",
  "recommendedSku",
  "velocityScore",
] as const;

async function main() {
  console.log("Refresh Location Master from the seed catalogue");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const snap = await db.collection("locationMaster").get();
  const stored = new Map(snap.docs.map((d) => [d.id, d.data() as any]));

  const batch = db.batch();
  let updated = 0;
  let created = 0;

  for (const seed of seedCatalogue as any[]) {
    const current = stored.get(seed.id);
    if (!current) {
      created++;
      console.log(`  + ${seed.id} (new)`);
      if (!DRY_RUN) {
        // A new location is always empty — the catalogue's occupiedPallets
        // is demo data and must never be written as if it were real.
        batch.set(
          db.collection("locationMaster").doc(seed.id),
          stripUndefinedDeep({ ...seed, occupiedPallets: 0 }),
        );
      }
      continue;
    }

    // Start from the seed, then restore the warehouse-owned fields.
    const next: Record<string, any> = { ...seed };
    for (const field of PRESERVED) {
      if (current[field] !== undefined) next[field] = current[field];
    }
    next.id = seed.id;
    next.updatedAt = new Date().toISOString();

    // Report what changed
    const changes: string[] = [];
    for (const key of Object.keys(seed)) {
      if (key === "updatedAt") continue;
      if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) {
        changes.push(`${key}: ${JSON.stringify(current[key])} → ${JSON.stringify(next[key])}`);
      }
    }

    if (changes.length === 0) {
      console.log(`  = ${seed.id} (up to date)`);
      continue;
    }

    updated++;
    console.log(`  ~ ${seed.id}:`);
    changes.slice(0, 6).forEach((c) => console.log(`      ${c}`));
    if (changes.length > 6) console.log(`      …and ${changes.length - 6} more field(s)`);

    if (!DRY_RUN)
      batch.set(db.collection("locationMaster").doc(seed.id), stripUndefinedDeep(next), {
        merge: true,
      });
  }

  // Locations in Firestore that are not in the catalogue
  const seedIds = new Set((seedCatalogue as any[]).map((l) => l.id));
  for (const doc of snap.docs) {
    if (!seedIds.has(doc.id)) {
      console.log(`  ? ${doc.id} — not in the catalogue, left untouched`);
    }
  }

  if (!DRY_RUN) {
    await batch.commit();
    console.log(`\nCommitted ${updated} updated and ${created} new location(s).`);
  } else {
    console.log(`\nDry run — ${updated} would be updated, ${created} would be created.`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Refresh failed:", e);
  process.exit(1);
});
