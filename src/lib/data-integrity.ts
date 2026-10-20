/**
 * ============================================================
 *  MODULE INDEX — Data Integrity / Correlation Checker
 * ============================================================
 *
 *  Purpose: Detect records whose references no longer resolve — the classic
 *           "orphaned data" problem in a WMS after imports, deletions or
 *           manual database edits. Every issue is reported with a severity
 *           and a concrete repair action so the operator can fix it in one
 *           click instead of hunting through the database.
 *
 *  Key exports:
 *    • IntegritySeverity   — "error" | "warning"
 *    • IntegrityIssue      — one detected problem
 *    • IntegrityContext    — the data set the checker runs against
 *    • checkDataIntegrity() — run all correlation checks
 *    • repairIssue()       — apply the suggested repair
 *    • INTEGRITY_CHECKS    — registry of the individual checks
 *
 *  Correlation rules implemented:
 *    P1  pallet → inbound container missing
 *    P2  inbound line → pallet missing
 *    P3  pallet location → location master missing
 *    P4  pallet SKU → item master missing
 *    P5  pallet received units ≠ inbound line received qty
 *    S1  inbound container → work order missing
 *    S2  work order → inbound container missing (orphan)
 *    S3  inbound line SKU → item master missing
 *    S4  inbound container → client/warehouse missing
 *    I1  inventory batch → pallet missing
 *    L1  pallet putaway without a location
 *    L2  location occupancy ≠ number of pallets actually stored
 * ============================================================
 */

import type { ItemMasterRecord, LocationRecord } from "./master-data";

export type IntegritySeverity = "error" | "warning";

export type IntegrityIssueType =
  | "pallet-missing-container"
  | "line-missing-pallet"
  | "pallet-missing-location"
  | "pallet-missing-item"
  | "pallet-units-drift"
  | "container-missing-workorder"
  | "orphan-workorder"
  | "line-missing-item"
  | "container-missing-party"
  | "inventory-missing-pallet"
  | "putaway-without-location"
  | "location-occupancy-drift"
  | "cartonization-missing-order"
  | "pallet-missing-inventory";

export type IntegrityIssue = {
  id: string;
  type: IntegrityIssueType;
  severity: IntegritySeverity;
  /** Short human title, e.g. "Pallet has no inbound container" */
  title: string;
  /** What is wrong and why it matters */
  detail: string;
  /** The record the problem was found on */
  entity: "pallet" | "shipment" | "workOrder" | "line" | "inventory" | "location";
  /** Primary key of the offending record */
  recordId: string;
  /** The related record that is missing / mismatched */
  relatedId?: string;
  tenantId?: string;
  warehouseId?: string;
  /** Whether the app can repair this automatically */
  autoFixable: boolean;
  /** Label of the repair action shown on the button */
  fixLabel?: string;
};

export type IntegrityContext = {
  pallets?: any[];
  inboundShipments?: any[];
  workOrders?: any[];
  inventoryItems?: any[];
  cartonizations?: any[];
  orders?: any[];
  itemMaster?: ItemMasterRecord[];
  locationMaster?: LocationRecord[];
  tenants?: any[];
  warehouses?: any[];
};

/* ───── Individual checks ──────────────────────────────────────────── */

type Check = (ctx: IntegrityContext) => IntegrityIssue[];

