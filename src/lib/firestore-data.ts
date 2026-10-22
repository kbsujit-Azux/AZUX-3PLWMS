/**
 * ============================================================
 *  MODULE INDEX — Firestore Data-Access Layer (DAL)
 * ============================================================
 *
 *  Purpose: All Firestore collection operations for the WMS 3PL
 *           system. Every read, write, subscribe, and transactional
 *           operation flows through this module. This is the only
 *           module that imports from "firebase/firestore" directly
 *           (aside from firestore.ts which creates the db instance).
 *
 *  Naming convention:
 *    fetchX()           — One-time read of collection X
 *    subscribeX()       — Real-time onSnapshot listener for X
 *    createX()          — setDoc for a single X record
 *    updateX()          — updateDoc for a single X record
 *    deleteX()          — deleteDoc for a single X record
 *    batchWriteX()      — writeBatch for bulk X writes
 *
 *  Collections covered:
 *    ┌─────────────────────┬──────────────────────────────────────────┐
 *    │ Collection          │ CRUD Functions                           │
 *    ├─────────────────────┼──────────────────────────────────────────┤
 *    │ tenants             │ fetchTenants, subscribeTenants           │
 *    │ warehouses          │ fetchWarehouses, subscribeWarehouses     │
 *    │ itemMaster          │ fetchItemMaster, subscribeItemMaster,    │
 *    │                     │ addItemToMaster, deleteItemMaster        │
 *    │ inboundShipments    │ fetchInboundShipments, subscribe...,     │
 *    │                     │ updateInboundLine, receiveInbound...     │
 *    │ pallets             │ fetchPallets, subscribePallets,          │
 *    │                     │ createPallet, createPallets, updatePallet│
 *    │ outboundPallets     │ fetchOutboundPallets, subscribe...,      │
 *    │                     │ createOutboundPallet, update..., getNext │
 *    │ shipments           │ createShipmentRecord, update...,         │
 *    │                     │ subscribeShipmentRecords                 │
 *    │ orders              │ fetchOrders, subscribeOrders,            │
 *    │                     │ createOrder, updateOrder, deleteOrder    │
 *    │ inventoryItems      │ fetchInventoryItems, subscribe...,       │
 *    │                     │ upsertInventoryItem, updateInventoryBatch│
 *    │ pickTickets         │ fetchPickTickets, subscribe...,          │
 *    │                     │ writePickTicket, batchWrite..., update,  │
 *    │                     │ delete, deleteByOrder                    │
 *    │ ediLogs             │ fetchEdiLogs                             │
 *    │ locations           │ fetchLocations, subscribeLocations       │
 *    │ clientAllocation... │ fetch, subscribe, set, delete            │
 *    │ billsOfLading       │ fetch, subscribe, create                 │
 *    │ inventoryTrans...   │ log, fetch, subscribe                    │
 *    │ counters            │ (used internally by getNext*Seq)         │
 *    │ billingClients      │ CRUD via subscribe/create/update/delete  │
 *    │ chargeRules         │ CRUD via subscribe/create/update/delete  │
 *    │ billableEvents      │ CRUD via subscribe/create/update         │
 *    │ invoices            │ CRUD via subscribe/create/update/delete  │
 *    └─────────────────────┴──────────────────────────────────────────┘
 *
 *  Transactional operations (runTransaction):
 *    • executeDirectedPick()      — Directed pick with batch updates
 *    • executeManualPick()        — Manual pick with auto-generated ticket
 *    • reallocatePickTicket()     — Reallocate to next available batch
 *    • getNextOrderSeq()          — Atomic order number generation
 *    • getNextPickTicketSeq()     — Atomic pick ticket sequence
 *    • getNextBolNumber()         — Atomic BOL number generation
 *    • getNextOutboundPalletSeq() — Atomic outbound pallet sequence
 *    • shipOrder()                — Full ship transaction: BOL + tickets + inv
 *    • allocateOrderTransactional() — Allocation + order status + batch qty
 *    • deallocateOrderTransactional() — Reverse allocation
 *    • deleteInventoryBatch()     — Admin batch deletion with audit trail
 *    • rebuildLocationMasterFromInventory() — Sync locations from inventory
 *
 *  Extension points for advanced WMS 3PL functions:
 *    - To add a new Firestore collection:
 *      1. Define the type in the appropriate lib/*.ts module
 *      2. Add fetchX / subscribeX / createX / updateX / deleteX here
 *      3. Follow the tenantId/warehouseId filter pattern
 *      4. Export the new functions from src/lib/index.ts
 *    - To add a new transactional operation:
 *      1. Use runTransaction() for atomic reads + writes
 *      2. Validate preconditions before entering the transaction
 *      3. Log inventory transactions for audit trail
 *      4. Return typed result objects (success + error pattern)
 * ============================================================
 */

import {
  collection,
  getDocs,
  getDoc,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  writeBatch,
  increment,
  limit,
  type Unsubscribe,
  orderBy,
  Timestamp,
  QuerySnapshot,
  Query,
  serverTimestamp,
  runTransaction,
  addDoc,
} from "firebase/firestore";
import { db } from "./firestore";
import type {
  Tenant,
  Warehouse,
  InventoryItem,
  ClientAllocationConfig,
  PickTicket,
} from "./mock-data";
import type { BillOfLading } from "./bol-data";
import { DROP001_LOCATION, warehouses as seedWarehouses } from "./mock-data";
import type { Pallet } from "./pallet-data";
import type { ItemMasterRecord, LocationRecord, LocationType } from "./master-data";
import type { InboundShipment, InboundLine, WorkOrderStatus } from "./inbound-data";
import { projectWorkOrderLines } from "./inbound-data";
import { tenants as _tenants } from "./mock-data";

function getTenantName(id: string): string {
  return _tenants.find((t) => t.id === id)?.name || id;
}
import type { Order, EdiLog } from "./edi-data";
import type { OutboundPallet } from "./outbound-pallet-data";
import type {
  BillingClient,
  ChargeRule,
  BillableEvent,
  Invoice,
  InvoicePayment,
  BillingAuditLog,
} from "./billing-data";
import type {
  SerialInventoryRecord,
  SerialStatus,
  ComplianceAuditLog,
  ComplianceDocument,
  Recall,
  QuarantineOrder,
  ComplianceDocumentType,
  DocumentStatus,
  RecallStatus,
} from "./compliance-types";
import type { CycleCount, CycleCountLine, CountSchedule } from "./counting-data";
import type { VasWorkOrder, VasWorkOrderLine } from "./vas-data";
import type { CrossDockMatch } from "./crossdock-data";
import type { CatchWeightItem, CatchWeightLog } from "./catch-weight-data";
import type { LaborForecast, ShiftSchedule } from "./labor-forecast";
import type { WarehouseEmployee, MovementHistory } from "./rf-types";
import type { CarrierServiceRecord } from "./carrier-services";
import { maybeCaptureBillableEvent } from "./billing-engine";
import {
  LABOR_STANDARDS,
  getLaborStandard,
  computeStandardSec,
  getAisleFromLocation,
} from "./labor-data";
import type { LaborStandard, LaborEvent, LaborTaskType } from "./rf-types";

// ============================================================
// Tenants
// ============================================================
export async function fetchTenants(): Promise<Tenant[]> {
  const snap = await getDocs(collection(db, "tenants"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as Tenant);
}

export function subscribeTenants(callback: (tenants: Tenant[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "tenants"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as Tenant));
  });
}

// ============================================================
// Warehouses
// ============================================================
export async function fetchWarehouses(): Promise<Warehouse[]> {
  const snap = await getDocs(collection(db, "warehouses"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as Warehouse);
}

export function subscribeWarehouses(callback: (warehouses: Warehouse[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "warehouses"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as Warehouse));
  });
}

export async function createWarehouse(warehouse: Omit<Warehouse, "id">): Promise<string> {
  const ref = doc(collection(db, "warehouses"));
  await setDoc(ref, warehouse);
  return ref.id;
}

export async function updateWarehouse(id: string, warehouse: Partial<Warehouse>): Promise<void> {
  await updateDoc(doc(db, "warehouses", id), warehouse);
}

export async function deleteWarehouse(id: string): Promise<void> {
  await deleteDoc(doc(db, "warehouses", id));
}

// ============================================================
// Item Master
// ============================================================
export async function fetchItemMaster(tenantId?: string): Promise<ItemMasterRecord[]> {
  let q: Query = collection(db, "itemMaster");
  if (tenantId && tenantId !== "all") {
    q = query(collection(db, "itemMaster"), where("tenantId", "==", tenantId));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as unknown as ItemMasterRecord);
}

export function subscribeItemMaster(
  callback: (items: ItemMasterRecord[]) => void,
  tenantId?: string,
): Unsubscribe {
  let q: Query = collection(db, "itemMaster");
  if (tenantId && tenantId !== "all") {
    q = query(collection(db, "itemMaster"), where("tenantId", "==", tenantId));
  }
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => d.data() as unknown as ItemMasterRecord));
  });
}

export async function addItemToMaster(rec: any): Promise<ItemMasterRecord> {
  const full: ItemMasterRecord = {
    ...rec,
    cbmPerCase:
      rec.lengthIn && rec.widthIn && rec.heightIn
        ? +(rec.lengthIn * rec.widthIn * rec.heightIn * 0.000016387064).toFixed(4)
        : 0,
    active: rec.active ?? true,
    hazmat: rec.hazmat ?? false,
    source: rec.source ?? "MANUAL",
    effectiveAt: new Date().toISOString(),
  };
  await setDoc(doc(db, "itemMaster", full.sku), full);
  return full;
}

export async function deleteItemFromMaster(sku: string): Promise<{ ok: true }> {
  const invSnap = await getDocs(query(collection(db, "inventoryItems"), where("sku", "==", sku)));
  if (!invSnap.empty) {
    throw new Error(`Cannot delete ${sku} — inventory exists.`);
  }
  await deleteDoc(doc(db, "itemMaster", sku));
  return { ok: true };
}

export async function updateItemInMaster(sku: string, updates: Partial<ItemMasterRecord>): Promise<void> {
  const full = {
    ...updates,
    cbmPerCase:
      updates.lengthIn && updates.widthIn && updates.heightIn
        ? +(updates.lengthIn * updates.widthIn * updates.heightIn * 0.000016387064).toFixed(4)
        : undefined,
    effectiveAt: new Date().toISOString(),
  };
  // Remove undefined values
  const clean = Object.fromEntries(Object.entries(full).filter(([_, v]) => v !== undefined));
  await updateDoc(doc(db, "itemMaster", sku), clean);
}

// ============================================================
// Location Master
// ============================================================
export async function addLocationToMaster(loc: LocationRecord): Promise<LocationRecord> {
  const full: LocationRecord = {
    ...loc,
    cubicFeet: loc.lengthFt && loc.widthFt && loc.heightFt ? loc.lengthFt * loc.widthFt * loc.heightFt : 0,
  };
  await setDoc(doc(db, "locationMaster", full.id), full);
  return full;
}

export async function updateLocationInMaster(id: string, updates: Partial<LocationRecord>): Promise<void> {
  const full = {
    ...updates,
    cubicFeet:
      updates.lengthFt && updates.widthFt && updates.heightFt
        ? updates.lengthFt * updates.widthFt * updates.heightFt
        : undefined,
  };
  const clean = Object.fromEntries(Object.entries(full).filter(([_, v]) => v !== undefined));
  await updateDoc(doc(db, "locationMaster", id), clean);
}

export async function deleteLocationFromMaster(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "locationMaster", id));
  return { ok: true };
}

// ============================================================
// Inbound Shipments
// ============================================================
export async function fetchInboundShipments(
  tenantId?: string,
  warehouseId?: string,
): Promise<InboundShipment[]> {
  let q: Query = collection(db, "inboundShipments");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as InboundShipment);
}

export function subscribeInboundShipments(
  callback: (shipments: InboundShipment[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "inboundShipments");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as InboundShipment),
    );
  });
}

/**
 * Update a single line of an inbound shipment.
 *
 * IMPORTANT: Firestore's `update()` treats a dotted path such as
 * `lines.0.receivedQty` as a MAP key path, which replaces the whole `lines`
 * array with an object and destroys every other line (and every other field
 * of the targeted line). To stay safe the whole array is read, the single
 * line is merged in memory, and the array is written back.
 */
