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

const ts = (d: string) => new Date(d).toISOString();

export function computePalletCubeCuFt(pallet: Pallet): number {
  const item = findItem(pallet.sku);
  if (!item || !item.cbmPerCase || item.cbmPerCase <= 0) return 0;
  const cases = pallet.units / (pallet.casePack || 1);
  return +(item.cbmPerCase * cases * 35.3147).toFixed(2);
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
}): Pallet[] {
  const now = new Date().toISOString();
  const created: Pallet[] = [];
  const startSeq = Math.floor(Math.random() * 9000) + 1000;
  for (let i = 0; i < args.palletCount; i++) {
    const suggested = suggestPutawayLocation(args.itemStyle + i, args.warehouseId);
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
      zone: (suggested.split("·")[1]?.[0] ?? "A") as Pallet["zone"],
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
