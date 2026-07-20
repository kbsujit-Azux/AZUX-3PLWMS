/**
 * ============================================================
 *  MODULE INDEX — Cycle Counting & Physical Inventory
 * ============================================================
 *
 *  Purpose: Blind cycle counting schedules, ABC analysis
 *           slotting integration, and discrepancy reconciliation
 *           workflows for physical inventory accuracy.
 *
 *  Key types exported:
 *    • CycleCount              — Count header
 *    • CycleCountLine          — Per-location count detail
 *    • CountSchedule           — Scheduled count template
 *    • AbcClass                — A/B/C/D classification
 *
 *  Data:
 *    • cycleCounts[]           — Mock active counts
 *    • countSchedules[]        — Recurring schedule templates
 *
 *  Helper functions:
 *    • classifyAbc()           — ABC classification by annual usage value
 *    • generateCycleCountSchedule() — Auto-generate counts by class
 *    • computeVariance()       — Count vs expected
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    fetchCycleCounts / subscribeCycleCounts / createCycleCount / updateCycleCount
 *    fetchCycleCountLines / subscribeCycleCountLines / createCycleCountLine / updateCycleCountLine
 *    fetchCountSchedules / subscribeCountSchedules / createCountSchedule / updateCountSchedule
 *
 *  Extension points:
 *    - Add count reason codes (shrinkage, damage, receiving error)
 *    - Add snapshot inventory freeze logic
 *    - Add RF Gun blind count mode
 * ============================================================
 */

import type { InventoryItem, InventoryBatch } from "./mock-data";
import type { MovementHistory } from "./rf-types";

export type AbcClass = "A" | "B" | "C" | "D";

export type CountType = "CYCLE" | "ANNUAL" | "ADHOC" | "BLIND";

export type CountStatus =
  | "scheduled"
  | "in_progress"
  | "counted"
  | "reviewed"
  | "adjusted"
  | "closed"
  | "cancelled";

export type VarianceReason =
  | "SHRINKAGE"
  | "DAMAGE"
  | "RECEIVING_ERROR"
  | "PICKING_ERROR"
  | "PUTAWAY_ERROR"
  | "SYSTEM_ERROR"
  | "UNACCOUNTED"
  | "OTHER";

export type CountPriority = "low" | "medium" | "high" | "critical";

export type CountScheduleFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual";

export type CountSchedule = {
  id: string;
  tenantId: string;
  warehouseId: string;
  name: string;
  countType: CountType;
  abcClass?: AbcClass;
  locationIds?: string[];
  skus?: string[];
  frequency: CountScheduleFrequency;
  nextRunAt: string;
  lastRunAt?: string;
  varianceTolerancePct: number;
  autoAdjust: boolean;
  active: boolean;
  createdAt: string;
  createdBy: string;
};

export type CycleCount = {
  id: string;
  tenantId: string;
  warehouseId: string;
  countType: CountType;
  status: CountStatus;
  priority: CountPriority;

  scheduledDate: string;
  startedAt?: string;
  completedAt?: string;

  abcClass?: AbcClass;
  locationIds?: string[];
  skus?: string[];

  assignedTo?: string;
  team?: string;

  totalLines: number;
  countedLines: number;
  varianceLines: number;
  adjustedLines: number;

  notes?: string;
  createdAt: string;
  createdBy: string;
};

export type CycleCountLine = {
  id: string;
  countId: string;
  locationId: string;
  sku: string;
  batchId?: string;
  upc?: string;
  description?: string;

  expectedQty: number;
  expectedWeightLbs?: number;

  countedQty: number;
  countedWeightLbs?: number;
  countedAt?: string;
  countedBy?: string;

  varianceQty?: number;
  variancePct?: number;
  varianceWeightLbs?: number;

  varianceReason?: VarianceReason;
  varianceNotes?: string;

  adjustmentQty?: number;
  adjustmentWeightLbs?: number;
  adjusted: boolean;
  adjustedAt?: string;
  adjustedBy?: string;

  supervisorReview: boolean;
  supervisorApproved?: boolean;
  supervisorNotes?: string;
};

const ts = (d: string) => new Date(d).toISOString();

export const cycleCounts: CycleCount[] = [
  {
    id: "CC-2026-0519-001",
    tenantId: "acme",
    warehouseId: "atl1",
    countType: "CYCLE",
    status: "in_progress",
    priority: "high",
    scheduledDate: ts("2026-05-19T08:00:00Z"),
    startedAt: ts("2026-05-19T08:15:00Z"),
    abcClass: "A",
    assignedTo: "j.patel",
    team: "Alpha",
    totalLines: 12,
    countedLines: 5,
    varianceLines: 0,
    adjustedLines: 0,
    createdAt: ts("2026-05-18T14:00:00Z"),
    createdBy: "s.becker",
  },
  {
    id: "CC-2026-0519-002",
    tenantId: "northstar",
    warehouseId: "ord2",
    countType: "BLIND",
    status: "scheduled",
    priority: "medium",
    scheduledDate: ts("2026-05-20T06:00:00Z"),
    abcClass: "B",
    assignedTo: "m.alvarez",
    team: "Bravo",
    totalLines: 24,
    countedLines: 0,
    varianceLines: 0,
    adjustedLines: 0,
    createdAt: ts("2026-05-19T09:00:00Z"),
    createdBy: "s.becker",
  },
];