/** P1 — a pallet points at an inbound container that no longer exists */
const checkPalletContainer: Check = (ctx) => {
  const shipmentIds = new Set((ctx.inboundShipments ?? []).map((s) => s.id));
  const out: IntegrityIssue[] = [];
  for (const p of ctx.pallets ?? []) {
    const sid = p.shipmentId ?? p.inboundShipmentId;
    if (!sid) {
      out.push({
        id: `P1-nolink-${p.id}`,
        type: "pallet-missing-container",
        severity: "warning",
        title: "Pallet is not linked to a container",
        detail: `Pallet ${p.id} was built without an inbound container reference, so it cannot be traced back to a receipt.`,
        entity: "pallet",
        recordId: p.id,
        tenantId: p.tenantId,
        warehouseId: p.warehouseId,
        autoFixable: false,
      });
      continue;
    }
    if (!shipmentIds.has(sid)) {
      out.push({
        id: `P1-${p.id}`,
        type: "pallet-missing-container",
        severity: "error",
        title: "Pallet has no inbound container",
        detail: `Pallet ${p.id} references container ${sid}, which no longer exists. The pallet is orphaned and its received units are not reflected on any receipt.`,
        entity: "pallet",
        recordId: p.id,
        relatedId: sid,
        tenantId: p.tenantId,
        warehouseId: p.warehouseId,
        autoFixable: true,
        fixLabel: "Unlink pallet",
      });
    }
  }
  return out;
};

/** P2 — an inbound line references a pallet that no longer exists */
const checkLinePallets: Check = (ctx) => {
  const palletIds = new Set((ctx.pallets ?? []).map((p) => p.id));
  const out: IntegrityIssue[] = [];
  for (const s of ctx.inboundShipments ?? []) {
    for (const l of s.lines ?? []) {
      for (const pid of l.palletIds ?? []) {
        if (!palletIds.has(pid)) {
          out.push({
            id: `P2-${s.id}-${l.lineNo}-${pid}`,
            type: "line-missing-pallet",
            severity: "error",
            title: "Receipt references a missing pallet",
            detail: `Line ${l.lineNo} of ${s.id} (${l.sku}) lists pallet ${pid}, which has been deleted. The received quantity still counts it.`,
            entity: "line",
            recordId: `${s.id}:${l.lineNo}`,
            relatedId: pid,
            tenantId: s.tenantId,
            warehouseId: s.warehouseId,
            autoFixable: true,
            fixLabel: "Remove reference",
          });
        }
      }
    }
  }
  return out;
};

/** P3 — a pallet is stored in a location that is not in the location master */
const checkPalletLocation: Check = (ctx) => {
  const locIds = new Set((ctx.locationMaster ?? []).map((l) => l.id));
  const out: IntegrityIssue[] = [];
  for (const p of ctx.pallets ?? []) {
    if (p.location && !locIds.has(p.location)) {
      out.push({
        id: `P3-${p.id}`,
        type: "pallet-missing-location",
        severity: "error",
        title: "Pallet is in an unknown location",
        detail: `Pallet ${p.id} is stored at ${p.location}, which is not in the Location Master. Putaway and slotting cannot account for it.`,
        entity: "pallet",
        recordId: p.id,
        relatedId: p.location,
        tenantId: p.tenantId,
        warehouseId: p.warehouseId,
        autoFixable: true,
        fixLabel: "Return to staging",
      });
    }
  }
  return out;
};

/** P4 — a pallet references a SKU that is not in the item master */
const checkPalletItem: Check = (ctx) => {
  const skus = new Set((ctx.itemMaster ?? []).map((i) => i.sku));
  const out: IntegrityIssue[] = [];
  for (const p of ctx.pallets ?? []) {
    if (p.sku && !skus.has(p.sku)) {
      out.push({
        id: `P4-${p.id}`,
        type: "pallet-missing-item",
        severity: "error",
        title: "Pallet references an unknown SKU",
        detail: `Pallet ${p.id} holds ${p.sku}, which is missing from the Item Master. Dimensions, pallet build and billing cannot be resolved for it.`,
        entity: "pallet",
        recordId: p.id,
        relatedId: p.sku,
        tenantId: p.tenantId,
        warehouseId: p.warehouseId,
        autoFixable: false,
      });
    }
  }
  return out;
};

