/**
 * ============================================================
 *  MODULE INDEX — Pallet Management & Directed Picking
 * ============================================================
 *
 *  Purpose: Inbound pallet building, directed putaway suggestions,
 *           and outbound directed pick wave construction. Pallets
 *           are the physical unit of work in the 3PL warehouse.
 *
 *  Key types exported:
 *    • Pallet, PalletStatus         — Inbound pallet with build/putaway state
 *    • PickInstruction              — Single stop in a directed pick route
 *    • PickWave                     — Grouped pick instructions per order
 *
 *  Data:
 *    • pallets[]                    — All pallets (inbound + in-flight)
 *    • pickWaves[]                  — Mock open pick waves
 *
 *  Helper functions:
 *    • suggestPutawayLocation()     — Directed putaway: style+WH → slot
 *    • createPalletsFromInbound()   — Build pallets from ASN line
 *    • buildPickWave()              — LIFO/FIFO + aisle-sequenced pick route
 *    • appendPallets / removePallets — In-memory pallet store mutators
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    fetchPallets / subscribePallets / createPallet / createPallets / updatePallet
 *    fetchOutboundPallets / subscribeOutboundPallets / createOutboundPallet ...
 *
 *  Extension points:
 *    - Add pallet build rules (max weight, mixed-SKU rules)
 *    - Add cube/weight-based slotting optimization
 *    - Add pick wave batching across multiple orders
 *    - Add pallet re-labeling / re-palletization
 * ============================================================
 */

import { warehouses, inventoryItems, type InventoryItem } from "./mock-data";
import { findItem } from "./master-data";

export type PalletStatus = "building" | "putaway" | "staged" | "picking" | "shipped";

export type Pallet = {
  id: string;
  itemStyle: string;
  tenantId: string;
  warehouseId: string;
  sku: string;
  description: string;
  units: number;
  capacityUnits: number;
  casePack: number;
  weightLbs: number;
  builtAt: string;
  builtBy: string;
  poNumber: string;
  ediSource: string;
  status: PalletStatus;
  location: string | null;
  suggestedLocation: string;
  zone: string;
  receivedAt: string;
  cubeCuFt?: number;
  container?: string;
  /** Inbound container this pallet was built from (links Pallet ↔ Inbound). */
  shipmentId?: string;
  /** Inbound container this pallet was built from (alias used by the UI). */
  inboundShipmentId?: string;
  /** Timestamp the pallet was put away into its location. */
  putawayAt?: string;
  /** Last modification timestamp (maintained by the Firestore layer). */
  updatedAt?: string;
};

const ts = (d: string) => new Date(d).toISOString();

export function computePalletCubeCuFt(pallet: Pallet): number {
  const item = findItem(pallet.sku);
  if (!item || !item.cbmPerCase || item.cbmPerCase <= 0) return 0;
  const cases = pallet.units / (pallet.casePack || 1);
  return +(item.cbmPerCase * cases * 35.3147).toFixed(2);
}

/**
 * A pallet's weight.
 *
 * The stored value is authoritative, but a pallet built before the Item
 * Master carried a unit weight may have 0. In that case the weight is
 * derived from the live Item Master (units x unit weight) so the screen
 * never shows a meaningless "0 lb".
 */
export function palletWeightLbs(
  pallet: { sku: string; units: number; weightLbs?: number },
  itemMaster?: { sku: string; weightLbs?: number }[],
): number {
  if (pallet.weightLbs && pallet.weightLbs > 0) return pallet.weightLbs;
  const item = itemMaster?.find((i) => i.sku === pallet.sku);
  if (!item) return pallet.weightLbs ?? 0;
  return +(pallet.units * (item.weightLbs || 0)).toFixed(1);
}

/**
 * The case pack of a pallet — units per carton.
 * Falls back to the Item Master when the stored value is missing.
 */
export function palletCasePack(
  pallet: { sku: string; casePack?: number },
  itemMaster?: { sku: string; caseQty?: number }[],
): number {
  if (pallet.casePack && pallet.casePack > 1) return pallet.casePack;
  const item = itemMaster?.find((i) => i.sku === pallet.sku);
  return item?.caseQty || pallet.casePack || 1;
}