export async function updateInboundLine(
  shipmentId: string,
  lineNo: number,
  updates: Partial<InboundLine>,
) {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(shipmentRef);
    if (!snap.exists()) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }
    const data = snap.data() as any;
    const lines: any[] = Array.isArray(data.lines) ? [...data.lines] : [];
    const idx = Math.max(0, lineNo);
    lines[idx] = { ...(lines[idx] ?? {}), ...updates };
    transaction.update(shipmentRef, {
      lines,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function receiveInboundShipment(
  shipmentId: string,
  lineNo: number,
  receivedQty: number,
  palletIds: string[],
) {
  return await runTransaction(db, async (transaction) => {
    const shipmentRef = doc(db, "inboundShipments", shipmentId);
    const shipmentSnap = await transaction.get(shipmentRef);
    if (!shipmentSnap.exists()) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }
    const shipmentData = shipmentSnap.data() as any;
    const clientId = shipmentData?.clientId || shipmentData?.tenantId;
    const tenantId = shipmentData?.tenantId || clientId;
    const warehouseId = shipmentData?.warehouseId;

    transaction.update(shipmentRef, {
      [`lines.${lineNo}.receivedQty`]: increment(receivedQty),
      [`lines.${lineNo}.palletIds`]: arrayUnion(...palletIds),
      status: "received",
      receivedAt: new Date().toISOString(),
    });

    if (clientId && receivedQty > 0) {
      const eventRef = doc(collection(db, "billableEvents"));
      transaction.set(eventRef, {
        id: eventRef.id,
        clientId,
        tenantId,
        warehouseId,
        shipmentId,
        lineNo,
        receivedQty,
        type: "Inbound",
        unit: "carton",
        billed: false,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return { success: true };
  });
}

// ============================================================
// Create Inbound Shipment from CSV
// ============================================================
export async function createInboundShipmentRecord(
  shipment: Omit<
    InboundShipment,
    "id" | "isaControl" | "partner" | "receivedAt" | "lines" | "source"
  > & {
    source: "CSV";
    lines: Array<{
      lineNo: number;
      sku: string;
      upc?: string;
      itemStyle?: string;
      description?: string;
      lot: string;
      expirationDate?: string;
      qtyExpected: number;
      cartonsExpected?: number;
      unitsPerPallet?: number;
      weightLbsPerUnit?: number;
    }>;
  },
): Promise<string> {
  // Generate ID in format: INB-YYYYMMDD-XXXX (same for both Inbound and WorkOrder)
  const id = `INB-${new Date().getFullYear()}${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}${(new Date().getDate()).toString().padStart(2, "0")}-${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;

  const woId = id; // Use SAME ID for WorkOrder

  const totalUnits = Array.isArray(shipment.lines) ? shipment.lines.reduce((sum, l) => sum + l.qtyExpected, 0) : 0;
  const totalCartons = Array.isArray(shipment.lines) ? shipment.lines.reduce((sum, l) => sum + (l.cartonsExpected || 0), 0) : 0;

  const lines: InboundLine[] = Array.isArray(shipment.lines) ? shipment.lines.map((l, idx) => ({
    lineNo: l.lineNo,
    sku: l.sku,
    upc: l.upc || "",
    itemStyle: l.itemStyle || "",
    description: l.description || "",
    lot: l.lot,
    expirationDate: l.expirationDate || "2099-12-31",
    qtyExpected: l.qtyExpected,
    cartonsExpected: l.cartonsExpected || 0,
    uom: "EA",
    weightLbsPerUnit: l.weightLbsPerUnit || 0,
    unitsPerPallet: l.unitsPerPallet || 1,
    receivedQty: 0,
    palletIds: [],
    status: "expected",
  })) : [];

  const fullShipment: InboundShipment = {
    id,
    ediRef: shipment.ediRef || shipment.poNumber,
    isaControl: `CSV-${Date.now()}`,
    tenantId: shipment.tenantId,
    warehouseId: shipment.warehouseId,
    partner: "CSV_IMPORT",
    carrier: shipment.carrier,
    trailerNumber: shipment.trailerNumber || "—",
    containerNumber: shipment.containerNumber || "—",
    sealNumber: shipment.sealNumber || "",
    bolNumber: shipment.bolNumber || "",
    origin: shipment.origin || "",
    poNumber: shipment.poNumber,
    appointmentAt: shipment.appointmentAt || new Date().toISOString(),
    expectedAt: shipment.appointmentAt || new Date().toISOString(),
    receivedAt: null,
    doorAssigned: shipment.doorAssigned || null,
    warehouseLocation: shipment.warehouseLocation || null,
    status: "scheduled",
    source: "CSV",
    workOrderId: woId,
    vessel: shipment.vessel || "",
    voyageNumber: shipment.voyageNumber || "",
    port: shipment.port || "",
    lines,
  };

  const workOrderLines = Array.isArray(shipment.lines) ? shipment.lines.map((l, idx) => ({
    lineNo: idx + 1,
    sku: l.sku,
    upc: l.upc || "",
    description: "",
    lot: l.lot,
    qtyExpected: l.qtyExpected,
    qtyReceived: 0,
    cartons: l.cartonsExpected || 0,
    status: "pending" as const,
  })) : [];

  const workOrderData = {
    id: woId,
    woNumber: woId,
    tenantId: shipment.tenantId,
    warehouseId: shipment.warehouseId,
    clientName: getTenantName(shipment.tenantId),
    containerNumber: shipment.containerNumber || "—",
    trailerNumber: shipment.trailerNumber || "—",
    sealNumber: shipment.sealNumber || "",
    bolNumber: shipment.bolNumber || "",
    poNumber: shipment.poNumber,
    ediRef: shipment.ediRef,
    carrier: shipment.carrier,
    vessel: shipment.vessel || "",
    voyageNumber: shipment.voyageNumber || "",
    port: shipment.port || "",
    origin: shipment.origin || "",
    arrivalDate: shipment.appointmentAt,
    departureDate: null,
    yardInDate: null,
    yardLeaveDate: null,
    inboundEntryDate: new Date().toISOString(),
    receivedDate: null,
    status: "scheduled",
    totalUnits,
    totalCartons,
    lineCount: shipment.lines.length,
    lines: workOrderLines,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: "",
    doorAssigned: shipment.doorAssigned || null,
    warehouseLocation: shipment.warehouseLocation || null,
  };

  // Use batch write for atomic creation of both inbound shipment and work order
  const batch = writeBatch(db);
  batch.set(doc(db, "inboundShipments", id), fullShipment);
  batch.set(doc(db, "workOrders", woId), workOrderData);
  await batch.commit();

  return id;
}

export async function updateInboundLineFields(
  shipmentId: string,
  lineNo: number,
  updates: Partial<InboundLine> & { receivedQty?: number; palletIds?: string[]; status?: "expected" | "partial" | "received" },
) {
  // Delegates to the array-safe implementation (see updateInboundLine).
  return updateInboundLine(shipmentId, lineNo, updates as Partial<InboundLine>);
}

/**
 * Record a pallet build against an inbound line.
 *
 * Uses field-level paths (not a whole-line replace) so the rest of the line
 * (sku, description, qtyExpected, …) is preserved. Pallet IDs are unioned
 * so repeated builds accumulate instead of overwriting each other.
 *
 * Also advances the shipment status:
 *   - all lines received  → "received"
 *   - otherwise           → "on_dock"
 */
export async function recordInboundPalletBuild(
  shipmentId: string,
  lineNo: number,
  receivedDelta: number,
  palletIds: string[],
  lineStatus: "expected" | "partial" | "received",
  unitsPerPallet?: number,
  osd?: {
    foundQty?: number;
    damagedQty?: number;
    osdType?: "over" | "short" | "damaged" | "wrong_item";
    osdReason?: string;
    damagePalletId?: string;
  },
): Promise<{ shipmentStatus: "on_dock" | "received" }> {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(shipmentRef);
    if (!snap.exists()) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }
    const data = snap.data() as any;
    // Copy the array — never mutate the snapshot in place.
    const lines: any[] = Array.isArray(data.lines) ? [...data.lines] : [];

    const line = lines[lineNo] ?? {};
    // The received quantity is the ACTUAL total in the linked pallets, not
    // capped at the expected quantity — otherwise an over-receipt would be
    // invisible and a deleted pallet would not change anything.
    const nextReceived = Math.max(0, Number(line.receivedQty ?? 0) + receivedDelta);
    const nextLineStatus: "expected" | "partial" | "received" =
      Number(line.qtyExpected ?? 0) > 0 &&
      nextReceived >= Number(line.qtyExpected ?? 0)
        ? "received"
        : nextReceived > 0
          ? "partial"
          : "expected";

    const mergedPalletIds = Array.from(
      new Set([...(Array.isArray(line.palletIds) ? line.palletIds : []), ...palletIds]),
    );

    lines[lineNo] = {
      ...line,
      receivedQty: nextReceived,
      status: nextLineStatus,
      palletIds: mergedPalletIds,
      ...(unitsPerPallet && unitsPerPallet > 0 ? { unitsPerPallet } : {}),
      ...(osd?.foundQty !== undefined ? { foundQty: osd.foundQty } : {}),
      ...(osd?.damagedQty !== undefined ? { damagedQty: osd.damagedQty } : {}),
      ...(osd?.osdType ? { osdType: osd.osdType } : {}),
      ...(osd?.osdReason ? { osdReason: osd.osdReason } : {}),
      ...(osd?.damagePalletId ? { damagePalletId: osd.damagePalletId } : {}),
    };

    const allReceived = lines.every(
      (l, i) => (i === lineNo ? nextLineStatus : l?.status) === "received",
    );
    const shipmentStatus: "on_dock" | "received" = allReceived ? "received" : "on_dock";

    transaction.update(shipmentRef, {
      lines,
      status: shipmentStatus,
      ...(shipmentStatus === "received" ? { receivedAt: new Date().toISOString() } : {}),
      updatedAt: new Date().toISOString(),
    });
    return { shipmentStatus };
  });
}

/**
 * Persist a closed-container receipt.
 *
 * The receipt is the client-facing document (the "Inbound Receipt" print).
 * It has to survive a refresh, so it is written to Firestore and synced
 * back into the app.
 */
export async function saveInboundReceipt(receipt: {
  id: string;
  receiptRef: string;
  inboundShipmentId: string;
  tenantId: string;
  warehouseId: string;
  carrier: string;
  trailerNumber: string;
  containerNumber: string;
  sealNumber: string;
  bolNumber: string;
  poNumber: string;
  appointmentAt: string;
  closedAt: string;
  source: string;
  lines: any[];
}): Promise<void> {
  await setDoc(doc(db, "inboundReceipts", receipt.id), {
    ...receipt,
    updatedAt: new Date().toISOString(),
  });
}

export async function fetchInboundReceipts(): Promise<any[]> {
  const snap = await getDocs(collection(db, "inboundReceipts"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }));
}

export function subscribeInboundReceipts(
  callback: (receipts: any[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "inboundReceipts"), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })));
  });
}

export async function updateInboundShipmentStatus(  shipmentId: string,
  status: "scheduled" | "arrived" | "on_dock" | "putaway" | "received" | "exception",
  receivedAt?: string,
) {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);
  await updateDoc(shipmentRef, {
    status,
    receivedAt: receivedAt || new Date().toISOString(),
  });
}

export async function deleteInboundShipment(shipmentId: string, workOrderId?: string) {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);
  await deleteDoc(shipmentRef);

  // Remove the pallets that were built from this container so the Pallet
  // screen does not keep showing orphans.
  try {
    const [byShipment, byInbound] = await Promise.all([
      getDocs(query(collection(db, "pallets"), where("shipmentId", "==", shipmentId))),
      getDocs(query(collection(db, "pallets"), where("inboundShipmentId", "==", shipmentId))),
    ]);
    const refs = [...byShipment.docs, ...byInbound.docs].map((d) => d.ref);
    if (refs.length) {
      const batch = writeBatch(db);
      refs.forEach((r) => batch.delete(r));
      await batch.commit();
    }
  } catch (e) {
    console.warn("Could not remove linked pallets:", e);
  }

  if (workOrderId) {
    try {
      await deleteDoc(doc(db, "workOrders", workOrderId));
    } catch (e) {
      console.warn("Work order not found or already deleted:", workOrderId);
    }
  }
}

export async function updateInboundShipmentRecord(
  shipmentId: string,
  updates: {
    ediRef: string;
    poNumber: string;
    carrier: string;
    trailerNumber: string;
    containerNumber: string;
    sealNumber: string;
    bolNumber: string;
    origin: string;
    appointmentAt: string;
    lines: Array<{
      lineNo: number;
      sku: string;
      upc: string;
      itemStyle: string;
      description: string;
      lot: string;
      expirationDate: string;
      qtyExpected: number;
      cartonsExpected: number;
      unitsPerPallet: number;
      weightLbsPerUnit: number;
      poNumber?: string;
      uom?: string;
      /** Units already received on this line. */
      receivedQty?: number;
      palletIds?: string[];
      status?: "expected" | "partial" | "received";
      /** Receiving variance (OSD). */
      foundQty?: number;
      damagedQty?: number;
      osdType?: "over" | "short" | "damaged" | "wrong_item";
      osdReason?: string;
      damagePalletId?: string;
    }>;
    status?: "scheduled" | "arrived" | "on_dock" | "putaway" | "received" | "exception";
    receivedAt?: string | null;
    workOrderId?: string;
    vessel?: string;
    voyageNumber?: string;
    port?: string;
    doorAssigned?: string | null;
    warehouseLocation?: string | null;
  }
) {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);
  
  // Get current shipment to check workOrderId
  const shipmentSnap = await getDoc(shipmentRef);
  if (!shipmentSnap.exists()) {
    throw new Error(`Shipment ${shipmentId} not found`);
  }
  const currentShipment = shipmentSnap.data() as InboundShipment;
  
  const { status, receivedAt, workOrderId, ...shipmentUpdates } = updates;
  const woId = workOrderId || currentShipment.workOrderId || shipmentId; // Use inbound ID as work order ID
  
  const batch = writeBatch(db);
  batch.update(shipmentRef, stripUndefinedDeep({
    ...shipmentUpdates,
    ...(status && { status }),
    ...(receivedAt && { receivedAt }),
    ...(workOrderId && { workOrderId }),
    workOrderId: woId, // Ensure workOrderId is set
  }));
  
  // Sync to WorkOrder - create if doesn't exist, update if exists
  const woRef = doc(db, "workOrders", woId);
  const woSnap = await getDoc(woRef);
  
  const totalUnits = Array.isArray(updates.lines) ? updates.lines.reduce((sum, l) => sum + l.qtyExpected, 0) : 0;
  const totalCartons = Array.isArray(updates.lines) ? updates.lines.reduce((sum, l) => sum + (l.cartonsExpected || 0), 0) : 0;
  
  // The work order lines are rebuilt from the container lines, but the
  // RECEIPT state of an existing line must be preserved — otherwise editing a
  // container that has already been received would reset its quantities.
  const existingWoLines: any[] = woSnap.exists()
    ? ((woSnap.data() as any).lines ?? [])
    : [];
  const workOrderLines = Array.isArray(updates.lines)
    ? projectWorkOrderLines(updates.lines as any, existingWoLines)
    : [];
  
  const workOrderData = {
    id: woId,
    woNumber: woId,
    tenantId: currentShipment.tenantId,
    warehouseId: currentShipment.warehouseId,
    clientName: getTenantName(currentShipment.tenantId),
    containerNumber: updates.containerNumber || "—",
    trailerNumber: updates.trailerNumber || "—",
    sealNumber: updates.sealNumber || "",
    bolNumber: updates.bolNumber || "",
    poNumber: updates.poNumber,
    ediRef: updates.ediRef,
    carrier: updates.carrier,
    vessel: updates.vessel || "",
    voyageNumber: updates.voyageNumber || "",
    port: updates.port || "",
    origin: updates.origin || "",
    arrivalDate: updates.appointmentAt,
    departureDate: null,
    yardInDate: null,
    yardLeaveDate: null,
    inboundEntryDate: new Date().toISOString(),
    receivedDate: receivedAt || null,
    // The container's status drives the work order, but a work order that has
    // already reached a terminal state must not be downgraded back to
    // "received" — the container vocabulary cannot express "departed" or
    // "closed".
    status: (() => {
      const existing = woSnap.exists() ? (woSnap.data() as any).status : undefined;
      if (!status) return existing ?? "scheduled";
      const mapped = mapInboundStatusToWoStatus(status);
      if (
        (existing === "departed" || existing === "closed") &&
        mapped === "received"
      ) {
        return existing;
      }
      return mapped;
    })(),
    totalUnits,
    totalCartons,
    lineCount: updates.lines.length,
    lines: workOrderLines,
    createdAt: woSnap.exists() ? woSnap.data().createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: woSnap.exists() ? (woSnap.data().notes || "") : "",
    doorAssigned: updates.doorAssigned ?? currentShipment.doorAssigned ?? null,
    warehouseLocation: updates.warehouseLocation ?? currentShipment.warehouseLocation ?? null,
  };
  
  if (woSnap.exists()) {
    batch.update(woRef, stripUndefinedDeep({
      ...workOrderData,
      createdAt: woSnap.data().createdAt, // Preserve original createdAt
      updatedAt: serverTimestamp(),
    }));
  } else {
    batch.set(woRef, stripUndefinedDeep(workOrderData));
  }
  
  await batch.commit();
}

/**
 * Map an inbound container status to the work order status.
 *
 * Every value is covered — an unmapped status would produce `undefined`,
 * which Firestore rejects on a batch write ("Unsupported field value:
 * undefined"). Unrecognised input falls back to "scheduled" rather than
 * writing an invalid document.
 */
function mapInboundStatusToWoStatus(status: string): WorkOrderStatus {
  const map: Record<string, WorkOrderStatus> = {
    scheduled: "scheduled",
    arrived: "at_dock",
    on_dock: "at_dock",
    putaway: "unloading",
    received: "received",
    exception: "closed",
  };
  return map[status] ?? "scheduled";
}

/**
 * Map a work order status back to the inbound container status.
 *
 * The two vocabularies differ, so an explicit map is required. Anything
 * unknown falls back to the current status rather than writing undefined.
 */
export function mapWoStatusToInboundStatus(
  status: string,
  fallback: InboundShipment["status"] = "scheduled",
): InboundShipment["status"] {
  const map: Record<string, InboundShipment["status"]> = {
    scheduled: "scheduled",
    at_dock: "arrived",
    unloading: "putaway",
    received: "received",
    departed: "received",
    closed: "received",
    // inbound statuses pass through unchanged
    arrived: "arrived",
    on_dock: "on_dock",
    putaway: "putaway",
    exception: "exception",
  };
  return map[status] ?? fallback;
}

/**
 * Persist built pallets to Firestore and link them to an inbound shipment.
 *
 * The shipment reference is written onto each pallet so the Inbound screen
 * and the Pallet screen stay bound to the same records.
 */
export async function createPalletsAndLinkToShipment(
  shipmentId: string,
  pallets: Pallet[],
): Promise<void> {
  const batch = writeBatch(db);
  pallets.forEach((pallet) => {
    batch.set(doc(db, "pallets", pallet.id), {
      ...pallet,
      shipmentId,
      inboundShipmentId: shipmentId,
      updatedAt: new Date().toISOString(),
    });
  });
  await batch.commit();
}

// ============================================================
// Pallets
// ============================================================
export async function fetchPallets(tenantId?: string, warehouseId?: string): Promise<Pallet[]> {
  let q: Query = collection(db, "pallets");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as Pallet);
}

export function subscribePallets(
  callback: (pallets: Pallet[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "pallets");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as Pallet));
  });
}

export async function createPallet(pallet: Pallet) {
  await setDoc(doc(db, "pallets", pallet.id), pallet);
}

export async function createPallets(pallets: Pallet[]) {
  const batch = writeBatch(db);
  pallets.forEach((p) => {
    batch.set(doc(db, "pallets", p.id), p);
  });
  await batch.commit();
}

/**
 * Collapse duplicate batches for the same pallet.
 *
 * Firestore's `set(..., { merge: true })` MERGES arrays element-by-element
 * instead of replacing them, so a re-written batch can end up duplicated.
 * Always dedupe by palletId before writing.
 */
export function dedupeBatches(batches: any[]): any[] {
  const byKey = new Map<string, any>();
  const order: string[] = [];
  for (const b of batches ?? []) {
    const key = b?.palletId ?? b?.batchId;
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      // Keep the newest record but preserve the allocation state.
      byKey.set(key, {
        ...existing,
        ...b,
        qtyAllocated: Math.max(existing.qtyAllocated ?? 0, b.qtyAllocated ?? 0),
      });
    } else {
      byKey.set(key, b);
      order.push(key);
    }
  }
  return order.map((k) => byKey.get(k)!);
}

export async function updatePallet(palletId: string, updates: Partial<Pallet>) {
  const palletRef = doc(db, "pallets", palletId);
  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(palletRef);
    if (!snap.exists()) {
      throw new Error(`Pallet ${palletId} not found`);
    }
    transaction.update(palletRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Put a pallet away into a location.
 *
 * This is the single source of truth for a putaway. It writes, in one
 * transaction:
 *   • the pallet            → status "putaway", location, putawayAt
 *   • the inventory record → creates the SKU record if it is missing and
 *                            creates/updates the batch for THIS pallet with
 *                            the real location and unit count
 *   • the location         → occupiedPallets incremented
 *   • the previous location→ occupiedPallets decremented (when moving)
 *
 * Both the Pallet screen and the RF gun call this, so a putaway always
 * shows up in the inventory.
 */
/**
 * Validate a putaway before any write happens.
 *
 * Kept as a pure function so the rules can be unit tested:
 *  • a pallet that is already in the inventory cannot be put away again
 *    (it must be released from the inventory first)
 *  • a location that has no free pallet positions cannot accept a pallet
 */
export function validatePutaway(args: {
  palletId: string;
  /** The pallet's current location (null when it is not stored) */
  palletLocation: string | null;
  /** Whether an inventory batch already exists for this pallet */
  hasInventoryBatch: boolean;
  /** The destination location */
  location: string;
  /** Destination location occupancy */
  occupiedPallets?: number;
  /** Destination location capacity (0/undefined = unlimited) */
  capacityPallets?: number;
}): { ok: boolean; error?: string } {
  if (args.hasInventoryBatch && args.palletLocation) {
    return {
      ok: false,
      error: `Pallet ${args.palletId} is already in the inventory at ${args.palletLocation}. Release it from the inventory before putting it away again.`,
    };
  }
  const capacity = Number(args.capacityPallets ?? 0);
  const occupied = Number(args.occupiedPallets ?? 0);
  if (capacity > 0 && occupied >= capacity && args.palletLocation !== args.location) {
    return {
      ok: false,
      error: `Location ${args.location} is full (${occupied}/${capacity} pallet positions).`,
    };
  }
  return { ok: true };
}

export async function putAwayPallet(
  palletId: string,
  location: string,
  opts?: { performedBy?: string; notes?: string },
): Promise<{ pallet: Pallet; inventorySku: string }> {
  const palletRef = doc(db, "pallets", palletId);
  const now = new Date().toISOString();

  let updatedPallet: any = null;
  let inventorySku = "";

  await runTransaction(db, async (transaction) => {
    /* ── READS (Firestore requires every read before any write) ── */

    const snap = await transaction.get(palletRef);
    if (!snap.exists()) {
      throw new Error(`Pallet ${palletId} not found`);
    }
    const pallet = snap.data() as any;
    const previousLocation = (pallet.location as string | null) ?? null;

    inventorySku = pallet.sku;
    const invRef = doc(db, "inventoryItems", pallet.sku);
    const invSnap = await transaction.get(invRef);

    // The item master is read so a record that is missing its descriptive
    // fields (sku, upc, description, case pack) can be repaired.
    const masterSnap = await transaction.get(doc(db, "itemMaster", pallet.sku));
    const master: any = masterSnap.exists() ? masterSnap.data() : {};

    // The destination location.
    const locRef = doc(db, "locationMaster", location);
    const locSnap = await transaction.get(locRef);

    // The location the pallet is leaving (when moving).
    let prevRef: any = null;
    let prevSnap: any = null;
    if (previousLocation && previousLocation !== location) {
      prevRef = doc(db, "locationMaster", previousLocation);
      prevSnap = await transaction.get(prevRef);
    }

    /* ── VALIDATION ── */

    const item: any = invSnap.exists()
      ? {
          // Keep the descriptive fields but make sure none of them are missing
          // (an earlier partial write can leave a record without its SKU).
          ...invSnap.data(),
          sku: pallet.sku,
          upc: invSnap.data()?.upc || master.upc || "",
          itemStyle: invSnap.data()?.itemStyle || pallet.itemStyle || master.itemStyle || "",
          description:
            invSnap.data()?.description || pallet.description || master.description || "",
          caseQty: invSnap.data()?.caseQty || master.caseQty || 1,
          uom: invSnap.data()?.uom || master.uom || "EA",
        }
      : {
          sku: pallet.sku,
          upc: master.upc ?? "",
          itemStyle: pallet.itemStyle ?? master.itemStyle ?? "",
          description: pallet.description ?? master.description ?? "",
          category: master.category ?? "General",
          uom: master.uom ?? "EA",
          unitCost: master.unitCost ?? 0,
          unitPrice: master.unitPrice ?? 0,
          caseQty: master.caseQty ?? 1,
          weightLbs: master.weightLbs ?? 0,
          tenantId: pallet.tenantId,
          warehouseId: pallet.warehouseId,
          batches: [],
          status: "active",
        };

    const batches: any[] = Array.isArray(item.batches) ? [...item.batches] : [];
    const batchIdx = batches.findIndex((b) => b.palletId === palletId);

    // A pallet that is already in the inventory cannot be put away again.
    // It must be released from the inventory first.
    const locData = locSnap.exists() ? (locSnap.data() as any) : null;
    const validation = validatePutaway({
      palletId,
      palletLocation: previousLocation,
      hasInventoryBatch: batchIdx >= 0,
      location,
      occupiedPallets: Number(locData?.occupiedPallets ?? 0),
      capacityPallets: Number(locData?.capacityPallets ?? 0),
    });
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    /* ── WRITES ── */

    // 1. The pallet
    const nextPallet = {
      ...pallet,
      status: "putaway",
      location,
      putawayAt: now,
      updatedAt: now,
    };
    transaction.update(palletRef, nextPallet);
    updatedPallet = nextPallet;

    // 2. The inventory record + batch for this pallet
    const batch = {
      batchId:
        batchIdx >= 0 ? batches[batchIdx].batchId : `${pallet.sku}-${palletId}`,
      palletId,
      receivedAt: now,
      qty: Number(pallet.units) || 0,
      location,
      poNumber: pallet.poNumber ?? "",
      ediSource: (pallet.ediSource ?? "MANUAL") as
        | "EDI_943"
        | "EDI_944"
        | "CSV"
        | "MANUAL",
      qtyAllocated: batchIdx >= 0 ? (batches[batchIdx].qtyAllocated ?? 0) : 0,
      ...(batchIdx >= 0 && batches[batchIdx].pickTicketNum !== undefined
        ? { pickTicketNum: batches[batchIdx].pickTicketNum }
        : {}),
    };
    if (batchIdx >= 0) {
      batches[batchIdx] = batch;
    } else {
      batches.push(batch);
    }
    // NOTE: `set(..., { merge: true })` merges arrays element-by-element, which
    // would duplicate the batch on every putaway. `update()` replaces the
    // whole array, so the inventory always holds exactly one batch per pallet.
    if (invSnap.exists()) {
      transaction.update(invRef, {
        batches: dedupeBatches(batches),
        updatedAt: now,
      });
    } else {
      transaction.set(invRef, { ...item, batches: dedupeBatches(batches), updatedAt: now });
    }

    // 3. The destination location gains the pallet
    if (locSnap.exists()) {
      const current = Number(locData?.occupiedPallets ?? 0);
      // Moving within the same location must not double count.
      const next = previousLocation === location ? current : current + 1;
      transaction.update(locRef, { occupiedPallets: next, updatedAt: now });
    }

    // 4. The previous location releases it
    if (prevRef && prevSnap?.exists()) {
      const current = Number(prevSnap.data()?.occupiedPallets ?? 0);
      transaction.update(prevRef, {
        occupiedPallets: Math.max(0, current - 1),
        updatedAt: now,
      });
    }
  });

  // 5. Audit trail — the inventory transaction log is the authoritative
  //    audit trail (the Inventory screen reads it back).
  try {
    await logInventoryTransaction({
      sku: updatedPallet?.sku ?? "",
      palletId,
      location,
      type: "PUTAWAY",
      qtyChange: 0,
      qtyBefore: 0,
      qtyAfter: Number(updatedPallet?.units) || 0,
      user: opts?.performedBy ?? "system",
      notes: opts?.notes ?? `Put away into ${location}`,
    });
  } catch (e) {
    console.warn("Could not write putaway transaction:", e);
  }

  // 6. Movement history (separate append-only physical movement log)
  try {
    await logMovement({
      badgeId: opts?.performedBy ?? "system",
      tenantId: updatedPallet?.tenantId ?? "",
      type: "PUTAWAY",
      referenceId: palletId,
      itemCode: updatedPallet?.sku ?? "",
      fromLocationId: updatedPallet?.suggestedLocation ?? "",
      toLocationId: location,
      originalQty: Number(updatedPallet?.units) || 0,
      movedQty: Number(updatedPallet?.units) || 0,
      uom: "UNITS",
    } as any);
  } catch (e) {
    console.warn("Could not write movement history:", e);
  }

  return { pallet: updatedPallet as Pallet, inventorySku };
}

/**
 * Remove a pallet's inventory batch (used when the pallet is deleted or its
 * units are corrected).
 */
export async function removeInventoryBatchForPallet(
  sku: string,
  palletId: string,
): Promise<void> {
  const invRef = doc(db, "inventoryItems", sku);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return;
  const item = snap.data() as any;
  const batches = (item.batches ?? []).filter((b: any) => b.palletId !== palletId);
  if (batches.length === (item.batches ?? []).length) return;
  await updateDoc(invRef, {
    batches: dedupeBatches(batches),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Update the unit count of a pallet's inventory batch so the inventory
 * always matches the physical pallet.
 */
export async function syncInventoryBatchUnits(
  sku: string,
  palletId: string,
  qty: number,
): Promise<void> {
  const invRef = doc(db, "inventoryItems", sku);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return;
  const item = snap.data() as any;
  const batches: any[] = Array.isArray(item.batches) ? [...item.batches] : [];
  const idx = batches.findIndex((b) => b.palletId === palletId);
  if (idx < 0) return;
  batches[idx] = { ...batches[idx], qty };
  await updateDoc(invRef, {
    batches: dedupeBatches(batches),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Delete a pallet and release its location slot.
 *
 * The location occupancy counter is decremented in the same transaction so
 * the Location Master never drifts out of sync with the pallet records.
 *
 * The linked inbound container is then reconciled (see
 * `syncInboundFromPallets`) so the Inbound screen and the Pallet screen
 * always show the same receipt state.
 */
export async function deletePallet(palletId: string): Promise<void> {
  const palletRef = doc(db, "pallets", palletId);
  let shipmentId: string | null = null;
  let palletSku: string | null = null;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(palletRef);
    if (!snap.exists()) return;

    const pallet = snap.data() as any;
    transaction.delete(palletRef);
    shipmentId = pallet?.shipmentId ?? pallet?.inboundShipmentId ?? null;
    palletSku = pallet?.sku ?? null;

    const locationId = pallet?.location;
    if (locationId) {
      const locRef = doc(db, "locationMaster", locationId);
      const locSnap = await transaction.get(locRef);
      if (locSnap.exists()) {
        const current = Number(locSnap.data()?.occupiedPallets ?? 0);
        transaction.update(locRef, {
          occupiedPallets: Math.max(0, current - 1),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  });

  if (shipmentId) {
    await syncInboundFromPallets(shipmentId);
  }

  // Remove the pallet's inventory batch so the on-hand quantity matches the
  // physical stock.
  if (palletSku) {
    try {
      await removeInventoryBatchForPallet(palletSku, palletId);
    } catch (e) {
      console.warn("Could not remove inventory batch for pallet:", e);
    }
  }
}

/**
 * Recompute an inbound container's line receipts from the pallets that
 * actually exist, then write the shipment back.
 *
 * The pallets are the source of truth for what was received. This keeps the
 * Inbound screen and the Pallet screen in agreement after a pallet is
 * deleted (or created) so neither can drift from the other.
 */
export async function syncInboundFromPallets(shipmentId: string): Promise<void> {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);
  const shipSnap = await getDoc(shipmentRef);
  if (!shipSnap.exists()) return;

  const ship = shipSnap.data() as any;
  const lines: any[] = Array.isArray(ship.lines) ? [...ship.lines] : [];

  // Pallets can carry either link field depending on how they were created.
  const [byShipment, byInbound] = await Promise.all([
    getDocs(query(collection(db, "pallets"), where("shipmentId", "==", shipmentId))),
    getDocs(query(collection(db, "pallets"), where("inboundShipmentId", "==", shipmentId))),
  ]);
  const palletMap = new Map<string, any>();
  [...byShipment.docs, ...byInbound.docs].forEach((d) => {
    const p = d.data() as any;
    palletMap.set(d.id, p);
  });
  const pallets = [...palletMap.values()];

  let changed = false;
  lines.forEach((line, idx) => {
    const linked = pallets.filter((p) => p.sku === line.sku);
    const units = linked.reduce((sum, p) => sum + (Number(p.units) || 0), 0);
    // The received quantity is the ACTUAL number of units in the linked
    // pallets — it is deliberately NOT capped at the expected quantity.
    // Capping would hide over-receipts and would make a deleted pallet
    // invisible (the value would simply stay pinned at the cap).
    const received = units;
    const qtyExpected = Number(line.qtyExpected) || 0;
    const status: "expected" | "partial" | "received" =
      qtyExpected > 0 && received >= qtyExpected
        ? "received"
        : received > 0
          ? "partial"
          : "expected";
    const palletIds = linked.map((p) => p.id);

    if (
      line.receivedQty !== received ||
      line.status !== status ||
      JSON.stringify(line.palletIds ?? []) !== JSON.stringify(palletIds)
    ) {
      lines[idx] = { ...line, receivedQty: received, status, palletIds };
      changed = true;
    }
  });

  if (!changed) return;

  const allReceived = lines.length > 0 && lines.every((l) => l.status === "received");
  await updateDoc(shipmentRef, {
    lines,
    status: allReceived ? "received" : "on_dock",
    updatedAt: new Date().toISOString(),
  });
}

// ============================================================
// Outbound Pallets
// ============================================================
export async function fetchOutboundPallets(
  tenantId?: string,
  warehouseId?: string,
): Promise<OutboundPallet[]> {
  let q: Query = collection(db, "outboundPallets");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as OutboundPallet);
}

export function subscribeOutboundPallets(
  callback: (pallets: OutboundPallet[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "outboundPallets");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as OutboundPallet),
    );
  });
}

export async function fetchOutboundPalletsByOrder(orderId: string): Promise<OutboundPallet[]> {
  const q = query(collection(db, "outboundPallets"), where("orderId", "==", orderId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as OutboundPallet);
}

export async function createOutboundPallet(pallet: OutboundPallet) {
  await setDoc(doc(db, "outboundPallets", pallet.id), pallet);
}

export async function createOutboundPallets(pallets: OutboundPallet[]) {
  const batch = writeBatch(db);
  pallets.forEach((p) => {
    batch.set(doc(db, "outboundPallets", p.id), p);
  });
  await batch.commit();
}

export async function updateOutboundPallet(palletId: string, updates: Partial<OutboundPallet>) {
  await updateDoc(doc(db, "outboundPallets", palletId), updates);
}

export async function getNextOutboundPalletSeq(): Promise<string> {
  const counterRef = doc(db, "counters", "outboundPallets");
  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const currentSeq = snap.exists() ? (snap.data().seq as number) : 1;
    const nextSeq = currentSeq + 1;
    transaction.update(counterRef, { seq: nextSeq });
    return `OBP-${nextSeq.toString().padStart(8, "0")}`;
  });
}

export async function clearDropBatchesForOrder(orderId: string): Promise<void> {
  const ptSnap = await getDocs(
    query(collection(db, "pickTickets"), where("orderId", "==", orderId)),
  );
  const pts = ptSnap.docs.map(
    (d) => ({ ...(d.data() ?? {}), id: d.id, pickTicketNum: d.id }) as unknown as PickTicket,
  );

  for (const pt of pts) {
    const invRef = doc(db, "inventoryItems", pt.sku);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) continue;

    const item = invSnap.data() as InventoryItem;
    const ptPickNum = pt.pickTicketNum;
    const ptPallet = pt.palletId;
    const newBatches =
      item.batches?.filter(
        (b) =>
          !(
            b.palletId === ptPallet &&
            b.location === DROP001_LOCATION &&
            (b.pickTicketNum == ptPickNum || String(b.pickTicketNum ?? "") === String(ptPickNum))
          ),
      ) || [];
    await updateDoc(invRef, { batches: newBatches });
  }
}

export async function createShipmentRecord(shipment: {
  id: string;
  bolId: string;
  orderIds: string[];
  tenantId: string;
  warehouseId: string;
  carrier: string;
  scac: string;
  serviceLevel: string;
  mode: string;
  status: string;
  dockDoor: string;
  appointmentAt: string;
  trailerNumber: string;
  sealNumber: string;
  proNumber: string;
  shipTo: string;
  pallets: number;
  cartons: number;
  weightLbs: number;
  declaredValue: number;
}) {
  await setDoc(doc(db, "shipments", shipment.id), shipment);
}

export async function updateShipmentRecord(shipmentId: string, updates: any) {
  await updateDoc(doc(db, "shipments", shipmentId), updates);
}

export function subscribeShipmentRecords(
  callback: (shipments: any[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "shipments");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })));
  });
}

// ============================================================
// Orders
// ============================================================
export async function fetchOrders(tenantId?: string, warehouseId?: string): Promise<Order[]> {
  let q: Query = collection(db, "orders");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as Order);
}

export function subscribeOrders(
  callback: (orders: Order[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "orders");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as Order));
  });
}

export async function updateOrder(orderId: string, updates: Partial<Order>) {
  await setDoc(doc(db, "orders", orderId), updates, { merge: true });
}

export async function syncOrderStatusFromPickTickets(orderId: string): Promise<void> {
  const ptSnap = await getDocs(
    query(collection(db, "pickTickets"), where("orderId", "==", orderId)),
  );
  const pts = ptSnap.docs.map(
    (d) => ({ ...(d.data() ?? {}), id: d.id, pickTicketNum: d.id }) as unknown as PickTicket,
  );
  if (pts.length === 0) return;

  const allPicked = pts.every((pt) => pt.status === "PICKED" || pt.status === "CLOSED");
  const anyPicked = pts.some((pt) => pt.status === "PICKED" || pt.status === "CLOSED");
  const allClosed = pts.every((pt) => pt.status === "CLOSED");

  if (allClosed) {
    await updateOrder(orderId, { status: "shipped" });
  } else if (allPicked) {
    await updateOrder(orderId, { status: "PICKED" });
  } else if (anyPicked) {
    await updateOrder(orderId, { status: "picking" });
  } else {
    await updateOrder(orderId, { status: "ALLOCATED" });
  }
}

export async function createOrder(order: Order) {
  await setDoc(doc(db, "orders", order.id), order);
}

export async function deleteOrder(orderId: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "orders", orderId));
  return { ok: true };
}

/**
 * Write an inventory record.
 *
 * IMPORTANT: `set(ref, data, { merge: true })` MERGES arrays element-by-element
 * instead of replacing them, so re-saving a record duplicated its batches.
 * `update()` replaces the whole array, and the batches are deduped by
 * palletId first, so there is always exactly one batch per pallet.
 */
export async function upsertInventoryItem(item: InventoryItem) {
  const ref = doc(db, "inventoryItems", item.sku);
  const payload = {
    ...item,
    batches: dedupeBatches(item.batches ?? []),
    updatedAt: new Date().toISOString(),
  };
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, payload);
  } else {
    await setDoc(ref, payload);
  }
}

/**
 * Release a pallet from the inventory.
 *
 * Used when a putaway was recorded in error: the inventory batch is removed
 * and the pallet returns to the "staged" state so it can be put away again
 * (from the Pallet screen or the RF gun).
 *
 * Refuses to release a pallet whose stock is already allocated.
 */
export async function releaseInventoryPallet(
  sku: string,
  palletId: string,
  opts?: { performedBy?: string; reason?: string },
): Promise<{ ok: boolean; message: string }> {
  const invRef = doc(db, "inventoryItems", sku);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) {
    return { ok: false, message: "Inventory record not found." };
  }
  const item = invSnap.data() as any;
  const batches: any[] = Array.isArray(item.batches) ? [...item.batches] : [];
  const idx = batches.findIndex((b) => b.palletId === palletId);
  if (idx < 0) {
    return { ok: false, message: `No inventory batch for pallet ${palletId}.` };
  }
  const batch = batches[idx];
  if ((batch.qtyAllocated ?? 0) > 0) {
    return {
      ok: false,
      message: `Pallet ${palletId} has ${batch.qtyAllocated} unit(s) allocated. Release the allocation first.`,
    };
  }

  const location = batch.location;
  batches.splice(idx, 1);
  if (batches.length === 0) {
    await deleteDoc(invRef);
  } else {
    await updateDoc(invRef, {
      batches: dedupeBatches(batches),
      updatedAt: new Date().toISOString(),
    });
  }

  // Return the pallet to "staged" so it can be put away again.
  const palletRef = doc(db, "pallets", palletId);
  const palletSnap = await getDoc(palletRef);
  if (palletSnap.exists()) {
    const pallet = palletSnap.data() as any;
    await updateDoc(palletRef, {
      status: "staged",
      location: null,
      putawayAt: null,
      updatedAt: new Date().toISOString(),
    });
    if (location) {
      const locRef = doc(db, "locationMaster", location);
      const locSnap = await getDoc(locRef);
      if (locSnap.exists()) {
        const current = Number(locSnap.data()?.occupiedPallets ?? 0);
        await updateDoc(locRef, {
          occupiedPallets: Math.max(0, current - 1),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Audit trail
  try {
    await logInventoryTransaction({
      sku,
      palletId,
      location,
      type: "DELETE",
      qtyChange: -Math.abs(Number(batch.qty) || 0),
      qtyBefore: Number(batch.qty) || 0,
      qtyAfter: 0,
      user: opts?.performedBy ?? "admin",
      notes: opts?.reason ?? "Released from inventory — pallet returned to staged",
    });
  } catch (e) {
    console.warn("Could not write inventory transaction:", e);
  }

  return {
    ok: true,
    message: `Pallet ${palletId} released — removed from inventory and returned to staged for putaway.`,
  };
}

/**
 * Update a single batch of an inventory record.
 *
 * The batches array is read, the batch is merged in memory and the whole
 * array is written back — a dotted path such as `batches.B-123` would be
 * treated as a MAP key by Firestore and destroy the array.
 */
export async function updateInventoryBatch(sku: string, batchId: string, updates: any) {
  const ref = doc(db, "inventoryItems", sku);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const item = snap.data() as any;
  const batches: any[] = Array.isArray(item.batches) ? [...item.batches] : [];
  const idx = batches.findIndex(
    (b) => b.batchId === batchId || b.palletId === batchId,
  );
  if (idx < 0) return;
  batches[idx] = { ...batches[idx], ...updates };
  await updateDoc(ref, {
    batches: dedupeBatches(batches),
    updatedAt: new Date().toISOString(),
  });
}

export async function writePickTicket(ticket: PickTicket) {
  await setDoc(doc(db, "pickTickets", ticket.pickTicketNum.toString()), ticket);
}

export async function batchWritePickTickets(tickets: PickTicket[]) {
  const batch = writeBatch(db);
  for (const t of tickets) {
    batch.set(doc(db, "pickTickets", t.pickTicketNum.toString()), t);
  }
  await batch.commit();
}

// ============================================================
// EDI Logs
// ============================================================
export async function fetchEdiLogs(tenantId?: string, warehouseId?: string): Promise<EdiLog[]> {
  let q: Query = collection(db, "ediLogs");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("receivedAt", "desc"));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as EdiLog);
}

// ============================================================
// Locations (Master Data)
// ============================================================
/**
 * Read the Location Master.
 *
 * These read from the `locationMaster` collection — the single source of
 * truth used by the Masters screen, the Putaway Engine and the RF gun.
 * (A legacy `locations` collection used to exist as a stale duplicate; it
 * has been consolidated into `locationMaster`.)
 */
export async function fetchLocations(): Promise<LocationRecord[]> {
  const snap = await getDocs(collection(db, "locationMaster"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as LocationRecord);
}

export function subscribeLocations(callback: (locations: LocationRecord[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "locationMaster"), (snap: QuerySnapshot) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as LocationRecord),
    );
  });
}

// ============================================================
// Inventory Items
// ============================================================
export async function fetchInventoryItems(
  tenantId?: string,
  warehouseId?: string,
): Promise<InventoryItem[]> {
  let q: Query = collection(db, "inventoryItems");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as InventoryItem);
}

export function subscribeInventoryItems(
  callback: (items: InventoryItem[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "inventoryItems");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);

  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as InventoryItem));
  });
}

// ============================================================
// Client Allocation Configs
// ============================================================
export async function fetchClientAllocationConfigs(): Promise<ClientAllocationConfig[]> {
  const snap = await getDocs(collection(db, "clientAllocationConfigs"));
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as ClientAllocationConfig,
  );
}

export function subscribeClientAllocationConfigs(
  callback: (configs: ClientAllocationConfig[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "clientAllocationConfigs"), (snap: QuerySnapshot) => {
    callback(
      snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as ClientAllocationConfig,
      ),
    );
  });
}

export async function setClientAllocationConfig(config: ClientAllocationConfig) {
  await setDoc(doc(db, "clientAllocationConfigs", config.tenantId), config);
}

export async function deleteClientAllocationConfig(tenantId: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "clientAllocationConfigs", tenantId));
  return { ok: true };
}

// ============================================================
// Pick Tickets
// ============================================================
export async function fetchPickTickets(orderId?: string): Promise<PickTicket[]> {
  let q: Query = collection(db, "pickTickets");
  if (orderId) {
    q = query(collection(db, "pickTickets"), where("orderId", "==", orderId));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as PickTicket);
}

export function subscribePickTickets(
  callback: (tickets: PickTicket[]) => void,
  orderId?: string,
): Unsubscribe {
  let q: Query = collection(db, "pickTickets");
  if (orderId) {
    q = query(collection(db, "pickTickets"), where("orderId", "==", orderId));
  }
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as PickTicket));
  });
}

export async function insertPickTicket(ticket: PickTicket) {
  await setDoc(doc(db, "pickTickets", ticket.pickTicketNum.toString()), ticket);
}

export async function updatePickTicket(pickTicketNum: number, updates: Partial<PickTicket>) {
  await updateDoc(doc(db, "pickTickets", pickTicketNum.toString()), updates);
}

export async function deletePickTicket(pickTicketNum: number): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "pickTickets", pickTicketNum.toString()));
  return { ok: true };
}

export async function deletePickTicketsByOrder(orderId: string): Promise<{ ok: true }> {
  const snap = await getDocs(query(collection(db, "pickTickets"), where("orderId", "==", orderId)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { ok: true };
}

// ============================================================
// Transaction History
// ============================================================
export type InventoryTransaction = {
  id: string;
  sku: string;
  palletId: string;
  location: string;
  orderId?: string;
  pickTicketNum?: number;
  type:
    | "RECEIVE"
    | "ALLOCATE"
    | "PICK"
    | "REALLOCATE"
    | "SHIP"
    | "ADJUST"
    | "PUTAWAY"
    | "MOVE"
    | "DELETE";
  qtyChange: number;
  qtyBefore: number;
  qtyAfter: number;
  cartons?: number;
  user: string;
  timestamp: string;
  notes?: string;
};

export async function logInventoryTransaction(
  txn: Omit<InventoryTransaction, "id" | "timestamp">,
): Promise<InventoryTransaction> {
  const id = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    ...txn,
    id,
    timestamp: new Date().toISOString(),
  };
  await setDoc(doc(db, "inventoryTransactions", id), {
    ...record,
    timestamp: serverTimestamp(),
  });
  return record;
}

export async function fetchTransactionHistory(
  sku?: string,
  palletId?: string,
  location?: string,
): Promise<InventoryTransaction[]> {
  const snap = await getDocs(collection(db, "inventoryTransactions"));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as InventoryTransaction)
    .filter(
      (t) =>
        (!sku || t.sku === sku) &&
        (!palletId || t.palletId === palletId) &&
        (!location || t.location === location),
    );
}

export function subscribeTransactionHistory(
  callback: (txns: InventoryTransaction[]) => void,
  sku?: string,
  palletId?: string,
  location?: string,
): Unsubscribe {
  return onSnapshot(collection(db, "inventoryTransactions"), (snap: QuerySnapshot) => {
    const all = snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as InventoryTransaction,
    );
    const filtered = all.filter(
      (t) =>
        (!sku || t.sku === sku) &&
        (!palletId || t.palletId === palletId) &&
        (!location || t.location === location),
    );
    callback(filtered);
  });
}

export { db } from "./firestore";
export { collection, doc, setDoc, updateDoc, getDocs } from "firebase/firestore";

// ============================================================
// Directed Pick with Transaction Management
// ============================================================
export async function executeDirectedPick(
  pickTicketNum: number,
  qtyPicked: number,
  palletId: string,
  location: string,
  user: string = "picker",
): Promise<{ success: boolean; message?: string }> {
  if (qtyPicked <= 0) {
    throw new Error("Pick quantity must be greater than 0");
  }

  return await runTransaction(db, async (transaction) => {
    const ptRef = doc(db, "pickTickets", pickTicketNum.toString());
    const ptSnap = await transaction.get(ptRef);
    if (!ptSnap.exists()) {
      throw new Error(`Pick ticket ${pickTicketNum} not found`);
    }
    const pt = ptSnap.data() as PickTicket;

    const invRef = doc(db, "inventoryItems", pt.sku);
    const invSnap = await transaction.get(invRef);
    if (!invSnap.exists()) {
      throw new Error(`SKU ${pt.sku} not found in inventory`);
    }

    const item = invSnap.data() as InventoryItem;
    const batchIndex = item.batches?.findIndex(
      (b) => b.palletId === pt.palletId && b.location === pt.fromLocation,
    );
    if (batchIndex === undefined || batchIndex < 0) {
      throw new Error(`Batch not found at ${pt.fromLocation} for pallet ${pt.palletId}`);
    }

    const batch = item.batches![batchIndex];
    const qtyBefore = batch.qty;
    const qtyAfter = qtyBefore - qtyPicked;

    if (qtyAfter < 0) {
      throw new Error(`Insufficient quantity. Available: ${qtyBefore}, Requested: ${qtyPicked}`);
    }

    // Create updated batches array with modified source batch and new DROP001 batch
    const updatedBatches = [...(item.batches || [])];
    updatedBatches[batchIndex] = {
      ...batch,
      qty: qtyAfter,
      qtyAllocated: Math.max(0, batch.qtyAllocated - qtyPicked),
    };

    // Create DROP001 batch entry in inventory
    const dropBatch = {
      batchId: `DROP-${Date.now()}-${pt.pickTicketNum}`,
      palletId: pt.palletId,
      location: DROP001_LOCATION,
      qty: qtyPicked,
      qtyAllocated: 0,
      receivedAt: new Date().toISOString(),
      pickTicketNum: pt.pickTicketNum,
      poNumber: "",
      ediSource: "MANUAL" as const,
    };
    updatedBatches.push(dropBatch);

    transaction.update(invRef, {
      batches: updatedBatches,
    });

    transaction.update(ptRef, {
      status: "PICKED",
      pickedAt: new Date().toISOString(),
      qtyPicked: qtyPicked,
    });

    // Log outbound transaction (original location)
    const outTxnId = `TX-${Date.now()}-PICK`;
    transaction.set(doc(db, "inventoryTransactions", outTxnId), {
      sku: pt.sku,
      palletId: pt.palletId,
      location: pt.fromLocation,
      orderId: pt.orderId,
      pickTicketNum: pt.pickTicketNum,
      type: "PICK",
      qtyChange: -qtyPicked,
      qtyBefore,
      qtyAfter,
      user,
      notes: `Pulled ${qtyPicked} units for PT-${pickTicketNum}`,
      timestamp: serverTimestamp(),
    });

    // Log inbound transaction (DROP001 receipt)
    const inTxnId = `TX-${Date.now()}-DROP`;
    transaction.set(doc(db, "inventoryTransactions", inTxnId), {
      sku: pt.sku,
      palletId: pt.palletId,
      location: DROP001_LOCATION,
      orderId: pt.orderId,
      pickTicketNum: pt.pickTicketNum,
      type: "RECEIVE",
      qtyChange: qtyPicked,
      qtyBefore: 0,
      qtyAfter: qtyPicked,
      user,
      notes: `PT-${pickTicketNum} staged at DROP001`,
      timestamp: serverTimestamp(),
    });

    return { success: true };
  });
}

export async function executeManualPick(params: {
  orderId: string;
  sku: string;
  palletId: string;
  location: string;
  qtyPicked: number;
  user?: string;
}): Promise<{ success: boolean; pickTicketNum: number; message?: string }> {
  const { orderId, sku, palletId, location, qtyPicked, user = "picker" } = params;
  if (qtyPicked <= 0) {
    throw new Error("Pick quantity must be greater than 0");
  }

  return await runTransaction(db, async (transaction) => {
    const invRef = doc(db, "inventoryItems", sku);
    const invSnap = await transaction.get(invRef);
    if (!invSnap.exists()) {
      throw new Error(`SKU ${sku} not found in inventory`);
    }

    const item = invSnap.data() as InventoryItem;
    const batchIndex = item.batches?.findIndex(
      (b) => b.palletId === palletId && b.location === location,
    );
    if (batchIndex === undefined || batchIndex < 0) {
      throw new Error(`Batch not found at ${location} for pallet ${palletId}`);
    }

    const batch = item.batches![batchIndex];
    const qtyBefore = batch.qty;
    const qtyAfter = qtyBefore - qtyPicked;

    if (qtyAfter < 0) {
      throw new Error(`Insufficient quantity. Available: ${qtyBefore}, Requested: ${qtyPicked}`);
    }

    const updatedBatches = [...(item.batches || [])];
    updatedBatches[batchIndex] = {
      ...batch,
      qty: qtyAfter,
      qtyAllocated: Math.max(0, batch.qtyAllocated - qtyPicked),
    };

    const pickTicketNum = await getNextPickTicketSeq();
    const dropBatch = {
      batchId: `DROP-${Date.now()}-${pickTicketNum}`,
      palletId,
      location: DROP001_LOCATION,
      qty: qtyPicked,
      qtyAllocated: 0,
      receivedAt: new Date().toISOString(),
      pickTicketNum,
      poNumber: "",
      ediSource: "MANUAL" as const,
    };
    updatedBatches.push(dropBatch);

    transaction.update(invRef, {
      batches: updatedBatches,
    });

    const ptRef = doc(db, "pickTickets", pickTicketNum.toString());
    transaction.set(ptRef, {
      pickTicketNum,
      orderId,
      sku,
      palletId,
      fromLocation: location,
      quantityToPick: qtyPicked,
      status: "PICKED",
      createdAt: new Date().toISOString(),
      pickedAt: new Date().toISOString(),
      qtyPicked,
    });

    const outTxnId = `TX-${Date.now()}-PICK`;
    transaction.set(doc(db, "inventoryTransactions", outTxnId), {
      sku,
      palletId,
      location,
      orderId,
      pickTicketNum,
      type: "PICK",
      qtyChange: -qtyPicked,
      qtyBefore,
      qtyAfter,
      user,
      notes: `Manual pick ${qtyPicked} units for PT-${pickTicketNum}`,
      timestamp: serverTimestamp(),
    });

    const inTxnId = `TX-${Date.now()}-DROP`;
    transaction.set(doc(db, "inventoryTransactions", inTxnId), {
      sku,
      palletId,
      location: DROP001_LOCATION,
      orderId,
      pickTicketNum,
      type: "RECEIVE",
      qtyChange: qtyPicked,
      qtyBefore: 0,
      qtyAfter: qtyPicked,
      user,
      notes: `PT-${pickTicketNum} staged at DROP001`,
      timestamp: serverTimestamp(),
    });

    return { success: true, pickTicketNum };
  });
}

// ============================================================
// Real-time Reallocate Pick
// ============================================================
export async function reallocatePickTicket(
  pickTicketNum: number,
  user: string = "system",
): Promise<{ palletId: string; location: string; qty: number } | null> {
  return await runTransaction(db, async (transaction) => {
    const ptRef = doc(db, "pickTickets", pickTicketNum.toString());
    const ptSnap = await transaction.get(ptRef);
    if (!ptSnap.exists()) {
      throw new Error(`Pick ticket ${pickTicketNum} not found`);
    }
    const pt = ptSnap.data() as PickTicket;

    const invRef = doc(db, "inventoryItems", pt.sku);
    const invSnap = await transaction.get(invRef);
    if (!invSnap.exists()) {
      throw new Error(`SKU ${pt.sku} not found in inventory`);
    }

    const item = invSnap.data() as InventoryItem;
    const nonAllocatable = DROP001_LOCATION;
    const availableBatch = item.batches
      ?.filter((b) => b.location !== nonAllocatable && b.qty - (b.qtyAllocated || 0) > 0)
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];

    if (!availableBatch) {
      return null;
    }

    // Update pick ticket with new location/pallet
    transaction.update(ptRef, {
      palletId: availableBatch.palletId,
      fromLocation: availableBatch.location,
      reallocatedAt: new Date().toISOString(),
      reallocated: true,
    });

    // Log reallocation transaction
    const txnId = `TX-${Date.now()}-REAL`;
    transaction.set(doc(db, "inventoryTransactions", txnId), {
      sku: pt.sku,
      palletId: availableBatch.palletId,
      location: availableBatch.location,
      orderId: pt.orderId,
      pickTicketNum: pt.pickTicketNum,
      type: "REALLOCATE",
      qtyChange: 0,
      qtyBefore: pt.quantityToPick,
      qtyAfter: pt.quantityToPick,
      user,
      notes: `Reallocated from ${pt.palletId}/${pt.fromLocation} to ${availableBatch.palletId}/${availableBatch.location}`,
      timestamp: serverTimestamp(),
    });

    return {
      palletId: availableBatch.palletId,
      location: availableBatch.location,
      qty: pt.quantityToPick,
    };
  });
}

// ============================================================
// Sequence Number Management (transactional)
// ============================================================
export async function getNextOrderSeq(): Promise<string> {
  const counterRef = doc(db, "counters", "orders");
  const counterSnap = await getDocs(query(collection(db, "counters")));
  if ((counterSnap.docs as any).find((d: any) => d.id === "orders") === undefined) {
    await setDoc(counterRef, { seq: 1 }, { merge: true });
  }
  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    if (!snap.exists()) {
      transaction.set(counterRef, { seq: 1 });
      return "SO#-00000001";
    }
    const currentSeq = snap.data().seq as number;
    const nextSeq = currentSeq + 1;
    transaction.update(counterRef, { seq: nextSeq });
    return `SO#-0${nextSeq.toString().padStart(8, "0")}`;
  });
}

export async function getNextPickTicketSeq(): Promise<number> {
  const counterRef = doc(db, "counters", "pickTickets");
  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const currentSeq = snap.exists() ? (snap.data().seq as number) : 1000;
    const nextSeq = currentSeq + 1;
    transaction.update(counterRef, { seq: nextSeq });
    return nextSeq;
  });
}

