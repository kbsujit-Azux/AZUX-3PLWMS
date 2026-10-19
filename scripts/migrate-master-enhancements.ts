/**
 * ============================================================
 *  MIGRATION — Backfill Item Master & Location Master enhancements
 * ============================================================
 *
 *  Purpose: Existing Firestore documents were written before the
 *           Item Master / Location Master enhancement release and are
 *           therefore missing the new fields:
 *
 *           itemMaster:
 *             • packHierarchy[]  (GTIN parent/child pack structure)
 *             • basePackLevel
 *             • innerPackQty / masterPackQty
 *             • apparelAttrs     (Style / Color / Size matrix)
 *             • palletBuild      (stackability, pattern, limits)
 *             • velocity         (ABC class, storage class)
 *             • substitutions[]  (alternate SKUs)
 *             • compliance extras (countryOfOrigin, harmonizedCode, brand…)
 *
 *           locationMaster:
 *             • slottingRules    (storage class compatibility, priorities)
 *             • velocityMetrics  (picks/day, lines/day, cubic velocity)
 *             • zoneAdjacency    (travel times to docks)
 *             • status           (active / quarantine / …)
 *             • operational fields (cycle count, putaway sequence, limits)
 *
 *  The script is IDEMPOTENT — running it twice is safe. It only writes
 *  fields that are missing, so operator overrides are never clobbered.
 *
 *  Usage:
 *    npm run migrate:master-enhancements
 *    npm run migrate:master-enhancements -- --dry-run
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

/* ───── Defaults (mirrors master-data.ts) ───────────────────────────── */

const DEFAULT_PALLET_BUILD = {
  maxPalletHeightIn: 60,
  maxPalletWeightLbs: 2500,
  stackability: "full",
  palletPattern: "interlock",
  allowMixedSku: false,
  palletType: "standard_48x40",
};

const DEFAULT_VELOCITY = {
  abcClass: "B",
  annualPicks: 500,
  linesPerOrder: 3,
  storageClass: "reserve",
};

const DEFAULT_SLOTTING = {
  allowedStorageClasses: ["forward", "reserve", "bulk"],
  putawayPriority: 50,
  replenPriority: 50,
  allowedPalletTypes: ["standard_48x40"],
};

const DEFAULT_VELOCITY_METRICS = {
  picksPerDay: 0,
  linesPerDay: 0,
  cubicVelocity: 0,
  lastCalculated: new Date().toISOString(),
  manualOverride: false,
};

const DEFAULT_ZONE_ADJACENCY = {
  adjacent: [],
  toShippingDockSec: 300,
  toReceivingDockSec: 300,
};

/* ───── Item Master backfill ───────────────────────────────────────── */

/**
 * Build the GTIN pack hierarchy for an item that does not have one yet.
 * Creates a simple two-level structure (each → inner) from the case qty.
 */
function derivePackHierarchy(item: Record<string, any>): any[] {
  const upc = String(item.upc ?? "");
  const childGtin = upc.length === 12 ? `0${upc}` : upc || undefined;
  const parentGtin = childGtin ? `1${childGtin.slice(1)}` : undefined;
  const caseQty = Number(item.caseQty) || 1;

  return [
    {
      parentGtin: undefined,
      childGtin,
      qtyPerParent: 1,
      packLevel: "each",
      isBaseUnit: true,
    },
    {
      parentGtin: childGtin,
      childGtin: parentGtin,
      qtyPerParent: caseQty,
      packLevel: "inner",
      packLengthIn: item.caseLengthIn ?? item.lengthIn,
      packWidthIn: item.caseWidthIn ?? item.widthIn,
      packHeightIn: item.caseHeightIn ?? item.heightIn,
      packWeightLbs: item.caseWeightLbs,
      isBaseUnit: false,
    },
  ];
}

