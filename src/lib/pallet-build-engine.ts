/**
 * ============================================================
 *  MODULE INDEX — Pallet Build Engine
 * ============================================================
 *
 *  Purpose: Compute optimal pallet configurations from Item Master
 *           data (case dimensions, weight, stackability, pallet
 *           constraints) so the system can RECOMMEND how many
 *           pallets to build and how to stack them — instead of
 *           the operator guessing.
 *
 *  Key exports:
 *    • PalletType            — Standard 48x40, Euro 48x32, Half 48x20, Custom
 *    • StackPattern          — column | interlock | brick | pinwheel
 *    • PalletBuildRecommendation — the result of a build calculation
 *    • recommendPalletBuild() — main entry point
 *    • casesPerLayer()       — pattern-aware layer calculation
 *    • convertPackQuantity() — GTIN hierarchy pack conversion
 *    • findPackConversion()  — build the pack conversion graph
 *    • packLabelForLevel()   — human label for a pack level
 *
 *  Algorithm (see recommendPalletBuild):
 *    1. Resolve pallet footprint from pallet type (or custom dims)
 *    2. For each stack pattern, compute cases-per-layer
 *    3. Derive layers, height, weight per pallet
 *    4. Validate against max height / max weight / stackability
 *    5. Score patterns (interlock > brick > column > pinwheel) and
 *       prefer the pattern that minimises pallet count
 *    6. Return the best valid recommendation with a rationale
 *
 *  Firestore:
 *    Recommendations are computed on demand (pure function) and the
 *    resulting pallets are persisted via pallet-data / firestore-data.
 *    Reusable templates live in the `palletBuildTemplates` collection.
 * ============================================================
 */

import type {
  ItemMasterRecord,
  PalletBuildConfig,
  GTINHierarchy,
  PackLevel,
} from "./master-data";

/* ───── Pallet geometry ─────────────────────────────────────────────── */

export type PalletType = "standard_48x40" | "euro_48x32" | "half_48x20" | "custom";

export type StackPattern = "column" | "interlock" | "brick" | "pinwheel";

export type PalletFootprint = {
  /** Usable length in inches */
  lengthIn: number;
  /** Usable width in inches */
  widthIn: number;
  /** Deck height in inches (pallet itself) */
  deckHeightIn: number;
  label: string;
};

/** Standard GMA pallet footprints (usable deck area, inches) */
export const PALLET_FOOTPRINTS: Record<Exclude<PalletType, "custom">, PalletFootprint> = {
  standard_48x40: { lengthIn: 48, widthIn: 40, deckHeightIn: 5, label: "48 x 40 (Standard)" },
  euro_48x32: { lengthIn: 48, widthIn: 32, deckHeightIn: 5, label: "48 x 32 (Euro)" },
  half_48x20: { lengthIn: 48, widthIn: 20, deckHeightIn: 5, label: "48 x 20 (Half)" },
};

/** Pattern stability score — higher is a more stable stack */
const PATTERN_STABILITY: Record<StackPattern, number> = {
  interlock: 100,
  brick: 85,
  column: 70,
  pinwheel: 60,
};

/* ───── Recommendation result ───────────────────────────────────────── */

export type PalletBuildRecommendation = {
  /** Number of pallets required */
  palletCount: number;
  /** Units (or cases) per pallet */
  unitsPerPallet: number;
  /** Cases per layer (for column/brick-style stacking) */
  casesPerLayer: number;
  /** Number of layers per pallet */
  layersPerPallet: number;
  /** Recommended stacking pattern */
  pattern: StackPattern;
  /** Total stacked height in inches (excluding pallet deck) */
  stackedHeightIn: number;
  /** Total weight per pallet in lbs */
  weightPerPalletLbs: number;
  /** Whether the recommendation satisfies all constraints */
  valid: boolean;
  /** Human-readable reasons / warnings */
  notes: string[];
  /** Machine-readable constraint violations */
  violations: PalletViolation[];
  /** The pallet footprint used */
  footprint: PalletFootprint;
  /** All evaluated patterns with their scores (for UI transparency) */
  alternatives: Array<{
    pattern: StackPattern;
    casesPerLayer: number;
    casesPerPallet: number;
    layersPerPallet: number;
    palletCount: number;
    heightIn: number;
    weightLbs: number;
    valid: boolean;
    score: number;
  }>;
};

