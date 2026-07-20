/**
 * ============================================================
 *  TENANT VALIDATION — Multi-tenant access control
 * ============================================================
 *
 *  Purpose: Centralize tenant/warehouse access checks
 *           to prevent cross-tenant data leakage.
 *
 *  Features:
 *    - Tenant validation for Firestore queries
 *    - Warehouse access checks
 *    - RBAC helpers
 *
 *  Extension points:
 *    - Add tenant-level feature flags
 *    - Add warehouse-specific capabilities
 * ============================================================
 */

import { Warehouse, Tenant } from "./mock-data";

export type TenantAccess = {
  tenantId: string;
  warehouseIds: string[];
  canViewAllWarehouses: boolean;
};

const TENANT_ACCESS: Record<string, TenantAccess> = {
  all: { tenantId: "all", warehouseIds: [], canViewAllWarehouses: true },
  acme: { tenantId: "acme", warehouseIds: ["atl1", "ord2"], canViewAllWarehouses: false },
  northstar: { tenantId: "northstar", warehouseIds: ["ord2", "lax3"], canViewAllWarehouses: false },
  harborlite: { tenantId: "harborlite", warehouseIds: ["ewr1", "atl1"], canViewAllWarehouses: false },
  verdant: { tenantId: "verdant", warehouseIds: ["ord2", "atl1"], canViewAllWarehouses: false },
};

export function getTenantAccess(tenantId: string): TenantAccess {
  return TENANT_ACCESS[tenantId] ?? TENANT_ACCESS.all;
}

export function canAccessWarehouse(tenantId: string, warehouseId: string): boolean {
  const access = getTenantAccess(tenantId);
  if (access.canViewAllWarehouses) return true;
  return access.warehouseIds.includes(warehouseId);
}

export function getAccessibleWarehouses(tenantId: string): string[] {
  const access = getTenantAccess(tenantId);
  if (access.canViewAllWarehouses) {
    return ["atl1", "ord2", "lax3", "ewr1"];
  }
  return access.warehouseIds;
}

export function validateTenantWarehouse(tenantId: string, warehouseId: string): void {
  if (!canAccessWarehouse(tenantId, warehouseId)) {
    throw new Error(`Access denied: tenant ${tenantId} cannot access warehouse ${warehouseId}`);
  }
}

export function getTenantFilter(tenantId: string): { tenantId?: string; warehouseId?: string } {
  if (tenantId === "all") {
    return {};
  }
  return {
    tenantId,
    warehouseId: getAccessibleWarehouses(tenantId)[0],
  };
}