function itemMasterBackfill(item: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {};

  if (!Array.isArray(item.packHierarchy) || item.packHierarchy.length === 0) {
    patch.packHierarchy = derivePackHierarchy(item);
  }
  if (!item.basePackLevel) patch.basePackLevel = "each";
  if (item.innerPackQty === undefined) patch.innerPackQty = 1;
  if (item.masterPackQty === undefined) patch.masterPackQty = undefined;

  if (!item.palletBuild) patch.palletBuild = DEFAULT_PALLET_BUILD;
  if (!item.velocity) patch.velocity = DEFAULT_VELOCITY;
  if (!Array.isArray(item.substitutions)) patch.substitutions = [];

  // Dimensions at case level (derived when absent)
  if (item.caseLengthIn === undefined && item.lengthIn !== undefined) {
    patch.caseLengthIn = item.lengthIn;
  }
  if (item.caseWidthIn === undefined && item.widthIn !== undefined) {
    patch.caseWidthIn = item.widthIn;
  }
  if (item.caseHeightIn === undefined && item.heightIn !== undefined) {
    patch.caseHeightIn = item.heightIn;
  }
  if (item.masterCbm === undefined) patch.masterCbm = undefined;

  // Compliance extras — only fill blanks, never overwrite operator data
  if (!item.countryOfOrigin) patch.countryOfOrigin = "US";
  if (item.harmonizedCode === undefined) patch.harmonizedCode = undefined;
  if (item.brand === undefined) patch.brand = undefined;
  if (item.manufacturer === undefined) patch.manufacturer = undefined;
  if (item.manufacturerSku === undefined) patch.manufacturerSku = undefined;

  return patch;
}

/* ───── Location Master backfill ───────────────────────────────────── */

function deriveSlottingRules(loc: Record<string, any>): any {
  const zone = String(loc.zone ?? "").toLowerCase();
  const isStaging =
    loc.type === "DROP" ||
    zone.includes("dock") ||
    zone.includes("staging") ||
    zone.includes("drop");
  const isBulk = loc.type === "FLR" || zone.includes("bulk");
  const isForward = zone.includes("forward");
  const isHazmat = zone.includes("hazmat");
  const isCold = zone.includes("cold") || loc.tempControlled === true;

  const allowedStorageClasses = isHazmat
    ? ["hazmat"]
    : isCold
      ? ["cold", "forward", "reserve"]
      : isStaging
        ? ["forward", "reserve", "bulk", "staging"]
        : isBulk
          ? ["bulk", "reserve"]
          : isForward
            ? ["forward", "reserve"]
            : ["reserve", "bulk"];

  return {
    ...DEFAULT_SLOTTING,
    allowedStorageClasses,
    requiredItemAttrs: {
      hazmatAllowed: isHazmat,
      tempControlled: isCold,
      tempMin: loc.tempMin,
      tempMax: loc.tempMax,
      maxWeightLbs: loc.maxPalletWeightLbs ?? (isBulk ? 3000 : 2500),
      maxDimIn: { l: 48, w: 40, h: isBulk ? 96 : 60 },
      abcClass: isForward ? ["A", "B"] : isBulk ? ["C"] : ["B", "C"],
    },
    adjacentZones: [],
    putawayPriority: isStaging ? 20 : isForward ? 30 : isBulk ? 80 : 50,
    replenPriority: isForward ? 10 : isBulk ? 80 : 50,
    allowedPalletTypes: ["standard_48x40", "euro_48x32"],
  };
}

function deriveVelocityMetrics(loc: Record<string, any>): any {
  const isForward = String(loc.zone ?? "").toLowerCase().includes("forward");
  const score = Number(loc.velocityScore) || 0;
  return {
    picksPerDay: isForward ? Math.max(score / 10, 0) : score / 10,
    linesPerDay: isForward ? Math.max(score / 5, 0) : score / 5,
    cubicVelocity: score,
    lastCalculated: new Date().toISOString(),
    manualOverride: false,
  };
}

