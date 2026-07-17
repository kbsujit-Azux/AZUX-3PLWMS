/**
 * ============================================================
 *  MODULE INDEX — Tenant Portal Firestore CRUD
 * ============================================================
 *
 *  Purpose: Data access for tenant portal users, CSV uploads,
 *           and generated reports.
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
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  TenantPortalUser,
  TenantPortalCsvUpload,
  TenantPortalReport,
  CsvUploadStatus,
  ReportFormat,
} from "./tenant-portal";

// ============================================================
// Tenant Portal Users
// ============================================================

export async function fetchTenantPortalUsers(tenantId: string): Promise<TenantPortalUser[]> {
  const q = query(collection(db, "tenantPortalUsers"), where("tenantId", "==", tenantId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as TenantPortalUser);
}

export async function fetchTenantPortalUser(id: string): Promise<TenantPortalUser | null> {
  const snap = await getDoc(doc(db, "tenantPortalUsers", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() ?? {}) } as TenantPortalUser;
}

export async function createTenantPortalUser(data: Omit<TenantPortalUser, "id" | "createdAt" | "updatedAt">): Promise<TenantPortalUser> {
  const now = new Date().toISOString();
  const payload = { ...data, createdAt: now, updatedAt: now };
  const ref = await addDoc(collection(db, "tenantPortalUsers"), payload);
  return { id: ref.id, ...payload } as TenantPortalUser;
}

export async function updateTenantPortalUser(id: string, data: Partial<Omit<TenantPortalUser, "id">>): Promise<void> {
  const ref = doc(db, "tenantPortalUsers", id);
  await updateDoc(ref, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteTenantPortalUser(id: string): Promise<void> {
  await deleteDoc(doc(db, "tenantPortalUsers", id));
}

export function subscribeTenantPortalUsers(
  callback: (users: TenantPortalUser[]) => void,
  tenantId: string
): Unsubscribe {
  const q = query(collection(db, "tenantPortalUsers"), where("tenantId", "==", tenantId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as TenantPortalUser));
  });
}

// ============================================================
// Tenant Portal CSV Uploads
// ============================================================

export async function fetchTenantPortalCsvUploads(tenantId: string): Promise<TenantPortalCsvUpload[]> {
  const q = query(collection(db, "tenantPortalCsvUploads"), where("tenantId", "==", tenantId), orderBy("uploadedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as TenantPortalCsvUpload);
}

export async function createTenantPortalCsvUpload(data: Omit<TenantPortalCsvUpload, "id" | "uploadedAt">): Promise<TenantPortalCsvUpload> {
  const payload = { ...data, uploadedAt: new Date().toISOString() };
  const ref = await addDoc(collection(db, "tenantPortalCsvUploads"), payload);
  return { id: ref.id, ...payload } as TenantPortalCsvUpload;
}

export async function updateTenantPortalCsvUpload(id: string, data: Partial<Omit<TenantPortalCsvUpload, "id">>): Promise<void> {
  const ref = doc(db, "tenantPortalCsvUploads", id);
  await updateDoc(ref, data);
}

// ============================================================
// Tenant Portal Reports
// ============================================================

export async function fetchTenantPortalReports(tenantId: string): Promise<TenantPortalReport[]> {
  const q = query(collection(db, "tenantPortalReports"), where("tenantId", "==", tenantId), orderBy("generatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as TenantPortalReport);
}

export async function createTenantPortalReport(data: Omit<TenantPortalReport, "id" | "generatedAt">): Promise<TenantPortalReport> {
  const payload = { ...data, generatedAt: new Date().toISOString() };
  const ref = await addDoc(collection(db, "tenantPortalReports"), payload);
  return { id: ref.id, ...payload } as TenantPortalReport;
}

export async function updateTenantPortalReport(id: string, data: Partial<Omit<TenantPortalReport, "id">>): Promise<void> {
  const ref = doc(db, "tenantPortalReports", id);
  await updateDoc(ref, data);
}
