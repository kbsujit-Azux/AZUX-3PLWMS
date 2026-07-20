/**
 * ============================================================
 *  MODULE INDEX — Catch Weight Management
 * ============================================================
 *
 *  Purpose: Variable weight tracking for food/beverage 3PLs.
 *           Items are billed or tracked by actual weight rather
 *           than strict units.
 *
 *  Key types exported:
 *    • CatchWeightItem             — Master config for catch-weight SKUs
 *    • CatchWeightLog              — Transaction-level weight capture
 *    • CatchWeightTransactionType  — Transaction context
 *
 *  Data:
 *    • catchWeightItems[]          — Mock master records
 *    • catchWeightLogs[]           — Mock transaction logs
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    fetchCatchWeightItems / subscribeCatchWeightItems / createCatchWeightItem / updateCatchWeightItem
 *    fetchCatchWeightLogs / subscribeCatchWeightLogs / createCatchWeightLog
 *
 *  Extension points:
 *    - Add scale API integration
 *    - Add rolling average weight calculation
 *    - Add billing weight vs actual weight reconciliation
 * ============================================================
 */

export type CatchWeightTransactionType = "RECEIVE" | "PICK" | "MOVE" | "ADJUST" | "SHIP";

export type CatchWeightItem = {
  sku: string;
  tenantId: string;
  warehouseId: string;
  catchWeightEnabled: boolean;
  unitType: "each" | "case" | "pallet";
  targetWeightLbs: number;
  weightTolerancePct: number;
  tareWeightLbs: number;
  minWeightLbs: number;
  maxWeightLbs: number;
  billByWeight: boolean;
};

export type CatchWeightLog = {
  id: string;
  tenantId: string;
  warehouseId: string;
  sku: string;
  batchId: string;
  locationId: string;
  transactionType: CatchWeightTransactionType;
  transactionRef: string;
  grossWeightLbs: number;
  tareWeightLbs: number;
  netWeightLbs: number;
  avgWeightLbs?: number;
  weightVariancePct?: number;
  capturedAt: string;
  capturedBy: string;
  scaleId?: string;
};

const ts = (d: string) => new Date(d).toISOString();

export const catchWeightItems: CatchWeightItem[] = [
  {
    sku: "VRD-COLL-30CT",
    tenantId: "verdant",
    warehouseId: "ord2",
    catchWeightEnabled: true,
    unitType: "case",
    targetWeightLbs: 12.5,
    weightTolerancePct: 5,
    tareWeightLbs: 0.5,
    minWeightLbs: 11.0,
    maxWeightLbs: 14.5,
    billByWeight: true,
  },
  {
    sku: "VRD-MAG-GLY",
    tenantId: "verdant",
    warehouseId: "ord2",
    catchWeightEnabled: true,
    unitType: "case",
    targetWeightLbs: 18.0,
    weightTolerancePct: 4,
    tareWeightLbs: 0.8,
    minWeightLbs: 16.0,
    maxWeightLbs: 20.0,
    billByWeight: true,
  },
];

export const catchWeightLogs: CatchWeightLog[] = [
  {
    id: "CWL-2026-0519-001",
    tenantId: "verdant",
    warehouseId: "atl1",
    sku: "VRD-COLL-30CT",
    batchId: "B-24277",
    locationId: "G01-01-A",
    transactionType: "RECEIVE",
    transactionRef: "RCV-2026-0519-001",
    grossWeightLbs: 13.0,
    tareWeightLbs: 0.5,
    netWeightLbs: 12.5,
    capturedAt: ts("2026-05-19T07:15:00Z"),
    capturedBy: "a.volkov",
    scaleId: "SCL-01",
  },
];

export function validateCatchWeight(
  log: CatchWeightLog,
  item: CatchWeightItem,
): { valid: boolean; reason?: string } {
  if (log.netWeightLbs < item.minWeightLbs || log.netWeightLbs > item.maxWeightLbs) {
    return {
      valid: false,
      reason: `Net weight ${log.netWeightLbs} lbs outside bounds [${item.minWeightLbs}, ${item.maxWeightLbs}]`,
    };
  }

  const variance = Math.abs(log.netWeightLbs - item.targetWeightLbs) / item.targetWeightLbs * 100;
  if (variance > item.weightTolerancePct) {
    return {
      valid: false,
      reason: `Variance ${variance.toFixed(1)}% exceeds tolerance ${item.weightTolerancePct}%`,
    };
  }

  return { valid: true };
}

export function computeCatchWeightStats(
  logs: CatchWeightLog[],
  sku: string,
): { avgWeight: number; stdDev: number; min: number; max: number; count: number } {
  const skuLogs = logs.filter((l) => l.sku === sku);
  if (skuLogs.length === 0) return { avgWeight: 0, stdDev: 0, min: 0, max: 0, count: 0 };

  const weights = skuLogs.map((l) => l.netWeightLbs);
  const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
  const variance = weights.reduce((sum, w) => sum + (w - avg) ** 2, 0) / weights.length;
  const stdDev = Math.sqrt(variance);

  return {
    avgWeight: +avg.toFixed(2),
    stdDev: +stdDev.toFixed(2),
    min: Math.min(...weights),
    max: Math.max(...weights),
    count: skuLogs.length,
  };
}