function deriveZoneAdjacency(loc: Record<string, any>): any {
  const isDock = loc.type === "DROP";
  const isForward = String(loc.zone ?? "").toLowerCase().includes("forward");
  return {
    ...DEFAULT_ZONE_ADJACENCY,
    adjacent: [],
    toShippingDockSec: isForward ? 60 : 300,
    toReceivingDockSec: isDock ? 30 : 180,
  };
}

function locationMasterBackfill(loc: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {};

  if (!loc.slottingRules) patch.slottingRules = deriveSlottingRules(loc);
  if (!loc.velocityMetrics) patch.velocityMetrics = deriveVelocityMetrics(loc);
  if (!loc.zoneAdjacency) patch.zoneAdjacency = deriveZoneAdjacency(loc);

  if (!loc.status) {
    patch.status = String(loc.notes ?? "").toLowerCase().includes("hold")
      ? "quarantine"
      : "active";
  }
  if (!loc.lastCycleCount) patch.lastCycleCount = new Date().toISOString();
  if (loc.cycleCountFreqDays === undefined) {
    patch.cycleCountFreqDays = loc.type === "FLR" ? 180 : loc.pickable ? 30 : 90;
  }
  if (loc.putawaySequence === undefined) {
    patch.putawaySequence = patch.slottingRules?.putawayPriority ?? 50;
  }
  if (loc.maxPalletWeightLbs === undefined) {
    patch.maxPalletWeightLbs = loc.type === "FLR" ? 3000 : 2500;
  }
  if (loc.maxPalletHeightIn === undefined) {
    patch.maxPalletHeightIn = loc.type === "FLR" ? 96 : 72;
  }
  if (loc.clearanceHeightIn === undefined) {
    patch.clearanceHeightIn = loc.type === "FLR" ? 120 : 96;
  }

  return patch;
}

/* ───── Runner ─────────────────────────────────────────────────────── */

/**
 * Recursively remove undefined values so Firestore accepts the payload.
 * Firestore rejects `undefined` anywhere in the document tree, including
 * inside nested arrays of objects (e.g. packHierarchy[].parentGtin).
 */
function stripUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value
      .map((v) => stripUndefinedDeep(v))
      .filter((v) => v !== undefined);
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

async function migrateCollection(
  collectionName: string,
  build: (doc: Record<string, any>) => Record<string, any>,
) {
  console.log(`\n── ${collectionName} ───────────────────────────────`);
  const snapshot = await db.collection(collectionName).get();
  console.log(`Scanning ${snapshot.size} document(s)…`);

  let updated = 0;
  let skipped = 0;
  const batch = db.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, any>;
    const patch = stripUndefinedDeep(build(data)) as Record<string, any>;
    const keys = Object.keys(patch);

    if (keys.length === 0) {
      skipped++;
      continue;
    }

    updated++;
    console.log(
      `  • ${doc.id}: +${keys.length} field(s) → ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? "…" : ""}`,
    );

    if (!DRY_RUN) {
      batch.set(doc.ref, patch, { merge: true });
      pending++;
      if (pending >= 400) {
        await batch.commit();
        pending = 0;
      }
    }
  }

  if (!DRY_RUN && pending > 0) {
    await batch.commit();
  }

  console.log(
    `Result: ${updated} updated, ${skipped} already complete${DRY_RUN ? " (DRY RUN — nothing written)" : ""}.`,
  );
  return updated;
}

async function main() {
  console.log("Item Master & Location Master enhancement migration");
  console.log(`Project: wms-3pl-79a05`);
  console.log(`Mode:    ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  const itemCount = await migrateCollection("itemMaster", itemMasterBackfill);
  const locCount = await migrateCollection("locationMaster", locationMasterBackfill);

  console.log("\n════════════════════════════════════════════");
  console.log(`itemMaster:     ${itemCount} document(s) updated`);
  console.log(`locationMaster: ${locCount} document(s) updated`);
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