export type PalletViolation =
  | "height_exceeded"
  | "weight_exceeded"
  | "stack_height_exceeded"
  | "non_stackable"
  | "oversize_case"
  | "zero_quantity";

/* ───── Helpers ─────────────────────────────────────────────────────── */

/** Resolve the pallet footprint for a given config */
export function resolveFootprint(config: PalletBuildConfig): PalletFootprint {
  if (config.palletType === "custom" && config.customPalletDimsIn) {
    const { l, w } = config.customPalletDimsIn;
    return { lengthIn: l, widthIn: w, deckHeightIn: 5, label: `${l} x ${w} (Custom)` };
  }
  return (
    PALLET_FOOTPRINTS[config.palletType as Exclude<PalletType, "custom">] ??
    PALLET_FOOTPRINTS.standard_48x40
  );
}

/**
 * Fit a case (lengthIn x widthIn) onto a pallet footprint, allowing the
 * case to be rotated 90 degrees. Returns the number of cases that fit in
 * a single layer for the given pattern.
 */
export function casesPerLayer(
  caseLengthIn: number,
  caseWidthIn: number,
  caseHeightIn: number,
  footprint: PalletFootprint,
  pattern: StackPattern,
): number {
  if (caseLengthIn <= 0 || caseWidthIn <= 0) return 0;

  const tryFit = (l: number, w: number): number => {
    const alongLength = Math.floor(footprint.lengthIn / l);
    const alongWidth = Math.floor(footprint.widthIn / w);
    if (alongLength <= 0 || alongWidth <= 0) return 0;
    return alongLength * alongWidth;
  };

  // Base (column) count using the best orientation
  const flat = Math.max(tryFit(caseLengthIn, caseWidthIn), tryFit(caseWidthIn, caseLengthIn));

  switch (pattern) {
    case "interlock":
      // Interlocked layers waste ~8% of the footprint
      return Math.max(1, Math.floor(flat * 0.92));
    case "brick":
      // Brick bond wastes ~5%
      return Math.max(1, Math.floor(flat * 0.95));
    case "pinwheel":
      // Pinwheel is efficient on odd footprints, slightly wasteful otherwise
      return Math.max(1, Math.floor(flat * 0.9));
    case "column":
    default:
      return flat;
  }
}

/** Case-level dimensions for an item, honouring the stock pack level */
export function caseDimensionsFor(item: ItemMasterRecord): {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
  unitsPerCase: number;
} {
  const lengthIn = item.caseLengthIn ?? item.lengthIn;
  const widthIn = item.caseWidthIn ?? item.widthIn;
  const heightIn = item.caseHeightIn ?? item.heightIn;
  const weightLbs = item.caseWeightLbs || item.weightLbs * (item.caseQty || 1);
  return {
    lengthIn,
    widthIn,
    heightIn,
    weightLbs,
    unitsPerCase: item.caseQty || 1,
  };
}

/* ───── Main recommendation ─────────────────────────────────────────── */

export type RecommendPalletBuildArgs = {
  item: ItemMasterRecord;
  /** Total units to palletize */
  quantity: number;
  /** Override the item's own pallet build config */
  config?: Partial<PalletBuildConfig>;
  /** Extra allowed stacking height (e.g. rack clearance) */
  clearanceHeightIn?: number;
};

/**
 * Recommend how to palletize a quantity of an item.
 *
 * Returns the best valid pattern plus the full set of evaluated
 * alternatives so the UI can explain the decision.
 */
