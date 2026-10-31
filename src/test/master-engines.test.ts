import { describe, it, expect } from "vitest";
import {
  recommendPalletBuild,
  recommendPalletPlan,
  packSizeOf,
  convertPackQuantity,
  casesPerLayer,
  resolveFootprint,
  unitsPerPackLevel,
  type RecommendPalletBuildArgs,
} from "@/lib/pallet-build-engine";
import {
  recommendPutaway,
  scoreLocation,
  checkConstraints,
  locationZone,
  storageClassFor,
  idealZoneFor,
} from "@/lib/putaway-engine";
import {
  buildItemFromRow,
  parseItemMasterCsv,
  ITEM_MASTER_CSV_FIELDS,
  ITEM_MASTER_CSV_HEADERS,
} from "@/lib/item-master-csv";
import type {
  ItemMasterRecord,
  LocationRecord,
  PalletBuildConfig,
  VelocityClassification,
} from "@/lib/master-data";

/* ───── Fixtures ───────────────────────────────────────────────────── */

const defaultPalletBuild: PalletBuildConfig = {
  maxPalletHeightIn: 60,
  maxPalletWeightLbs: 2500,
  stackability: "full",
  palletPattern: "interlock",
  allowMixedSku: false,
  palletType: "standard_48x40",
};

const defaultVelocity: VelocityClassification = {
  abcClass: "B",
  annualPicks: 500,
  linesPerOrder: 3,
  storageClass: "reserve",
};

