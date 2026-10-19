/**
 * ============================================================
 *  MODULE INDEX — Master Data (Item Master EDI 832 + Locations)
 * ============================================================
 *
 *  Purpose: Two master data domains:
 *    1. Item Master (EDI 832) — SKU catalog with dimensions,
 *       NMFC, freight class, case specs, and tenant binding.
 *    2. Location Master — Warehouse location definitions with
 *       zone, capacity, pickability, and item-style constraints.
 *
 *  Key types exported:
 *    • ItemMasterRecord          — EDI 832 catalog record per SKU
 *    • LocationRecord            — Warehouse location (RACK/FLR/DROP)
 *    • LocationType              — "FLR" | "DROP" | "RACK"
 *    • MasterException           — Validation error against item master
 *
 *  Data:
 *    • itemMaster[]              — Seed item master records
 *    • locationMaster[]          — Seed location definitions
 *
 *  Helper functions:
 *    • cbmFromInches()           — L×W×H → cubic meters
 *    • nmfcFor()                 — NMFC/freight class lookup by SKU/category
 *    • findItem()                — Item master lookup by SKU
 *    • hasInventoryForSku()      — Inventory existence check
 *    • validateLineAgainstItemMaster() — Inbound/order line validation
 *    • collectMasterExceptions() — Batch validation across all documents
 *    • pickableLocations()       — Filter to allocatable locations
 *    • findLocation()            — Location lookup by ID
 *    • locationOccupancyPct()    — Capacity utilization
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    fetchItemMaster / subscribeItemMaster / addItemToMaster / deleteItemFromMaster
 *    fetchLocations / subscribeLocations
 *
 *  Extension points:
 *    - Add new commodity categories to NMFC_BY_CATEGORY
 *    - Add per-SKU overrides to NMFC_BY_SKU / CASE_SPECS
 *    - Extend LocationRecord with aisle velocity or slotting rules
 * ============================================================
 */

import { inventoryItems } from "./mock-data";
import { inboundShipments } from "./inbound-data";
import { orders } from "./edi-data";

// ============================================================
// New Enhanced Types
// ============================================================

/** Pack level in GTIN hierarchy */
export type PackLevel = "each" | "inner" | "master" | "pallet";

/** GTIN Hierarchy — Parent/Child pack structure */
export type GTINHierarchy = {
  /** Parent GTIN (e.g., Case/Inner Pack GTIN-14) */
  parentGtin?: string;
  /** Child GTIN (e.g., Each/Unit GTIN-14) */
  childGtin?: string;
  /** Quantity of child units in parent pack */
  qtyPerParent: number;
  /** Pack level: 'each' | 'inner' | 'master' | 'pallet' */
  packLevel: PackLevel;
  /** Dimensions at this pack level (inches) */
  packLengthIn?: number;
  packWidthIn?: number;
  packHeightIn?: number;
  /** Weight at this pack level (lbs) */
  packWeightLbs?: number;
  /** Is this the base sellable unit? */
  isBaseUnit: boolean;
};

/** Apparel Attribute Matrix (Style/Color/Size) */
export type ApparelAttributes = {
  /** Style identifier (e.g., "HOODIE-PULLOVER") */
  style: string;
  /** Color code + name (e.g., "BLK-Black", "NVY-Navy") */
  color: { code: string; name: string };
  /** Size code + dimension overrides */
  size: {
    code: string;           // S, M, L, XL, 2XL
    lengthIn?: number;      // Override base dimensions
    widthIn?: number;
    heightIn?: number;
    weightLbs?: number;
  };
  /** Fit type: regular, slim, relaxed, oversized */
  fit?: "regular" | "slim" | "relaxed" | "oversized";
  /** Fabric composition for storage requirements */
  fabric?: {
    primary: string;        // cotton, polyester, blend
    pct: number;
    careCode?: string;      // wash/dry instructions
  };
  /** Season: Spring, Summer, Fall, Winter, Core */
  season?: string;
  /** Gender: Mens, Womens, Unisex, Kids */
  gender?: string;
};

/** Pallet Build Intelligence Configuration */
export type PalletBuildConfig = {
  /** Max pallet height (inches) - warehouse default 60" */
  maxPalletHeightIn: number;
  /** Max pallet weight (lbs) - warehouse default 2500 */
  maxPalletWeightLbs: number;
  /** Max cases per layer (auto-calc from dims) */
  maxCasesPerLayer?: number;
  /** Max layers per pallet */
  maxLayers?: number;
  /** Stackability: 'full' | 'limited' | 'non-stackable' | 'crushable' */
  stackability: "full" | "limited" | "non-stackable" | "crushable";
  /** Max stack height for limited stackability (inches) */
  maxStackHeightIn?: number;
  /** Pallet pattern: 'column' | 'interlock' | 'brick' | 'pinwheel' */
  palletPattern: "column" | "interlock" | "brick" | "pinwheel";
  /** Allow mixed SKU on pallet */
  allowMixedSku: boolean;
  /** Allowed mixed SKU families (by itemStyle) */
  mixedSkuStyles?: string[];
  /** Overhang allowed (inches) */
  overhangIn?: number;
  /** Pallet type: 'standard_48x40' | 'euro_48x32' | 'half_48x20' | 'custom' */
  palletType: "standard_48x40" | "euro_48x32" | "half_48x20" | "custom";
  /** Custom pallet dims if type=custom */
  customPalletDimsIn?: { l: number; w: number; h: number };
};

/** Velocity & Slotting Classification */
export type VelocityClassification = {
  /** ABC classification: A (fast), B (medium), C (slow) */
  abcClass: "A" | "B" | "C";
  /** Annual picks per year */
  annualPicks: number;
  /** Lines per order (avg) */
  linesPerOrder: number;
  /** Seasonal peak months (1-12) */
  peakMonths?: number[];
  /** Storage class: 'forward' | 'reserve' | 'bulk' | 'cold' | 'hazmat' */
  storageClass: "forward" | "reserve" | "bulk" | "cold" | "hazmat";
  /** Replenishment trigger (days of supply) */
  reorderDays?: number;
};

/** Substitution Rule */
export type SubstitutionRule = {
  /** Alternate SKU */
  alternateSku: string;
  /** Type: 'substitute' | 'upgrade' | 'downgrade' | 'equivalent' */
  type: "substitute" | "upgrade" | "downgrade" | "equivalent";
  /** Priority (1 = first choice) */
  priority: number;
  /** Condition: 'always' | 'stockout' | 'customer_request' */
  condition: "always" | "stockout" | "customer_request";
  /** Cost impact % */
  costImpactPct?: number;
};

/** Slotting Intelligence Rules */
export type SlottingRules = {
  /** Storage class compatibility: which item storage classes can go here */
  allowedStorageClasses: ("forward" | "reserve" | "bulk" | "cold" | "hazmat" | "staging")[];
  /** Required item attributes for this location */
  requiredItemAttrs?: {
    hazmatAllowed?: boolean;
    tempControlled?: boolean;
    tempMin?: number;
    tempMax?: number;
    maxWeightLbs?: number;
    maxDimIn?: { l: number; w: number; h: number };
    abcClass?: ("A" | "B" | "C")[];
  };
  /** Adjacent zone affinity (for putaway sequencing) */
  adjacentZones?: string[];
  /** Putaway sequence priority (lower = first) */
  putawayPriority: number;
  /** Replenishment priority */
  replenPriority: number;
  /** Allowed pallet types */
  allowedPalletTypes: ("standard_48x40" | "euro_48x32" | "half_48x20")[];
};

