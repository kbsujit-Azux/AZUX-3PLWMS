import {
  collection,
  getDocs,
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
  type Unsubscribe,
  orderBy,
  Timestamp,
  QuerySnapshot,
  Query,
  serverTimestamp,
  runTransaction,
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
import { DROP001_LOCATION } from "./mock-data";
import type { Pallet } from "./pallet-data";
import type { ItemMasterRecord, LocationRecord } from "./master-data";
import type { InboundShipment, InboundLine } from "./inbound-data";
import type { Order, EdiLog } from "./edi-data";
import type { OutboundPallet } from "./outbound-pallet-data";
import type { BillingClient, ChargeRule, BillableEvent, Invoice } from "./billing-data";

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

export async function updateInboundLine(
  shipmentId: string,
  lineNo: number,
  updates: Partial<InboundLine>,
) {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);
  await updateDoc(shipmentRef, {
    [`lines.${lineNo}`]: updates,
  });
}

export async function receiveInboundShipment(
  shipmentId: string,
  lineNo: number,
  receivedQty: number,
  palletIds: string[],
) {
  const shipmentRef = doc(db, "inboundShipments", shipmentId);

  await updateDoc(shipmentRef, {
    [`lines.${lineNo}.receivedQty`]: increment(receivedQty),
    [`lines.${lineNo}.palletIds`]: arrayUnion(...palletIds),
    status: "received",
    receivedAt: new Date().toISOString(),
  });
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

export async function updatePallet(palletId: string, updates: Partial<Pallet>) {
  await updateDoc(doc(db, "pallets", palletId), updates);
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
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as OutboundPallet));
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
    const invSnap = await getDocs(invRef);
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

export async function upsertInventoryItem(item: InventoryItem) {
  await setDoc(doc(db, "inventoryItems", item.sku), item, { merge: true });
}

export async function updateInventoryBatch(sku: string, batchId: string, updates: any) {
  await updateDoc(doc(db, "inventoryItems", sku), {
    [`batches.${batchId}`]: updates,
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
export async function fetchLocations(): Promise<LocationRecord[]> {
  const snap = await getDocs(collection(db, "locations"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as LocationRecord);
}

export function subscribeLocations(callback: (locations: LocationRecord[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "locations"), (snap: QuerySnapshot) => {
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
  type: "RECEIVE" | "ALLOCATE" | "PICK" | "REALLOCATE" | "SHIP" | "ADJUST";
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
}): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const { sku, palletId, location } = params;
  const invRef = doc(db, "inventoryItems", sku);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(invRef);
      if (!snap.exists()) {
        throw new Error(`SKU ${sku} not found in inventory`);
      }
      const item = snap.data() as InventoryItem;
      const before = item.batches?.length ?? 0;
      const filtered = item.batches?.filter((b) => {
        if (palletId && b.palletId !== palletId) return true;
        if (location && b.location !== location) return true;
        return false;
      }) ?? [];
      transaction.update(invRef, { batches: filtered });
      return filtered.length;
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

export async function createChargeRule(rule: ChargeRule) {
  await setDoc(doc(db, "chargeRules", rule.id), rule);
}

export async function updateChargeRule(ruleId: string, updates: Partial<ChargeRule>) {
  await updateDoc(doc(db, "chargeRules", ruleId), updates);
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

export async function seedBillingData(): Promise<{ success: boolean; error?: string }> {
  try {
    const { billingClients: clients, defaultRules: rules, billableEvents: events, seedInvoices: invoices } = await import("@/lib/billing-data");

    // Clear existing billing collections to remove stale/dummy data
    const collections = ["billingClients", "chargeRules", "billableEvents", "invoices"];
    for (const colName of collections) {
      const snap = await getDocs(collection(db, colName));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    const seedBatch = writeBatch(db);

    for (const c of clients) {
      seedBatch.set(doc(db, "billingClients", c.id), c);
    }
    for (const r of rules) {
      seedBatch.set(doc(db, "chargeRules", r.id), r);
    }
    for (const e of events) {
      seedBatch.set(doc(db, "billableEvents", e.id), e);
    }
    for (const inv of invoices) {
      seedBatch.set(doc(db, "invoices", inv.id), inv);
    }

    await seedBatch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