/**
 * A pallet is locked once it has left the staging area: it is stored in a
 * location, on a pick, or already shipped.
 *
 * Locked pallets cannot be edited or deleted from the Pallet screen — they
 * must be released from the Inventory screen first, which returns them to
 * "staged" with no location.
 */
export function isPalletLocked(pallet: {
  location?: string | null;
  status?: string;
}): boolean {
  return (
    !!pallet.location ||
    pallet.status === "putaway" ||
    pallet.status === "picking" ||
    pallet.status === "shipped"
  );
}

/**
 * A pallet is waiting to be put away when it is not stored anywhere yet.
 */
export function isAwaitingPutaway(pallet: {
  location?: string | null;
  status?: string;
}): boolean {
  return (
    !pallet.location &&
    pallet.status !== "shipped" &&
    pallet.status !== "picking"
  );
}

/** Directed putaway: pick the best slot for an inbound pallet */
export function suggestPutawayLocation(itemStyle: string, warehouseId: string): string {
  // In production this consults the warehouse slotting map (velocity, weight,
  // zone affinity, cube). Deterministic mock based on style + warehouse.
  const styleHash = itemStyle.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const zones = ["A", "B", "C", "D", "E", "F", "G"];
  const zone = zones[styleHash % zones.length];
  const aisle = ((styleHash >> 3) % 18) + 1;
  const shelf = ((styleHash >> 7) % 5) + 1;
  const bin = ["A", "B", "C", "D"][(styleHash >> 11) % 4];
  const whCode = warehouses.find((w) => w.id === warehouseId)?.code ?? "WH";
  return `${whCode}·${zone}${aisle.toString().padStart(2, "0")}-${shelf.toString().padStart(2, "0")}-${bin}`;
}

/**
 * Derive the pallet zone from a location reference.
 *
 * Handles both the legacy synthetic format ("ATL·A12-03-B") and real
 * Location Master IDs ("A12-03-B", "DOCK-D07", "FLR-ATL1-01").
 */
export function deriveZoneFromLocation(location: string): Pallet["zone"] {
  if (!location) return "A";
  // Legacy format: WH·ZONE-SHELF-BIN
  if (location.includes("·")) {
    const zone = location.split("·")[1]?.[0];
    if (zone) return zone as Pallet["zone"];
  }
  // Real location IDs: A12-03-B → "A", DOCK-D07 → "D", FLR-ATL1-01 → "F"
  const first = location.charAt(0).toUpperCase();
  if (/[A-Z]/.test(first)) return first as Pallet["zone"];
  return "A";
}

function buildSeedPallets(): Pallet[] {
  const out: Pallet[] = [];
  for (const item of inventoryItems) {
    for (const b of item.batches) {
      const zoneChar = (suggestPutawayLocation(item.itemStyle, item.warehouseId).split(
        "·",
      )[1]?.[0] ?? "A") as Pallet["zone"];
      const basePallet = {
        id: b.palletId,
        itemStyle: item.itemStyle,
        tenantId: item.tenantId,
        warehouseId: item.warehouseId,
        sku: item.sku,
        description: item.description,
        units: b.qty,
        capacityUnits: Math.max(b.qty, Math.ceil(b.qty * 1.25)),
        casePack: item.caseQty,
        weightLbs: +(b.qty * item.weightLbs).toFixed(1),
        builtAt: b.receivedAt,
        builtBy: ["R. Alvarez", "M. Chen", "J. Okafor", "S. Patel"][b.qty % 4],
        poNumber: b.poNumber,
        ediSource: b.ediSource,
        status: "putaway" as PalletStatus,
        location: b.location,
        suggestedLocation: b.location,
        zone: zoneChar,
        receivedAt: b.receivedAt,
      };
      out.push({
        ...basePallet,
        cubeCuFt: computePalletCubeCuFt(basePallet),
      });
    }
  }

  // A few in-flight pallets to demo the building / staging states
  const inFlight: Pallet[] = [
    seedPallet({
      id: "PLT-ATL1-00973",
      item: inventoryItems[0],
      status: "building",
      units: 36,
      builtAt: "2026-05-19T08:15:00Z",
      poNumber: "PO-554120",
      ediSource: "EDI_943",
    }),
    seedPallet({
      id: "PLT-ORD2-01302",
      item: inventoryItems[2],
      status: "staged",
      units: 240,
      builtAt: "2026-05-19T07:42:00Z",
      poNumber: "PO-770221",
      ediSource: "EDI_943",
    }),
    seedPallet({
      id: "PLT-EWR1-00421",
      item: inventoryItems[4],
      status: "picking",
      units: 300,
      builtAt: "2026-05-19T07:05:00Z",
      poNumber: "PO-310995",
      ediSource: "EDI_944",
    }),
  ];

  return [...inFlight, ...out];
}

