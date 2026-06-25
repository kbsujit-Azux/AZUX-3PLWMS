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
} from "firebase/firestore";
import { db } from "./firestore";
import type {
  Tenant,
  Warehouse,
  InventoryItem,
  ClientAllocationConfig,
  PickTicket,
} from "./mock-data";
import type { Pallet } from "./pallet-data";
import type { ItemMasterRecord, LocationRecord } from "./master-data";
import type { InboundShipment, InboundLine } from "./inbound-data";
import type { Order, EdiLog } from "./edi-data";

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
  await updateDoc(doc(db, "orders", orderId), updates);
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
