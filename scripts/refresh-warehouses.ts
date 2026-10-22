/**
 * ============================================================
 *  REFRESH — Sync the warehouse master with the catalogue
 * ============================================================
 *
 *  Problem: the warehouse records in Firestore were written with only a
 *           subset of the fields (id, name, code, city, capacityPct).
 *           The Settings > Warehouse screen renders the full facility
 *           profile, so a missing `squareFeet` crashed the screen.
 *
 *  This copies the catalogue's facility attributes onto the stored records.
 *  Operator edits to the descriptive fields are preserved.
 *
 *  Usage:
 *    npm run refresh:warehouses
 *    npm run refresh:warehouses -- --dry-run
 * ============================================================
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { warehouses as seedCatalogue } from "../src/lib/mock-data";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log("Refresh the warehouse master from the catalogue");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}\n`);

  const batch = db.batch();
  let updated = 0;
  let created = 0;

  for (const seed of seedCatalogue as any[]) {
    const ref = db.collection("warehouses").doc(seed.id);
    const snap = await ref.get();
    const current = (snap.data() ?? {}) as any;

    // The facility profile comes from the catalogue; the descriptive fields
    // keep whatever the operator set.
    const next = {
      ...current,
      id: seed.id,
      name: current.name ?? seed.name,
      code: current.code ?? seed.code,
      city: current.city ?? seed.city,
      capacityPct: current.capacityPct ?? seed.capacityPct,
      addressLine: current.addressLine ?? seed.addressLine ?? "",
      squareFeet: current.squareFeet ?? seed.squareFeet ?? 0,
      manager: current.manager ?? seed.manager ?? "",
      docks: current.docks ?? seed.docks ?? 0,
      active: current.active ?? seed.active ?? true,
    };

    const missing = Object.keys(seed).filter(
      (k) => k !== "id" && current[k] === undefined,
    );
    if (missing.length === 0) {
      console.log(`  = ${seed.id} (complete)`);
      continue;
    }

    if (!snap.exists) created++;
    else updated++;
    console.log(`  ~ ${seed.id}: +${missing.join(", ")}`);
    if (!DRY_RUN) batch.set(ref, next, { merge: true });
  }

  if (!DRY_RUN) await batch.commit();
  console.log(
    `\n${updated} updated, ${created} created${DRY_RUN ? " (DRY RUN — nothing written)" : ""}.`,
  );
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