/** P5 — the received units on a receipt disagree with its pallets */
const checkUnitsDrift: Check = (ctx) => {
  const out: IntegrityIssue[] = [];
  const byId = new Map((ctx.pallets ?? []).map((p) => [p.id, p]));
  for (const s of ctx.inboundShipments ?? []) {
    for (const l of s.lines ?? []) {
      const linked = (l.palletIds ?? [])
        .map((pid: string) => byId.get(pid))
        .filter(Boolean) as any[];
      if (linked.length === 0) continue;
      const units = linked.reduce((sum, p) => sum + (Number(p.units) || 0), 0);
      const received = Number(l.receivedQty) || 0;
      if (units !== received) {
        out.push({
          id: `P5-${s.id}-${l.lineNo}`,
          type: "pallet-units-drift",
          severity: "error",
          title: "Received quantity does not match the pallets",
          detail: `Line ${l.lineNo} of ${s.id} (${l.sku}) shows ${received} units received, but its ${linked.length} pallet(s) hold ${units} units.`,
          entity: "line",
          recordId: `${s.id}:${l.lineNo}`,
          tenantId: s.tenantId,
          warehouseId: s.warehouseId,
          autoFixable: true,
          fixLabel: "Recalculate from pallets",
        });
      }
    }
  }
  return out;
};

/** S1 — an inbound container has no work order */
const checkContainerWorkOrder: Check = (ctx) => {
  const woIds = new Set((ctx.workOrders ?? []).map((w) => w.id));
  const out: IntegrityIssue[] = [];
  for (const s of ctx.inboundShipments ?? []) {
    if (s.workOrderId && !woIds.has(s.workOrderId)) {
      out.push({
        id: `S1-${s.id}`,
        type: "container-missing-workorder",
        severity: "error",
        title: "Container has no work order",
        detail: `Container ${s.id} references work order ${s.workOrderId}, which does not exist. Receiving progress and billing cannot be reconciled.`,
        entity: "shipment",
        recordId: s.id,
        relatedId: s.workOrderId,
        tenantId: s.tenantId,
        warehouseId: s.warehouseId,
        autoFixable: true,
        fixLabel: "Recreate work order",
      });
    }
  }
  return out;
};

/** S2 — a work order has no inbound container */
const checkOrphanWorkOrder: Check = (ctx) => {
  const shipmentIds = new Set((ctx.inboundShipments ?? []).map((s) => s.id));
  const out: IntegrityIssue[] = [];
  for (const w of ctx.workOrders ?? []) {
    const linked = (ctx.inboundShipments ?? []).find(
      (s) => s.workOrderId === w.id || s.id === w.id,
    );
    if (!linked) {
      out.push({
        id: `S2-${w.id}`,
        type: "orphan-workorder",
        severity: "warning",
        title: "Work order has no container",
        detail: `Work order ${w.id} (${w.ediRef ?? w.poNumber ?? ""}) is not linked to any inbound container. It will not appear on the Inbound screen.`,
        entity: "workOrder",
        recordId: w.id,
        tenantId: w.tenantId,
        warehouseId: w.warehouseId,
        autoFixable: true,
        fixLabel: "Delete work order",
      });
    }
  }
  void shipmentIds;
  return out;
};

/** S3 — an inbound line references a SKU that is not in the item master */
const checkLineItem: Check = (ctx) => {
  const skus = new Set((ctx.itemMaster ?? []).map((i) => i.sku));
  const out: IntegrityIssue[] = [];
  for (const s of ctx.inboundShipments ?? []) {
    for (const l of s.lines ?? []) {
      if (l.sku && !skus.has(l.sku)) {
        out.push({
          id: `S3-${s.id}-${l.lineNo}`,
          type: "line-missing-item",
          severity: "error",
          title: "Receipt line references an unknown SKU",
          detail: `Line ${l.lineNo} of ${s.id} references ${l.sku}, which is missing from the Item Master. The receipt cannot be palletized or billed correctly.`,
          entity: "line",
          recordId: `${s.id}:${l.lineNo}`,
          relatedId: l.sku,
          tenantId: s.tenantId,
          warehouseId: s.warehouseId,
          autoFixable: false,
        });
      }
    }
  }
  return out;
};

