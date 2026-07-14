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
export type ItemMasterRecord = {
  sku: string; // Vendor SKU (EDI 832 LIN03)
  upc: string; // GTIN / UPC (EDI 832 LIN05)
  itemStyle: string; // Pallet build grouping
  description: string;
  category: string;
  uom: string;
  caseQty: number; // EDI 832 PO4
  unitCost: number; // EDI 832 PRC02
  unitPrice: number;
  weightLbs: number;
  /** Case dimensions in inches (EDI 832 MEA — LN / WD / HT) */
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** Case gross weight in lbs (EDI 832 MEA — G) */
  caseWeightLbs: number;
  /** Cubic meters per case — derived from L×W×H (EDI 832 MEA — CB) */
  cbmPerCase: number;
  /** NMFC commodity code (National Motor Freight Classification) */
  nmfc: string;
  /** Freight class — NMFTA standard density-based class for LTL rating */
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
  tenantId: string;
  hazmat: boolean;
  active: boolean;
  source: "EDI_832" | "CSV" | "MANUAL";
  effectiveAt: string; // EDI 832 DTM/007

  // ─── Enterprise Compliance & Governance ─────────────────────────────
  /** GS1 GTIN-14 identifier (derived from UPC if not provided) */
  gtin?: string;
  /** Lot/batch control required */
  lotControl: boolean;
  /** Expiration date control required */
  expiryControl: boolean;
  /** Serial number control required (unit-level) */
  serialControl: boolean;
  /** Shelf life in days — used for FEFO */
  shelfLifeDays?: number;
  /** Preferred storage temperature min °F */
  storageTempMin?: number;
  /** Preferred storage temperature max °F */
  storageTempMax?: number;
  /** Temperature unit: F or C */
  storageTempUnit?: "F" | "C";
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

/** Per-SKU case dimension + weight overrides, keyed by SKU. */
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
      itemStyle: i.itemStyle,
      description: i.description,
      category: i.category,
      uom: i.uom,
      caseQty: i.caseQty,
      unitCost: i.unitCost,
      unitPrice: i.unitPrice,
      weightLbs: i.weightLbs,
      lengthIn: s.l,
      widthIn: s.w,
      heightIn: s.h,
      caseWeightLbs: s.caseLbs,
      cbmPerCase: cbmFromInches(s.l, s.w, s.h),
      nmfc: f.nmfc,
      freightClass: f.freightClass,
      tenantId: i.tenantId,
      hazmat: false,
      active: true,
      source: "EDI_832",
      effectiveAt: ts("2026-05-01T00:00:00Z"),
    };
  }),
  (() => {
    const s = specFor("ACM-SLPBG-20F", 6, 3.4);
    const f = nmfcFor("ACM-SLPBG-20F", "Camping");
    return {
      sku: "ACM-SLPBG-20F",
      upc: "081234500031",
      itemStyle: "SLPBG-20F",
      description: "Mummy Sleeping Bag, 20°F",
      category: "Camping",
      uom: "EA",
      caseQty: 6,
      unitCost: 38.0,
      unitPrice: 119,
      weightLbs: 3.4,
      lengthIn: s.l,
      widthIn: s.w,
      heightIn: s.h,
      caseWeightLbs: s.caseLbs,
      cbmPerCase: cbmFromInches(s.l, s.w, s.h),
      nmfc: f.nmfc,
      freightClass: f.freightClass,
      tenantId: "acme",
      hazmat: false,
      active: true,
      source: "EDI_832",
      effectiveAt: ts("2026-05-12T00:00:00Z"),
    } satisfies ItemMasterRecord;
  })(),
  (() => {
    const s = specFor("VRD-MAG-GLY", 36, 0.5);
    const f = nmfcFor("VRD-MAG-GLY", "Supplements");
    return {
      sku: "VRD-MAG-GLY",
      upc: "076500011137",
      itemStyle: "MAG-GLY",
      description: "Magnesium Glycinate 120ct",
      category: "Supplements",
      uom: "EA",
      caseQty: 36,
      unitCost: 7.2,
      unitPrice: 24,
      weightLbs: 0.5,
      lengthIn: s.l,
      widthIn: s.w,
      heightIn: s.h,
      caseWeightLbs: s.caseLbs,
      cbmPerCase: cbmFromInches(s.l, s.w, s.h),
      nmfc: f.nmfc,
      freightClass: f.freightClass,
      tenantId: "verdant",
      hazmat: false,
      active: true,
      source: "EDI_832",
      effectiveAt: ts("2026-05-02T00:00:00Z"),
    } satisfies ItemMasterRecord;
  })(),
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
  id: string; // e.g. A12-03-B
  warehouseId: string;
  tenantId?: string; // Client / tenant that owns or is assigned this location
  type: LocationType; // FLR / DROP / RACK
  zone: string; // Receiving, Reserve, Forward, Hazmat…
  capacityPallets: number;
  occupiedPallets: number;
  pickable: boolean; // If false → excluded from allocation
  allowedItemStyles: string[] | null; // null = any
  notes?: string;
  /** Location dimensions in feet (for volumetric billing) */
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  /** Pre-computed cubic feet (lengthFt * widthFt * heightFt) */
  cubicFeet?: number;
  /** Slotting zone classification for dynamic reslotting */
  zoneType?: "forward_pick" | "reserve" | "staging" | "hazmat" | "cold";
  /** Velocity score for this location (picks per day) */
  velocityScore?: number;
  /** Recommended SKU(s) for this location */
  recommendedSku?: string;
};

export const locationMaster: LocationRecord[] = [
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
