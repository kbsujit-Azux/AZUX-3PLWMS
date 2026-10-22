/**
 * ============================================================
 *  SEED LOCATIONS — acme rack/bulk locations at EWR1
 * ============================================================
 *
 *  Problem: the acme containers received at EWR1 were put away into
 *  locations that belong to ANOTHER client (harborlite), because the
 *  directed putaway engine did not check the client. The putaway
 *  validation now rejects a location that is not set up for the
 *  (client, warehouse) combination, so acme needs its own locations.
 *
 *  This script:
 *    1. Creates the acme-owned locations at EWR1
 *    2. Moves the acme pallets (and their inventory batches) onto them
 *    3. Recomputes the occupancy of every affected location
 *
 *  Usage:
 *    npm run seed:acme-locations
 *    npm run seed:acme-locations -- --dry-run
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
const TENANT = "acme";
const WAREHOUSE = "ewr1";

/** Firestore rejects `undefined` anywhere in a document. */
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

/** The locations acme needs at EWR1, derived from the inventory. */
const NEW_LOCATIONS = [
  {
    id: "A03-01-B",
    type: "RACK",
    zone: "Camping Reserve",
    allowedItemStyles: ["TENT-2P"],
    capacityPallets: 4,
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
  },
  {
    id: "C08-04-A",
    type: "RACK",
    zone: "Appliance Reserve",
    allowedItemStyles: ["STV-CMP"],
    capacityPallets: 4,
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
  },
  {
    id: "FLR-EWR1-02",
    type: "FLR",
    zone: "Bulk Floor",
    allowedItemStyles: null,
    capacityPallets: 20,
    lengthFt: 30,
    widthFt: 20,
    heightFt: 8,
  },
];

/** Where each acme pallet moves to. */
const PALLET_MOVES: Record<string, string> = {
  "PLT-EWR1-03168": "C08-04-A",
  "PLT-EWR1-03169": "C08-04-A",
  "PLT-EWR1-03170": "FLR-EWR1-02",
  "PLT-EWR1-09807": "FLR-EWR1-02",
  "PLT-EWR1-09809": "FLR-EWR1-02",
  // PLT-EWR1-09808 / 09810 stay in DROP-EWR1-01 (shared, no client)
};

/** The shared staging location is valid for every client. */
const SHARED_DROP = "DROP-EWR1-01";