/** Dynamic Velocity Metrics */
export type VelocityMetrics = {
  /** Auto-calculated: picks per day (30-day rolling) */
  picksPerDay: number;
  /** Auto-calculated: lines per day */
  linesPerDay: number;
  /** Auto-calculated: cubic velocity (cuft picked/day) */
  cubicVelocity: number;
  /** Last updated timestamp */
  lastCalculated: string;
  /** Manual override flag */
  manualOverride: boolean;
};

/** Zone Adjacency & Travel Distance */
export type ZoneAdjacency = {
  /** Adjacent zones with travel time (seconds) */
  adjacent: { zone: string; travelTimeSec: number }[];
  /** Distance to shipping dock (seconds) */
  toShippingDockSec: number;
  /** Distance to receiving dock (seconds) */
  toReceivingDockSec: number;
};

export type ItemMasterRecord = {
  // ─── Core Identity ────────────────────────────────────────────────
  sku: string; // Vendor SKU (EDI 832 LIN03)
  upc: string; // GTIN / UPC (EDI 832 LIN05)
  gtin?: string; // GS1 GTIN-14
  itemStyle: string; // Pallet build grouping
  description: string;
  category: string;
  uom: string;
  tenantId: string;

  // ─── Pack Hierarchy ──────────────────────────────────────────────
  packHierarchy: GTINHierarchy[]; // Parent/child pack levels
  basePackLevel: PackLevel; // Which level is stocked
  caseQty: number; // EDI 832 PO4 - Units per case (at base pack level)
  innerPackQty?: number; // Units per inner pack
  masterPackQty?: number; // Cases per master pack

  // ─── Apparel Attributes ──────────────────────────────────────────
  apparelAttrs?: ApparelAttributes; // Null if not apparel

  // ─── Dimensions & Weight ─────────────────────────────────────────
  // At base pack level (each)
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;

  // At case level (derived or override)
  caseLengthIn?: number;
  caseWidthIn?: number;
  caseHeightIn?: number;
  caseWeightLbs: number;
  cbmPerCase: number;

  // At master pack level
  masterLengthIn?: number;
  masterWidthIn?: number;
  masterHeightIn?: number;
  masterWeightLbs?: number;
  masterCbm?: number;

  // ─── Pallet Build Intelligence ───────────────────────────────────
  palletBuild: PalletBuildConfig;

  // ─── Velocity & Slotting ─────────────────────────────────────────
  velocity?: VelocityClassification;

  // ─── Substitutions ───────────────────────────────────────────────
  substitutions?: SubstitutionRule[];

  // ─── Commercial ──────────────────────────────────────────────────
  unitCost: number; // EDI 832 PRC02
  unitPrice: number;

  // ─── Freight ─────────────────────────────────────────────────────
  nmfc: string;
  freightClass:
    | "50"
    | "55"
    | "60"
    | "65"
    | "70"
    | "77.5"
    | "85"
    | "92.5"
    | "100"
    | "110"
    | "125"
    | "150"
    | "175"
    | "200"
    | "250"
    | "300"
    | "400"
    | "500";

  // ─── Compliance & Governance ─────────────────────────────────────
  lotControl: boolean;
  expiryControl: boolean;
  serialControl: boolean;
  shelfLifeDays?: number;
  storageTempMin?: number;
  storageTempMax?: number;
  storageTempUnit?: "F" | "C";
  hazmat: boolean;
  active: boolean;
  source: "EDI_832" | "CSV" | "MANUAL";
  effectiveAt: string; // EDI 832 DTM/007

  // ─── Additional Compliance ───────────────────────────────────────
  countryOfOrigin?: string;
  harmonizedCode?: string; // HS/HTS code
  brand?: string;
  manufacturer?: string;
  manufacturerSku?: string;
};

const ts = (d: string) => new Date(d).toISOString();

/** Cubic meters from inches: (L*W*H in³) * 0.000016387064 m³/in³ */
export function cbmFromInches(lengthIn: number, widthIn: number, heightIn: number): number {
  return +(lengthIn * widthIn * heightIn * 0.000016387064).toFixed(4);
}

/** Default NMFC + freight class by commodity category (NMFTA reference). */
const NMFC_BY_CATEGORY: Record<
  string,
  { nmfc: string; freightClass: ItemMasterRecord["freightClass"] }
> = {
  Camping: { nmfc: "087700", freightClass: "150" },
  Apparel: { nmfc: "049880", freightClass: "125" },
  Audio: { nmfc: "063270", freightClass: "92.5" },
  Electronics: { nmfc: "063270", freightClass: "92.5" },
  Accessories: { nmfc: "116030", freightClass: "85" },
  Supplements: { nmfc: "157800", freightClass: "100" },
  Wellness: { nmfc: "157800", freightClass: "100" },
  Default: { nmfc: "999999", freightClass: "100" },
};

/** Per-SKU NMFC / class overrides take precedence over the category default. */
const NMFC_BY_SKU: Record<
  string,
  { nmfc: string; freightClass: ItemMasterRecord["freightClass"] }
> = {
  "ACM-TENT-2P-OLV": { nmfc: "087700-01", freightClass: "150" },
  "ACM-STV-CMP-01": { nmfc: "087860", freightClass: "125" },
  "ACM-SLPBG-20F": { nmfc: "087710", freightClass: "175" },
  "HLE-EARB-PRO": { nmfc: "063270-04", freightClass: "92.5" },
  "HLE-CHRG-65W": { nmfc: "063270-02", freightClass: "92.5" },
};

export function nmfcFor(sku: string, category: string) {
  return NMFC_BY_SKU[sku] ?? NMFC_BY_CATEGORY[category] ?? NMFC_BY_CATEGORY.Default;
}

// ============================================================
// Default Configurations
// ============================================================

/** Default pallet build config */
const defaultPalletBuild: PalletBuildConfig = {
  maxPalletHeightIn: 60,
  maxPalletWeightLbs: 2500,
  stackability: "full",
  palletPattern: "interlock",
  allowMixedSku: false,
  palletType: "standard_48x40",
};

/** Default velocity classification */
const defaultVelocity: VelocityClassification = {
  abcClass: "B",
  annualPicks: 500,
  linesPerOrder: 3,
  storageClass: "reserve",
};

/** Default slotting rules */
const defaultSlottingRules: SlottingRules = {
  allowedStorageClasses: ["forward", "reserve", "bulk"],
  putawayPriority: 50,
  replenPriority: 50,
  allowedPalletTypes: ["standard_48x40"],
};

/** Default velocity metrics */
const defaultVelocityMetrics: VelocityMetrics = {
  picksPerDay: 0,
  linesPerDay: 0,
  cubicVelocity: 0,
  lastCalculated: new Date().toISOString(),
  manualOverride: false,
};