/** S4 — an inbound container references a client or warehouse that is gone */
const checkContainerParties: Check = (ctx) => {
  const tenantIds = new Set((ctx.tenants ?? []).map((t) => t.id));
  const whIds = new Set((ctx.warehouses ?? []).map((w) => w.id));
  const out: IntegrityIssue[] = [];
  for (const s of ctx.inboundShipments ?? []) {
    if (s.tenantId && !tenantIds.has(s.tenantId)) {
      out.push({
        id: `S4-t-${s.id}`,
        type: "container-missing-party",
        severity: "error",
        title: "Container references an unknown client",
        detail: `Container ${s.id} is booked to client ${s.tenantId}, which is not in the client master.`,
        entity: "shipment",
        recordId: s.id,
        relatedId: s.tenantId,
        tenantId: s.tenantId,
        warehouseId: s.warehouseId,
        autoFixable: false,
      });
    }
    if (s.warehouseId && !whIds.has(s.warehouseId)) {
      out.push({
        id: `S4-w-${s.id}`,
        type: "container-missing-party",
        severity: "error",
        title: "Container references an unknown warehouse",
        detail: `Container ${s.id} is booked to warehouse ${s.warehouseId}, which is not in the warehouse master.`,
        entity: "shipment",
        recordId: s.id,
        relatedId: s.warehouseId,
        tenantId: s.tenantId,
        warehouseId: s.warehouseId,
        autoFixable: false,
      });
    }
  }
  return out;
};

/** I1 — an inventory batch references a pallet that no longer exists */
const checkInventoryPallets: Check = (ctx) => {
  const palletIds = new Set((ctx.pallets ?? []).map((p) => p.id));
  const out: IntegrityIssue[] = [];
  for (const inv of ctx.inventoryItems ?? []) {
    for (const b of inv.batches ?? []) {
      if (b.palletId && !palletIds.has(b.palletId)) {
        out.push({
          id: `I1-${inv.sku}-${b.palletId}`,
          type: "inventory-missing-pallet",
          severity: "error",
          title: "Inventory batch references a missing pallet",
          detail: `Inventory for ${inv.sku} has a batch on pallet ${b.palletId}, which has been deleted. The on-hand quantity is not backed by a physical pallet.`,
          entity: "inventory",
          recordId: `${inv.sku}:${b.palletId}`,
          relatedId: b.palletId,
          tenantId: inv.tenantId,
          warehouseId: inv.warehouseId,
          autoFixable: true,
          fixLabel: "Remove batch",
        });
      }
    }
  }
  return out;
};

/** L1 — a pallet is put away but has no location assigned */
const checkPutawayLocation: Check = (ctx) => {
  const out: IntegrityIssue[] = [];
  for (const p of ctx.pallets ?? []) {
    if (p.status === "putaway" && !p.location) {
      out.push({
        id: `L1-${p.id}`,
        type: "putaway-without-location",
        severity: "error",
        title: "Pallet is put away without a location",
        detail: `Pallet ${p.id} has status "putaway" but no location recorded. Stock is on hand with nowhere to scan it from.`,
        entity: "pallet",
        recordId: p.id,
        tenantId: p.tenantId,
        warehouseId: p.warehouseId,
        autoFixable: true,
        fixLabel: "Return to staged",
      });
    }
  }
  return out;
};

/** L2 — a location's occupancy counter disagrees with the pallets stored there */
const checkLocationOccupancy: Check = (ctx) => {
  const out: IntegrityIssue[] = [];
  const actual = new Map<string, number>();
  for (const p of ctx.pallets ?? []) {
    if (!p.location) continue;
    actual.set(p.location, (actual.get(p.location) ?? 0) + 1);
  }
  for (const l of ctx.locationMaster ?? []) {
    const stored = actual.get(l.id) ?? 0;
    const recorded = Number(l.occupiedPallets) || 0;
    if (stored !== recorded) {
      out.push({
        id: `L2-${l.id}`,
        type: "location-occupancy-drift",
        severity: "warning",
        title: "Location occupancy is out of date",
        detail: `Location ${l.id} is recorded as ${recorded} occupied, but ${stored} pallet(s) are actually stored there.`,
        entity: "location",
        recordId: l.id,
        tenantId: l.tenantId,
        warehouseId: l.warehouseId,
        autoFixable: true,
        fixLabel: "Recalculate occupancy",
      });
    }
  }
  return out;
};

