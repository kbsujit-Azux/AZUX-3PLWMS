/**
 * ============================================================
 *  MODULE INDEX — Catch Weight Engine
 * ============================================================
 *
 *  Purpose: Business logic for catch weight validation,
 *           rolling statistics, and billing weight calculation.
 *
 *  Extension points:
 *    - Add scale API integration for automated capture
 *    - Add trend detection for out-of-spec weights
 * ============================================================
 */

import type { CatchWeightLog, CatchWeightItem } from "./catch-weight-data";

export function computeWeightVariancePct(log: CatchWeightLog, item: CatchWeightItem): number {
  if (item.targetWeightLbs === 0) return 0;
  return Math.abs(log.netWeightLbs - item.targetWeightLbs) / item.targetWeightLbs * 100;
}

export function isWeightOutOfSpec(log: CatchWeightLog, item: CatchWeightItem): boolean {
  return log.netWeightLbs < item.minWeightLbs || log.netWeightLbs > item.maxWeightLbs;
}

export function computeBillingWeight(
  log: CatchWeightLog,
  item: CatchWeightItem,
  qtyUnits: number,
): number {
  if (item.billByWeight) {
    return +(log.netWeightLbs * qtyUnits).toFixed(2);
  }
  return qtyUnits * item.targetWeightLbs;
}