/** Default zone adjacency */
const defaultZoneAdjacency: ZoneAdjacency = {
  adjacent: [],
  toShippingDockSec: 300,
  toReceivingDockSec: 300,
};

// ============================================================
// Seed Data
// ============================================================
const CASE_SPECS: Record<string, { l: number; w: number; h: number; caseLbs: number }> = {
  "ACM-TENT-2P-OLV": { l: 26, w: 10, h: 10, caseLbs: 26.4 },
  "ACM-STV-CMP-01": { l: 18, w: 14, h: 8, caseLbs: 23.2 },
  "NSA-HOOD-BLK-M": { l: 22, w: 16, h: 14, caseLbs: 27.8 },
  "NSA-TEE-WHT-L": { l: 20, w: 14, h: 12, caseLbs: 20.4 },
  "HLE-EARB-PRO": { l: 16, w: 12, h: 8, caseLbs: 7.2 },
  "HLE-CHRG-65W": { l: 14, w: 10, h: 6, caseLbs: 13.5 },
  "VRD-COLL-30CT": { l: 18, w: 12, h: 10, caseLbs: 20.8 },
  "VRD-MAG-GLY": { l: 16, w: 12, h: 9, caseLbs: 19.4 },
  "ACM-SLPBG-20F": { l: 22, w: 14, h: 14, caseLbs: 22.0 },
};

function specFor(sku: string, caseQty: number, weightLbs: number) {
  const s = CASE_SPECS[sku];
  if (s) return s;
  // Fallback heuristic — square-ish carton sized to caseQty
  const side = Math.max(8, Math.round(Math.cbrt(Math.max(1, caseQty)) * 6));
  return { l: side + 4, w: side, h: side - 2, caseLbs: +(caseQty * weightLbs * 1.05).toFixed(2) };
}