export async function getNextBolNumber(): Promise<string> {
  const counterRef = doc(db, "counters", "bol");
  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const currentSeq = snap.exists() ? (snap.data().seq as number) : 1;
    const nextSeq = currentSeq + 1;
    transaction.update(counterRef, { seq: nextSeq });
    return `MBOL-${nextSeq.toString().padStart(12, "0")}`;
  });
}

export async function getNextInboundSeq(): Promise<string> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}`;
  const counterRef = doc(db, "counters", `inbound_${dateStr}`);
  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    if (!snap.exists()) {
      transaction.set(counterRef, { seq: 1, date: dateStr });
      return `INB-${dateStr}-0001`;
    }
    const currentSeq = snap.data().seq as number;
    const nextSeq = currentSeq + 1;
    transaction.update(counterRef, { seq: nextSeq });
    return `INB-${dateStr}-${nextSeq.toString().padStart(4, "0")}`;
  });
}

// ============================================================
// Ship Order - Create BOL and Process Shipment
// ============================================================
export type ShipResult = {
  success: boolean;
  bolNumber: string;
  shippedLines: Array<{
    sku: string;
    palletId: string;
    location: string;
    qtyShipped: number;
  }>;
  error?: string;
};

export async function shipOrder(orderId: string): Promise<ShipResult> {
  try {
    // Get order first
    const ordersSnap = await getDocs(collection(db, "orders"));
    const order = ordersSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as Order)
      .find((o) => o.id === orderId);
    if (!order) {
      return {
        success: false,
        bolNumber: "",
        shippedLines: [],
        error: `Order ${orderId} not found`,
      };
    }

    // Check pick tickets
    const ptSnap = await getDocs(
      query(collection(db, "pickTickets"), where("orderId", "==", orderId)),
    );
    const pts = ptSnap.docs.map(
      (d) => ({ ...(d.data() ?? {}), id: d.id, pickTicketNum: d.id }) as unknown as PickTicket,
    );
    const unpicked = pts.filter((pt) => pt.status !== "PICKED");
    if (unpicked.length > 0) {
      return {
        success: false,
        bolNumber: "",
        shippedLines: [],
        error: `Order has ${unpicked.length} unpicked pick tickets`,
      };
    }

    // Get the orderRef for transaction use
    const orderRef = doc(db, "orders", orderId);

    return await runTransaction(db, async (transaction) => {
      // Get inventory for shipped items
      const shippedLines: ShipResult["shippedLines"] = [];
      for (const pt of pts) {
        const invRef = doc(db, "inventoryItems", pt.sku);
        const invSnap = await transaction.get(invRef);
        if (invSnap.exists()) {
          const item = invSnap.data() as InventoryItem;
          const dropBatch = item.batches?.find(
            (b) =>
              b.palletId === pt.palletId &&
              b.location === DROP001_LOCATION &&
              b.pickTicketNum === pt.pickTicketNum,
          );
          if (dropBatch) {
            shippedLines.push({
              sku: pt.sku,
              palletId: pt.palletId,
              location: DROP001_LOCATION,
              qtyShipped: dropBatch.qty,
            });
          }
        }
      }

      // Generate BOL number
      const bolNumber = await getNextBolNumber();

      // Create BOL document
      const bolRef = doc(db, "billsOfLading", bolNumber);
      transaction.set(bolRef, {
        bolNumber,
        orderId,
        status: "issued",
        createdAt: serverTimestamp(),
        shippedLines,
        carrier: order.carrier,
        tenantId: order.tenantId,
        warehouseId: order.warehouseId,
      });

      // Update order status
      transaction.update(orderRef, { status: "shipped" });

      // Update pick tickets to CLOSED
      pts.forEach((pt) => {
        transaction.update(doc(db, "pickTickets", pt.pickTicketNum.toString()), {
          status: "CLOSED",
          closedAt: serverTimestamp(),
        });
      });

      // Remove DROP001 batches from inventory
      for (const pt of pts) {
        const invRef = doc(db, "inventoryItems", pt.sku);
        const invSnap = await transaction.get(invRef);
        if (invSnap.exists()) {
          const item = invSnap.data() as InventoryItem;
          const newBatches =
            item.batches?.filter(
              (b) =>
                !(
                  b.palletId === pt.palletId &&
                  b.location === DROP001_LOCATION &&
                  b.pickTicketNum === pt.pickTicketNum
                ),
            ) || [];
          transaction.update(invRef, { batches: newBatches });
        }
      }

      // Log ship transactions (one per shipped line for accurate history)
      for (const line of shippedLines) {
        const shipTxnId = `TX-SHIP-${Date.now()}-${line.palletId}`;
        transaction.set(doc(db, "inventoryTransactions", shipTxnId), {
          sku: line.sku,
          palletId: line.palletId,
          location: line.location,
          orderId,
          pickTicketNum: pts.find((pt) => pt.sku === line.sku && pt.palletId === line.palletId)
            ?.pickTicketNum,
          type: "SHIP",
          qtyChange: -line.qtyShipped,
          qtyBefore: line.qtyShipped,
          qtyAfter: 0,
          user: "system",
          notes: `Shipped ${line.qtyShipped} units via BOL ${bolNumber}`,
          timestamp: serverTimestamp(),
        });
      }

      return { success: true, bolNumber, shippedLines };
    });
  } catch (e: any) {
    return { success: false, bolNumber: "", shippedLines: [], error: e.message };
  }
}

// ============================================================
// Bills of Lading
// ============================================================
export async function fetchBillsOfLading(
  tenantId?: string,
  warehouseId?: string,
): Promise<BillOfLading[]> {
  let q: Query = collection(db, "billsOfLading");
  if (tenantId && tenantId !== "all") {
    q = query(q, where("tenantId", "==", tenantId));
  }
  if (warehouseId && warehouseId !== "all") {
    q = query(q, where("warehouseId", "==", warehouseId));
  }
  q = query(q, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as BillOfLading);
}

export function subscribeBillsOfLading(
  callback: (bols: BillOfLading[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "billsOfLading");
  if (tenantId && tenantId !== "all") {
    q = query(q, where("tenantId", "==", tenantId));
  }
  if (warehouseId && warehouseId !== "all") {
    q = query(q, where("warehouseId", "==", warehouseId));
  }
  q = query(q, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as BillOfLading));
  });
}

export async function createBol(bol: BillOfLading): Promise<void> {
  const bolRef = doc(db, "billsOfLading", bol.bolNumber);
  await setDoc(bolRef, bol);
}

// ============================================================
// Transactional Allocation (for multi-line orders)
// ============================================================
export async function allocateOrderTransactional(
  orderId: string,
  allocatedLines: Array<{ sku: string; palletId: string; location: string; qtyAllocated: number }>,
  pickTicketNum: number,
): Promise<{ success: boolean; error?: string }> {
  const orderRef = doc(db, "orders", orderId);
  const updates: Promise<any>[] = [];

  try {
    await runTransaction(db, async (transaction) => {
      // Check if order exists, create if not (for testing)
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        // Allow creation for testing purposes
        transaction.set(orderRef, { status: "ALLOCATED" }, { merge: true });
      } else {
        transaction.update(orderRef, { status: "ALLOCATED" });
      }

      // Update each affected inventory item
      for (const line of allocatedLines) {
        const invRef = doc(db, "inventoryItems", line.sku);
        const invSnap = await transaction.get(invRef);
        if (invSnap.exists()) {
          const item = invSnap.data() as InventoryItem;
          const batch = item.batches?.find(
            (b) => b.palletId === line.palletId && b.location === line.location,
          );
          if (batch) {
            const batchIndex = item.batches!.indexOf(batch);
            const currentAllocated = batch.qtyAllocated || 0;
            const newAllocated = currentAllocated + line.qtyAllocated;
            transaction.update(invRef, {
              [`batches.${batchIndex}.qtyAllocated`]: newAllocated,
            });
          }
        }
      }
    });

    // Write pick tickets
    await batchWritePickTickets(
      allocatedLines.map((line) => ({
        pickTicketNum,
        orderId,
        sku: line.sku,
        palletId: line.palletId,
        fromLocation: line.location,
        quantityToPick: line.qtyAllocated,
        status: "GENERATED" as const,
        createdAt: new Date().toISOString(),
      })),
    );

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// Admin Inventory Cleanup
// ============================================================
export async function deleteInventoryBatch(params: {
  sku: string;
  palletId?: string;
  location?: string;
  user?: string;
}): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const { sku, palletId, location, user = "admin" } = params;
  const invRef = doc(db, "inventoryItems", sku);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(invRef);
      if (!snap.exists()) {
        throw new Error(`SKU ${sku} not found in inventory`);
      }
      const item = snap.data() as InventoryItem;
      const before = item.batches?.length ?? 0;

      // Log audit trail for each deleted batch
      for (const b of item.batches ?? []) {
        if (
          (palletId && b.palletId === palletId) ||
          (location && b.location === location) ||
          (!palletId && !location)
        ) {
          const txnId = `TX-${Date.now()}-DEL-${b.batchId}`;
          transaction.set(doc(db, "inventoryTransactions", txnId), {
            sku: item.sku,
            palletId: b.palletId,
            location: b.location,
            type: "DELETE",
            qtyChange: -b.qty,
            qtyBefore: b.qty,
            qtyAfter: 0,
            user,
            notes: `Batch deleted by admin`,
            timestamp: serverTimestamp(),
          });
        }
      }

      const filtered =
        item.batches?.filter((b) => {
          if (palletId && b.palletId !== palletId) return true;
          if (location && b.location !== location) return true;
          return false;
        }) ?? [];
      transaction.update(invRef, { batches: filtered });
      return before - filtered.length;
    });
    return { success: true, deletedCount: 0 };
  } catch (e: any) {
    return { success: false, deletedCount: 0, error: e.message };
  }
}

export async function rebuildLocationMasterFromInventory(): Promise<{
  success: boolean;
  created: number;
  updated: number;
  removed: number;
  error?: string;
}> {
  try {
    const invSnap = await getDocs(collection(db, "inventoryItems"));
    const locSnap = await getDocs(collection(db, "locationMaster"));

    const locMap = new Map<string, LocationRecord>();
    for (const d of locSnap.docs) {
      const data = d.data() as LocationRecord;
      locMap.set(data.id, { ...data });
    }

    const seen = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const invDoc of invSnap.docs) {
      const item = invDoc.data() as InventoryItem;
      for (const batch of item.batches ?? []) {
        const locId = batch.location;
        if (!locId || seen.has(locId)) continue;
        seen.add(locId);

        const existing = locMap.get(locId);
        const isDrop = locId.toUpperCase().includes("DROP") || locId.toUpperCase().includes("DOCK");
        const isFloor = locId.toUpperCase().includes("FLR");
        const type: LocationType = isDrop ? "DROP" : isFloor ? "FLR" : "RACK";
        const pickable = type !== "DROP";

        if (existing) {
          const changed =
            existing.warehouseId !== item.warehouseId ||
            existing.tenantId !== item.tenantId ||
            existing.type !== type ||
            existing.pickable !== pickable;
          if (changed) {
            locMap.set(locId, {
              ...existing,
              warehouseId: item.warehouseId,
              tenantId: item.tenantId ?? existing.tenantId,
              type,
              pickable,
            });
            updated++;
          }
        } else {
          locMap.set(locId, {
            id: locId,
            warehouseId: item.warehouseId,
            tenantId: item.tenantId,
            type,
            zone: isDrop ? "Staging/Drop" : isFloor ? "Bulk Floor" : "Reserve",
            capacityPallets: 1,
            occupiedPallets: 0,
            pickable,
            allowedItemStyles: null,
            slottingRules: {
              allowedStorageClasses: isFloor
                ? ["bulk", "reserve"]
                : isDrop
                  ? ["forward", "reserve", "bulk", "staging"]
                  : ["reserve", "bulk"],
              putawayPriority: isDrop ? 20 : isFloor ? 80 : 50,
              replenPriority: isDrop ? 20 : isFloor ? 80 : 50,
              allowedPalletTypes: ["standard_48x40"],
            },
            velocityMetrics: {
              picksPerDay: 0,
              linesPerDay: 0,
              cubicVelocity: 0,
              lastCalculated: new Date().toISOString(),
              manualOverride: false,
            },
            zoneAdjacency: {
              adjacent: [],
              toShippingDockSec: 300,
              toReceivingDockSec: isDrop ? 30 : 180,
            },
            status: "active",
            maxPalletWeightLbs: isFloor ? 3000 : 2500,
            maxPalletHeightIn: isFloor ? 96 : 72,
            clearanceHeightIn: isFloor ? 120 : 96,
          });
          created++;
        }
      }
    }

    const removed = locMap.size - seen.size;
    const stale = [...locMap.keys()].filter((id) => !seen.has(id));
    for (const id of stale) {
      locMap.delete(id);
    }

    const batch = writeBatch(db);
    for (const loc of locMap.values()) {
      const ref = doc(db, "locationMaster", loc.id);
      batch.set(ref, loc);
    }
    for (const id of stale) {
      batch.delete(doc(db, "locationMaster", id));
    }
    await batch.commit();

    return { success: true, created, updated, removed };
  } catch (e: any) {
    return { success: false, created: 0, updated: 0, removed: 0, error: e.message };
  }
}

// ============================================================
// Outbound Pallets
// ============================================================
// Transactional Deallocation (for multi-line orders)
// ============================================================
export async function deallocateOrderTransactional(
  orderId: string,
  lines: Array<{ sku: string; palletId: string; location: string; qty: number }>,
): Promise<{ success: boolean; error?: string }> {
  const orderRef = doc(db, "orders", orderId);

  try {
    await runTransaction(db, async (transaction) => {
      // Check if order exists, create if not (for testing)
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        transaction.set(orderRef, { status: "new" }, { merge: true });
      } else {
        transaction.update(orderRef, { status: "new" });
      }

      // Update each affected inventory item - SUBTRACT allocated qty on deallocate
      for (const line of lines) {
        const invRef = doc(db, "inventoryItems", line.sku);
        const invSnap = await transaction.get(invRef);
        if (invSnap.exists()) {
          const item = invSnap.data() as InventoryItem;
          const batch = item.batches?.find(
            (b) => b.palletId === line.palletId && b.location === line.location,
          );
          if (batch) {
            const batchIndex = item.batches!.indexOf(batch);
            const currentAllocated = batch.qtyAllocated || 0;
            const newAllocated = Math.max(0, currentAllocated - line.qty);
            transaction.update(invRef, {
              [`batches.${batchIndex}.qtyAllocated`]: newAllocated,
            });
          }
        }
      }
    });

    // Delete pick tickets for this order
    await deletePickTicketsByOrder(orderId);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// Billing — Firestore CRUD
// ============================================================
export function subscribeBillingClients(callback: (clients: BillingClient[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "billingClients"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as BillingClient));
  });
}

export async function createBillingClient(client: BillingClient) {
  await setDoc(doc(db, "billingClients", client.id), client);
}

export async function updateBillingClient(clientId: string, updates: Partial<BillingClient>) {
  await updateDoc(doc(db, "billingClients", clientId), updates);
}

export async function deleteBillingClient(clientId: string) {
  await deleteDoc(doc(db, "billingClients", clientId));
}

export function subscribeChargeRules(callback: (rules: ChargeRule[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "chargeRules"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as ChargeRule));
  });
}

/**
 * Firestore rejects `undefined` anywhere in a document, and the charge
 * rule form leaves optional fields (warehouse, location, accessorial type,
 * tier pricing…) empty. Strip them before writing so a partially filled
 * rate can always be saved.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)).filter((v) => v !== undefined) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out as T;
  }
  return value;
}

export async function createChargeRule(rule: ChargeRule) {
  await setDoc(doc(db, "chargeRules", rule.id), stripUndefinedDeep(rule));
}

export async function updateChargeRule(
  ruleId: string,
  updates: Partial<ChargeRule>,
) {
  await updateDoc(doc(db, "chargeRules", ruleId), stripUndefinedDeep(updates));
}

export async function deleteChargeRule(ruleId: string) {
  await deleteDoc(doc(db, "chargeRules", ruleId));
}

export function subscribeBillableEvents(callback: (events: BillableEvent[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "billableEvents"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as BillableEvent));
  });
}

export async function createBillableEvent(evt: BillableEvent) {
  await setDoc(doc(db, "billableEvents", evt.id), evt);
}

export async function updateBillableEvent(eventId: string, updates: Partial<BillableEvent>) {
  await updateDoc(doc(db, "billableEvents", eventId), updates);
}

export function subscribeInvoices(callback: (invoices: Invoice[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "invoices"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as Invoice));
  });
}

export async function createInvoice(invoice: Invoice) {
  await setDoc(doc(db, "invoices", invoice.id), invoice);
}

export async function updateInvoice(invoiceId: string, updates: Partial<Invoice>) {
  await updateDoc(doc(db, "invoices", invoiceId), updates);
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await deleteDoc(doc(db, "invoices", invoiceId));
}

// ============================================================
// Invoice Payments
// ============================================================
export function subscribeInvoicePayments(
  callback: (payments: InvoicePayment[]) => void,
  invoiceId?: string,
): Unsubscribe {
  let q: Query = collection(db, "invoicePayments");
  const conditions: any[] = [];
  if (invoiceId) conditions.push(where("invoiceId", "==", invoiceId));
  if (conditions.length > 0) q = query(q, ...conditions);
  return onSnapshot(q, (snap: QuerySnapshot) => {
    let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as InvoicePayment);
    if (invoiceId) items = items.filter((p) => p.invoiceId === invoiceId);
    callback(items);
  });
}

export async function createInvoicePayment(payment: InvoicePayment) {
  await setDoc(doc(db, "invoicePayments", payment.id), payment);
}

export async function updateInvoicePayment(paymentId: string, updates: Partial<InvoicePayment>) {
  await updateDoc(doc(db, "invoicePayments", paymentId), updates);
}

export async function deleteInvoicePayment(paymentId: string): Promise<void> {
  await deleteDoc(doc(db, "invoicePayments", paymentId));
}

// ============================================================
// Billing Audit Log
// ============================================================
export function subscribeBillingAuditLog(
  callback: (logs: BillingAuditLog[]) => void,
  tenantId?: string,
): Unsubscribe {
  let q: Query = collection(db, "billingAuditLog");
  const conditions: any[] = [];
  if (tenantId) conditions.push(where("tenantId", "==", tenantId));
  if (conditions.length > 0) q = query(q, ...conditions);
  return onSnapshot(q, (snap: QuerySnapshot) => {
    let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as BillingAuditLog);
    if (tenantId) items = items.filter((l) => l.tenantId === tenantId);
    callback(items);
  });
}

export async function createBillingAuditLog(log: BillingAuditLog) {
  await setDoc(doc(db, "billingAuditLog", log.id), log);
}

export async function deleteBillingAuditLog(logId: string): Promise<void> {
  await deleteDoc(doc(db, "billingAuditLog", logId));
}

export async function seedBillingData(): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      billingClients: clients,
      defaultRules: rules,
      billableEvents: events,
      seedInvoices: invoices,
    } = await import("@/lib/billing-data");

    const collections = ["billingClients", "chargeRules", "billableEvents", "invoices"];
    for (const colName of collections) {
      const snap = await getDocs(collection(db, colName));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    const seedBatch = writeBatch(db);
    for (const c of clients) seedBatch.set(doc(db, "billingClients", c.id), c);
    for (const r of rules) seedBatch.set(doc(db, "chargeRules", r.id), r);
    for (const e of events) seedBatch.set(doc(db, "billableEvents", e.id), e);
    for (const inv of invoices) seedBatch.set(doc(db, "invoices", inv.id), inv);
    await seedBatch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// Warehouse Employees (RF Gun Badge Auth)
// ============================================================
export async function fetchEmployees(
  tenantId?: string,
  warehouseId?: string,
): Promise<WarehouseEmployee[]> {
  let q: Query = collection(db, "employees");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("assignedClientId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("assignedWarehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() ?? {}),
  })) as unknown as WarehouseEmployee[];
}

export function subscribeEmployees(
  callback: (employees: WarehouseEmployee[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "employees");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("assignedClientId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("assignedWarehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })) as unknown as WarehouseEmployee[],
    );
  });
}

export async function createEmployee(emp: WarehouseEmployee): Promise<void> {
  await setDoc(doc(db, "employees", emp.badgeId), emp);
}

export async function updateEmployee(
  badgeId: string,
  updates: Partial<WarehouseEmployee>,
): Promise<void> {
  await updateDoc(doc(db, "employees", badgeId), updates);
}

export async function deleteEmployee(badgeId: string): Promise<void> {
  await deleteDoc(doc(db, "employees", badgeId));
}

// ============================================================
// Movement History (Append-Only Audit Log)
// ============================================================
export async function logMovement(entry: Omit<MovementHistory, "movementId">): Promise<string> {
  const id = `MV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, "movementHistory", id), {
    ...entry,
    movementId: id,
    timestamp: serverTimestamp(),
  });
  return id;
}

