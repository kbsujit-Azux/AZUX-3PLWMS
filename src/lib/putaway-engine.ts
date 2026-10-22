/**
 * ============================================================
 *  MODULE INDEX — Directed Putaway Engine
 * ============================================================
 *
 *  Purpose: Recommend WHERE a newly built pallet should be stored.
 *           Scores every candidate location against the pallet's
 *           characteristics (velocity, storage class, size, weight,
 *           temperature, hazmat) plus operational factors (zone
 *           affinity, travel distance, space utilisation) and
 *           returns a ranked list with human-readable reasons.
 *
 *  Key exports:
 *    • PutawayCandidate   — a scored location suggestion
 *    • recommendPutaway()  — main entry point
 *    • scoreLocation()    — single-location scoring (exported for tests)
 *    • PutawayAlgorithm   — best_fit | nearest_empty | zone_cluster
 *
 *  Scoring weights (configurable):
 *    • Velocity match    30%  — A items → forward pick, C items → reserve
 *    • Zone affinity     25%  — co-locate with existing same-SKU stock
 *    • Travel distance   20%  — nearer to receiving for putaway
 *    • Space efficiency  15%  — least wasted cube
 *    • Constraints       10%  — weight / dimension / hazmat / temp compliance
 *
 *  Note: this is distinct from `slotting-engine.ts`, which re-slots
 *  EXISTING inventory between zones. This engine places NEW pallets.
 * ============================================================
 */

import type {
  ItemMasterRecord,
  LocationRecord,
  VelocityClassification,
} from "./master-data";

export type PutawayAlgorithm = "best_fit" | "nearest_empty" | "zone_cluster";

export type PutawayConstraintViolation = {
  type:
    | "weight"
    | "dimension"
    | "hazmat"
    | "temperature"
    | "capacity"
    | "status"
    | "client";
  detail: string;
};

export type PutawayCandidate = {
  locationId: string;
  warehouseId: string;
  zone: string;
  type: string;
  /** Overall score 0..100 */
  score: number;
  /** Component breakdown for UI transparency */
  breakdown: {
    velocity: number;
    zoneAffinity: number;
    travelDistance: number;
    spaceEfficiency: number;
    constraints: number;
  };
  /** Human-readable reasons this location was recommended */
  reasons: string[];
  /** Reasons the location was rejected (if any) */
  warnings: string[];
  /** Constraint violations — non-empty means the location is not usable */
  violations: PutawayConstraintViolation[];
  /** Estimated free pallet positions after placing this pallet */
  remainingCapacity: number;
};

export type PutawayInput = {
  sku: string;
  itemStyle?: string;
  /** The owning client — a location assigned to another client is excluded. */
  tenantId?: string;
  warehouseId: string;
  /** Pallet physical characteristics */
  weightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  cubeCuFt?: number;
  /** Existing pallets in the warehouse (for zone affinity) */
  existingPallets?: Array<{ sku: string; location: string | null }>;
};

export type PutawayWeights = {
  velocity: number;
  zoneAffinity: number;
  travelDistance: number;
  spaceEfficiency: number;
  constraints: number;
};

export const DEFAULT_PUTAWAY_WEIGHTS: PutawayWeights = {
  velocity: 0.3,
  zoneAffinity: 0.25,
  travelDistance: 0.2,
  spaceEfficiency: 0.15,
  constraints: 0.1,
};

/* ───── Helpers ─────────────────────────────────────────────────────── */

/** Zone a location belongs to (used for affinity + velocity matching) */
export function locationZone(location: LocationRecord): string {
  if (location.zoneType) return location.zoneType;
  const z = location.zone.toLowerCase();
  if (z.includes("forward") || z.includes("pick")) return "forward_pick";
  if (z.includes("bulk") || z.includes("reserve")) return "reserve";
  if (z.includes("hazmat")) return "hazmat";
  if (z.includes("cold")) return "cold";
  if (z.includes("stage") || z.includes("dock") || z.includes("drop")) return "staging";
  return "reserve";
}

/**
 * Storage class an item should live in.
 *
 * Derived from the ABC velocity class so that fast movers land in forward
 * pick and slow movers in reserve / bulk. Special classes (cold, hazmat)
 * are honoured when explicitly assigned.
 */
export function storageClassFor(item?: ItemMasterRecord): string {
  if (!item) return "reserve";
  if (item.hazmat) return "hazmat";
  const explicit = item.velocity?.storageClass;
  if (explicit === "cold" || explicit === "hazmat") return explicit;
  const abc = item.velocity?.abcClass ?? "B";
  return abc === "A" ? "forward" : abc === "C" ? "bulk" : "reserve";
}

/**
 * A location is usable by a client when it is SHARED (no tenant assigned)
 * or assigned to that client. A location owned by another client is never
 * a valid putaway target.
 */
export function locationAvailableToClient(
  location: { tenantId?: string | null },
  tenantId?: string,
): boolean {
  // No client context — treat every location as available.
  if (!tenantId) return true;
  if (!location.tenantId) return true;
  return location.tenantId === tenantId;
}

