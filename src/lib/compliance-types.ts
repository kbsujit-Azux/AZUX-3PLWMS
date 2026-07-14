/**
 * ============================================================
 *  MODULE INDEX — Enterprise Compliance & Governance Types
 * ============================================================
 *
 *  Purpose: Types for serialized inventory, hazmat/temp validation,
 *           and tamper-proof audit logging for regulated 3PL operations.
 *
 *  Collections:
 *    - serialInventory       — GS1/serialized unit tracking
 *    - complianceAuditLog    — SSAE18/SOC2 audit vault
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    fetchSerialInventory / subscribeSerialInventory / createSerialInventory / updateSerialInventoryStatus
 *    subscribeComplianceAuditLog / appendComplianceLog
 * ============================================================
 */

import type { ItemMasterRecord, LocationRecord } from "./master-data";

// ============================================================
// Serialized Inventory
// ============================================================

export type SerialStatus = "active" | "quarantined" | "expired" | "recalled";

export type SerialInventoryRecord = {
  id: string; // auto-generated or GS1 serial/lot identifier
  sku: string;
  tenantId: string;
  warehouseId: string;
  locationId: string;
  palletId?: string;
  lotNumber?: string;
  serialNumber?: string;
  expiryDate?: string; // ISO date YYYY-MM-DD
  manufactureDate?: string;
  status: SerialStatus;
  receivedAt: string;
  lastMovedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryLotView = {
  sku: string;
  lotNumber?: string;
  expiryDate?: string;
  totalQty: number;
  locations: string[];
  oldestReceivedAt: string;
};

// ============================================================
// Hazmat / Temperature Validation
// ============================================================

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  severity: ValidationSeverity;
  ruleId?: string;
}

export interface ComplianceValidatorOptions {
  item: ItemMasterRecord;
  location: LocationRecord;
  employeeRole?: string;
}

// ============================================================
// Audit Vault
// ============================================================

export type ComplianceAction =
  | "serial_created"
  | "serial_status_changed"
  | "location_updated"
  | "item_master_updated"
  | "allocation_decision"
  | "validation_failure"
  | "validation_success"
  | "login"
  | "logout"
  | "data_export"
  | "configuration_change";

export type ComplianceEntityType =
  | "serial_inventory"
  | "location"
  | "item_master"
  | "allocation"
  | "hazmat_validation"
  | "temperature_validation"
  | "user_session"
  | "system";

export type ComplianceAuditLog = {
  id: string;
  tenantId: string;
  timestamp: string;
  actor: string;
  actorRole?: string;
  action: ComplianceAction;
  entityType: ComplianceEntityType;
  entityId: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  hashChain?: string; // SHA-256(prevEntry.id + prevEntry.timestamp + prevEntry.action + prevEntry.entityId)
};

// ============================================================
// Temperature Units
// ============================================================

export type TempUnit = "F" | "C";

export function normalizeTemp(valueCelsius: number, unit: TempUnit): number {
  if (unit === "C") return valueCelsius;
  return +(valueCelsius * 9 / 5 + 32).toFixed(2);
}

export function isTempCompatible(
  itemMinF?: number,
  itemMaxF?: number,
  locationMinF?: number,
  locationMaxF?: number,
): boolean {
  if (!itemMinF && !itemMaxF) return true;
  if (!locationMinF && !locationMaxF) return false;

  const effectiveMin = locationMinF ?? -40;
  const effectiveMax = locationMaxF ?? 100;

  if (itemMinF !== undefined && effectiveMax < itemMinF) return false;
  if (itemMaxF !== undefined && effectiveMin > itemMaxF) return false;
  return true;
}