export function recommendPalletBuild(
  args: RecommendPalletBuildArgs,
): PalletBuildRecommendation {
  const { item, quantity } = args;
  const config: PalletBuildConfig = {
    ...item.palletBuild,
    ...(args.config ?? {}),
  };

  const footprint = resolveFootprint(config);
  const dims = caseDimensionsFor(item);
  const unitsPerCase = dims.unitsPerCase || 1;
  const totalCases = Math.ceil(quantity / unitsPerCase);

  const maxStackHeight =
    config.stackability === "limited" && config.maxStackHeightIn
      ? config.maxStackHeightIn
      : config.maxPalletHeightIn;

  if (quantity <= 0) {
    return {
      palletCount: 0,
      unitsPerPallet: 0,
      casesPerLayer: 0,
      layersPerPallet: 0,
      pattern: config.palletPattern,
      stackedHeightIn: 0,
      weightPerPalletLbs: 0,
      valid: false,
      notes: ["Nothing to palletize — quantity is zero."],
      violations: ["zero_quantity"],
      footprint,
      alternatives: [],
    };
  }

  const notes: string[] = [];
  const violations: PalletViolation[] = [];

  // Hard check: a single case must physically fit the pallet footprint
  const fitsFootprint =
    (dims.lengthIn <= footprint.lengthIn && dims.widthIn <= footprint.widthIn) ||
    (dims.widthIn <= footprint.lengthIn && dims.lengthIn <= footprint.widthIn);
  if (!fitsFootprint) {
    violations.push("oversize_case");
    notes.push(
      `Case ${dims.lengthIn}" x ${dims.widthIn}" exceeds pallet footprint ${footprint.lengthIn}" x ${footprint.widthIn}".`,
    );
  }

  const patterns: StackPattern[] = ["interlock", "brick", "column", "pinwheel"];
  const alternatives: PalletBuildRecommendation["alternatives"] = [];

  for (const pattern of patterns) {
    const cpl = casesPerLayer(
      dims.lengthIn,
      dims.widthIn,
      dims.heightIn,
      footprint,
      pattern,
    );
    if (cpl <= 0) {
      alternatives.push({
        pattern,
        casesPerLayer: 0,
        casesPerPallet: 0,
        layersPerPallet: 0,
        palletCount: 0,
        heightIn: 0,
        weightLbs: 0,
        valid: false,
        score: 0,
      });
      continue;
    }

    // Apply item-level caps (geometric fit may exceed the configured limits)
    const cappedCpl = config.maxCasesPerLayer
      ? Math.min(cpl, config.maxCasesPerLayer)
      : cpl;

    // How many layers can we legally stack? Driven by the height limits
    // and the item's stackability, NOT by the quantity.
    const layersByHeight = Math.floor(config.maxPalletHeightIn / dims.heightIn);
    let allowedLayers = layersByHeight;
    if (config.stackability === "limited" && config.maxStackHeightIn) {
      allowedLayers = Math.min(
        allowedLayers,
        Math.floor(config.maxStackHeightIn / dims.heightIn),
      );
    }
    if (config.stackability === "non-stackable" || config.stackability === "crushable") {
      allowedLayers = 1;
    }
    if (config.maxLayers) allowedLayers = Math.min(allowedLayers, config.maxLayers);

    // A single layer must physically fit within the height limits
    if (allowedLayers < 1) {
      violations.push("height_exceeded");
      alternatives.push({
        pattern,
        casesPerLayer: cappedCpl,
        casesPerPallet: 0,
        layersPerPallet: 0,
        palletCount: 0,
        heightIn: 0,
        weightLbs: 0,
        valid: false,
        score: 0,
      });
      continue;
    }

    // Cases that fit on a single pallet at the legal stack height
    const casesPerPallet = cappedCpl * allowedLayers;
    const palletCount = Math.max(1, Math.ceil(totalCases / casesPerPallet));

    // Layers actually used on a FULL pallet (the last pallet may be partial)
    const layersPerPallet = allowedLayers;
    const heightIn = layersPerPallet * dims.heightIn;
    const weightLbs = cappedCpl * layersPerPallet * dims.weightLbs;

    let valid = true;
    if (heightIn > config.maxPalletHeightIn) valid = false;
    if (weightLbs > config.maxPalletWeightLbs) valid = false;
    if (config.stackability === "limited" && config.maxStackHeightIn) {
      if (heightIn > config.maxStackHeightIn) valid = false;
    }

    // Score: stability first, then efficiency (fewer pallets, tighter stack)
    const score =
      PATTERN_STABILITY[pattern] +
      (valid ? 200 : 0) -
      palletCount * 10 -
      Math.max(0, heightIn - config.maxPalletHeightIn) * 2;

    alternatives.push({
      pattern,
      casesPerLayer: cappedCpl,
      casesPerPallet,
      layersPerPallet,
      palletCount,
      heightIn,
      weightLbs: +weightLbs.toFixed(1),
      valid,
      score,
    });
  }

  const best = alternatives
    .filter((a) => a.valid && a.palletCount > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!best) {
    // Nothing fits — return the most conservative estimate with violations
    const fallback =
      alternatives.filter((a) => a.casesPerLayer > 0).sort((a, b) => b.score - a.score)[0] ??
      alternatives[0];
    violations.push(
      fallback.heightIn > config.maxPalletHeightIn ? "height_exceeded" : "weight_exceeded",
    );
    notes.push(
      `No stacking pattern satisfies the limits (max ${config.maxPalletHeightIn}" / ${config.maxPalletWeightLbs} lb). Relax constraints or split the receipt.`,
    );
    return {
      palletCount: fallback.palletCount,
      unitsPerPallet: fallback.casesPerPallet * unitsPerCase,
      casesPerLayer: fallback.casesPerLayer,
      layersPerPallet: fallback.layersPerPallet,
      pattern: fallback.pattern,
      stackedHeightIn: fallback.heightIn,
      weightPerPalletLbs: fallback.weightLbs,
      valid: false,
      notes,
      violations,
      footprint,
      alternatives,
    };
  }

  // Optional refinements to the winning pattern
  if (config.stackability === "limited" && config.maxStackHeightIn) {
    notes.push(
      `Limited stackability — max stack height ${config.maxStackHeightIn}" (${best.layersPerPallet} layers).`,
    );
  }
  if (config.maxCasesPerLayer && best.casesPerLayer === config.maxCasesPerLayer) {
    notes.push(
      `Cases per layer capped at ${config.maxCasesPerLayer} by item configuration.`,
    );
  }
  if (config.maxLayers && best.layersPerPallet === config.maxLayers) {
    notes.push(
      `Layers per pallet capped at ${config.maxLayers} by item configuration — ${best.palletCount} pallets required.`,
    );
  }
  if (best.weightLbs > config.maxPalletWeightLbs * 0.9) {
    notes.push(
      `Pallet weight ${best.weightLbs} lb is within 10% of the ${config.maxPalletWeightLbs} lb limit.`,
    );
  }

  return {
    palletCount: best.palletCount,
    unitsPerPallet: best.casesPerPallet * unitsPerCase,
    casesPerLayer: best.casesPerLayer,
    layersPerPallet: best.layersPerPallet,
    pattern: best.pattern,
    stackedHeightIn: best.heightIn,
    weightPerPalletLbs: best.weightLbs,
    valid: true,
    notes,
    violations,
    footprint,
    alternatives,
  };
}