/** Ideal zone for a storage class */
export function idealZoneFor(storageClass: string): string {
  switch (storageClass) {
    case "forward":
      return "forward_pick";
    case "bulk":
      return "bulk";
    case "cold":
      return "cold";
    case "hazmat":
      return "hazmat";
    case "staging":
      return "staging";
    default:
      return "reserve";
  }
}

/* ───── Constraint checking ─────────────────────────────────────────── */

export function checkConstraints(
  location: LocationRecord,
  input: PutawayInput,
  item?: ItemMasterRecord,
): PutawayConstraintViolation[] {
  const violations: PutawayConstraintViolation[] = [];

  // A location assigned to another client is never a valid target.
  if (!locationAvailableToClient(location, input.tenantId)) {
    violations.push({
      type: "client",
      detail: `Location is assigned to another client`,
    });
  }

  if (location.status !== "active") {
    violations.push({
      type: "status",
      detail: `Location is ${location.status}`,
    });
  }

  if (location.occupiedPallets >= location.capacityPallets) {
    violations.push({
      type: "capacity",
      detail: "No free pallet positions",
    });
  }

  const maxWeight = location.maxPalletWeightLbs ?? 2500;
  if (input.weightLbs > maxWeight) {
    violations.push({
      type: "weight",
      detail: `Pallet ${input.weightLbs} lb exceeds ${maxWeight} lb limit`,
    });
  }

  const maxHeight = location.maxPalletHeightIn ?? 72;
  if (input.heightIn > maxHeight) {
    violations.push({
      type: "dimension",
      detail: `Pallet height ${input.heightIn}" exceeds ${maxHeight}" limit`,
    });
  }

  const reqDims = location.slottingRules?.requiredItemAttrs?.maxDimIn;
  if (reqDims) {
    const fits =
      (input.lengthIn <= reqDims.l && input.widthIn <= reqDims.w) ||
      (input.widthIn <= reqDims.l && input.lengthIn <= reqDims.w);
    if (!fits) {
      violations.push({
        type: "dimension",
        detail: `Pallet footprint ${input.lengthIn}" x ${input.widthIn}" exceeds ${reqDims.l}" x ${reqDims.w}"`,
      });
    }
  }

  const hazmatAllowed = location.slottingRules?.requiredItemAttrs?.hazmatAllowed ?? location.hazmatAllowed ?? false;
  if (item?.hazmat && !hazmatAllowed) {
    violations.push({
      type: "hazmat",
      detail: "Hazmat item in a non-hazmat location",
    });
  }

  const tempControlled = location.slottingRules?.requiredItemAttrs?.tempControlled ?? location.tempControlled ?? false;
  if (item?.storageTempMin !== undefined || item?.storageTempMax !== undefined) {
    if (!tempControlled) {
      violations.push({
        type: "temperature",
        detail: "Item requires temperature control",
      });
    } else {
      const locMin = location.slottingRules?.requiredItemAttrs?.tempMin ?? location.tempMin;
      const locMax = location.slottingRules?.requiredItemAttrs?.tempMax ?? location.tempMax;
      if (
        (locMin !== undefined && item.storageTempMin !== undefined && item.storageTempMin < locMin) ||
        (locMax !== undefined && item.storageTempMax !== undefined && item.storageTempMax > locMax)
      ) {
        violations.push({
          type: "temperature",
          detail: `Item temp range ${item.storageTempMin}–${item.storageTempMax} not within location ${locMin}–${locMax}`,
        });
      }
    }
  }

  if (location.allowedItemStyles && location.allowedItemStyles.length > 0) {
    const style = input.itemStyle ?? item?.itemStyle;
    if (style && !location.allowedItemStyles.includes(style)) {
      violations.push({
        type: "dimension",
        detail: `Style ${style} not allowed here (${location.allowedItemStyles.join(", ")})`,
      });
    }
  }

  return violations;
}

/* ───── Single location scoring ─────────────────────────────────────── */