async function main() {
  console.log("Create the acme EWR1 locations and move the acme pallets onto them");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}\n`);

  /* 1. Create the locations */
  console.log("── Locations ──────────────────────────────");
  for (const loc of NEW_LOCATIONS) {
    const ref = db.collection("locationMaster").doc(loc.id);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`  = ${loc.id} (already exists)`);
      continue;
    }
    const now = new Date().toISOString();
    const record = {
      id: loc.id,
      warehouseId: WAREHOUSE,
      tenantId: TENANT,
      type: loc.type,
      zone: loc.zone,
      capacityPallets: loc.capacityPallets,
      occupiedPallets: 0,
      pickable: loc.type !== "DROP",
      allowedItemStyles: loc.allowedItemStyles,
      notes: "Created for Acme Outdoor Co. at EWR1",
      lengthFt: loc.lengthFt,
      widthFt: loc.widthFt,
      heightFt: loc.heightFt,
      cubicFeet: loc.lengthFt * loc.widthFt * loc.heightFt,
      slottingRules: {
        allowedStorageClasses:
          loc.type === "FLR" ? ["bulk", "reserve"] : ["forward", "reserve"],
        requiredItemAttrs: {
          hazmatAllowed: false,
          tempControlled: false,
          maxWeightLbs: loc.type === "FLR" ? 3000 : 2500,
          maxDimIn: { l: 48, w: 40, h: loc.type === "FLR" ? 96 : 60 },
          abcClass: loc.type === "FLR" ? ["C"] : ["A", "B"],
        },
        adjacentZones: [],
        putawayPriority: loc.type === "FLR" ? 80 : 40,
        replenPriority: loc.type === "FLR" ? 80 : 40,
        allowedPalletTypes: ["standard_48x40", "euro_48x32"],
      },
      velocityMetrics: {
        picksPerDay: 0,
        linesPerDay: 0,
        cubicVelocity: 0,
        lastCalculated: now,
        manualOverride: false,
      },
      zoneAdjacency: {
        adjacent: [],
        toShippingDockSec: 200,
        toReceivingDockSec: 150,
      },
      zoneType: loc.type === "FLR" ? "bulk" : "reserve",
      velocityScore: 0,
      recommendedSku: undefined,
      hazmatAllowed: false,
      tempControlled: false,
      tempMin: undefined,
      tempMax: undefined,
      status: "active",
      lastCycleCount: now,
      cycleCountFreqDays: 90,
      putawaySequence: loc.type === "FLR" ? 80 : 40,
      maxPalletWeightLbs: loc.type === "FLR" ? 3000 : 2500,
      maxPalletHeightIn: loc.type === "FLR" ? 96 : 72,
      clearanceHeightIn: loc.type === "FLR" ? 120 : 96,
    };
    if (!DRY_RUN) await ref.set(stripUndefinedDeep(record));
    console.log(`  + ${loc.id} (${loc.type}, ${loc.zone}) — ${loc.capacityPallets} positions`);
  }

  /* 2. Move the pallets and their inventory batches */
  console.log("\n── Pallets + inventory ──────────────────────");
  const batch = db.batch();

  // A SKU can have several pallets moving, and a Firestore batch may only
  // write each document once — so the inventory updates are accumulated per
  // SKU and applied at the end.
  const inventoryMoves = new Map<string, Set<string>>();

  for (const [palletId, toLocation] of Object.entries(PALLET_MOVES)) {
    const pref = db.collection("pallets").doc(palletId);
    const psnap = await pref.get();
    if (!psnap.exists) {
      console.log(`  ? ${palletId} not found`);
      continue;
    }
    const pallet = psnap.data() as any;
    const from = pallet.location ?? "-";
    if (!DRY_RUN) {
      batch.update(pref, {
        location: toLocation,
        suggestedLocation: toLocation,
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`  ${palletId}: ${from} → ${toLocation}`);

    const moved = inventoryMoves.get(pallet.sku) ?? new Set<string>();
    moved.add(palletId);
    inventoryMoves.set(pallet.sku, moved);
  }

  // Apply the inventory batch updates (one write per SKU).
  for (const [sku, palletIds] of inventoryMoves) {
    const invRef = db.collection("inventoryItems").doc(sku);
    const isnap = await invRef.get();
    if (!isnap.exists) continue;
    const inv = isnap.data() as any;
    const batches = (inv.batches ?? []).map((b: any) => {
      if (!palletIds.has(b.palletId)) return b;
      const move = PALLET_MOVES[b.palletId];
      return move ? { ...b, location: move } : b;
    });
    if (!DRY_RUN) {
      batch.update(invRef, {
        batches,
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`  inventory ${sku}: ${palletIds.size} batch(es) relocated`);
  }

  // Pallets left in the shared drop keep it, but make sure their suggestion
  // points at a valid location for this client.
  const dropSnap = await db
    .collection("pallets")
    .where("warehouseId", "==", WAREHOUSE)
    .get();
  for (const d of dropSnap.docs) {
    const p = d.data() as any;
    if (p.tenantId !== TENANT) continue;
    if (p.location !== SHARED_DROP) continue;
    if (!DRY_RUN) {
      batch.update(d.ref, {
        suggestedLocation: SHARED_DROP,
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`  ${d.id}: stays in ${SHARED_DROP} (shared location)`);
  }

  if (!DRY_RUN) await batch.commit();

  /* 3. Recount the occupancy of every affected location */
  console.log("\n── Occupancy ───────────────────────────────");
  const palletSnap = await db.collection("pallets").get();
  const counts = new Map<string, number>();
  palletSnap.docs.forEach((d) => {
    const p = d.data() as any;
    if (!p.location) return;
    counts.set(p.location, (counts.get(p.location) ?? 0) + 1);
  });
  const affected = new Set<string>([
    ...NEW_LOCATIONS.map((l) => l.id),
    ...Object.values(PALLET_MOVES),
    "C08-02-B",
    "C08-03-A",
    "FLR-EWR1-01",
    SHARED_DROP,
  ]);
  const b2 = db.batch();
  for (const locId of affected) {
    const actual = counts.get(locId) ?? 0;
    const ref = db.collection("locationMaster").doc(locId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  ${locId}: (not in the master)`);
      continue;
    }
    const current = Number((snap.data() as any).occupiedPallets ?? 0);
    if (current === actual) {
      console.log(`  ${locId}: occupancy ${actual} (unchanged)`);
      continue;
    }
    if (!DRY_RUN) {
      b2.update(ref, {
        occupiedPallets: actual,
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`  ${locId}: occupancy ${current} → ${actual}`);
  }
  if (!DRY_RUN) await b2.commit();

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