/* ============================================================
 *  GTIN Pack Conversion
 * ============================================================ */

/** A conversion edge in the pack hierarchy graph */
export type PackConversion = {
  from: PackLevel;
  to: PackLevel;
  /** Units of `to` contained in one `from` */
  qtyPerParent: number;
  parentGtin?: string;
  childGtin?: string;
};

/**
 * Build the pack conversion graph from an item's GTIN hierarchy.
 * Each entry declares how many child units fit inside one parent.
 */
export function findPackConversion(hierarchy: GTINHierarchy[]): PackConversion[] {
  const edges: PackConversion[] = [];
  for (const h of hierarchy) {
    edges.push({
      from: h.packLevel,
      to: h.packLevel,
      qtyPerParent: h.qtyPerParent,
      parentGtin: h.parentGtin,
      childGtin: h.childGtin,
    });
  }
  return edges;
}

/** Level ordering used to walk the hierarchy (each → inner → master → pallet) */
const LEVEL_ORDER: PackLevel[] = ["each", "inner", "master", "pallet"];

export type PackConversionResult = {
  ok: boolean;
  quantity: number;
  fromLevel: PackLevel;
  toLevel: PackLevel;
  /** Human label, e.g. "24 each per case" */
  label: string;
  error?: string;
};

/**
 * Convert a quantity between two pack levels using the GTIN hierarchy.
 *
 * Example:
 *   convertPackQuantity(item, 48, "each", "inner")
 *   → { ok: true, quantity: 2, label: "2 inner packs" }
 */