export function scoreLocation(
  location: LocationRecord,
  input: PutawayInput,
  item: ItemMasterRecord | undefined,
  weights: PutawayWeights = DEFAULT_PUTAWAY_WEIGHTS,
): PutawayCandidate {
  const violations = checkConstraints(location, input, item);
  const reasons: string[] = [];
  const warnings: string[] = [];

  const storageClass = storageClassFor(item);
  const idealZone = idealZoneFor(storageClass);
  const locZone = locationZone(location);

  /* 1. Velocity match (30%) */
  let velocity = 0;
  const allowedClasses = location.slottingRules?.allowedStorageClasses ?? [];
  if (locZone === idealZone) {
    velocity = 100;
    reasons.push(`Zone "${location.zone}" is the preferred zone for ${storageClass} items`);
  } else if (allowedClasses.includes(storageClass as never)) {
    velocity = 70;
    reasons.push(`Storage class "${storageClass}" is permitted here`);
  } else {
    velocity = 25;
    warnings.push(`Zone "${location.zone}" is not the preferred zone for ${storageClass} items`);
  }

  /* 2. Zone affinity (25%) */
  let zoneAffinity = 0;
  const style = input.itemStyle ?? item?.itemStyle;
  if (style && input.existingPallets?.length) {
    const sameStyle = input.existingPallets.filter((p) => p.sku === input.sku || p.sku.startsWith(style));
    if (sameStyle.length) {
      const sameZone = sameStyle.filter((p) => {
        if (!p.location) return false;
        const loc = location.zone;
        return p.location.includes(loc.split(" ")[0]) || p.location.includes(loc);
      });
      zoneAffinity = sameZone.length > 0 ? 100 : 60;
      reasons.push(
        sameZone.length > 0
          ? `Co-located with ${sameZone.length} existing pallet(s) of this SKU`
          : `${sameStyle.length} existing pallet(s) of this style stored in another zone`,
      );
    } else {
      zoneAffinity = 40;
    }
  } else {
    zoneAffinity = 50;
  }

  /* 3. Travel distance (20%) */
  let travelDistance = 50;
  const toReceiving = location.zoneAdjacency?.toReceivingDockSec ?? 300;
  const toShipping = location.zoneAdjacency?.toShippingDockSec ?? 300;
  if (storageClass === "forward") {
    travelDistance = Math.max(0, 100 - toShipping / 6);
    reasons.push(`Short travel to shipping dock (${toShipping}s) — fast-moving item`);
  } else {
    travelDistance = Math.max(0, 100 - toReceiving / 6);
  }

  /* 4. Space efficiency (15%) */
  let spaceEfficiency = 50;
  const free = location.capacityPallets - location.occupiedPallets;
  if (location.capacityPallets > 0) {
    spaceEfficiency = Math.round((free / location.capacityPallets) * 100);
  }
  if (free <= 0) {
    spaceEfficiency = 0;
  }

  /* 5. Constraints (10%) */
  let constraints = violations.length === 0 ? 100 : Math.max(0, 100 - violations.length * 50);
  for (const v of violations) {
    warnings.push(v.detail);
  }

  const breakdown = {
    velocity: Math.round(velocity),
    zoneAffinity: Math.round(zoneAffinity),
    travelDistance: Math.round(travelDistance),
    spaceEfficiency: Math.round(spaceEfficiency),
    constraints: Math.round(constraints),
  };

  const score = Math.round(
    breakdown.velocity * weights.velocity +
      breakdown.zoneAffinity * weights.zoneAffinity +
      breakdown.travelDistance * weights.travelDistance +
      breakdown.spaceEfficiency * weights.spaceEfficiency +
      breakdown.constraints * weights.constraints,
  );

  return {
    locationId: location.id,
    warehouseId: location.warehouseId,
    zone: location.zone,
    type: location.type,
    score: violations.length > 0 ? Math.max(0, score - 50) : score,
    breakdown,
    reasons,
    warnings,
    violations,
    remainingCapacity: Math.max(0, free),
  };
}

/* ───── Main entry point ────────────────────────────────────────────── */

export type RecommendPutawayArgs = {
  input: PutawayInput;
  locations: LocationRecord[];
  item?: ItemMasterRecord;
  algorithm?: PutawayAlgorithm;
  weights?: PutawayWeights;
  /** How many suggestions to return */
  limit?: number;
};

/**
 * Rank locations for a new pallet and return the top N suggestions.
 * Locations with hard constraint violations are excluded unless
 * `includeInfeasible` is set.
 */
export function recommendPutaway(
  args: RecommendPutawayArgs,
): PutawayCandidate[] {
  const {
    input,
    locations,
    item,
    algorithm = "best_fit",
    weights = DEFAULT_PUTAWAY_WEIGHTS,
    limit = 5,
  } = args;

  const warehouseLocations = locations.filter(
    (l) =>
      l.warehouseId === input.warehouseId &&
      // Never recommend a location that belongs to another client.
      locationAvailableToClient(l, input.tenantId),
  );

  const scored = warehouseLocations.map((l) =>
    scoreLocation(l, input, item, weights),
  );

  const feasible = scored.filter((c) => c.violations.length === 0);

  const ranked = feasible.sort((a, b) => {
    if (algorithm === "nearest_empty") {
      // Prefer empty locations first, then score
      if (a.remainingCapacity !== b.remainingCapacity) {
        return b.remainingCapacity - a.remainingCapacity;
      }
    }
    if (algorithm === "zone_cluster") {
      // Prefer locations that already hold the SKU / share its zone
      if (a.breakdown.zoneAffinity !== b.breakdown.zoneAffinity) {
        return b.breakdown.zoneAffinity - a.breakdown.zoneAffinity;
      }
    }
    return b.score - a.score;
  });

  return ranked.slice(0, limit);
}

/**
 * Suggest a single best location (highest scoring) — used by the
 * pallet build flow to pre-fill the suggestedLocation field.
 */
export function suggestBestLocation(
  args: RecommendPutawayArgs,
): PutawayCandidate | null {
  const results = recommendPutaway({ ...args, limit: 1 });
  return results[0] ?? null;
}