/** Seed Item Master from inventory + a couple of catalog-only SKUs */
export const itemMaster: ItemMasterRecord[] = [
  ...inventoryItems.map<ItemMasterRecord>((i) => {
    const s = specFor(i.sku, i.caseQty, i.weightLbs);
    const f = nmfcFor(i.sku, i.category);
    return {
      sku: i.sku,
      upc: i.upc,
      gtin: i.upc.length === 12 ? `0${i.upc}` : i.upc,
      itemStyle: i.itemStyle,
      description: i.description,
      category: i.category,
      uom: i.uom,
      tenantId: i.tenantId,
      packHierarchy: [
        {
          parentGtin: undefined,
          childGtin: i.upc.length === 12 ? `0${i.upc}` : i.upc,
          qtyPerParent: 1,
          packLevel: "each",
          isBaseUnit: true,
        },
        {
          parentGtin: i.upc.length === 12 ? `0${i.upc}` : i.upc,
          childGtin: undefined,
          qtyPerParent: i.caseQty,
          packLevel: "inner",
          packLengthIn: s.l,
          packWidthIn: s.w,
          packHeightIn: s.h,
          packWeightLbs: s.caseLbs,
          isBaseUnit: false,
        },
      ],
      basePackLevel: "each",
      caseQty: i.caseQty,
      innerPackQty: 1,
      masterPackQty: undefined,
      apparelAttrs: undefined,
      lengthIn: s.l,
      widthIn: s.w,
      heightIn: s.h,
      weightLbs: i.weightLbs,
      caseLengthIn: s.l,
      caseWidthIn: s.w,
      caseHeightIn: s.h,
      caseWeightLbs: s.caseLbs,
      cbmPerCase: cbmFromInches(s.l, s.w, s.h),
      masterLengthIn: undefined,
      masterWidthIn: undefined,
      masterHeightIn: undefined,
      masterWeightLbs: undefined,
      masterCbm: undefined,
      palletBuild: defaultPalletBuild,
      velocity: defaultVelocity,
      substitutions: undefined,
      unitCost: i.unitCost,
      unitPrice: i.unitPrice,
      nmfc: f.nmfc,
      freightClass: f.freightClass,
      lotControl: false,
      expiryControl: false,
      serialControl: false,
      shelfLifeDays: undefined,
      storageTempMin: undefined,
      storageTempMax: undefined,
      storageTempUnit: "F",
      hazmat: false,
      active: true,
      source: "EDI_832",
      effectiveAt: ts("2026-05-01T00:00:00Z"),
      countryOfOrigin: "US",
      harmonizedCode: undefined,
      brand: undefined,
      manufacturer: undefined,
      manufacturerSku: undefined,
    } satisfies ItemMasterRecord;
  }),
  (() => {
    const s = specFor("ACM-SLPBG-20F", 6, 3.4);
    const f = nmfcFor("ACM-SLPBG-20F", "Camping");
    return {
      sku: "ACM-SLPBG-20F",
      upc: "081234500031",
      gtin: "00812345000031",
      itemStyle: "SLPBG-20F",
      description: "Mummy Sleeping Bag, 20°F",
      category: "Camping",
      uom: "EA",
      tenantId: "acme",
      packHierarchy: [
        {
          parentGtin: undefined,
          childGtin: "00812345000031",
          qtyPerParent: 1,
          packLevel: "each",
          isBaseUnit: true,
        },
        {
          parentGtin: "00812345000031",
          childGtin: "10812345000038",
          qtyPerParent: 6,
          packLevel: "inner",
          packLengthIn: s.l,
          packWidthIn: s.w,
          packHeightIn: s.h,
          packWeightLbs: s.caseLbs,
          isBaseUnit: false,
        },
      ],
      basePackLevel: "each",
      caseQty: 6,
      innerPackQty: 1,
      masterPackQty: undefined,
      apparelAttrs: undefined,
      lengthIn: s.l,
      widthIn: s.w,
      heightIn: s.h,
      weightLbs: 3.4,
      caseLengthIn: s.l,
      caseWidthIn: s.w,
      caseHeightIn: s.h,
      caseWeightLbs: s.caseLbs,
      cbmPerCase: cbmFromInches(s.l, s.w, s.h),
      masterLengthIn: undefined,
      masterWidthIn: undefined,
      masterHeightIn: undefined,
      masterWeightLbs: undefined,
      masterCbm: undefined,
      palletBuild: {
        ...defaultPalletBuild,
        stackability: "limited",
        maxStackHeightIn: 48,
      },
      velocity: {
        ...defaultVelocity,
        abcClass: "B",
        annualPicks: 200,
        storageClass: "reserve",
      },
      substitutions: [
        {
          alternateSku: "ACM-SLPBG-00F",
          type: "substitute",
          priority: 1,
          condition: "stockout",
          costImpactPct: 5,
        },
      ],
      unitCost: 38.0,
      unitPrice: 119,
      nmfc: f.nmfc,
      freightClass: f.freightClass,
      lotControl: false,
      expiryControl: false,
      serialControl: false,
      shelfLifeDays: undefined,
      storageTempMin: undefined,
      storageTempMax: undefined,
      storageTempUnit: "F",
      hazmat: false,
      active: true,
      source: "EDI_832",
      effectiveAt: ts("2026-05-12T00:00:00Z"),
      countryOfOrigin: "CN",
      harmonizedCode: "9404.30.0000",
      brand: "Acme Outdoors",
      manufacturer: "Acme Mfg",
      manufacturerSku: "SLPBG-20F",
    } satisfies ItemMasterRecord;
  })(),
  (() => {
    const s = specFor("VRD-MAG-GLY", 36, 0.5);
    const f = nmfcFor("VRD-MAG-GLY", "Supplements");
    return {
      sku: "VRD-MAG-GLY",
      upc: "076500011137",
      gtin: "0076500011137",
      itemStyle: "MAG-GLY",
      description: "Magnesium Glycinate 120ct",
      category: "Supplements",
      uom: "EA",
      tenantId: "verdant",
      packHierarchy: [
        {
          parentGtin: undefined,
          childGtin: "0076500011137",
          qtyPerParent: 1,
          packLevel: "each",
          isBaseUnit: true,
        },
        {
          parentGtin: "0076500011137",
          childGtin: "1076500011134",
          qtyPerParent: 36,
          packLevel: "inner",
          packLengthIn: s.l,
          packWidthIn: s.w,
          packHeightIn: s.h,
          packWeightLbs: s.caseLbs,
          isBaseUnit: false,
        },
        {
          parentGtin: "1076500011134",
          childGtin: undefined,
          qtyPerParent: 4,
          packLevel: "master",
          packLengthIn: 18,
          packWidthIn: 16,
          packHeightIn: 12,
          packWeightLbs: 80,
          isBaseUnit: false,
        },
      ],
      basePackLevel: "each",
      caseQty: 36,
      innerPackQty: 1,
      masterPackQty: 4,
      apparelAttrs: undefined,
      lengthIn: s.l,
      widthIn: s.w,
      heightIn: s.h,
      weightLbs: 0.5,
      caseLengthIn: s.l,
      caseWidthIn: s.w,
      caseHeightIn: s.h,
      caseWeightLbs: s.caseLbs,
      cbmPerCase: cbmFromInches(s.l, s.w, s.h),
      masterLengthIn: 18,
      masterWidthIn: 16,
      masterHeightIn: 12,
      masterWeightLbs: 80,
      masterCbm: cbmFromInches(18, 16, 12),
      palletBuild: {
        ...defaultPalletBuild,
        maxPalletHeightIn: 55,
        stackability: "full",
        palletPattern: "column",
      },
      velocity: {
        ...defaultVelocity,
        abcClass: "A",
        annualPicks: 5000,
        storageClass: "forward",
        peakMonths: [1, 2, 11, 12],
      },
      substitutions: [
        {
          alternateSku: "VRD-MAG-CIT",
          type: "substitute",
          priority: 1,
          condition: "stockout",
          costImpactPct: -2,
        },
        {
          alternateSku: "VRD-MAG-OXIDE",
          type: "downgrade",
          priority: 2,
          condition: "stockout",
          costImpactPct: -15,
        },
      ],
      unitCost: 7.2,
      unitPrice: 24,
      nmfc: f.nmfc,
      freightClass: f.freightClass,
      lotControl: true,
      expiryControl: true,
      serialControl: false,
      shelfLifeDays: 730,
      storageTempMin: 50,
      storageTempMax: 80,
      storageTempUnit: "F",
      hazmat: false,
      active: true,
      source: "EDI_832",
      effectiveAt: ts("2026-05-02T00:00:00Z"),
      countryOfOrigin: "US",
      harmonizedCode: "2106.90.0000",
      brand: "Verdant Health",
      manufacturer: "Verdant Labs",
      manufacturerSku: "MAG-GLY-120",
    } satisfies ItemMasterRecord;
  })(),
  // Additional test records for apparel and GTIN hierarchy
  {
    sku: "NSA-HOOD-BLK-M",
    upc: "081001234567",
    gtin: "0081001234567",
    itemStyle: "HOOD-CLASSIC",
    description: "Classic Hoodie - Black - Medium",
    category: "Apparel",
    uom: "EA",
    tenantId: "northstar",
    packHierarchy: [
      {
        parentGtin: undefined,
        childGtin: "0081001234567",
        qtyPerParent: 1,
        packLevel: "each",
        isBaseUnit: true,
      },
      {
        parentGtin: "0081001234567",
        childGtin: "1081001234564",
        qtyPerParent: 24,
        packLevel: "inner",
        packLengthIn: 22,
        packWidthIn: 16,
        packHeightIn: 14,
        packWeightLbs: 27.8,
        isBaseUnit: false,
      },
      {
        parentGtin: "1081001234564",
        childGtin: undefined,
        qtyPerParent: 2,
        packLevel: "master",
        packLengthIn: 24,
        packWidthIn: 22,
        packHeightIn: 16,
        packWeightLbs: 60,
        isBaseUnit: false,
      },
    ],
    basePackLevel: "each",
    caseQty: 24,
    innerPackQty: 1,
    masterPackQty: 2,
    apparelAttrs: {
      style: "HOODIE-PULLOVER",
      color: { code: "BLK", name: "Black" },
      size: { code: "M", lengthIn: 28, widthIn: 22, heightIn: 2, weightLbs: 1.2 },
      fit: "regular",
      fabric: { primary: "cotton", pct: 80, careCode: "Machine wash cold" },
      season: "Fall",
      gender: "Unisex",
    },
    lengthIn: 12,
    widthIn: 10,
    heightIn: 2,
    weightLbs: 1.2,
    caseLengthIn: 22,
    caseWidthIn: 16,
    caseHeightIn: 14,
    caseWeightLbs: 27.8,
    cbmPerCase: cbmFromInches(22, 16, 14),
    masterLengthIn: 24,
    masterWidthIn: 22,
    masterHeightIn: 16,
    masterWeightLbs: 60,
    masterCbm: cbmFromInches(24, 22, 16),
    palletBuild: {
      ...defaultPalletBuild,
      maxPalletHeightIn: 55,
      stackability: "full",
      palletPattern: "brick",
    },
    velocity: {
      ...defaultVelocity,
      abcClass: "A",
      annualPicks: 15000,
      storageClass: "forward",
      peakMonths: [9, 10, 11, 12],
    },
    substitutions: [
      {
        alternateSku: "NSA-HOOD-NVY-M",
        type: "substitute",
        priority: 1,
        condition: "stockout",
        costImpactPct: 0,
      },
      {
        alternateSku: "NSA-HOOD-GRY-M",
        type: "substitute",
        priority: 2,
        condition: "stockout",
        costImpactPct: 0,
      },
    ],
    unitCost: 18.5,
    unitPrice: 49.99,
    nmfc: "049880",
    freightClass: "125",
    lotControl: false,
    expiryControl: false,
    serialControl: false,
    shelfLifeDays: undefined,
    storageTempMin: undefined,
    storageTempMax: undefined,
    storageTempUnit: "F",
    hazmat: false,
    active: true,
    source: "EDI_832",
    effectiveAt: ts("2026-06-15T00:00:00Z"),
    countryOfOrigin: "VN",
    harmonizedCode: "6110.20.2020",
    brand: "NorthStar Apparel",
    manufacturer: "NorthStar Mfg",
    manufacturerSku: "HOOD-CLASSIC-BLK-M",
  },
  {
    sku: "NSA-TEE-WHT-L",
    upc: "081001234574",
    gtin: "0081001234574",
    itemStyle: "TEE-PREMIUM",
    description: "Premium Tee - White - Large",
    category: "Apparel",
    uom: "EA",
    tenantId: "northstar",
    packHierarchy: [
      {
        parentGtin: undefined,
        childGtin: "0081001234574",
        qtyPerParent: 1,
        packLevel: "each",
        isBaseUnit: true,
      },
      {
        parentGtin: "0081001234574",
        childGtin: "1081001234571",
        qtyPerParent: 36,
        packLevel: "inner",
        packLengthIn: 20,
        packWidthIn: 14,
        packHeightIn: 12,
        packWeightLbs: 20.4,
        isBaseUnit: false,
      },
      {
        parentGtin: "1081001234571",
        childGtin: undefined,
        qtyPerParent: 3,
        packLevel: "master",
        packLengthIn: 22,
        packWidthIn: 20,
        packHeightIn: 14,
        packWeightLbs: 65,
        isBaseUnit: false,
      },
    ],
    basePackLevel: "each",
    caseQty: 36,
    innerPackQty: 1,
    masterPackQty: 3,
    apparelAttrs: {
      style: "TEE-CREWNECK",
      color: { code: "WHT", name: "White" },
      size: { code: "L", lengthIn: 30, widthIn: 24, heightIn: 1, weightLbs: 0.6 },
      fit: "slim",
      fabric: { primary: "cotton", pct: 100, careCode: "Machine wash warm" },
      season: "Core",
      gender: "Mens",
    },
    lengthIn: 11,
    widthIn: 9,
    heightIn: 1,
    weightLbs: 0.6,
    caseLengthIn: 20,
    caseWidthIn: 14,
    caseHeightIn: 12,
    caseWeightLbs: 20.4,
    cbmPerCase: cbmFromInches(20, 14, 12),
    masterLengthIn: 22,
    masterWidthIn: 20,
    masterHeightIn: 14,
    masterWeightLbs: 65,
    masterCbm: cbmFromInches(22, 20, 14),
    palletBuild: {
      ...defaultPalletBuild,
      maxPalletHeightIn: 50,
      stackability: "full",
      palletPattern: "column",
    },
    velocity: {
      ...defaultVelocity,
      abcClass: "A",
      annualPicks: 25000,
      storageClass: "forward",
      peakMonths: [5, 6, 7, 8],
    },
    substitutions: [
      {
        alternateSku: "NSA-TEE-BLK-L",
        type: "substitute",
        priority: 1,
        condition: "stockout",
        costImpactPct: 0,
      },
    ],
    unitCost: 8.0,
    unitPrice: 24.99,
    nmfc: "049880",
    freightClass: "125",
    lotControl: false,
    expiryControl: false,
    serialControl: false,
    shelfLifeDays: undefined,
    storageTempMin: undefined,
    storageTempMax: undefined,
    storageTempUnit: "F",
    hazmat: false,
    active: true,
    source: "EDI_832",
    effectiveAt: ts("2026-06-15T00:00:00Z"),
    countryOfOrigin: "VN",
    harmonizedCode: "6109.10.0010",
    brand: "NorthStar Apparel",
    manufacturer: "NorthStar Mfg",
    manufacturerSku: "TEE-PREMIUM-WHT-L",
  },
  {
    sku: "HLE-EARB-PRO",
    upc: "084001234567",
    gtin: "0084001234567",
    itemStyle: "EARB-PRO",
    description: "Pro Earbuds - Wireless ANC",
    category: "Electronics",
    uom: "EA",
    tenantId: "harborlite",
    packHierarchy: [
      {
        parentGtin: undefined,
        childGtin: "0084001234567",
        qtyPerParent: 1,
        packLevel: "each",
        isBaseUnit: true,
      },
      {
        parentGtin: "0084001234567",
        childGtin: "1084001234564",
        qtyPerParent: 20,
        packLevel: "inner",
        packLengthIn: 16,
        packWidthIn: 12,
        packHeightIn: 8,
        packWeightLbs: 7.2,
        isBaseUnit: false,
      },
      {
        parentGtin: "1084001234564",
        childGtin: undefined,
        qtyPerParent: 5,
        packLevel: "master",
        packLengthIn: 18,
        packWidthIn: 16,
        packHeightIn: 10,
        packWeightLbs: 38,
        isBaseUnit: false,
      },
    ],
    basePackLevel: "each",
    caseQty: 20,
    innerPackQty: 1,
    masterPackQty: 5,
    apparelAttrs: undefined,
    lengthIn: 8,
    widthIn: 6,
    heightIn: 3,
    weightLbs: 0.3,
    caseLengthIn: 16,
    caseWidthIn: 12,
    caseHeightIn: 8,
    caseWeightLbs: 7.2,
    cbmPerCase: cbmFromInches(16, 12, 8),
    masterLengthIn: 18,
    masterWidthIn: 16,
    masterHeightIn: 10,
    masterWeightLbs: 38,
    masterCbm: cbmFromInches(18, 16, 10),
    palletBuild: {
      ...defaultPalletBuild,
      maxPalletHeightIn: 48,
      stackability: "full",
      palletPattern: "column",
    },
    velocity: {
      ...defaultVelocity,
      abcClass: "A",
      annualPicks: 8000,
      storageClass: "forward",
      peakMonths: [11, 12],
    },
    substitutions: [
      {
        alternateSku: "HLE-EARB-STD",
        type: "downgrade",
        priority: 1,
        condition: "stockout",
        costImpactPct: -30,
      },
    ],
    unitCost: 85.0,
    unitPrice: 199.99,
    nmfc: "063270-04",
    freightClass: "92.5",
    lotControl: false,
    expiryControl: false,
    serialControl: true,
    shelfLifeDays: undefined,
    storageTempMin: 32,
    storageTempMax: 95,
    storageTempUnit: "F",
    hazmat: false,
    active: true,
    source: "EDI_832",
    effectiveAt: ts("2026-04-01T00:00:00Z"),
    countryOfOrigin: "CN",
    harmonizedCode: "8518.30.2000",
    brand: "Harbor Audio",
    manufacturer: "Harbor Electronics",
    manufacturerSku: "EARB-PRO-BLK",
  },
  {
    sku: "HLE-CHRG-65W",
    upc: "084001234574",
    gtin: "0084001234574",
    itemStyle: "CHRG-65W",
    description: "65W GaN Charger - USB-C PD",
    category: "Electronics",
    uom: "EA",
    tenantId: "harborlite",
    packHierarchy: [
      {
        parentGtin: undefined,
        childGtin: "0084001234574",
        qtyPerParent: 1,
        packLevel: "each",
        isBaseUnit: true,
      },
      {
        parentGtin: "0084001234574",
        childGtin: "1084001234571",
        qtyPerParent: 40,
        packLevel: "inner",
        packLengthIn: 14,
        packWidthIn: 10,
        packHeightIn: 6,
        packWeightLbs: 13.5,
        isBaseUnit: false,
      },
      {
        parentGtin: "1084001234571",
        childGtin: undefined,
        qtyPerParent: 4,
        packLevel: "master",
        packLengthIn: 16,
        packWidthIn: 14,
        packHeightIn: 8,
        packWeightLbs: 56,
        isBaseUnit: false,
      },
    ],
    basePackLevel: "each",
    caseQty: 40,
    innerPackQty: 1,
    masterPackQty: 4,
    apparelAttrs: undefined,
    lengthIn: 5,
    widthIn: 3,
    heightIn: 1.5,
    weightLbs: 0.3,
    caseLengthIn: 14,
    caseWidthIn: 10,
    caseHeightIn: 6,
    caseWeightLbs: 13.5,
    cbmPerCase: cbmFromInches(14, 10, 6),
    masterLengthIn: 16,
    masterWidthIn: 14,
    masterHeightIn: 8,
    masterWeightLbs: 56,
    masterCbm: cbmFromInches(16, 14, 8),
    palletBuild: {
      ...defaultPalletBuild,
      maxPalletHeightIn: 48,
      stackability: "full",
      palletPattern: "column",
    },
    velocity: {
      ...defaultVelocity,
      abcClass: "B",
      annualPicks: 3000,
      storageClass: "reserve",
    },
    substitutions: [
      {
        alternateSku: "HLE-CHRG-100W",
        type: "upgrade",
        priority: 1,
        condition: "customer_request",
        costImpactPct: 50,
      },
    ],
    unitCost: 22.0,
    unitPrice: 54.99,
    nmfc: "063270-02",
    freightClass: "92.5",
    lotControl: false,
    expiryControl: false,
    serialControl: true,
    shelfLifeDays: undefined,
    storageTempMin: 32,
    storageTempMax: 95,
    storageTempUnit: "F",
    hazmat: false,
    active: true,
    source: "EDI_832",
    effectiveAt: ts("2026-04-01T00:00:00Z"),
    countryOfOrigin: "CN",
    harmonizedCode: "8504.40.9540",
    brand: "Harbor Audio",
    manufacturer: "Harbor Electronics",
    manufacturerSku: "CHRG-65W-GAN",
  },
  {
    sku: "VRD-COLL-30CT",
    upc: "076500011120",
    gtin: "0076500011120",
    itemStyle: "COLL-PWDR",
    description: "Collagen Peptides Powder 30ct",
    category: "Supplements",
    uom: "EA",
    tenantId: "verdant",
    packHierarchy: [
      {
        parentGtin: undefined,
        childGtin: "0076500011120",
        qtyPerParent: 1,
        packLevel: "each",
        isBaseUnit: true,
      },
      {
        parentGtin: "0076500011120",
        childGtin: "1076500011127",
        qtyPerParent: 12,
        packLevel: "inner",
        packLengthIn: 18,
        packWidthIn: 12,
        packHeightIn: 10,
        packWeightLbs: 20.8,
        isBaseUnit: false,
      },
      {
        parentGtin: "1076500011127",
        childGtin: undefined,
        qtyPerParent: 6,
        packLevel: "master",
        packLengthIn: 20,
        packWidthIn: 18,
        packHeightIn: 12,
        packWeightLbs: 130,
        isBaseUnit: false,
      },
    ],
    basePackLevel: "each",
    caseQty: 12,
    innerPackQty: 1,
    masterPackQty: 6,
    apparelAttrs: undefined,
    lengthIn: 6,
    widthIn: 4,
    heightIn: 8,
    weightLbs: 1.5,
    caseLengthIn: 18,
    caseWidthIn: 12,
    caseHeightIn: 10,
    caseWeightLbs: 20.8,
    cbmPerCase: cbmFromInches(18, 12, 10),
    masterLengthIn: 20,
    masterWidthIn: 18,
    masterHeightIn: 12,
    masterWeightLbs: 130,
    masterCbm: cbmFromInches(20, 18, 12),
    palletBuild: {
      ...defaultPalletBuild,
      maxPalletHeightIn: 55,
      stackability: "full",
      palletPattern: "interlock",
    },
    velocity: {
      ...defaultVelocity,
      abcClass: "B",
      annualPicks: 2000,
      storageClass: "reserve",
    },
    substitutions: [
      {
        alternateSku: "VRD-COLL-60CT",
        type: "upgrade",
        priority: 1,
        condition: "customer_request",
        costImpactPct: 40,
      },
    ],
    unitCost: 15.0,
    unitPrice: 39.99,
    nmfc: "157800",
    freightClass: "100",
    lotControl: true,
    expiryControl: true,
    serialControl: false,
    shelfLifeDays: 730,
    storageTempMin: 50,
    storageTempMax: 80,
    storageTempUnit: "F",
    hazmat: false,
    active: true,
    source: "EDI_832",
    effectiveAt: ts("2026-03-01T00:00:00Z"),
    countryOfOrigin: "US",
    harmonizedCode: "2106.90.0000",
    brand: "Verdant Health",
    manufacturer: "Verdant Labs",
    manufacturerSku: "COLL-PWDR-30",
  },
];