function makeItem(overrides: Partial<ItemMasterRecord> = {}): ItemMasterRecord {
  return {
    sku: "TEST-001",
    upc: "081234500001",
    gtin: "0081234500001",
    itemStyle: "TEST-1",
    description: "Test item",
    category: "General",
    uom: "EA",
    tenantId: "acme",
    packHierarchy: [
      {
        parentGtin: undefined,
        childGtin: "0081234500001",
        qtyPerParent: 1,
        packLevel: "each",
        isBaseUnit: true,
      },
      {
        parentGtin: "0081234500001",
        childGtin: undefined,
        qtyPerParent: 24,
        packLevel: "inner",
        packLengthIn: 18,
        packWidthIn: 12,
        packHeightIn: 10,
        packWeightLbs: 25,
        isBaseUnit: false,
      },
    ],
    basePackLevel: "each",
    caseQty: 24,
    innerPackQty: 1,
    lengthIn: 18,
    widthIn: 12,
    heightIn: 10,
    weightLbs: 1,
    caseLengthIn: 18,
    caseWidthIn: 12,
    caseHeightIn: 10,
    caseWeightLbs: 25,
    cbmPerCase: 0.004643,
    palletBuild: defaultPalletBuild,
    velocity: defaultVelocity,
    unitCost: 10,
    unitPrice: 25,
    nmfc: "009300",
    freightClass: "100",
    lotControl: false,
    expiryControl: false,
    serialControl: false,
    hazmat: false,
    active: true,
    source: "CSV",
    effectiveAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeLocation(overrides: Partial<LocationRecord> = {}): LocationRecord {
  return {
    id: "A12-03-B",
    warehouseId: "atl1",
    type: "RACK",
    zone: "Reserve",
    capacityPallets: 1,
    occupiedPallets: 0,
    pickable: true,
    allowedItemStyles: null,
    slottingRules: {
      allowedStorageClasses: ["forward", "reserve", "bulk"],
      putawayPriority: 50,
      replenPriority: 50,
      allowedPalletTypes: ["standard_48x40"],
    },
    velocityMetrics: {
      picksPerDay: 0,
      linesPerDay: 0,
      cubicVelocity: 0,
      lastCalculated: "2026-01-01T00:00:00Z",
      manualOverride: false,
    },
    zoneAdjacency: {
      adjacent: [],
      toShippingDockSec: 300,
      toReceivingDockSec: 180,
    },
    status: "active",
    maxPalletWeightLbs: 2500,
    maxPalletHeightIn: 72,
    clearanceHeightIn: 96,
    ...overrides,
  };
}

const buildArgs = (over: Partial<RecommendPalletBuildArgs> = {}): RecommendPalletBuildArgs => ({
  item: makeItem(),
  quantity: 240,
  ...over,
});

/* ───── Pallet Build Engine ────────────────────────────────────────── */

describe("Pallet Build Engine", () => {
  it("computes cases per layer from the pallet footprint", () => {
    const fp = resolveFootprint(defaultPalletBuild);
    expect(fp.lengthIn).toBe(48);
    expect(fp.widthIn).toBe(40);
    // 18 x 12 case fits 2 x 3 unrotated, 4 x 2 rotated => 8 is the better fit
    expect(casesPerLayer(18, 12, 10, fp, "column")).toBe(8);
    // interlock / brick / pinwheel apply a stacking-efficiency factor
    expect(casesPerLayer(18, 12, 10, fp, "interlock")).toBeLessThan(8);
  });

  it("rotates the case when it only fits the other way", () => {
    const fp = resolveFootprint(defaultPalletBuild);
    // 40 x 18 fits rotated: 48/18 = 2, 40/40 = 1 => 2
    expect(casesPerLayer(40, 18, 10, fp, "column")).toBe(2);
  });

  it("recommends a valid pallet count for a standard receipt", () => {
    const rec = recommendPalletBuild(buildArgs({ quantity: 240 }));
    expect(rec.valid).toBe(true);
    expect(rec.palletCount).toBeGreaterThan(0);
    expect(rec.casesPerLayer).toBeGreaterThan(0);
    expect(rec.violations).toHaveLength(0);
  });

  it("scales the pallet count with the quantity", () => {
    const small = recommendPalletBuild(buildArgs({ quantity: 240 }));
    const large = recommendPalletBuild(buildArgs({ quantity: 5000 }));
    expect(large.palletCount).toBeGreaterThan(small.palletCount);
  });

  it("flags a violation when a single layer exceeds the max height", () => {
    const rec = recommendPalletBuild(
      buildArgs({
        quantity: 5000,
        item: makeItem({
          palletBuild: { ...defaultPalletBuild, maxPalletHeightIn: 9 },
        }),
      }),
    );
    expect(rec.valid).toBe(false);
    expect(rec.violations).toContain("height_exceeded");
  });

  it("flags a violation when the pallet exceeds the max weight", () => {
    const rec = recommendPalletBuild(
      buildArgs({
        quantity: 240,
        item: makeItem({
          palletBuild: { ...defaultPalletBuild, maxPalletWeightLbs: 10 },
        }),
      }),
    );
    expect(rec.valid).toBe(false);
    expect(rec.violations).toContain("weight_exceeded");
  });

  it("caps layers at one for non-stackable items (more pallets needed)", () => {
    const stackable = recommendPalletBuild(buildArgs({ quantity: 240 }));
    const nonStackable = recommendPalletBuild(
      buildArgs({
        quantity: 240,
        item: makeItem({
          palletBuild: { ...defaultPalletBuild, stackability: "non-stackable" },
        }),
      }),
    );
    expect(nonStackable.valid).toBe(true);
    expect(nonStackable.layersPerPallet).toBe(1);
    expect(nonStackable.palletCount).toBeGreaterThan(stackable.palletCount);
  });

  it("enforces the max cases per layer cap", () => {
    const uncapped = recommendPalletBuild(buildArgs({ quantity: 5000 }));
    const capped = recommendPalletBuild(
      buildArgs({
        quantity: 5000,
        item: makeItem({
          palletBuild: { ...defaultPalletBuild, maxCasesPerLayer: 2 },
        }),
      }),
    );
    expect(capped.valid).toBe(true);
    expect(capped.casesPerLayer).toBe(2);
    expect(capped.palletCount).toBeGreaterThan(uncapped.palletCount);
  });

  it("returns zero quantity for an empty receipt", () => {
    const rec = recommendPalletBuild(buildArgs({ quantity: 0 }));
    expect(rec.valid).toBe(false);
    expect(rec.violations).toContain("zero_quantity");
    expect(rec.palletCount).toBe(0);
  });

  it("evaluates all four stacking patterns", () => {
    const rec = recommendPalletBuild(buildArgs());
    expect(rec.alternatives).toHaveLength(4);
    expect(rec.alternatives.map((a) => a.pattern).sort()).toEqual([
      "brick",
      "column",
      "interlock",
      "pinwheel",
    ]);
  });
});

/* ───── Pallet Plan (the "how many pallets do I build" answer) ──────── */

describe("Pallet plan", () => {
  it("reads the pack size from the pack hierarchy", () => {
    expect(packSizeOf(makeItem())).toBe(24);
  });

  it("never recommends more pallets than cartons", () => {
    // 144 units at a pack size of 24 is 6 cartons.
    const plan = recommendPalletPlan(makeItem(), 144, 24);
    expect(plan.palletCount).toBeLessThanOrEqual(6);
    expect(plan.palletCount).toBeGreaterThan(0);
  });

  it("uses the optimal plan when the engine can build one", () => {
    const plan = recommendPalletPlan(makeItem(), 144, 24);
    expect(plan.basis).toBe("optimal");
    expect(plan.palletCount).toBe(1);
    expect(plan.unitsPerPallet).toBeGreaterThan(24);
    expect(plan.recommendation).toBeDefined();
  });

  it("falls back to one pack per pallet without an Item Master record", () => {
    const plan = recommendPalletPlan(undefined, 144, 24);
    expect(plan.basis).toBe("pack");
    expect(plan.palletCount).toBe(6);
    expect(plan.unitsPerPallet).toBe(24);
  });

  it("falls back to one pack per pallet when no plan fits the limits", () => {
    const impossible = makeItem({
      palletBuild: { ...defaultPalletBuild, maxPalletHeightIn: 1 },
    });
    const plan = recommendPalletPlan(impossible, 144, 24);
    expect(plan.basis).toBe("pack");
    expect(plan.palletCount).toBe(6);
  });

  it("handles a zero quantity without dividing by zero", () => {
    const plan = recommendPalletPlan(makeItem(), 0, 24);
    expect(Number.isFinite(plan.palletCount)).toBe(true);
    expect(plan.palletCount).toBeGreaterThanOrEqual(0);
  });
});

/* ───── GTIN Pack Conversion ───────────────────────────────────────── */

describe("GTIN Pack Conversion", () => {
  it("converts each to inner pack", () => {
    const result = convertPackQuantity(makeItem(), 48, "each", "inner");
    expect(result.ok).toBe(true);
    expect(result.quantity).toBe(2);
  });

  it("converts inner pack back to each", () => {
    const result = convertPackQuantity(makeItem(), 2, "inner", "each");
    expect(result.ok).toBe(true);
    expect(result.quantity).toBe(48);
  });

  it("returns the same quantity for the same level", () => {
    const result = convertPackQuantity(makeItem(), 7, "each", "each");
    expect(result.ok).toBe(true);
    expect(result.quantity).toBe(7);
  });

  it("reports an error when no hierarchy exists", () => {
    const result = convertPackQuantity(makeItem({ packHierarchy: [] }), 10, "each", "master");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("resolves units per pack level", () => {
    expect(unitsPerPackLevel(makeItem(), "inner")).toBe(24);
  });
});

/* ───── Putaway Engine ─────────────────────────────────────────────── */

describe("Directed Putaway Engine", () => {
  const input = {
    sku: "TEST-001",
    itemStyle: "TEST-1",
    tenantId: "acme",
    warehouseId: "atl1",
    weightLbs: 400,
    lengthIn: 48,
    widthIn: 40,
    heightIn: 40,
    existingPallets: [] as Array<{ sku: string; location: string | null }>,
  };

  it("derives the zone from a location record", () => {
    expect(locationZone(makeLocation({ zone: "Forward Pick" }))).toBe("forward_pick");
    expect(locationZone(makeLocation({ zone: "Bulk Floor" }))).toBe("reserve");
    expect(locationZone(makeLocation({ zone: "Receiving Dock" }))).toBe("staging");
  });

  it("maps velocity class to storage class", () => {
    expect(storageClassFor(makeItem({ velocity: { ...defaultVelocity, abcClass: "A" } }))).toBe(
      "forward",
    );
    expect(storageClassFor(makeItem({ velocity: { ...defaultVelocity, abcClass: "C" } }))).toBe(
      "bulk",
    );
    expect(idealZoneFor("forward")).toBe("forward_pick");
  });

  it("returns ranked suggestions for the warehouse", () => {
    const locations = [
      makeLocation({ id: "LOC-1" }),
      makeLocation({ id: "LOC-2", zone: "Forward Pick", zoneType: "forward_pick" }),
      makeLocation({ id: "LOC-3", warehouseId: "ord2" }), // different warehouse
    ];
    const results = recommendPutaway({ input, locations, item: makeItem(), limit: 5 });
    expect(results.length).toBe(2);
    expect(results.map((r) => r.locationId)).not.toContain("LOC-3");
    // scores must be descending
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("excludes locations with no free capacity", () => {
    const locations = [makeLocation({ occupiedPallets: 1, capacityPallets: 1 })];
    const results = recommendPutaway({ input, locations, item: makeItem() });
    expect(results).toHaveLength(0);
  });

  it("excludes non-active locations", () => {
    const locations = [makeLocation({ status: "quarantine" })];
    const results = recommendPutaway({ input, locations, item: makeItem() });
    expect(results).toHaveLength(0);
  });

  it("detects a weight constraint violation", () => {
    const loc = makeLocation({ maxPalletWeightLbs: 100 });
    const violations = checkConstraints(loc, { ...input, weightLbs: 500 });
    expect(violations.some((v) => v.type === "weight")).toBe(true);
  });

  it("detects a hazmat constraint violation", () => {
    const loc = makeLocation({
      hazmatAllowed: false,
      slottingRules: {
        allowedStorageClasses: ["reserve"],
        putawayPriority: 50,
        replenPriority: 50,
        allowedPalletTypes: ["standard_48x40"],
        requiredItemAttrs: { hazmatAllowed: false },
      },
    });
    const violations = checkConstraints(loc, input, makeItem({ hazmat: true }));
    expect(violations.some((v) => v.type === "hazmat")).toBe(true);
  });

  it("detects a style restriction violation", () => {
    const loc = makeLocation({ allowedItemStyles: ["OTHER-STYLE"] });
    const violations = checkConstraints(loc, input, makeItem());
    expect(violations.length).toBeGreaterThan(0);
  });

  it("prefers forward pick for fast movers", () => {
    const fast = makeItem({
      velocity: { ...defaultVelocity, abcClass: "A", storageClass: "forward" },
    });
    const locations = [
      makeLocation({ id: "RESERVE-LOC", zone: "Reserve", zoneType: "reserve" }),
      makeLocation({ id: "FORWARD-LOC", zone: "Forward Pick", zoneType: "forward_pick" }),
    ];
    const results = recommendPutaway({ input, locations, item: fast });
    expect(results[0].locationId).toBe("FORWARD-LOC");
  });

  it("explains its reasoning on every candidate", () => {
    const candidate = scoreLocation(makeLocation(), input, makeItem());
    expect(Array.isArray(candidate.reasons)).toBe(true);
    expect(candidate.breakdown.velocity).toBeGreaterThanOrEqual(0);
    expect(candidate.breakdown.constraints).toBe(100);
  });
});

/* ───── Item Master CSV mapping ────────────────────────────────────── */

describe("Item Master CSV Mapping", () => {
  const mapping = Object.fromEntries(
    ITEM_MASTER_CSV_FIELDS.map((f, i) => [f.key, ITEM_MASTER_CSV_HEADERS[i] ?? ""]),
  );

  it("exposes a column contract covering every enhanced group", () => {
    const groups = new Set(ITEM_MASTER_CSV_FIELDS.map((f) => f.group));
    expect(groups).toContain("pack");
    expect(groups).toContain("apparel");
    expect(groups).toContain("pallet");
    expect(groups).toContain("velocity");
    expect(groups).toContain("compliance");
  });

  it("builds a full record from a mapped row", () => {
    const row: Record<string, string> = {
      sku: "ACM-TEST-001",
      upc: "081234500099",
      gtin: "0081234500099",
      style: "TEST-1",
      description: "Test item",
      uom: "EA",
      category: "Apparel",
      case_qty: "24",
      inner_pack_qty: "1",
      master_pack_qty: "2",
      apparel_style: "HOODIE",
      color_code: "BLK",
      color_name: "Black",
      size_code: "M",
      fit: "regular",
      fabric_primary: "cotton",
      fabric_pct: "80",
      length_in: "22",
      width_in: "16",
      height_in: "14",
      weight_lbs: "1.2",
      case_weight_lbs: "27.8",
      max_pallet_height_in: "55",
      stackability: "limited",
      pallet_pattern: "brick",
      abc_class: "A",
      annual_picks: "15000",
      storage_class: "forward",
      peak_months: "9,10,11",
      unit_cost: "18.50",
      unit_price: "49.99",
      freight_class: "125",
      country_of_origin: "VN",
      brand: "Acme",
    };

    const result = buildItemFromRow({ row, mapping, tenantId: "acme" });
    expect(result.errors).toHaveLength(0);
    const rec = result.record!;
    expect(rec.sku).toBe("ACM-TEST-001");
    expect(rec.caseQty).toBe(24);
    expect(rec.masterPackQty).toBe(2);
    expect(rec.packHierarchy.length).toBe(3);
    expect(rec.apparelAttrs?.style).toBe("HOODIE");
    expect(rec.apparelAttrs?.color.name).toBe("Black");
    expect(rec.palletBuild.stackability).toBe("limited");
    expect(rec.palletBuild.palletPattern).toBe("brick");
    expect(rec.palletBuild.maxPalletHeightIn).toBe(55);
    expect(rec.velocity?.abcClass).toBe("A");
    expect(rec.velocity?.storageClass).toBe("forward");
    expect(rec.velocity?.peakMonths).toEqual([9, 10, 11]);
    expect(rec.source).toBe("CSV");
    expect(rec.tenantId).toBe("acme");
  });

  it("reports a missing required field", () => {
    const result = buildItemFromRow({
      row: { sku: "X" },
      mapping,
      tenantId: "acme",
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.record).toBeUndefined();
  });

  it("parses multiple rows and isolates failures", () => {
    const good: Record<string, string> = {
      sku: "A-1",
      upc: "081234500001",
      description: "Item A",
      case_qty: "10",
      length_in: "12",
      width_in: "10",
      height_in: "8",
      weight_lbs: "1",
      unit_cost: "5",
    };
    const bad: Record<string, string> = { sku: "B-1" };
    const result = parseItemMasterCsv([good, bad], mapping, "acme");
    expect(result.records).toHaveLength(1);
    expect(result.records[0].sku).toBe("A-1");
    // the bad row produces one error per missing required field
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].row).toBe(3);
  });
});