export async function fetchMovementHistory(filters?: {
  badgeId?: string;
  tenantId?: string;
  itemCode?: string;
  type?: MovementHistory["type"];
  limit?: number;
}): Promise<MovementHistory[]> {
  let q: Query = collection(db, "movementHistory");
  const conditions: any[] = [];
  if (filters?.badgeId) conditions.push(where("badgeId", "==", filters.badgeId));
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.itemCode) conditions.push(where("itemCode", "==", filters.itemCode));
  if (filters?.type) conditions.push(where("type", "==", filters.type));
  if (conditions.length > 0) q = query(q, ...conditions);
  const snap = await getDocs(q);
  let results = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() ?? {}),
  })) as unknown as MovementHistory[];
  if (filters?.limit) results = results.slice(0, filters.limit);
  const sorted = results.sort(
    (a, b) => ((b as any).timestamp?.seconds ?? 0) - ((a as any).timestamp?.seconds ?? 0),
  );
  return sorted;
}

export function subscribeMovementHistory(
  callback: (entries: MovementHistory[]) => void,
  filters?: {
    badgeId?: string;
    tenantId?: string;
    itemCode?: string;
    type?: MovementHistory["type"];
  },
): Unsubscribe {
  let q: Query = collection(db, "movementHistory");
  const conditions: any[] = [];
  if (filters?.badgeId) conditions.push(where("badgeId", "==", filters.badgeId));
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.itemCode) conditions.push(where("itemCode", "==", filters.itemCode));
  if (filters?.type) conditions.push(where("type", "==", filters.type));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("timestamp", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })) as unknown as MovementHistory[],
    );
  });
}