export function convertPackQuantity(
  item: ItemMasterRecord,
  quantity: number,
  fromLevel: PackLevel,
  toLevel: PackLevel,
): PackConversionResult {
  if (fromLevel === toLevel) {
    return {
      ok: true,
      quantity,
      fromLevel,
      toLevel,
      label: `${quantity} ${packLabelForLevel(fromLevel)}`,
    };
  }

  const hierarchy = item.packHierarchy ?? [];
  if (hierarchy.length === 0) {
    return {
      ok: false,
      quantity,
      fromLevel,
      toLevel,
      label: "",
      error: `No pack hierarchy defined for ${item.sku}`,
    };
  }

  const fromIdx = LEVEL_ORDER.indexOf(fromLevel);
  const toIdx = LEVEL_ORDER.indexOf(toLevel);
  if (fromIdx === -1 || toIdx === -1) {
    return {
      ok: false,
      quantity,
      fromLevel,
      toLevel,
      label: "",
      error: "Unknown pack level",
    };
  }

  // Walk the level chain. Each hierarchy entry for level L (L > each) states
  // "one L contains qtyPerParent units of the level directly below L".
  //   - going UP   (each → inner): divide by the target level's qtyPerParent
  //   - going DOWN (master → inner): multiply by the level being left's qtyPerParent
  const step = fromIdx > toIdx ? -1 : 1;
  let factor = 1;
  let missing = false;

  for (let i = fromIdx; i !== toIdx; i += step) {
    // The "upper" level of this pair:
    //   up   → the level we are entering (i + 1)
    //   down → the level we are leaving (i)
    const upperLevel = step === 1 ? LEVEL_ORDER[i + 1] : LEVEL_ORDER[i];
    const upper = hierarchy.find((h) => h.packLevel === upperLevel);
    const qty = upper?.qtyPerParent;
    if (!qty) {
      missing = true;
      break;
    }
    factor = step === 1 ? factor / qty : factor * qty;
  }

  if (missing) {
    return {
      ok: false,
      quantity,
      fromLevel,
      toLevel,
      label: "",
      error: `No conversion defined between ${fromLevel} and ${toLevel}`,
    };
  }

  // `factor` already encodes the direction (divided going up, multiplied
  // going down), so a single multiplication applies in both cases.
  const converted = quantity * factor;
  // Going UP may produce a fraction (e.g. 1.5 inner packs) — round down.
  // Going DOWN always yields a whole number of larger packs.
  const rounded = step === 1 ? Math.floor(converted) : converted;

  return {
    ok: true,
    quantity: rounded,
    fromLevel,
    toLevel,
    label: `${rounded} ${packLabelForLevel(toLevel)}`,
  };
}

/** Human-readable label for a pack level */
export function packLabelForLevel(level: PackLevel): string {
  switch (level) {
    case "each":
      return "each";
    case "inner":
      return "inner pack";
    case "master":
      return "master pack";
    case "pallet":
      return "pallet";
    default:
      return level;
  }
}

/**
 * Total unit quantity contained in ONE pack of the given level.
 *
 * e.g. each → inner (24 each per inner) → master (4 inner per master)
 *   unitsPerPackLevel(item, "inner")  = 24
 *   unitsPerPackLevel(item, "master") = 24 * 4 = 96
 */
export function unitsPerPackLevel(
  item: ItemMasterRecord,
  level: PackLevel,
): number {
  if (level === "each") return 1;
  const hierarchy = item.packHierarchy ?? [];
  const levelIdx = LEVEL_ORDER.indexOf(level);
  if (levelIdx <= 0) return 0;

  // Walk DOWN from the target level to "each", multiplying as we go.
  let units = 1;
  for (let i = levelIdx; i > 0; i--) {
    const upper = hierarchy.find((h) => h.packLevel === LEVEL_ORDER[i]);
    if (!upper?.qtyPerParent) return 0;
    units *= upper.qtyPerParent;
  }
  return units;
}