export function findItem(sku: string): ItemMasterRecord | undefined {
  return itemMaster.find((i) => i.sku === sku && i.active);
}

/* ============================================================
 * Mutators — Add / Delete with inventory protection
 * ============================================================ */

/** Returns true if any inventory batch exists for this SKU
 *  (optionally scoped to a tenant). Used to block deletion. */
export function hasInventoryForSku(sku: string, tenantId?: string): boolean {
  return inventoryItems.some((i) => {
    if (i.sku !== sku) return false;
    if (tenantId && i.tenantId !== tenantId) return false;
    return (i.batches?.reduce((a, b) => a + (b.qty ?? 0), 0) ?? 0) > 0;
  });
}

export function updateItemInMaster(sku: string, updates: Partial<ItemMasterRecord>) {
  const idx = itemMaster.findIndex((i) => i.sku === sku);
  if (idx !== -1) Object.assign(itemMaster[idx], updates);
}

/** Cross-check inbound / order lines against item master. */
export type MasterException = {
  scope: "inbound" | "order";
  documentId: string;
  tenantId: string;
  sku: string;
  reason: "missing-sku" | "inactive" | "tenant-mismatch" | "upc-mismatch";
  detail: string;
};

export function validateLineAgainstItemMaster(args: {
  sku: string;
  upc?: string;
  tenantId: string;
}): MasterException["reason"] | null {
  const rec = itemMaster.find((i) => i.sku === args.sku);
  if (!rec) return "missing-sku";
  if (!rec.active) return "inactive";
  if (rec.tenantId !== args.tenantId) return "tenant-mismatch";
  if (args.upc && rec.upc && args.upc !== rec.upc) return "upc-mismatch";
  return null;
}