export async function seedEmployees(employees: WarehouseEmployee[]): Promise<void> {
  const batch = writeBatch(db);
  for (const emp of employees) {
    batch.set(doc(db, "employees", emp.badgeId), emp);
  }
  await batch.commit();
}

export type { MovementHistory, WarehouseEmployee } from "./rf-types";

// ============================================================
// Labor Management System (LMS) — Engineered Labor Standards & Events
// ============================================================

export async function fetchLaborStandards(): Promise<LaborStandard[]> {
  const snap = await getDocs(collection(db, "laborStandards"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })) as unknown as LaborStandard[];
}

export function subscribeLaborStandards(
  callback: (standards: LaborStandard[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "laborStandards"), (snap: QuerySnapshot) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })) as unknown as LaborStandard[],
    );
  });
}

export async function createLaborStandard(standard: LaborStandard): Promise<string> {
  const ref = doc(collection(db, "laborStandards"));
  await setDoc(ref, standard);
  return ref.id;
}

export async function updateLaborStandard(
  id: string,
  updates: Partial<LaborStandard>,
): Promise<void> {
  await updateDoc(doc(db, "laborStandards", id), updates);
}

export async function deleteLaborStandard(id: string): Promise<void> {
  await deleteDoc(doc(db, "laborStandards", id));
}