function seedPallet(args: {
  id: string;
  item: InventoryItem;
  status: PalletStatus;
  units: number;
  builtAt: string;
  poNumber: string;
  ediSource: Pallet["ediSource"];
}): Pallet {
  const suggested = suggestPutawayLocation(args.item.itemStyle, args.item.warehouseId);
  const basePallet = {
    id: args.id,
    itemStyle: args.item.itemStyle,
    tenantId: args.item.tenantId,
    warehouseId: args.item.warehouseId,
    sku: args.item.sku,
    description: args.item.description,
    units: args.units,
    capacityUnits: Math.ceil(args.units * 1.15),
    casePack: args.item.caseQty,
    weightLbs: +(args.units * args.item.weightLbs).toFixed(1),
    builtAt: ts(args.builtAt),
    builtBy: "Live build",
    poNumber: args.poNumber,
    ediSource: args.ediSource,
    status: args.status,
    location: args.status === "building" || args.status === "staged" ? null : suggested,
    suggestedLocation: suggested,
    zone: (suggested.split("·")[1]?.[0] ?? "A") as Pallet["zone"],
    receivedAt: ts(args.builtAt),
  };
  return {
    ...basePallet,
    cubeCuFt: computePalletCubeCuFt(basePallet),
  };
}

export const pallets: Pallet[] = buildSeedPallets();

/** Append newly built pallets (e.g. from inbound receiving) into the mock store. */
export function appendPallets(newPallets: Pallet[]) {
  pallets.unshift(...newPallets);
}

/** Remove pallets by id (used to delete non-putaway pallets from the floor). */
export function removePallets(ids: string[]) {
  const set = new Set(ids);
  for (let i = pallets.length - 1; i >= 0; i--) {
    if (set.has(pallets[i].id)) pallets.splice(i, 1);
  }
}

/** Build pallets from an inbound ASN line. Returns the created pallets. */
export function createPalletsFromInbound(args: {
  sku: string;
  description: string;
  itemStyle: string;
  tenantId: string;
  warehouseId: string;
  poNumber: string;
  ediSource: Pallet["ediSource"];
  palletCount: number;
  unitsPerPallet: number;
  casePack?: number;
  weightLbsPerUnit: number;
  builtBy: string;
  prefix: string; // e.g. PLT-ATL1
  /**
   * Directed putaway suggestions produced by the PutawayEngine, in
   * priority order. When supplied these are used for the staged
   * pallets; otherwise the legacy deterministic fallback is used.
   */
  locationSuggestions?: string[];
}): Pallet[] {
  const now = new Date().toISOString();
  const created: Pallet[] = [];
  const startSeq = Math.floor(Math.random() * 9000) + 1000;
  for (let i = 0; i < args.palletCount; i++) {
    // The suggestions are authoritative when the caller supplies them. Only
    // fall back to the deterministic mock when the caller provides NOTHING —
    // a fabricated location id that does not exist in the Location Master is
    // worse than no suggestion at all.
    const suggestionPool = args.locationSuggestions?.filter(Boolean);
    const suggested = suggestionPool
      ? suggestionPool.length > 0
        ? suggestionPool[i % suggestionPool.length]
        : ""
      : suggestPutawayLocation(args.itemStyle + i, args.warehouseId);
    const id = `${args.prefix}-${(startSeq + i).toString().padStart(5, "0")}`;
    const basePallet = {
      id,
      itemStyle: args.itemStyle,
      tenantId: args.tenantId,
      warehouseId: args.warehouseId,
      sku: args.sku,
      description: args.description,
      units: args.unitsPerPallet,
      capacityUnits: Math.ceil(args.unitsPerPallet * 1.15),
      casePack: args.casePack ?? 1,
      weightLbs: +(args.unitsPerPallet * args.weightLbsPerUnit).toFixed(1),
      builtAt: now,
      builtBy: args.builtBy,
      poNumber: args.poNumber,
      ediSource: args.ediSource,
      status: "staged" as PalletStatus,
      location: null,
      suggestedLocation: suggested,
      zone: deriveZoneFromLocation(suggested),
      receivedAt: now,
    };
    created.push({
      ...basePallet,
      cubeCuFt: computePalletCubeCuFt(basePallet),
    });
  }
  appendPallets(created);
  return created;
}