/** C1 — a cartonization was derived from an order that no longer exists */
const checkCartonizationOrder: Check = (ctx) => {
  const orderIds = new Set((ctx.orders ?? []).map((o) => o.id));
  const out: IntegrityIssue[] = [];
  for (const c of ctx.cartonizations ?? []) {
    const orderId = c.orderId;
    if (!orderId) continue;
    if (!orderIds.has(orderId)) {
      out.push({
        id: `C1-${c.id}`,
        type: "cartonization-missing-order",
        severity: "error",
        title: "Cartonization has no order",
        detail: `Cartonization ${c.id} was built from order ${orderId}, which no longer exists. It cannot be packed, picked or billed.`,
        entity: "shipment",
        recordId: c.id,
        relatedId: orderId,
        tenantId: c.tenantId,
        warehouseId: c.warehouseId,
        autoFixable: true,
        fixLabel: "Delete cartonization",
      });
    }
  }
  return out;
};

/**
 * P6 — a pallet is stored in a location but has no inventory batch.
 *
 * Stock on hand is derived from the pallets, so a stored pallet without a
 * batch means the inventory under-reports what is physically in the building.
 */
const checkPalletInventory: Check = (ctx) => {
  const batchPalletIds = new Set(
    (ctx.inventoryItems ?? []).flatMap((i) =>
      (i.batches ?? []).map((b: any) => b.palletId),
    ),
  );
  const out: IntegrityIssue[] = [];
  for (const p of ctx.pallets ?? []) {
    if (!p.location) continue;
    if (batchPalletIds.has(p.id)) continue;
    out.push({
      id: `P6-${p.id}`,
      type: "pallet-missing-inventory",
      severity: "error",
      title: "Stored pallet is not in the inventory",
      detail: `Pallet ${p.id} is stored at ${p.location} but has no inventory batch, so the on-hand quantity does not include it.`,
      entity: "pallet",
      recordId: p.id,
      relatedId: p.sku,
      tenantId: p.tenantId,
      warehouseId: p.warehouseId,
      autoFixable: true,
      fixLabel: "Add to inventory",
    });
  }
  return out;
};

/** Registry of every correlation check */
export const INTEGRITY_CHECKS: Array<{ id: string; label: string; run: Check }> = [
  { id: "P1", label: "Pallet → container", run: checkPalletContainer },
  { id: "P2", label: "Receipt → pallet", run: checkLinePallets },
  { id: "P3", label: "Pallet → location", run: checkPalletLocation },
  { id: "P4", label: "Pallet → item", run: checkPalletItem },
  { id: "P5", label: "Receipt units ↔ pallets", run: checkUnitsDrift },
  { id: "P6", label: "Pallet → inventory", run: checkPalletInventory },
  { id: "S1", label: "Container → work order", run: checkContainerWorkOrder },
  { id: "S2", label: "Work order → container", run: checkOrphanWorkOrder },
  { id: "S3", label: "Receipt line → item", run: checkLineItem },
  { id: "S4", label: "Container → client / warehouse", run: checkContainerParties },
  { id: "I1", label: "Inventory → pallet", run: checkInventoryPallets },
  { id: "L1", label: "Pallet putaway → location", run: checkPutawayLocation },
  { id: "L2", label: "Location occupancy", run: checkLocationOccupancy },
  { id: "C1", label: "Cartonization → order", run: checkCartonizationOrder },
];

/**
 * Run every correlation check and return the issues, most severe first.
 */
export function checkDataIntegrity(ctx: IntegrityContext): IntegrityIssue[] {
  const issues = INTEGRITY_CHECKS.flatMap((c) => {
    try {
      return c.run(ctx);
    } catch {
      return [];
    }
  });

  return issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}