export async function seedLaborStandards(): Promise<void> {
  const existing = await fetchLaborStandards();
  if (existing.length > 0) return;

  const batch = writeBatch(db);
  for (const std of LABOR_STANDARDS) {
    const ref = doc(collection(db, "laborStandards"));
    batch.set(ref, std);
  }
  await batch.commit();
}

export async function recordLaborEvent(
  event: Omit<LaborEvent, "eventId" | "completedAt"> & { startedAt: string | Date },
): Promise<string> {
  const startedAt = new Date(event.startedAt);
  const completedAt = new Date();

  const actualSec = Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000));
  const standardSec = computeStandardSec(event.taskType, event.qty);
  const efficiencyPct =
    actualSec > 0 && standardSec > 0 ? Math.round((standardSec / actualSec) * 100) : 100;

  const aisle = getAisleFromLocation(event.locationId);

  const eventData: LaborEvent = {
    ...event,
    eventId: "", // will be set by Firestore
    startedAt,
    completedAt,
    durationSec: actualSec,
    standardSec,
    efficiencyPct,
    aisle,
  };

  const ref = await addDoc(collection(db, "laborEvents"), eventData);
  return ref.id;
}

export async function fetchLaborEvents(
  filters?: {
    badgeId?: string;
    tenantId?: string;
    warehouseId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    taskType?: string;
  },
  limitCount = 100,
): Promise<LaborEvent[]> {
  let q: any = query(
    collection(db, "laborEvents"),
    orderBy("completedAt", "desc"),
    limit(limitCount),
  );
  const conditions: any[] = [];

  if (filters?.badgeId) conditions.push(where("badgeId", "==", filters.badgeId));
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.warehouseId) conditions.push(where("warehouseId", "==", filters.warehouseId));
  if (filters?.dateFrom) conditions.push(where("completedAt", ">=", filters.dateFrom));
  if (filters?.dateTo) conditions.push(where("completedAt", "<=", filters.dateTo));
  if (filters?.taskType) conditions.push(where("taskType", "==", filters.taskType));

  if (conditions.length > 0) {
    q = query(
      collection(db, "laborEvents"),
      ...conditions,
      orderBy("completedAt", "desc"),
      limit(limitCount),
    );
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ eventId: d.id, ...(d.data() ?? {}) }) as LaborEvent);
}

export function subscribeLaborEvents(
  callback: (events: LaborEvent[]) => void,
  filters?: { badgeId?: string; tenantId?: string; warehouseId?: string },
  limitCount = 200,
): Unsubscribe {
  let q: any = query(
    collection(db, "laborEvents"),
    orderBy("completedAt", "desc"),
    limit(limitCount),
  );
  const conditions: any[] = [];

  if (filters?.badgeId) conditions.push(where("badgeId", "==", filters.badgeId));
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.warehouseId) conditions.push(where("warehouseId", "==", filters.warehouseId));

  if (conditions.length > 0) {
    q = query(
      collection(db, "laborEvents"),
      ...conditions,
      orderBy("completedAt", "desc"),
      limit(limitCount),
    );
  }

  return onSnapshot(q, (snap: QuerySnapshot<LaborEvent>) => {
    callback(snap.docs.map((d) => ({ ...(d.data() ?? {}), eventId: d.id }) as LaborEvent));
  });
}

// ============================================================
// Automated Billing Event Capture Hooks
// ============================================================
// These helpers allow operation modules to automatically create
// BillableEvent records when enabled ChargeRule.autoCapture rules
// match. Call these after successful operations.

async function getAutoCaptureRules(clientId: string, warehouseId?: string): Promise<ChargeRule[]> {
  const snap = await getDocs(
    query(
      collection(db, "chargeRules"),
      where("clientId", "==", clientId),
      where("enabled", "==", true),
      where("autoCapture", "==", true),
    ),
  );
  let rules = snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as ChargeRule);
  if (warehouseId) {
    rules = rules.filter((r) => !r.warehouseId || r.warehouseId === warehouseId);
  }
  return rules;
}

export async function captureBillableEventForInboundReceive(params: {
  clientId: string;
  tenantId: string;
  warehouseId?: string;
  shipmentId: string;
  lineNo: number;
  receivedQty: number;
}): Promise<void> {
  const { clientId, tenantId, warehouseId, shipmentId, lineNo, receivedQty } = params;
  const rules = await getAutoCaptureRules(clientId, warehouseId);
  if (rules.length === 0) return;
  await maybeCaptureBillableEvent({
    clientId,
    tenantId,
    warehouseId,
    type: "Inbound",
    reference: shipmentId,
    description: `Inbound receive line ${lineNo} — ${receivedQty} units`,
    quantity: receivedQty,
    unit: "carton",
    rules,
    createEvent: (evt) => createBillableEvent(evt),
  });
}

export async function captureBillableEventForPick(params: {
  clientId: string;
  tenantId: string;
  warehouseId?: string;
  orderId: string;
  pickTicketNum: number;
  qtyPicked: number;
}): Promise<void> {
  const { clientId, tenantId, warehouseId, orderId, pickTicketNum, qtyPicked } = params;
  const rules = await getAutoCaptureRules(clientId, warehouseId);
  if (rules.length === 0) return;
  await maybeCaptureBillableEvent({
    clientId,
    tenantId,
    warehouseId,
    type: "Outbound",
    reference: orderId,
    description: `Pick ticket ${pickTicketNum} — ${qtyPicked} units`,
    quantity: qtyPicked,
    unit: "carton",
    rules,
    createEvent: (evt) => createBillableEvent(evt),
  });
}

export async function captureBillableEventForShip(params: {
  clientId: string;
  tenantId: string;
  warehouseId?: string;
  orderId: string;
  bolNumber: string;
  qtyShipped: number;
}): Promise<void> {
  const { clientId, tenantId, warehouseId, orderId, bolNumber, qtyShipped } = params;
  const rules = await getAutoCaptureRules(clientId, warehouseId);
  if (rules.length === 0) return;
  await maybeCaptureBillableEvent({
    clientId,
    tenantId,
    warehouseId,
    type: "Outbound",
    reference: bolNumber,
    description: `Ship order ${orderId} — ${qtyShipped} units`,
    quantity: qtyShipped,
    unit: "bol",
    rules,
    createEvent: (evt) => createBillableEvent(evt),
  });
}

export async function captureBillableEventForPutaway(params: {
  clientId: string;
  tenantId: string;
  warehouseId?: string;
  palletId: string;
  qtyPutAway: number;
}): Promise<void> {
  const { clientId, tenantId, warehouseId, palletId, qtyPutAway } = params;
  const rules = await getAutoCaptureRules(clientId, warehouseId);
  if (rules.length === 0) return;
  await maybeCaptureBillableEvent({
    clientId,
    tenantId,
    warehouseId,
    type: "Inbound",
    reference: palletId,
    description: `Putaway pallet ${palletId} — ${qtyPutAway} units`,
    quantity: qtyPutAway,
    unit: "pallet",
    rules,
    createEvent: (evt) => createBillableEvent(evt),
  });
}

// ============================================================
// Serialized Inventory (GS1 / Lot / Expiry / Temperature)
// ============================================================
export async function createSerialInventory(record: SerialInventoryRecord): Promise<void> {
  await setDoc(doc(db, "serialInventory", record.id), {
    ...record,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSerialInventory(
  id: string,
  updates: Partial<SerialInventoryRecord>,
): Promise<void> {
  await updateDoc(doc(db, "serialInventory", id), { ...updates, updatedAt: serverTimestamp() });
}

export async function updateSerialInventoryStatus(
  id: string,
  status: SerialInventoryRecord["status"],
): Promise<void> {
  await updateDoc(doc(db, "serialInventory", id), { status, updatedAt: serverTimestamp() });
}

export async function deleteSerialInventory(id: string): Promise<void> {
  await deleteDoc(doc(db, "serialInventory", id));
}

export function subscribeSerialInventory(
  callback: (records: SerialInventoryRecord[]) => void,
  filters?: {
    tenantId?: string;
    warehouseId?: string;
    sku?: string;
    status?: SerialInventoryRecord["status"];
  },
): Unsubscribe {
  let q: Query = collection(db, "serialInventory");
  const conditions: any[] = [];
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.warehouseId) conditions.push(where("warehouseId", "==", filters.warehouseId));
  if (filters?.sku) conditions.push(where("sku", "==", filters.sku));
  if (filters?.status) conditions.push(where("status", "==", filters.status));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as SerialInventoryRecord));
  });
}