/* ───── Directed picking ─────────────────────────────────────────────── */

export type PickInstruction = {
  seq: number;
  palletId: string;
  location: string;
  sku: string;
  description: string;
  qty: number;
  itemStyle: string;
  receivedAt: string;
};

export type PickWave = {
  id: string;
  orderId: string;
  poNumber: string;
  tenantId: string;
  warehouseId: string;
  carrier: string;
  releasedAt: string;
  status: "released" | "in-progress" | "complete";
  assignee: string;
  instructions: PickInstruction[];
};

/**
 * Build a directed pick route: pallets sorted by the active LIFO/FIFO rule,
 * then re-sequenced by aisle to minimize walk time.
 */
export function buildPickWave(
  orderId: string,
  sku: string,
  qty: number,
  warehouseId: string,
  strategy: "LIFO" | "FIFO",
): PickInstruction[] {
  const candidates = pallets
    .filter(
      (p) =>
        p.sku === sku &&
        p.warehouseId === warehouseId &&
        (p.status === "putaway" || p.status === "picking") &&
        p.location,
    )
    .sort((a, b) =>
      strategy === "LIFO"
        ? +new Date(b.receivedAt) - +new Date(a.receivedAt)
        : +new Date(a.receivedAt) - +new Date(b.receivedAt),
    );

  const route: PickInstruction[] = [];
  let remaining = qty;
  for (const p of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(p.units, remaining);
    route.push({
      seq: 0,
      palletId: p.id,
      location: p.location!,
      sku: p.sku,
      description: p.description,
      qty: take,
      itemStyle: p.itemStyle,
      receivedAt: p.receivedAt,
    });
    remaining -= take;
  }

  // Re-sequence by aisle traversal (the location's aisle number)
  route.sort((a, b) => {
    const aAisle = parseInt(a.location.split("·")[1]?.slice(1, 3) ?? "0", 10);
    const bAisle = parseInt(b.location.split("·")[1]?.slice(1, 3) ?? "0", 10);
    return aAisle - bAisle;
  });
  return route.map((r, i) => ({ ...r, seq: i + 1 }));
}

/** Mock open pick waves for the directed picking screen */
export const pickWaves: Omit<PickWave, "instructions">[] = [
  {
    id: "WAVE-2026-0519-001",
    orderId: "SO-770412",
    poNumber: "PO-770412",
    tenantId: "northstar",
    warehouseId: "ord2",
    carrier: "UPS",
    releasedAt: "2026-05-19T07:10:00Z",
    status: "in-progress",
    assignee: "R. Alvarez",
  },
  {
    id: "WAVE-2026-0519-002",
    orderId: "SO-310995",
    poNumber: "PO-310995",
    tenantId: "harborlite",
    warehouseId: "ewr1",
    carrier: "FedEx",
    releasedAt: "2026-05-19T06:55:00Z",
    status: "in-progress",
    assignee: "M. Chen",
  },
  {
    id: "WAVE-2026-0519-003",
    orderId: "SO-554120",
    poNumber: "PO-554120",
    tenantId: "acme",
    warehouseId: "atl1",
    carrier: "FedEx",
    releasedAt: "2026-05-19T06:30:00Z",
    status: "released",
    assignee: "Unassigned",
  },
  {
    id: "WAVE-2026-0518-022",
    orderId: "SO-220116",
    poNumber: "PO-220116",
    tenantId: "verdant",
    warehouseId: "atl1",
    carrier: "USPS",
    releasedAt: "2026-05-18T22:40:00Z",
    status: "complete",
    assignee: "J. Okafor",
  },
];