export function masterReasonLabel(r: MasterException["reason"]): string {
  switch (r) {
    case "missing-sku":
      return "SKU not in 832 Item Master";
    case "inactive":
      return "SKU deactivated in Item Master";
    case "tenant-mismatch":
      return "Tenant mismatch vs. Item Master";
    case "upc-mismatch":
      return "UPC/GTIN mismatch vs. Item Master";
  }
}

export function collectMasterExceptions(): MasterException[] {
  const out: MasterException[] = [];
  for (const s of inboundShipments) {
    for (const l of s.lines) {
      const r = validateLineAgainstItemMaster({ sku: l.sku, upc: l.upc, tenantId: s.tenantId });
      if (r)
        out.push({
          scope: "inbound",
          documentId: s.id,
          tenantId: s.tenantId,
          sku: l.sku,
          reason: r,
          detail: masterReasonLabel(r),
        });
    }
  }
  for (const o of orders) {
    for (const l of o.lines) {
      const r = validateLineAgainstItemMaster({ sku: l.sku, tenantId: o.tenantId });
      if (r)
        out.push({
          scope: "order",
          documentId: o.id,
          tenantId: o.tenantId,
          sku: l.sku,
          reason: r,
          detail: masterReasonLabel(r),
        });
    }
  }
  return out;
}