export async function fetchExpiringLots(
  tenantId: string,
  daysAhead = 90,
): Promise<SerialInventoryRecord[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const q = query(
    collection(db, "serialInventory"),
    where("tenantId", "==", tenantId),
    where("expiryDate", "<=", cutoffStr),
    orderBy("expiryDate", "asc"),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as SerialInventoryRecord);
}

// ============================================================
// Compliance Audit Vault (SSAE18 / SOC2)
// ============================================================
export function subscribeComplianceAuditLog(
  callback: (logs: ComplianceAuditLog[]) => void,
  tenantId?: string,
): Unsubscribe {
  let q: Query = collection(db, "complianceAuditLog");
  const conditions: any[] = [];
  if (tenantId) conditions.push(where("tenantId", "==", tenantId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("timestamp", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as ComplianceAuditLog));
  });
}

export async function appendComplianceLog(log: ComplianceAuditLog): Promise<void> {
  await setDoc(doc(db, "complianceAuditLog", log.id), log);
}

export async function fetchComplianceAuditLog(
  tenantId: string,
  limitCount = 100,
): Promise<ComplianceAuditLog[]> {
  const q = query(
    collection(db, "complianceAuditLog"),
    where("tenantId", "==", tenantId),
    orderBy("timestamp", "desc"),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as ComplianceAuditLog);
}

// ============================================================
// Compliance Documents (Certificates, SDS, ISO, FDA, etc.)
// ============================================================
export async function createComplianceDocument(complianceDoc: ComplianceDocument): Promise<void> {
  await setDoc(doc(db, "complianceDocuments", complianceDoc.id), {
    ...complianceDoc,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateComplianceDocument(
  id: string,
  updates: Partial<ComplianceDocument>,
): Promise<void> {
  await updateDoc(doc(db, "complianceDocuments", id), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteComplianceDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, "complianceDocuments", id));
}

export function subscribeComplianceDocuments(
  callback: (docs: ComplianceDocument[]) => void,
  filters?: {
    tenantId?: string;
    sku?: string;
    documentType?: ComplianceDocumentType;
    status?: DocumentStatus;
  },
): Unsubscribe {
  let q: Query = collection(db, "complianceDocuments");
  const conditions: any[] = [];
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.sku) conditions.push(where("sku", "==", filters.sku));
  if (filters?.documentType) conditions.push(where("documentType", "==", filters.documentType));
  if (filters?.status) conditions.push(where("status", "==", filters.status));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("issuedAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as ComplianceDocument));
  });
}

export async function fetchExpiringDocuments(
  tenantId: string,
  daysAhead = 90,
): Promise<ComplianceDocument[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const q = query(
    collection(db, "complianceDocuments"),
    where("tenantId", "==", tenantId),
    where("expiresAt", "<=", cutoffStr),
    where("status", "==", "active"),
    orderBy("expiresAt", "asc"),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as ComplianceDocument);
}

// ============================================================
// Recalls
// ============================================================
export async function createRecall(recall: Recall): Promise<void> {
  await setDoc(doc(db, "recalls", recall.id), recall);
}

export async function updateRecall(id: string, updates: Partial<Recall>): Promise<void> {
  await updateDoc(doc(db, "recalls", id), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteRecall(id: string): Promise<void> {
  await deleteDoc(doc(db, "recalls", id));
}

export function subscribeRecalls(
  callback: (recalls: Recall[]) => void,
  filters?: { tenantId?: string; status?: RecallStatus },
): Unsubscribe {
  let q: Query = collection(db, "recalls");
  const conditions: any[] = [];
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.status) conditions.push(where("status", "==", filters.status));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("issuedAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as Recall));
  });
}

// ============================================================
// Quarantine Orders
// ============================================================
export async function createQuarantineOrder(order: QuarantineOrder): Promise<void> {
  await setDoc(doc(db, "quarantineOrders", order.id), {
    ...order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateQuarantineOrder(
  id: string,
  updates: Partial<QuarantineOrder>,
): Promise<void> {
  await updateDoc(doc(db, "quarantineOrders", id), { ...updates, updatedAt: serverTimestamp() });
}

export async function releaseQuarantineOrder(id: string): Promise<void> {
  await updateDoc(doc(db, "quarantineOrders", id), {
    status: "released",
    releasedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeQuarantineOrders(
  callback: (orders: QuarantineOrder[]) => void,
  filters?: { tenantId?: string; status?: "active" | "released" | "cancelled" },
): Unsubscribe {
  let q: Query = collection(db, "quarantineOrders");
  const conditions: any[] = [];
  if (filters?.tenantId) conditions.push(where("tenantId", "==", filters.tenantId));
  if (filters?.status) conditions.push(where("status", "==", filters.status));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("issuedAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as QuarantineOrder));
  });
}

// ============================================================
// RF Task Assignment
// ============================================================
export type RfTaskType = "PICK" | "PUTAWAY" | "RECEIVE" | "MOVE" | "INQUIRY";
export type RfTaskStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED";

export type RfAssignedTask = {
  id?: string;
  type: RfTaskType;
  badgeId: string;
  pickTicketNum?: number;
  palletId?: string;
  sku?: string;
  fromLocation?: string;
  toLocation?: string;
  qty: number;
  status: RfTaskStatus;
  assignedAt: string;
  completedAt?: string;
  notes?: string;
};

export function subscribeAssignedTasks(
  badgeId: string,
  callback: (tasks: RfAssignedTask[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "rfAssignedTasks", badgeId, "items"),
    orderBy("assignedAt", "desc"),
  );
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as RfAssignedTask));
  });
}

export async function assignRfTask(
  badgeId: string,
  task: Omit<RfAssignedTask, "id" | "badgeId" | "assignedAt">,
): Promise<string> {
  const ref = doc(collection(db, "rfAssignedTasks", badgeId, "items"));
  await setDoc(ref, {
    ...task,
    badgeId,
    assignedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function completeRfTask(badgeId: string, taskId: string, notes?: string) {
  await updateDoc(doc(db, "rfAssignedTasks", badgeId, "items", taskId), {
    status: "COMPLETED",
    completedAt: new Date().toISOString(),
    ...(notes ? { notes } : {}),
  });
}

export async function failRfTask(badgeId: string, taskId: string, notes?: string) {
  await updateDoc(doc(db, "rfAssignedTasks", badgeId, "items", taskId), {
    status: "FAILED",
    completedAt: new Date().toISOString(),
    ...(notes ? { notes } : {}),
  });
}

export async function fetchAssignedTasks(badgeId: string): Promise<RfAssignedTask[]> {
  const q = query(
    collection(db, "rfAssignedTasks", badgeId, "items"),
    orderBy("assignedAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as RfAssignedTask);
}

// ============================================================
// Cycle Counting
// ============================================================
export async function fetchCycleCounts(
  tenantId?: string,
  warehouseId?: string,
): Promise<CycleCount[]> {
  let q: Query = collection(db, "cycleCounts");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("scheduledDate", "desc"));
  else q = query(q, orderBy("scheduledDate", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CycleCount);
}

export function subscribeCycleCounts(
  callback: (counts: CycleCount[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "cycleCounts");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("scheduledDate", "desc"));
  else q = query(q, orderBy("scheduledDate", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CycleCount));
  });
}

export async function createCycleCount(data: Omit<CycleCount, "id">): Promise<string> {
  const ref = doc(collection(db, "cycleCounts"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateCycleCount(id: string, data: Partial<CycleCount>): Promise<void> {
  await updateDoc(doc(db, "cycleCounts", id), data);
}

export async function deleteCycleCount(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "cycleCounts", id));
  return { ok: true };
}

// ============================================================
// Cycle Count Lines
// ============================================================
export async function fetchCycleCountLines(countId: string): Promise<CycleCountLine[]> {
  const q = query(
    collection(db, "cycleCountLines"),
    where("countId", "==", countId),
    orderBy("locationId"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CycleCountLine);
}

export function subscribeCycleCountLines(
  callback: (lines: CycleCountLine[]) => void,
  countId: string,
): Unsubscribe {
  const q = query(
    collection(db, "cycleCountLines"),
    where("countId", "==", countId),
    orderBy("locationId"),
  );
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CycleCountLine));
  });
}

export async function createCycleCountLine(data: Omit<CycleCountLine, "id">): Promise<string> {
  const ref = doc(collection(db, "cycleCountLines"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateCycleCountLine(
  id: string,
  data: Partial<CycleCountLine>,
): Promise<void> {
  await updateDoc(doc(db, "cycleCountLines", id), data);
}

export async function batchWriteCycleCountLines(lines: CycleCountLine[]): Promise<void> {
  const batch = writeBatch(db);
  for (const line of lines) {
    const ref = doc(db, "cycleCountLines", line.id);
    batch.set(ref, line);
  }
  await batch.commit();
}

// ============================================================
// Count Schedules
// ============================================================
export async function fetchCountSchedules(
  tenantId?: string,
  warehouseId?: string,
): Promise<CountSchedule[]> {
  let q: Query = collection(db, "countSchedules");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("nextRunAt", "asc"));
  else q = query(q, orderBy("nextRunAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CountSchedule);
}

export function subscribeCountSchedules(
  callback: (schedules: CountSchedule[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "countSchedules");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("nextRunAt", "asc"));
  else q = query(q, orderBy("nextRunAt", "asc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CountSchedule));
  });
}

export async function createCountSchedule(data: Omit<CountSchedule, "id">): Promise<string> {
  const ref = doc(collection(db, "countSchedules"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateCountSchedule(id: string, data: Partial<CountSchedule>): Promise<void> {
  await updateDoc(doc(db, "countSchedules", id), data);
}

export async function deleteCountSchedule(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "countSchedules", id));
  return { ok: true };
}

// ============================================================
// VAS Work Orders
// ============================================================
export async function fetchVasWorkOrders(
  tenantId?: string,
  warehouseId?: string,
): Promise<VasWorkOrder[]> {
  let q: Query = collection(db, "vasWorkOrders");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("scheduledStartAt", "desc"));
  else q = query(q, orderBy("scheduledStartAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as VasWorkOrder);
}

export function subscribeVasWorkOrders(
  callback: (orders: VasWorkOrder[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "vasWorkOrders");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("scheduledStartAt", "desc"));
  else q = query(q, orderBy("scheduledStartAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as VasWorkOrder));
  });
}

export async function createVasWorkOrder(data: Omit<VasWorkOrder, "id">): Promise<string> {
  const ref = doc(collection(db, "vasWorkOrders"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateVasWorkOrder(id: string, data: Partial<VasWorkOrder>): Promise<void> {
  await updateDoc(doc(db, "vasWorkOrders", id), data);
}

export async function deleteVasWorkOrder(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "vasWorkOrders", id));
  return { ok: true };
}

// ============================================================
// VAS Work Order Lines
// ============================================================
export async function fetchVasWorkOrderLines(workOrderId: string): Promise<VasWorkOrderLine[]> {
  const q = query(
    collection(db, "vasWorkOrderLines"),
    where("workOrderId", "==", workOrderId),
    orderBy("lineNo"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as VasWorkOrderLine);
}

export function subscribeVasWorkOrderLines(
  callback: (lines: VasWorkOrderLine[]) => void,
  workOrderId: string,
): Unsubscribe {
  const q = query(
    collection(db, "vasWorkOrderLines"),
    where("workOrderId", "==", workOrderId),
    orderBy("lineNo"),
  );
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as VasWorkOrderLine));
  });
}

export async function createVasWorkOrderLine(data: Omit<VasWorkOrderLine, "id">): Promise<string> {
  const ref = doc(collection(db, "vasWorkOrderLines"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateVasWorkOrderLine(
  id: string,
  data: Partial<VasWorkOrderLine>,
): Promise<void> {
  await updateDoc(doc(db, "vasWorkOrderLines", id), data);
}

export async function batchWriteVasWorkOrderLines(lines: VasWorkOrderLine[]): Promise<void> {
  const batch = writeBatch(db);
  for (const line of lines) {
    const ref = doc(db, "vasWorkOrderLines", line.id);
    batch.set(ref, line);
  }
  await batch.commit();
}

// ============================================================
// Cross-Docking
// ============================================================
export async function fetchCrossDockMatches(
  tenantId?: string,
  warehouseId?: string,
): Promise<CrossDockMatch[]> {
  let q: Query = collection(db, "crossdockMatches");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("matchedAt", "desc"));
  else q = query(q, orderBy("matchedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CrossDockMatch);
}

export function subscribeCrossDockMatches(
  callback: (matches: CrossDockMatch[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "crossdockMatches");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("matchedAt", "desc"));
  else q = query(q, orderBy("matchedAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CrossDockMatch));
  });
}

export async function createCrossDockMatch(data: Omit<CrossDockMatch, "id">): Promise<string> {
  const ref = doc(collection(db, "crossdockMatches"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateCrossDockMatch(
  id: string,
  data: Partial<CrossDockMatch>,
): Promise<void> {
  await updateDoc(doc(db, "crossdockMatches", id), data);
}

export async function deleteCrossDockMatch(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "crossdockMatches", id));
  return { ok: true };
}

// ============================================================
// Catch Weight
// ============================================================
export async function fetchCatchWeightItems(
  tenantId?: string,
  warehouseId?: string,
): Promise<CatchWeightItem[]> {
  let q: Query = collection(db, "catchWeightItems");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })) as unknown as CatchWeightItem[];
}

export function subscribeCatchWeightItems(
  callback: (items: CatchWeightItem[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "catchWeightItems");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions);
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })) as unknown as CatchWeightItem[],
    );
  });
}

export async function createCatchWeightItem(
  data: Omit<CatchWeightItem, "sku"> & { sku: string },
): Promise<string> {
  const ref = doc(collection(db, "catchWeightItems"), data.sku);
  await setDoc(ref, data);
  return ref.id;
}

export async function updateCatchWeightItem(
  sku: string,
  data: Partial<CatchWeightItem>,
): Promise<void> {
  await updateDoc(doc(db, "catchWeightItems", sku), data);
}

export async function fetchCatchWeightLogs(
  tenantId?: string,
  warehouseId?: string,
): Promise<CatchWeightLog[]> {
  let q: Query = collection(db, "catchWeightLogs");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("capturedAt", "desc"));
  else q = query(q, orderBy("capturedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CatchWeightLog);
}

export function subscribeCatchWeightLogs(
  callback: (logs: CatchWeightLog[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "catchWeightLogs");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("capturedAt", "desc"));
  else q = query(q, orderBy("capturedAt", "desc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CatchWeightLog));
  });
}

export async function createCatchWeightLog(data: Omit<CatchWeightLog, "id">): Promise<string> {
  const ref = doc(collection(db, "catchWeightLogs"));
  await setDoc(ref, data);
  return ref.id;
}

// ============================================================
// Labor Forecasting
// ============================================================
export async function createLaborForecast(data: Omit<LaborForecast, "id">): Promise<string> {
  const ref = doc(collection(db, "laborForecasts"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateLaborForecast(id: string, data: Partial<LaborForecast>): Promise<void> {
  await updateDoc(doc(db, "laborForecasts", id), data);
}

export async function deleteLaborForecast(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "laborForecasts", id));
  return { ok: true };
}

export function subscribeLaborForecasts(
  callback: (forecasts: LaborForecast[]) => void,
  tenantId?: string,
  warehouseId?: string,
): Unsubscribe {
  let q: Query = collection(db, "laborForecasts");
  const conditions: any[] = [];
  if (tenantId && tenantId !== "all") conditions.push(where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all")
    conditions.push(where("warehouseId", "==", warehouseId));
  if (conditions.length > 0) q = query(q, ...conditions, orderBy("forecastDate", "asc"));
  else q = query(q, orderBy("forecastDate", "asc"));
  return onSnapshot(q, (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as LaborForecast));
  });
}

export async function createShiftSchedule(data: Omit<ShiftSchedule, "id">): Promise<string> {
  const ref = doc(collection(db, "shiftSchedules"));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateShiftSchedule(id: string, data: Partial<ShiftSchedule>): Promise<void> {
  await updateDoc(doc(db, "shiftSchedules", id), data);
}

export async function deleteShiftSchedule(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "shiftSchedules", id));
  return { ok: true };
}

// ============================================================
// Settings — Clients, Users, Carrier Services (Firestore CRUD)
// ============================================================

export type SettingsClient = {
  id: string;
  code: string;
  name: string;
  arAccount: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  businessType: "Warehousing" | "Transload" | "Warehousing+Transload";
  allocationRule: "FIFO" | "LIFO";
  preferredLocationPrefix: string;
  useDropForAllocation: boolean;
  active: boolean;
};

export type SettingsUser = {
  id: string;
  name: string;
  email: string;
  role:
    | "Admin"
    | "Operations Manager"
    | "Warehouse Lead"
    | "Picker"
    | "Receiver"
    | "Billing"
    | "Viewer";
  warehouseCode: string;
  active: boolean;
};

export async function fetchClients(): Promise<SettingsClient[]> {
  const snap = await getDocs(collection(db, "clients"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as SettingsClient);
}

export function subscribeClients(callback: (clients: SettingsClient[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "clients"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as SettingsClient));
  });
}

export async function createClient(client: SettingsClient) {
  await setDoc(doc(collection(db, "clients"), client.id), client);
}

export async function updateClient(clientId: string, updates: Partial<SettingsClient>) {
  await updateDoc(doc(db, "clients", clientId), updates);
}

export async function deleteClient(clientId: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "clients", clientId));
  return { ok: true };
}

export async function fetchUsers(): Promise<SettingsUser[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as SettingsUser);
}

export function subscribeUsers(callback: (users: SettingsUser[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "users"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as SettingsUser));
  });
}

