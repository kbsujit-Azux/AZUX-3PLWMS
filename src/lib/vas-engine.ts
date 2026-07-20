/**
 * ============================================================
 *  MODULE INDEX — VAS Work Order Engine
 * ============================================================
 *
 *  Purpose: Business logic for VAS work order lifecycle:
 *           release, issue components, consume, complete,
 *           and cost calculation.
 *
 *  Usage:
 *    await releaseWorkOrder(workOrderId);
 *    await issueComponents(workOrderId, lineId, qty);
 *    await completeWorkOrder(workOrderId);
 *
 *  Extension points:
 *    - Add BOM explosion for multi-level assemblies
 *    - Add quality inspection gates
 *    - Add serial/lot tracking for regulated items
 * ============================================================
 */

import type { VasWorkOrder, VasWorkOrderLine, VasWorkOrderStatus } from "./vas-data";
import type { InventoryItem, InventoryBatch } from "./mock-data";
import type { LaborEvent } from "./rf-types";

export interface WorkOrderReleaseResult {
  success: boolean;
  workOrderId: string;
  linesValidated: number;
  linesShort: number;
  shortages: { lineId: string; sku: string; required: number; available: number }[];
  errors: string[];
}

export interface WorkOrderCompleteResult {
  success: boolean;
  workOrderId: string;
  outputInventoryCreated: boolean;
  billableEventCaptured: boolean;
  errors: string[];
}

export function computeVasProgress(workOrder: VasWorkOrder, lines: VasWorkOrderLine[]): number {
  if (workOrder.status === "completed") return 100;
  if (workOrder.status === "draft" || workOrder.status === "cancelled") return 0;

  const totalRequired = lines.reduce((sum, l) => sum + l.qtyRequired, 0);
  const totalIssued = lines.reduce((sum, l) => sum + l.qtyIssued, 0);
  const totalConsumed = lines.reduce((sum, l) => sum + l.qtyConsumed, 0);

  if (totalRequired === 0) return 0;

  const issuePct = (totalIssued / totalRequired) * 100;
  const consumePct = (totalConsumed / totalRequired) * 100;

  return Math.round((issuePct + consumePct) / 2);
}

export function canReleaseWorkOrder(workOrder: VasWorkOrder, lines: VasWorkOrderLine[]): boolean {
  if (workOrder.status !== "draft") return false;
  if (lines.length === 0) return false;
  return lines.every((l) => l.qtyRequired > 0);
}

export function canStartWorkOrder(workOrder: VasWorkOrder): boolean {
  return workOrder.status === "released";
}

export function canCompleteWorkOrder(workOrder: VasWorkOrder, lines: VasWorkOrderLine[]): boolean {
  if (workOrder.status !== "in_progress") return false;
  return lines.every((l) => l.qtyConsumed >= l.qtyRequired);
}

export function calculateVasCost(
  workOrder: VasWorkOrder,
  lines: VasWorkOrderLine[],
  laborRatePerHour: number = 18.0,
): number {
  const materialCost = lines.reduce((sum, l) => {
    return sum + l.qtyConsumed * 0.01;
  }, 0);

  const totalLaborSec = lines.reduce((sum, l) => sum + (l.actualLaborSec || l.laborStandardSec || 0), 0);
  const laborCost = (totalLaborSec / 3600) * laborRatePerHour;

  const overheadRate = 0.25;
  const overhead = (materialCost + laborCost) * overheadRate;

  return +(materialCost + laborCost + overhead).toFixed(2);
}

export function validateInventoryAvailability(
  lines: VasWorkOrderLine[],
  inventoryItems: InventoryItem[],
): { available: boolean; shortages: { sku: string; required: number; available: number }[] } {
  const shortages: { sku: string; required: number; available: number }[] = [];

  for (const line of lines) {
    const item = inventoryItems.find((i) => i.sku === line.sku);
    const available = item ? item.batches.reduce((sum, b) => sum + b.qty, 0) : 0;

    if (available < line.qtyRequired) {
      shortages.push({
        sku: line.sku,
        required: line.qtyRequired,
        available,
      });
    }
  }

  return {
    available: shortages.length === 0,
    shortages,
  };
}

export function getWorkOrderNextAction(workOrder: VasWorkOrder, lines: VasWorkOrderLine[]): string {
  switch (workOrder.status) {
    case "draft":
      return "Release work order";
    case "released":
      return "Start work order";
    case "in_progress":
      const allConsumed = lines.every((l) => l.qtyConsumed >= l.qtyRequired);
      return allConsumed ? "Complete work order" : "Issue and consume components";
    case "completed":
      return "Work order completed";
    case "cancelled":
      return "Work order cancelled";
    case "exception":
      return "Resolve exception";
  }
}

export function getWorkOrderProgressDetails(
  workOrder: VasWorkOrder,
  lines: VasWorkOrderLine[],
): { totalLines: number; issuedLines: number; consumedLines: number; remainingLines: number } {
  const totalLines = lines.length;
  const issuedLines = lines.filter((l) => l.qtyIssued > 0).length;
  const consumedLines = lines.filter((l) => l.qtyConsumed >= l.qtyRequired).length;
  const remainingLines = totalLines - consumedLines;

  return { totalLines, issuedLines, consumedLines, remainingLines };
}