/* ============================================================
 * Warehouse Location Master
 * ============================================================ */

export type LocationType = "FLR" | "DROP" | "RACK";

export type LocationRecord = {
  // ─── Core Identity ────────────────────────────────────────────────
  id: string; // e.g. A12-03-B
  warehouseId: string;
  tenantId?: string; // Client / tenant that owns or is assigned this location
  type: LocationType; // FLR / DROP / RACK
  zone: string;
  capacityPallets: number;
  occupiedPallets: number;
  pickable: boolean; // If false → excluded from allocation
  allowedItemStyles: string[] | null; // null = any
  notes?: string;

  // ─── Dimensions ──────────────────────────────────────────────────
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  cubicFeet?: number;

  // ─── Slotting Intelligence ───────────────────────────────────────
  slottingRules: SlottingRules;
  velocityMetrics?: VelocityMetrics;
  zoneAdjacency?: ZoneAdjacency;

  // ─── Existing Enhanced Fields ────────────────────────────────────
  zoneType?: "forward_pick" | "reserve" | "staging" | "hazmat" | "cold";
  velocityScore?: number; // Legacy - replaced by velocityMetrics
  recommendedSku?: string;
  hazmatAllowed?: boolean;
  tempControlled?: boolean;
  tempMin?: number;
  tempMax?: number;

  // ─── New Operational Fields ──────────────────────────────────────
  /** Location status */
  status: "active" | "maintenance" | "damaged" | "quarantine" | "retired";
  /** Last cycle count date */
  lastCycleCount?: string;
  /** Cycle count frequency (days) */
  cycleCountFreqDays?: number;
  /** Assigned putaway sequence group */
  putawaySequence?: number;
  /** Maximum weight per pallet position (lbs) */
  maxPalletWeightLbs?: number;
  /** Maximum height per pallet (inches) */
  maxPalletHeightIn?: number;
  /** Sprinkler/clearance height (inches) */
  clearanceHeightIn?: number;
};

/**
 * Base seed location definitions. Enhanced fields (slotting rules, velocity
 * metrics, zone adjacency, operational status) are applied programmatically
 * in `locationMaster` below so the seed stays readable and every record
 * receives a complete, valid shape.
 */
type LocationSeed = Omit<
  LocationRecord,
  "slottingRules" | "velocityMetrics" | "zoneAdjacency" | "status"
>;

