/**
 * ============================================================
 *  MODULE INDEX � RMA Firestore CRUD
 * ============================================================
 *
 *  Purpose: Data access for RMA orders, lines, dispositions,
 *           and return processing fees.
 * ============================================================
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  RmaOrder,
  RmaLine,
  RmaDisposition,
  ReturnProcessingFee,
  RmaStatus,
  DispositionType,
  DispositionStatus,
  ReturnReason,
} from "./rma-types";

// ============================================================
// RMA Orders
// ============================================================

export async function fetchRmaOrders(tenantId?: string, warehouseId?: string): Promise<RmaOrder[]> {
  let q = query(collection(db, "rmaOrders"), orderBy("createdAt", "desc"));
  if (tenantId && tenantId !== "all") q = query(q, where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all") q = query(q, where("warehouseId", "==", warehouseId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as RmaOrder);
}

export async function fetchRmaOrder(id: string): Promise<RmaOrder | null> {
  const snap = await getDoc(doc(db, "rmaOrders", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() ?? {}) } as RmaOrder;
}

export async function createRmaOrder(data: Omit<RmaOrder, "id" | "createdAt" | "updatedAt">): Promise<RmaOrder> {
  const now = new Date().toISOString();
  const payload = { ...data, createdAt: now, updatedAt: now };
  const ref = await addDoc(collection(db, "rmaOrders"), payload);
  return { id: ref.id, ...payload } as RmaOrder;
}

export async function updateRmaOrder(id: string, data: Partial<Omit<RmaOrder, "id">>): Promise<void> {
  const ref = doc(db, "rmaOrders", id);
  await updateDoc(ref, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteRmaOrder(id: string): Promise<void> {
  await deleteDoc(doc(db, "rmaOrders", id));
}

export function subscribeRmaOrders(
  callback: (orders: RmaOrder[]) => void,
  tenantId?: string,
  warehouseId?: string
): Unsubscribe {
  let q = query(collection(db, "rmaOrders"), orderBy("createdAt", "desc"));
  if (tenantId && tenantId !== "all") q = query(q, where("tenantId", "==", tenantId));
  if (warehouseId && warehouseId !== "all") q = query(q, where("warehouseId", "==", warehouseId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as RmaOrder));
  });
}

// ============================================================
// RMA Lines
// ============================================================

export async function fetchRmaLines(rmaId: string): Promise<RmaLine[]> {
  const q = query(collection(db, "rmaLines"), where("rmaId", "==", rmaId), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as RmaLine);
}

export async function createRmaLine(data: Omit<RmaLine, "id" | "createdAt" | "updatedAt">): Promise<RmaLine> {
  const now = new Date().toISOString();
  const payload = { ...data, createdAt: now, updatedAt: now };
  const ref = await addDoc(collection(db, "rmaLines"), payload);
  return { id: ref.id, ...payload } as RmaLine;
}

export async function updateRmaLine(id: string, data: Partial<Omit<RmaLine, "id">>): Promise<void> {
  const ref = doc(db, "rmaLines", id);
  await updateDoc(ref, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteRmaLine(id: string): Promise<void> {
  await deleteDoc(doc(db, "rmaLines", id));
}

// ============================================================
// RMA Dispositions
// ============================================================

export async function fetchRmaDispositions(rmaId?: string): Promise<RmaDisposition[]> {
  let q = query(collection(db, "rmaDispositions"), orderBy("createdAt", "desc"));
  if (rmaId) q = query(q, where("rmaId", "==", rmaId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as RmaDisposition);
}

export async function createRmaDisposition(
  data: Omit<RmaDisposition, "id" | "createdAt" | "updatedAt">
): Promise<RmaDisposition> {
  const now = new Date().toISOString();
  const payload = { ...data, createdAt: now, updatedAt: now };
  const ref = await addDoc(collection(db, "rmaDispositions"), payload);
  return { id: ref.id, ...payload } as RmaDisposition;
}

export async function updateRmaDisposition(id: string, data: Partial<Omit<RmaDisposition, "id">>): Promise<void> {
  const ref = doc(db, "rmaDispositions", id);
  await updateDoc(ref, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteRmaDisposition(id: string): Promise<void> {
  await deleteDoc(doc(db, "rmaDispositions", id));
}

// ============================================================
// Return Processing Fees
// ============================================================

export async function createReturnProcessingFee(
  data: Omit<ReturnProcessingFee, "id" | "createdAt">
): Promise<ReturnProcessingFee> {
  const payload = { ...data, createdAt: new Date().toISOString() };
  const ref = await addDoc(collection(db, "returnProcessingFees"), payload);
  return { id: ref.id, ...payload } as ReturnProcessingFee;
}

export async function fetchReturnProcessingFees(rmaId: string): Promise<ReturnProcessingFee[]> {
  const q = query(collection(db, "returnProcessingFees"), where("rmaId", "==", rmaId), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as ReturnProcessingFee);
}
