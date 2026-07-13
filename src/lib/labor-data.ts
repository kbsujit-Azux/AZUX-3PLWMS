/**
 * ============================================================
 *  MODULE INDEX — Labor Management: Engineered Labor Standards
 * ============================================================
 *
 *  Purpose: Engineered Labor Standards (ELS) for 3PL warehouse tasks.
 *           These standards define the "engineered" time it should take
 *           a trained worker to complete each task type. They are used
 *           to compute efficiency % = standardSec / actualSec * 100.
 *
 *  Standards are defined per task type (aligned with RF movement types).
 *  Each standard has a fixed overhead (secFixed) + variable per-unit time (secPerUnit).
 *
 *  Formula: standardSec = secFixed + secPerUnit * qty
 *
 *  Extension points:
 *    - Add new task types to LABOR_STANDARDS array
 *    - Tune secFixed/secPerUnit based on time studies
 *    - Add per-client or per-warehouse overrides
 * ============================================================
 */

import type { LaborStandard, LaborTaskType } from "./rf-types";

/**
 * Engineered Labor Standards (ELS) for 3PL warehouse tasks.
 *
 * secFixed = fixed overhead seconds per task (walk to location, scan badge, confirm)
 * secPerUnit = variable seconds per unit (per line, per case, per pallet)
 * uom = unit of measure for qty in the formula
 *
 * These values are starting estimates; calibrate with time studies per site.
 */
export const LABOR_STANDARDS: LaborStandard[] = [
  {
    taskType: "DIRECTED_PICK",
    secFixed: 10,      // walk to location, scan location, scan item
    secPerUnit: 2.5,   // per pick line
    uom: "line",
    description: "Directed pick per line item",
  },
  {
    taskType: "PUTAWAY",
    secFixed: 25,      // drive to location, scan location, place pallet
    secPerUnit: 0,     // per pallet (fixed)
    uom: "pallet",
    description: "Putaway per pallet",
  },
  {
    taskType: "MOVE_PALLET",
    secFixed: 15,      // drive to origin, pick up, drive to dest, place
    secPerUnit: 0,     // per pallet
    uom: "pallet",
    description: "Pallet move between locations",
  },
  {
    taskType: "DOCK_RECEIVING",
    secFixed: 20,      // scan container, scan pallet, label
    secPerUnit: 0,     // per pallet
    uom: "pallet",
    description: "Dock receiving per pallet",
  },
];

/**
 * Look up the labor standard for a given task type.
 * Returns the standard or undefined if not found.
 */
export function getLaborStandard(taskType: LaborTaskType): LaborStandard | undefined {
  return LABOR_STANDARDS.find((s) => s.taskType === taskType);
}

/**
 * Compute the engineered standard time in seconds for a task.
 *
 * Formula: standardSec = secFixed + secPerUnit * qty
 *
 * @param taskType - The labor task type
 * @param qty - Quantity in the standard's UOM (lines, cases, pallets)
 * @returns Engineered standard time in seconds, or 0 if no standard found
 */
export function computeStandardSec(taskType: string, qty: number): number {
  const standard = LABOR_STANDARDS.find((s) => s.taskType === taskType);
  if (!standard) return 0;
  return Math.max(0, standard.secFixed + standard.secPerUnit * qty);
}

/**
 * Compute efficiency percentage from actual vs standard seconds.
 * Returns percentage rounded to nearest integer, capped at reasonable bounds.
 */
export function computeEfficiencyPct(standardSec: number, actualSec: number): number {
  if (standardSec <= 0 || actualSec <= 0) return 100;
  const pct = Math.round((standardSec / actualSec) * 100);
  return Math.min(999, Math.max(0, pct)); // cap between 0-999%
}

/**
 * Extract aisle identifier from a location ID.
 * Location format: "A12-03-B" -> returns "12" (aisle number)
 * Handles variations: "ATL1·A12-03-B" -> "12", "DROP-AISLE-A" -> "DROP-AISLE-A"
 */
export function getAisleFromLocation(locId: string): string {
  if (!locId) return "UNKNOWN";

  // Strip warehouse prefix like "ATL1·" or "WH1-"
  const clean = locId.replace(/^[A-Z0-9]+[·\-]/, "");

  // Match patterns like "A12-03-B" -> extract "12"
  const match = clean.match(/[A-Z]?(\d+)[\-\s]/);
  if (match) return match[1];

  // Fallback: return first alphanumeric segment
  const parts = clean.split(/[\-\s_]/);
  return parts[0] || "UNKNOWN";
}