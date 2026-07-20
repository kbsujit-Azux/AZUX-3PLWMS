/**
 * ============================================================
 *  MODULE INDEX — Compliance Validator
 * ============================================================
 *
 *  Purpose: Validate item-to-location compatibility for
 *           hazmat, temperature-controlled, and access-restricted
 *           inventory.
 * ============================================================
 */

import type { ItemMasterRecord, LocationRecord } from "./master-data";
import type { ValidationResult } from "./compliance-types";

export function validateItemForLocation(
  item: ItemMasterRecord,
  location: LocationRecord,
  _employeeRole?: string,
): ValidationResult {
  if (!item.active) {
    return { valid: false, reason: "Item is inactive in master", severity: "error", ruleId: "item_inactive" };
  }

  if (location.type === "DROP") {
    return { valid: false, reason: "Cannot slot inventory in DROP location", severity: "error", ruleId: "drop_location" };
  }

  if (item.hazmat && !location.hazmatAllowed) {
    return { valid: false, reason: "Hazmat item requires hazmat-approved location", severity: "error", ruleId: "hazmat_restriction" };
  }

  if ((item.storageTempMin !== undefined || item.storageTempMax !== undefined) && !location.tempControlled) {
    return { valid: false, reason: "Temperature-sensitive item requires climate-controlled location", severity: "error", ruleId: "temp_control_required" };
  }

  if (location.tempControlled && (item.storageTempMin !== undefined || item.storageTempMax !== undefined)) {
    const locMin = location.tempMin ?? -40;
    const locMax = location.tempMax ?? 100;
    if (item.storageTempMin !== undefined && locMax < item.storageTempMin) {
      return { valid: false, reason: `Item requires min ${item.storageTempMin}°F, location max is ${locMax}°F`, severity: "error", ruleId: "temp_min_exceeded" };
    }
    if (item.storageTempMax !== undefined && locMin > item.storageTempMax) {
      return { valid: false, reason: `Item requires max ${item.storageTempMax}°F, location min is ${locMin}°F`, severity: "error", ruleId: "temp_max_exceeded" };
    }
  }

  return { valid: true, severity: "info" };
}

export function getValidationBadge(result: ValidationResult): { label: string; className: string } {
  if (result.valid) {
    return { label: "Valid", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
  }
  switch (result.severity) {
    case "error":
      return { label: "Blocked", className: "bg-red-500/20 text-red-400 border-red-500/40" };
    case "warning":
      return { label: "Warning", className: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
    default:
      return { label: "Info", className: "bg-sky-500/20 text-sky-400 border-sky-500/40" };
  }
}
