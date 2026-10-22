/**
 * ============================================================
 *  SEED — Hold / quarantine locations for damaged stock
 * ============================================================
 *
 *  Damaged units are built onto their own pallet and need a quarantine
 *  slot. When a warehouse has none, the damage pallet would end up with
 *  no valid location and could not be put away.
 *
 *  This ensures every warehouse that has staged pallets also has a
 *  SHARED hold / quarantine location, so damaged stock always has a
 *  valid home.
 *
 *  Usage:
 *    npm run seed:hold-locations
 *    npm run seed:hold-locations -- --dry-run
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

/** The shared hold location per warehouse. */
const HOLD_LOCATIONS: Record<
  string,
  { id: string; zone: string; capacity: number; lengthFt: number; widthFt: number; heightFt: number }
> = {
  atl1: { id: "HOLD-ATL1-01", zone: "Damage Hold", capacity: 8, lengthFt: 8, widthFt: 6, heightFt: 4 },
  ord2: { id: "HOLD-ORD2-01", zone: "Damage Hold", capacity: 8, lengthFt: 8, widthFt: 6, heightFt: 4 },
  lax3: { id: "HOLD-LAX3-01", zone: "Damage Hold", capacity: 8, lengthFt: 8, widthFt: 6, heightFt: 4 },
  ewr1: { id: "HOLD-EWR1-01", zone: "Damage Hold", capacity: 8, lengthFt: 8, widthFt: 6, heightFt: 4 },
};

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

async function main() {
  console.log("Ensure every warehouse has a shared damage-hold location");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}\n`);

  const palletSnap = await db.collection("pallets").get();
  const warehousesInUse = new Set(
    palletSnap.docs
      .map((d) => (d.data() as any).warehouseId)
      .filter((w: string) => !!w),
  );

  for (const [warehouseId, loc] of Object.entries(HOLD_LOCATIONS)) {
    if (!warehousesInUse.has(warehouseId)) {
      console.log(`  · ${warehouseId}: no pallets, skipped`);
      continue;
    }
    const ref = db.collection("locationMaster").doc(loc.id);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`  = ${loc.id} (already exists)`);
      continue;
    }
    const now = new Date().toISOString();
    const record = {
      id: loc.id,
      warehouseId,
      tenantId: null, // shared by every client
      type: "RACK",
      zone: loc.zone,
      capacityPallets: loc.capacity,
      occupiedPallets: 0,
      pickable: false, // held stock is not pickable
      allowedItemStyles: null,
      notes: "Quarantine / damage hold — damaged stock awaiting disposition",
      lengthFt: loc.lengthFt,
      widthFt: loc.widthFt,
      heightFt: loc.heightFt,
      cubicFeet: loc.lengthFt * loc.widthFt * loc.heightFt,
      slottingRules: {
        allowedStorageClasses: ["bulk", "reserve"],
        requiredItemAttrs: {
          hazmatAllowed: true,
          tempControlled: false,
          maxWeightLbs: 2500,
          maxDimIn: { l: 48, w: 40, h: 60 },
          abcClass: ["C"],
        },
        adjacentZones: [],
        putawayPriority: 100,
        replenPriority: 100,
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
        toShippingDockSec: 300,
        toReceivingDockSec: 150,
      },
      zoneType: "staging",
      velocityScore: 0,
      hazmatAllowed: true,
      tempControlled: false,
      status: "active",
      lastCycleCount: now,
      cycleCountFreqDays: 30,
      putawaySequence: 100,
      maxPalletWeightLbs: 2500,
      maxPalletHeightIn: 72,
      clearanceHeightIn: 96,
    };
    if (!DRY_RUN) await ref.set(stripUndefinedDeep(record));
    console.log(`  + ${loc.id} (${warehouseId}) — ${loc.capacity} positions, shared`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