const locationSeeds: LocationSeed[] = [
  {
    id: "DOCK-D07",
    warehouseId: "atl1",
    tenantId: undefined,
    type: "DROP",
    zone: "Receiving Dock",
    capacityPallets: 6,
    occupiedPallets: 2,
    pickable: false,
    allowedItemStyles: null,
    notes: "Inbound staging",
    lengthFt: 8,
    widthFt: 6,
    heightFt: 4,
    cubicFeet: 192,
  },
  {
    id: "DROP-AISLE-A",
    warehouseId: "atl1",
    tenantId: undefined,
    type: "DROP",
    zone: "Putaway Drop",
    capacityPallets: 12,
    occupiedPallets: 4,
    pickable: false,
    allowedItemStyles: null,
    lengthFt: 8,
    widthFt: 6,
    heightFt: 4,
    cubicFeet: 192,
  },
  {
    id: "A12-03-B",
    warehouseId: "atl1",
    tenantId: "acme",
    type: "RACK",
    zone: "Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["TENT-2P"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "A12-04-A",
    warehouseId: "atl1",
    tenantId: "acme",
    type: "RACK",
    zone: "Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["TENT-2P"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "A14-01-C",
    warehouseId: "atl1",
    tenantId: undefined,
    type: "RACK",
    zone: "Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: false,
    allowedItemStyles: null,
    notes: "QA hold — pending cycle count",
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "B03-02-A",
    warehouseId: "atl1",
    tenantId: "acme",
    type: "RACK",
    zone: "Forward Pick",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["STV-CMP"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "FLR-ATL1-01",
    warehouseId: "atl1",
    tenantId: undefined,
    type: "FLR",
    zone: "Bulk Floor",
    capacityPallets: 24,
    occupiedPallets: 11,
    pickable: true,
    allowedItemStyles: null,
    lengthFt: 40,
    widthFt: 30,
    heightFt: 8,
    cubicFeet: 9600,
  },
  {
    id: "G01-01-A",
    warehouseId: "atl1",
    tenantId: "verdant",
    type: "RACK",
    zone: "Supplements Forward",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["COLL-PWDR", "MAG-GLY"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },

  {
    id: "DROP-ORD2-01",
    warehouseId: "ord2",
    tenantId: undefined,
    type: "DROP",
    zone: "Putaway Drop",
    capacityPallets: 10,
    occupiedPallets: 3,
    pickable: false,
    allowedItemStyles: null,
    lengthFt: 8,
    widthFt: 6,
    heightFt: 4,
    cubicFeet: 192,
  },
  {
    id: "D04-01-A",
    warehouseId: "ord2",
    tenantId: "northstar",
    type: "RACK",
    zone: "Apparel Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["HOOD-CLASSIC"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "D04-02-B",
    warehouseId: "ord2",
    tenantId: "northstar",
    type: "RACK",
    zone: "Apparel Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["HOOD-CLASSIC"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "E05-02-C",
    warehouseId: "ord2",
    tenantId: "verdant",
    type: "RACK",
    zone: "Hold/Quarantine",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: false,
    allowedItemStyles: null,
    notes: "Lot review hold",
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "FLR-ORD2-01",
    warehouseId: "ord2",
    tenantId: undefined,
    type: "FLR",
    zone: "Bulk Floor",
    capacityPallets: 18,
    occupiedPallets: 7,
    pickable: true,
    allowedItemStyles: null,
    lengthFt: 35,
    widthFt: 25,
    heightFt: 8,
    cubicFeet: 7000,
  },

  {
    id: "DOCK-LAX3-08",
    warehouseId: "lax3",
    tenantId: undefined,
    type: "DROP",
    zone: "Cross-Dock",
    capacityPallets: 8,
    occupiedPallets: 5,
    pickable: false,
    allowedItemStyles: null,
    lengthFt: 8,
    widthFt: 6,
    heightFt: 4,
    cubicFeet: 192,
  },
  {
    id: "F02-05-A",
    warehouseId: "lax3",
    tenantId: "northstar",
    type: "RACK",
    zone: "Apparel Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["TEE-PREMIUM"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "FLR-LAX3-01",
    warehouseId: "lax3",
    tenantId: "northstar",
    type: "FLR",
    zone: "Bulk Floor",
    capacityPallets: 30,
    occupiedPallets: 22,
    pickable: true,
    allowedItemStyles: null,
    lengthFt: 45,
    widthFt: 35,
    heightFt: 8,
    cubicFeet: 12600,
  },

  {
    id: "DROP-EWR1-01",
    warehouseId: "ewr1",
    tenantId: undefined,
    type: "DROP",
    zone: "Bonded Drop",
    capacityPallets: 6,
    occupiedPallets: 1,
    pickable: false,
    allowedItemStyles: null,
    lengthFt: 8,
    widthFt: 6,
    heightFt: 4,
    cubicFeet: 192,
  },
  {
    id: "C08-02-B",
    warehouseId: "ewr1",
    tenantId: "harborlite",
    type: "RACK",
    zone: "Electronics Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["EARB-PRO"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "C08-03-A",
    warehouseId: "ewr1",
    tenantId: "harborlite",
    type: "RACK",
    zone: "Electronics Reserve",
    capacityPallets: 1,
    occupiedPallets: 1,
    pickable: true,
    allowedItemStyles: ["EARB-PRO"],
    lengthFt: 10,
    widthFt: 4,
    heightFt: 6,
    cubicFeet: 240,
  },
  {
    id: "FLR-EWR1-01",
    warehouseId: "ewr1",
    tenantId: "harborlite",
    type: "FLR",
    zone: "Bulk Floor",
    capacityPallets: 20,
    occupiedPallets: 4,
    pickable: true,
    allowedItemStyles: null,
    lengthFt: 30,
    widthFt: 20,
    heightFt: 8,
    cubicFeet: 4800,
  },
];

/**
 * Slotting defaults derived from the location's zone / type so every seeded
 * location carries intelligent, warehouse-consistent rules.
 */
function seedSlottingRules(seed: LocationSeed): SlottingRules {
  const zone = seed.zone.toLowerCase();
  const isStaging = seed.type === "DROP" || zone.includes("dock") || zone.includes("staging") || zone.includes("drop");
  const isBulk = seed.type === "FLR" || zone.includes("bulk");
  const isForward = zone.includes("forward");
  const isHazmat = zone.includes("hazmat");
  const isCold = zone.includes("cold") || seed.tempControlled === true;

  const allowedStorageClasses: SlottingRules["allowedStorageClasses"] = isHazmat
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
    ...defaultSlottingRules,
    allowedStorageClasses,
    requiredItemAttrs: {
      hazmatAllowed: isHazmat,
      tempControlled: isCold,
      tempMin: seed.tempMin,
      tempMax: seed.tempMax,
      maxWeightLbs: seed.maxPalletWeightLbs ?? (isBulk ? 3000 : 2500),
      maxDimIn: { l: 48, w: 40, h: isBulk ? 96 : 60 },
      abcClass: isForward ? ["A", "B"] : isBulk ? ["C"] : ["B", "C"],
    },
    adjacentZones: [],
    putawayPriority: isStaging ? 20 : isForward ? 30 : isBulk ? 80 : 50,
    replenPriority: isForward ? 10 : isBulk ? 80 : 50,
    allowedPalletTypes: ["standard_48x40", "euro_48x32"],
  };
}

function seedVelocityMetrics(seed: LocationSeed): VelocityMetrics {
  const isForward = seed.zone.toLowerCase().includes("forward");
  const isBulk = seed.type === "FLR";
  const score = seed.velocityScore ?? 0;
  return {
    picksPerDay: isForward ? Math.max(score / 10, 0) : isBulk ? score / 10 : score / 10,
    linesPerDay: isForward ? Math.max(score / 5, 0) : score / 5,
    cubicVelocity: score,
    lastCalculated: new Date().toISOString(),
    manualOverride: false,
  };
}

function seedZoneAdjacency(seed: LocationSeed): ZoneAdjacency {
  const isDock = seed.type === "DROP";
  const isForward = seed.zone.toLowerCase().includes("forward");
  return {
    ...defaultZoneAdjacency,
    adjacent: [],
    toShippingDockSec: isForward ? 60 : isDock ? 300 : 300,
    toReceivingDockSec: isDock ? 30 : 180,
  };
}

/** Fully enriched Location Master with intelligent slotting defaults. */
export const locationMaster: LocationRecord[] = locationSeeds.map((seed) => ({
  ...seed,
  slottingRules: seedSlottingRules(seed),
  velocityMetrics: seedVelocityMetrics(seed),
  zoneAdjacency: seedZoneAdjacency(seed),
  status: seed.notes?.toLowerCase().includes("hold") ? "quarantine" : "active",
  lastCycleCount: new Date().toISOString(),
  cycleCountFreqDays: seed.type === "FLR" ? 180 : seed.pickable ? 30 : 90,
  putawaySequence: seedSlottingRules(seed).putawayPriority,
  maxPalletWeightLbs: seed.maxPalletWeightLbs ?? (seed.type === "FLR" ? 3000 : 2500),
  maxPalletHeightIn: seed.maxPalletHeightIn ?? (seed.type === "FLR" ? 96 : 72),
  clearanceHeightIn: seed.clearanceHeightIn ?? (seed.type === "FLR" ? 120 : 96),
}));

export function pickableLocations(warehouseId?: string): LocationRecord[] {
  return locationMaster.filter(
    (l) => l.pickable && (warehouseId ? l.warehouseId === warehouseId : true),
  );
}

export function findLocation(id: string): LocationRecord | undefined {
  return locationMaster.find((l) => l.id === id);
}

export function locationOccupancyPct(l: LocationRecord): number {
  if (l.capacityPallets === 0) return 0;
  return Math.min(100, Math.round((l.occupiedPallets / l.capacityPallets) * 100));
}

export function updateLocationInMaster(id: string, updates: Partial<LocationRecord>) {
  const idx = locationMaster.findIndex((l) => l.id === id);
  if (idx !== -1) Object.assign(locationMaster[idx], updates);
}

export function deleteLocationFromMaster(id: string) {
  const idx = locationMaster.findIndex((l) => l.id === id);
  if (idx !== -1) locationMaster.splice(idx, 1);
}

/** Compute cubic feet from location dimensions (feet) */
export function computeLocationCubicFeet(l: LocationRecord): number {
  if (l.cubicFeet && l.cubicFeet > 0) return l.cubicFeet;
  const lFt = l.lengthFt ?? 0;
  const wFt = l.widthFt ?? 0;
  const hFt = l.heightFt ?? 0;
  return lFt * wFt * hFt;
}
