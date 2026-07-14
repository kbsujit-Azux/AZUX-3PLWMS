/**
 * ============================================================
 *  MODULE INDEX � White-Labeled Tenant Portal
 * ============================================================
 *
 *  Purpose: Tenant self-service portal for inventory visibility,
 *           CSV uploads, reporting, and invoice viewing.
 *
 *  Collections:
 *    - tenantPortalUsers       � Tenant-specific users
 *    - tenantPortalReports     � Saved/cached reports
 *    - tenantPortalCsvUploads  � CSV upload history
 * ============================================================
 */

import type { Tenant, Warehouse } from "./mock-data";

// ============================================================
// Tenant Portal User
// ============================================================

export type TenantPortalUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "Admin" | "Viewer" | "Reports";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

// ============================================================
// Report Definition
// ============================================================

export type ReportType =
  | "inventory_summary"
  | "inventory_valuation"
  | "order_history"
  | "shipment_history"
  | "billing_summary"
  | "turnover_analysis"
  | "aging_report";

export type ReportFormat = "csv" | "xlsx" | "pdf";

export type TenantPortalReport = {
  id: string;
  tenantId: string;
  name: string;
  reportType: ReportType;
  filters: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
  fileUrl?: string;
  format: ReportFormat;
};

// ============================================================
// CSV Upload
// ============================================================

export type CsvUploadType = "inventory" | "orders" | "item_master";

export type CsvUploadStatus = "pending" | "processing" | "completed" | "failed";

export type TenantPortalCsvUpload = {
  id: string;
  tenantId: string;
  uploadType: CsvUploadType;
  fileName: string;
  status: CsvUploadStatus;
  rowCount?: number;
  successCount?: number;
  errorCount?: number;
  errors?: string[];
  uploadedBy: string;
  uploadedAt: string;
  processedAt?: string;
};

// ============================================================
// Tenant Portal Session
// ============================================================

export type TenantPortalSession = {
  tenantId: string;
  user: TenantPortalUser;
  warehouseId?: string;
};

// ============================================================
// Helpers
// ============================================================

export function getTenantById(id: string): Tenant | undefined {
  const TENANTS: Tenant[] = [
    { id: "acme", name: "Acme Outdoor Co.", code: "ACME" },
    { id: "northstar", name: "Northstar Apparel", code: "NSAP" },
    { id: "harborlite", name: "Harborlite Electronics", code: "HLE" },
    { id: "verdant", name: "Verdant Wellness", code: "VRDN" },
  ];
  return TENANTS.find((t) => t.id === id);
}

export function getWarehousesForTenant(tenantId: string): Warehouse[] {
  const TENANT_WAREHOUSES: Record<string, string[]> = {
    acme: ["atl1", "ord2"],
    northstar: ["ord2", "lax3"],
    harborlite: ["ewr1", "atl1"],
    verdant: ["lax3", "ord2"],
  };
  const allowed = TENANT_WAREHOUSES[tenantId] || [];
  const ALL_WAREHOUSES: Warehouse[] = [
    { id: "atl1", name: "ATL-1 Distribution", code: "ATL1", city: "Atlanta, GA", capacityPct: 78 },
    { id: "ord2", name: "ORD-2 Fulfillment", code: "ORD2", city: "Chicago, IL", capacityPct: 64 },
    { id: "lax3", name: "LAX-3 Cross-Dock", code: "LAX3", city: "Los Angeles, CA", capacityPct: 91 },
    { id: "ewr1", name: "EWR-1 Bonded", code: "EWR1", city: "Newark, NJ", capacityPct: 47 },
  ];
  return ALL_WAREHOUSES.filter((w) => allowed.includes(w.id));
}
