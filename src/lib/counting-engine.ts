/**
 * ============================================================
 *  MODULE INDEX — Cycle Counting Engine
 * ============================================================
 *
 *  Purpose: Business logic for cycle count execution, ABC
 *           classification, schedule generation, variance
 *           analysis, and inventory adjustment.
 *
 *  Usage:
 *    const classes = classifyAbc(items, movements);
 *    const eligible = generateCycleCountSchedule(warehouseId, "A", locationIds);
 *    const variance = computeCountVariance(expected, actual);
 *
 *  Extension points:
 *    - Add snapshot/inventory freeze logic
 *    - Add predictive count scheduling based on variance history
 *    - Add machine learning for ABC classification
 * ============================================================
 */

import type { InventoryItem, InventoryBatch } from "./mock-data";
import type { MovementHistory, LaborEvent } from "./rf-types";
import type {
  AbcClass,
  CountScheduleFrequency,
  CycleCount,
  CycleCountLine,
  CountSchedule,
  VarianceReason,
} from "./counting-data";
import { classifyAbc, generateCycleCountSchedule, computeVariance } from "./counting-data";

export interface CountExecutionResult {
  countId: string;
  linesProcessed: number;
  variancesFound: number;
  adjustmentsApproved: number;
  adjustmentsRejected: number;
  errors: string[];
}

export interface AbcClassificationResult {
  sku: string;
  itemStyle: string;
  description: string;
  abcClass: AbcClass;
  annualUsageValue: number;
  totalQty: number;
  unitCost: number;
}

export function buildAbcClassificationReport(
  inventoryItems: InventoryItem[],
  movements: MovementHistory[],
  windowDays = 365,
): AbcClassificationResult[] {
  const classes = classifyAbc(inventoryItems, movements, windowDays);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const relevantMovements = movements.filter((m) => {
    const t = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp as unknown as string);
    return t >= cutoff;
  });

  return inventoryItems
    .map((item) => {
      const skuMovements = relevantMovements.filter((m) => m.itemCode === item.sku);
      const totalQty = skuMovements.reduce((sum, m) => sum + m.movedQty, 0);
      const annualUsageValue = totalQty * item.unitCost;

      return {
        sku: item.sku,
        itemStyle: item.itemStyle,
        description: item.description,
        abcClass: classes.get(item.sku) || "D",
        annualUsageValue,
        totalQty,
        unitCost: item.unitCost,
      };
    })
    .sort((a, b) => b.annualUsageValue - a.annualUsageValue);
}

export function computeNextRunDate(frequency: CountScheduleFrequency, lastRunAt: string): string {
  const last = new Date(lastRunAt);
  const next = new Date(last);

  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "semi_annual":
      next.setMonth(next.getMonth() + 6);
      break;
    case "annual":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  return next.toISOString();
}

export function evaluateCountLine(
  line: CycleCountLine,
  tolerancePct: number,
): { varianceWithinTolerance: boolean; requiresSupervisorReview: boolean } {
  const absVariancePct = Math.abs(line.variancePct || 0);

  return {
    varianceWithinTolerance: absVariancePct <= tolerancePct,
    requiresSupervisorReview: absVariancePct > tolerancePct || (line.varianceQty || 0) !== 0,
  };
}

export function suggestVarianceReason(
  line: CycleCountLine,
  inventoryItems: InventoryItem[],
): VarianceReason | undefined {
  const item = inventoryItems.find((i) => i.sku === line.sku);
  if (!item) return "OTHER";

  const absVariancePct = Math.abs(line.variancePct || 0);

  if (absVariancePct > 50) {
    return item.status === "out" ? "SHRINKAGE" : "UNACCOUNTED";
  }

  if (line.varianceQty && line.varianceQty < 0) {
    return "SHRINKAGE";
  }

  if (line.varianceQty && line.varianceQty > 0) {
    return "RECEIVING_ERROR";
  }

  return "OTHER";
}

export function canAutoAdjust(line: CycleCountLine, tolerancePct: number): boolean {
  const absVariancePct = Math.abs(line.variancePct || 0);
  const withinTolerance = absVariancePct <= tolerancePct;
  const noSupervisorFlag = !line.supervisorReview;

  return withinTolerance && noSupervisorFlag && !line.supervisorApproved && line.supervisorApproved !== false;
}

export function buildCountLinesFromInventory(
  countId: string,
  locationIds: string[],
  inventoryItems: InventoryItem[],
  blind = false,
): CycleCountLine[] {
  const lines: CycleCountLine[] = [];

  for (const locId of locationIds) {
    const locItems = inventoryItems.filter((item) =>
      item.batches.some((batch) => batch.location === locId),
    );

    for (const item of locItems) {
      const batches = item.batches.filter((batch) => batch.location === locId);
      const totalQty = batches.reduce((sum, b) => sum + b.qty, 0);

      for (const batch of batches) {
        lines.push({
          id: `CCL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          countId,
          locationId: locId,
          sku: item.sku,
          batchId: batch.batchId,
          upc: item.upc,
          description: blind ? undefined : item.description,
          expectedQty: batch.qty,
          expectedWeightLbs: item.weightLbs * batch.qty,
          countedQty: 0,
          countedWeightLbs: undefined,
          countedAt: undefined,
          countedBy: undefined,
          varianceQty: undefined,
          variancePct: undefined,
          varianceWeightLbs: undefined,
          varianceReason: undefined,
          varianceNotes: undefined,
          adjustmentQty: undefined,
          adjustmentWeightLbs: undefined,
          adjusted: false,
          adjustedAt: undefined,
          adjustedBy: undefined,
          supervisorReview: false,
          supervisorApproved: undefined,
          supervisorNotes: undefined,
        });
      }
    }
  }

  return lines;
}

export function computeCountSummary(count: CycleCount, lines: CycleCountLine[]): Partial<CycleCount> {
  const updates: Partial<CycleCount> = {};

  updates.totalLines = lines.length;
  updates.countedLines = lines.filter((l) => l.countedQty > 0 || l.countedAt !== undefined).length;

  const varianceLines = lines.filter((l) => (l.varianceQty || 0) !== 0);
  updates.varianceLines = varianceLines.length;

  updates.adjustedLines = lines.filter((l) => l.adjusted).length;

  return updates;
}

export function getCountEfficiencyPct(count: CycleCount): number {
  if (count.totalLines === 0) return 0;
  return (count.countedLines / count.totalLines) * 100;
}

export function getVarianceRate(count: CycleCount): number {
  if (count.countedLines === 0) return 0;
  return (count.varianceLines / count.countedLines) * 100;
}