export async function createUser(user: SettingsUser) {
  await setDoc(doc(collection(db, "users"), user.id), user);
}

export async function updateUser(userId: string, updates: Partial<SettingsUser>) {
  await updateDoc(doc(db, "users", userId), updates);
}

export async function deleteUser(userId: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "users", userId));
  return { ok: true };
}

export async function fetchCarrierServices(): Promise<CarrierServiceRecord[]> {
  const snap = await getDocs(collection(db, "carrierServices"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CarrierServiceRecord);
}

export function subscribeCarrierServices(
  callback: (services: CarrierServiceRecord[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "carrierServices"), (snap: QuerySnapshot) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CarrierServiceRecord));
  });
}

export async function createCarrierService(service: CarrierServiceRecord) {
  await setDoc(doc(collection(db, "carrierServices"), service.id), service);
}

export async function updateCarrierService(
  serviceId: string,
  updates: Partial<CarrierServiceRecord>,
) {
  await updateDoc(doc(db, "carrierServices", serviceId), updates);
}

export async function deleteCarrierService(serviceId: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "carrierServices", serviceId));
  return { ok: true };
}

export type CsvUploadHistory = {
  id: string;
  tenantId: string;
  warehouseId: string;
  fileName: string;
  fileSize: number;
  uploadAt: string;
  uploadedBy: string;
  source: "inbound_asn" | "inventory" | "item_master" | "custom";
  status: "pending" | "processing" | "completed" | "failed";
  recordsProcessed: number;
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; field: string; message: string }>;
  mapping: Record<string, string>;
  rawHeaders: string[];
};

export function subscribeCsvUploadHistory(
  tenantId: string,
  warehouseId: string,
  callback: (history: CsvUploadHistory[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "csvUploadHistory"),
    where("tenantId", "==", tenantId),
    where("warehouseId", "==", warehouseId),
    orderBy("uploadAt", "desc"),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as CsvUploadHistory));
  });
}

export async function createCsvUploadRecord(
  record: Omit<CsvUploadHistory, "id" | "uploadAt">,
): Promise<string> {
  const id = `CSV-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}${(new Date().getDate()).toString().padStart(2, "0")}-${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;
  await setDoc(doc(db, "csvUploadHistory", id), {
    ...record,
    id,
    uploadAt: new Date().toISOString(),
  });
  return id;
}

export async function updateCsvUploadRecord(
  id: string,
  updates: Partial<CsvUploadHistory>,
): Promise<void> {
  await updateDoc(doc(db, "csvUploadHistory", id), updates);
}

export async function deleteCsvUploadRecord(id: string): Promise<{ ok: true }> {
  await deleteDoc(doc(db, "csvUploadHistory", id));
  return { ok: true };
}

// ============================================================
// Work Orders
// ============================================================
export async function fetchWorkOrders(): Promise<any[]> {
  const q = query(collection(db, "workOrders"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }));
}

export function subscribeWorkOrders(callback: (workOrders: any[]) => void): Unsubscribe {
  const q = query(collection(db, "workOrders"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })));
  });
}

export async function createWorkOrder(data: any): Promise<string> {
  const id = data.id || genWoId();
  await setDoc(doc(db, "workOrders", id), {
    ...data,
    id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function updateWorkOrder(id: string, updates: any): Promise<void> {
  await updateDoc(doc(db, "workOrders", id), stripUndefinedDeep({
    ...updates,
    updatedAt: serverTimestamp(),
  }));

  // Sync back to linked InboundShipment for all relevant fields
  try {
    const allShipments = await fetchInboundShipments();
    const linked = allShipments.find((s) => s.workOrderId === id);
    if (linked) {
      // Sync status
      if (updates.status) {
        const inboundStatus = mapWoStatusToInboundStatus(
          updates.status as string,
          linked.status,
        );
        if (linked.status !== inboundStatus) {
          await updateInboundShipmentRecord(linked.id, {
            ...linked,
            status: inboundStatus,
            ...(inboundStatus === "received" ? { receivedAt: new Date().toISOString() } : {}),
          });
        }
      }

      // Sync other fields that map between WorkOrder and InboundShipment
      const inboundUpdates: Record<string, unknown> = {};
      const fieldMap: Record<string, string> = {
        warehouseId: "warehouseId",
        carrier: "carrier",
        containerNumber: "containerNumber",
        trailerNumber: "trailerNumber",
        sealNumber: "sealNumber",
        bolNumber: "bolNumber",
        poNumber: "poNumber",
        ediRef: "ediRef",
        vessel: "vessel",
        voyageNumber: "voyageNumber",
        port: "port",
        origin: "origin",
        arrivalDate: "appointmentAt",
        departureDate: "receivedAt", // Not exact mapping but close
        yardInDate: "receivedAt",
        yardLeaveDate: "receivedAt",
        doorAssigned: "doorAssigned",
        warehouseLocation: "warehouseLocation",
        notes: "notes",
      };

      for (const [woField, inboundField] of Object.entries(fieldMap)) {
        const newVal = (updates as Record<string, unknown>)[woField];
        const curVal = (linked as unknown as Record<string, unknown>)[inboundField];
        if (newVal !== undefined && newVal !== curVal) {
          inboundUpdates[inboundField] = newVal;
        }
      }

      if (Object.keys(inboundUpdates).length > 0) {
        await updateInboundShipmentRecord(linked.id, {
          ...linked,
          ...inboundUpdates,
        });
      }
    }
  } catch (e) {
    console.error("Failed to sync WorkOrder to inbound:", e);
  }
}

export async function deleteWorkOrder(id: string): Promise<void> {
  // Also remove the linked inbound shipment and the pallets built from it so
  // no orphan records are left behind on the Pallet screen.
  try {
    const allShipments = await fetchInboundShipments();
    const linked = allShipments.find((s) => s.workOrderId === id);
    if (linked) {
      const [byShipment, byInbound] = await Promise.all([
        getDocs(query(collection(db, "pallets"), where("shipmentId", "==", linked.id))),
        getDocs(query(collection(db, "pallets"), where("inboundShipmentId", "==", linked.id))),
      ]);
      const palletRefs = [...byShipment.docs, ...byInbound.docs].map((d) => d.ref);
      if (palletRefs.length) {
        const batch = writeBatch(db);
        palletRefs.forEach((r) => batch.delete(r));
        await batch.commit();
      }
      await deleteDoc(doc(db, "inboundShipments", linked.id));
    }
  } catch (e) {
    console.error("Failed to delete linked inbound shipment:", e);
  }
  await deleteDoc(doc(db, "workOrders", id));
}

function genWoId(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, "0") + now.getDate().toString().padStart(2, "0");
  const seq = Math.floor(Math.random() * 1000).toString().padStart(4, "0");
  return `WO-${dateStr}-${seq}`;
}

// ============================================================
// Data Integrity Repairs
// ============================================================
/**
 * Apply a repair for a data-integrity issue.
 *
 * Each repair is deliberately narrow and idempotent so an operator can fix
 * a single problem without touching anything else.
 */
export async function repairIntegrityIssue(
  issue: {
    type: string;
    entity: string;
    recordId: string;
    relatedId?: string;
  },
): Promise<{ ok: boolean; message: string }> {
  switch (issue.type) {
    /** P1 — detach a pallet from a container that no longer exists */
    case "pallet-missing-container": {
      const ref = doc(db, "pallets", issue.recordId);
      await updateDoc(ref, {
        shipmentId: null,
        inboundShipmentId: null,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, message: `Pallet ${issue.recordId} unlinked from the missing container.` };
    }

    /** P2 — drop a deleted pallet id from the receipt line */
    case "line-missing-pallet": {
      const [shipmentId, lineNoRaw] = issue.recordId.split(":");
      const lineNo = Number(lineNoRaw) - 1;
      const ref = doc(db, "inboundShipments", shipmentId);
      const snap = await getDoc(ref);
      if (!snap.exists) return { ok: false, message: "Container no longer exists." };
      const data = snap.data() as any;
      const lines: any[] = Array.isArray(data.lines) ? [...data.lines] : [];
      if (!lines[lineNo]) return { ok: false, message: "Line no longer exists." };
      lines[lineNo] = {
        ...lines[lineNo],
        palletIds: (lines[lineNo].palletIds ?? []).filter((pid: string) => pid !== issue.relatedId),
      };
      await updateDoc(ref, { lines, updatedAt: new Date().toISOString() });
      await syncInboundFromPallets(shipmentId);
      return { ok: true, message: `Removed the missing pallet reference from ${issue.recordId}.` };
    }

    /** P3 — a pallet in an unknown location goes back to staging */
    case "pallet-missing-location": {
      const ref = doc(db, "pallets", issue.recordId);
      await updateDoc(ref, {
        location: null,
        status: "staged",
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, message: `Pallet ${issue.recordId} returned to staging.` };
    }

    /** P5 — recompute the received quantity from the linked pallets */
    case "pallet-units-drift": {
      const [shipmentId] = issue.recordId.split(":");
      await syncInboundFromPallets(shipmentId);
      return { ok: true, message: `Received quantity for ${issue.recordId} recalculated from its pallets.` };
    }

    /** S1 — recreate the missing work order for a container */
    case "container-missing-workorder": {
      const ref = doc(db, "inboundShipments", issue.recordId);
      const snap = await getDoc(ref);
      if (!snap.exists) return { ok: false, message: "Container no longer exists." };
      const s = snap.data() as any;
      const woId = issue.recordId;
      const totalUnits = (s.lines ?? []).reduce((a: number, l: any) => a + (l.qtyExpected || 0), 0);
      const totalCartons = (s.lines ?? []).reduce((a: number, l: any) => a + (l.cartonsExpected || 0), 0);
      await setDoc(doc(db, "workOrders", woId), {
        id: woId,
        woNumber: woId,
        tenantId: s.tenantId,
        warehouseId: s.warehouseId,
        clientName: s.tenantId,
        containerNumber: s.containerNumber ?? "",
        trailerNumber: s.trailerNumber ?? "",
        sealNumber: s.sealNumber ?? "",
        bolNumber: s.bolNumber ?? "",
        poNumber: s.poNumber ?? "",
        ediRef: s.ediRef ?? "",
        carrier: s.carrier ?? "",
        vessel: s.vessel ?? "",
        voyageNumber: s.voyageNumber ?? "",
        port: s.port ?? "",
        origin: s.origin ?? "",
        arrivalDate: s.appointmentAt ?? new Date().toISOString(),
        departureDate: null,
        yardInDate: null,
        yardLeaveDate: null,
        inboundEntryDate: new Date().toISOString(),
        receivedDate: s.receivedAt ?? null,
        status: "scheduled",
        totalUnits,
        totalCartons,
        lineCount: (s.lines ?? []).length,
        lines: (s.lines ?? []).map((l: any, i: number) => ({
          lineNo: i + 1,
          sku: l.sku,
          upc: l.upc ?? "",
          description: l.description ?? "",
          lot: l.lot ?? "",
          qtyExpected: l.qtyExpected ?? 0,
          qtyReceived: l.receivedQty ?? 0,
          cartons: l.cartonsExpected ?? 0,
          status: "pending",
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: "",
        doorAssigned: s.doorAssigned ?? null,
        warehouseLocation: s.warehouseLocation ?? null,
      });
      return { ok: true, message: `Work order ${woId} recreated for ${issue.recordId}.` };
    }

    /** S2 — remove an orphaned work order */
    case "orphan-workorder": {
      await deleteDoc(doc(db, "workOrders", issue.recordId));
      return { ok: true, message: `Work order ${issue.recordId} deleted.` };
    }

    /** I1 — remove an inventory batch that has no pallet */
    case "inventory-missing-pallet": {
      const [sku] = issue.recordId.split(":");
      const ref = doc(db, "inventoryItems", sku);
      const snap = await getDoc(ref);
      if (!snap.exists) return { ok: false, message: "Inventory record no longer exists." };
      const inv = snap.data() as any;
      await updateDoc(ref, {
        batches: (inv.batches ?? []).filter((b: any) => b.palletId !== issue.relatedId),
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, message: `Batch on pallet ${issue.relatedId} removed from ${sku}.` };
    }

    /** I2 — collapse duplicate batches for the same pallet */
    case "inventory-duplicate-batch": {
      const [sku] = issue.recordId.split(":");
      const invRef = doc(db, "inventoryItems", sku);
      const snap = await getDoc(invRef);
      if (!snap.exists()) return { ok: false, message: "Inventory record not found." };
      const item = snap.data() as any;
      const batches: any[] = Array.isArray(item.batches) ? [...item.batches] : [];
      const seen = new Set<string>();
      const deduped = batches.filter((b: any) => {
        const key = b?.palletId ?? b?.batchId;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removedCount = batches.length - deduped.length;
      if (removedCount === 0) {
        return { ok: true, message: "No duplicates found." };
      }
      await updateDoc(invRef, {
        batches: dedupeBatches(deduped),
        updatedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        message: `Removed ${removedCount} duplicate batch(es) from ${sku}.`,
      };
    }

    /** L1 — a putaway pallet with no location goes back to staged */
    case "putaway-without-location": {
      const ref = doc(db, "pallets", issue.recordId);
      await updateDoc(ref, { status: "staged", updatedAt: new Date().toISOString() });
      return { ok: true, message: `Pallet ${issue.recordId} returned to staged.` };
    }

    /** L2 — recompute the location occupancy from the stored pallets */
    case "location-occupancy-drift": {
      const palletSnap = await getDocs(collection(db, "pallets"));
      const stored = palletSnap.docs.filter(
        (d) => (d.data() as any).location === issue.recordId,
      ).length;
      await updateDoc(doc(db, "locationMaster", issue.recordId), {
        occupiedPallets: stored,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, message: `Occupancy for ${issue.recordId} set to ${stored}.` };
    }

    /** P6 — add a stored pallet to the inventory */
    case "pallet-missing-inventory": {
      const palletSnap = await getDoc(doc(db, "pallets", issue.recordId));
      if (!palletSnap.exists) return { ok: false, message: "Pallet no longer exists." };
      const pallet = palletSnap.data() as any;
      if (!pallet.location) {
        return { ok: false, message: "Pallet is not stored in a location yet." };
      }
      await putAwayPallet(issue.recordId, pallet.location, {
        notes: "Repaired via Data Integrity check P6",
      });
      return {
        ok: true,
        message: `Pallet ${issue.recordId} added to the inventory at ${pallet.location}.`,
      };
    }

    /** A1 — rebuild the inventory record's descriptive fields from the Item Master */
    case "inventory-missing-sku": {
      const sku = issue.recordId;
      const invRef = doc(db, "inventoryItems", sku);
      const snap = await getDoc(invRef);
      if (!snap.exists()) return { ok: false, message: "Inventory record not found." };
      const item = snap.data() as any;
      const masterSnap = await getDoc(doc(db, "itemMaster", sku));
      if (!masterSnap.exists()) {
        return { ok: false, message: `No Item Master record for ${sku}.` };
      }
      const master = masterSnap.data() as any;
      await updateDoc(invRef, {
        sku,
        upc: item.upc || master.upc || "",
        itemStyle: item.itemStyle || master.itemStyle || "",
        description: item.description || master.description || "",
        category: item.category || master.category || "General",
        uom: item.uom || master.uom || "EA",
        unitCost: item.unitCost ?? master.unitCost ?? 0,
        unitPrice: item.unitPrice ?? master.unitPrice ?? 0,
        caseQty: item.caseQty || master.caseQty || 1,
        weightLbs: item.weightLbs ?? master.weightLbs ?? 0,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, message: `Inventory record ${sku} rebuilt from the Item Master.` };
    }

    /** A2 — record the missing putaway in the audit trail */
    case "inventory-missing-audit": {
      const palletSnap = await getDoc(doc(db, "pallets", issue.recordId));
      if (!palletSnap.exists()) return { ok: false, message: "Pallet no longer exists." };
      const pallet = palletSnap.data() as any;
      if (!pallet.location) {
        return { ok: false, message: "Pallet is not stored in a location." };
      }
      await putAwayPallet(issue.recordId, pallet.location, {
        notes: "Audit trail repaired — putaway recorded",
      });
      return {
        ok: true,
        message: `Putaway recorded for ${issue.recordId} at ${pallet.location}.`,
      };
    }

    /** M1 — complete an incomplete warehouse record from the catalogue */
    case "master-missing-fields": {
      const ref = doc(db, "warehouses", issue.recordId);
      const snap = await getDoc(ref);
      if (!snap.exists) return { ok: false, message: "Warehouse record not found." };
      const current = snap.data() as any;
      const catalogue = seedWarehouses.find((w) => w.id === issue.recordId);
      if (!catalogue) {
        return { ok: false, message: "No catalogue entry for this warehouse." };
      }
      await updateDoc(ref, {
        addressLine: current.addressLine || catalogue.addressLine || "",
        squareFeet: current.squareFeet ?? catalogue.squareFeet ?? 0,
        manager: current.manager || catalogue.manager || "",
        docks: current.docks ?? catalogue.docks ?? 0,
        active: current.active ?? catalogue.active ?? true,
        updatedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        message: `Warehouse ${issue.recordId} completed from the catalogue.`,
      };
    }

    /** C1 — remove a cartonization whose order no longer exists */
    case "cartonization-missing-order": {
      await deleteDoc(doc(db, "cartonizations", issue.recordId));
      return { ok: true, message: `Cartonization ${issue.recordId} deleted.` };
    }

    default:
      return { ok: false, message: "No automatic repair available for this issue." };
  }
}