export const countSchedules: CountSchedule[] = [
  {
    id: "SCH-001",
    tenantId: "acme",
    warehouseId: "atl1",
    name: "Class A Monthly Cycle",
    countType: "CYCLE",
    abcClass: "A",
    frequency: "monthly",
    nextRunAt: ts("2026-06-01T06:00:00Z"),
    lastRunAt: ts("2026-05-01T06:00:00Z"),
    varianceTolerancePct: 2,
    autoAdjust: false,
    active: true,
    createdAt: ts("2026-01-15T00:00:00Z"),
    createdBy: "system",
  },
  {
    id: "SCH-002",
    tenantId: "northstar",
    warehouseId: "ord2",
    name: "Class B Quarterly Cycle",
    countType: "CYCLE",
    abcClass: "B",
    frequency: "quarterly",
    nextRunAt: ts("2026-07-01T06:00:00Z"),
    lastRunAt: ts("2026-04-01T06:00:00Z"),
    varianceTolerancePct: 3,
    autoAdjust: false,
    active: true,
    createdAt: ts("2026-01-15T00:00:00Z"),
    createdBy: "system",
  },
];

export function classifyAbc(
  inventoryItems: InventoryItem[],
  movements: MovementHistory[],
  windowDays = 365,
): Map<string, AbcClass> {
  const classes = new Map<string, AbcClass>();
  const usageValue = new Map<string, number>();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const relevantMovements = movements.filter((m) => {
    const t = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp as unknown as string);
    return t >= cutoff;
  });

  for (const item of inventoryItems) {
    const sku = item.sku;
    const unitCost = item.unitCost;
    const skuMovements = relevantMovements.filter((m) => m.itemCode === sku);
    const totalQty = skuMovements.reduce((sum, m) => sum + m.movedQty, 0);
    usageValue.set(sku, totalQty * unitCost);
  }

  const sorted = [...usageValue.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, val]) => sum + val, 0);
  let cumulative = 0;

  for (const [sku, value] of sorted) {
    cumulative += value;
    const pct = total > 0 ? cumulative / total : 0;

    if (pct <= 0.20) classes.set(sku, "A");
    else if (pct <= 0.50) classes.set(sku, "B");
    else if (pct <= 0.80) classes.set(sku, "C");
    else classes.set(sku, "D");
  }

  return classes;
}

export function generateCycleCountSchedule(
  warehouseId: string,
  abcClass: AbcClass,
  locationIds: string[],
): string[] {
  const frequencyByClass: Record<AbcClass, number> = {
    A: 30,
    B: 90,
    C: 180,
    D: 365,
  };

  const days = frequencyByClass[abcClass];
  const now = new Date();
  const eligible: string[] = [];

  for (const locId of locationIds) {
    const lastCountDate = new Date(now.getTime() - Math.floor(Math.random() * days * 1.5 * 24 * 60 * 60 * 1000));
    const nextDue = new Date(lastCountDate.getTime() + days * 24 * 60 * 60 * 1000);
    if (nextDue <= now) {
      eligible.push(locId);
    }
  }

  return eligible;
}

export function computeVariance(
  expectedQty: number,
  countedQty: number,
  expectedWeightLbs?: number,
  countedWeightLbs?: number,
): { varianceQty: number; variancePct: number; varianceWeightLbs?: number } {
  const varianceQty = countedQty - expectedQty;
  const variancePct = expectedQty !== 0 ? (varianceQty / expectedQty) * 100 : (countedQty !== 0 ? 100 : 0);
  const varianceWeightLbs =
    expectedWeightLbs !== undefined && countedWeightLbs !== undefined
      ? countedWeightLbs - expectedWeightLbs
      : undefined;

  return { varianceQty, variancePct, varianceWeightLbs };
}

export function getAbcClassColor(abcClass: AbcClass): "default" | "destructive" | "outline" | "secondary" {
  switch (abcClass) {
    case "A":
      return "destructive";
    case "B":
      return "default";
    case "C":
      return "secondary";
    case "D":
      return "outline";
  }
}

export function getCountTypeLabel(countType: CountType): string {
  switch (countType) {
    case "CYCLE":
      return "Cycle Count";
    case "ANNUAL":
      return "Annual Physical";
    case "ADHOC":
      return "Ad-Hoc Count";
    case "BLIND":
      return "Blind Count";
  }
}

export function getCountStatusLabel(status: CountStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "counted":
      return "Counted";
    case "reviewed":
      return "Reviewed";
    case "adjusted":
      return "Adjusted";
    case "closed":
      return "Closed";
    case "cancelled":
      return "Cancelled";
  }
}
