/**
 * ============================================================
 *  MODULE INDEX — Advanced Billing Engine
 * ============================================================
 *
 *  Purpose: Core billing computation logic for enterprise 3PL
 *           revenue leakage prevention. Handles:
 *           - 3D Volumetric Storage Billing
 *           - Tiered / Volume-based Pricing
 *           - Minimum Monthly Commitments
 *           - Peak Season Surcharges
 *           - Accessorial Charge Matching
 *           - Invoice Line Generation from BillableEvents
 *
 *  Data dependencies:
 *    - ChargeRule (from billing-data.ts)
 *    - BillableEvent (from billing-data.ts)
 *    - Pallet (from pallet-data.ts) for cube computation
 *    - LocationRecord (from master-data.ts) for location cube
 *
 *  Extension points:
 *    - Add new charge rule types (e.g., weight-based, value-based)
 *    - Add accrual accounting for unbilled periods
 *    - Add multi-currency support
 * ============================================================
 */

import type {
  ChargeRule,
  BillableEvent,
  PriceTier,
  AccessorialType,
  InvoiceLine,
  RateUnit,
  Invoice,
  BillingAuditLog,
} from "./billing-data";
import type { Pallet } from "./pallet-data";
import type { LocationRecord } from "./master-data";
import { computePalletCubeCuFt } from "./pallet-data";

export interface MatchedBillableEvent {
  event: BillableEvent;
  rule: ChargeRule;
  rate: number;
  total: number;
  tierBreakdown?: { effectiveRate: number; breakdown: { minQty: number; maxQty: number | null; rate: number }[] };
  peakSurcharge?: { baseAmount: number; surchargePct: number; totalAmount: number };
}

/** Compute which PriceTier applies for a given quantity */
export function computeTieredRate(qty: number, tiers: PriceTier[]): number {
  if (!tiers || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  for (const tier of sorted) {
    if (tier.maxQty === null || qty <= tier.maxQty) {
      return tier.rate;
    }
  }
  return sorted[sorted.length - 1].rate;
}

/** Apply peak season surcharge if date falls in peak window */
export function applyPeakSurcharge(
  amount: number,
  surchargePct: number,
  date: Date | string,
  peakStartMonth = 10,
  peakEndMonth = 12,
): number {
  const d = date instanceof Date ? date : new Date(date);
  const month = d.getMonth() + 1; // 1-12
  if (month >= peakStartMonth && month <= peakEndMonth) {
    return +(amount * (1 + surchargePct / 100)).toFixed(2);
  }
  return amount;
}

/** Enforce minimum monthly charge */
export function enforceMinimum(
  calculatedTotal: number,
  minMonthlyCharge: number,
): number {
  return Math.max(calculatedTotal, minMonthlyCharge);
}

/** Match a BillableEvent to the best ChargeRule */
export function matchEventToRule(
  event: BillableEvent,
  rules: ChargeRule[],
): ChargeRule | null {
  const candidates = rules.filter((r) => {
    if (!r.enabled) return false;
    if (event.type !== r.category && !(r.category === "Custom" && event.type === "Custom")) return false;
    if (event.unit !== r.unit && !(r.unit === "flat" && event.unit === "flat")) return false;
    if (r.warehouseId && event.warehouseId !== r.warehouseId) return false;
    if (r.locationId && event.locationId !== r.locationId) return false;
    // Accessorial type matching
    if (r.accessorialType && event.accessorialType !== r.accessorialType) return false;
    return true;
  });

  // Prefer most specific (warehouse + location) > warehouse > global
  candidates.sort((a, b) => {
    const aSpec = (a.locationId ? 3 : 0) + (a.warehouseId ? 2 : 0) + (a.accessorialType ? 1 : 0);
    const bSpec = (b.locationId ? 3 : 0) + (b.warehouseId ? 2 : 0) + (b.accessorialType ? 1 : 0);
    return bSpec - aSpec;
  });

  return candidates[0] || null;
}

/** Build invoice lines from unbilled events using ChargeRules */
export function buildInvoiceLinesFromEvents(
  events: BillableEvent[],
  rules: ChargeRule[],
  asOfDate: Date = new Date(),
): { lines: InvoiceLine[]; matchedEventIds: string[] } {
  const lines: InvoiceLine[] = [];
  const matchedIds: string[] = [];

  for (const event of events) {
    if (event.billed) continue;

    const rule = matchEventToRule(event, rules);
    if (!rule) continue;

    let rate = rule.rate;

    // Apply tiered pricing if defined
    if (rule.priceTiers && rule.priceTiers.length > 0) {
      rate = computeTieredRate(event.quantity, rule.priceTiers);
    }

    let total = +(event.quantity * rate).toFixed(2);

    // Apply peak surcharge if applicable
    if (rule.peakSurchargePct && rule.peakSurchargePct > 0) {
      total = applyPeakSurcharge(total, rule.peakSurchargePct, event.date, rule.peakStartMonth, rule.peakEndMonth);
    }

    lines.push({
      id: `ln-${event.id}`,
      activityType: event.type,
      description: `${event.description} (${event.reference})`,
      quantity: event.quantity,
      rate,
      total,
    });

    matchedIds.push(event.id);
  }

  return { lines, matchedEventIds: matchedIds };
}

/** Apply minimum monthly charges per rule category */
export function applyMinimumCharges(
  lines: InvoiceLine[],
  rules: ChargeRule[],
): InvoiceLine[] {
  // Group lines by activity type
  const totalsByType = new Map<string, { sum: number; lineIds: string[] }>();
  for (const line of lines) {
    const entry = totalsByType.get(line.activityType) || { sum: 0, lineIds: [] };
    entry.sum += line.total;
    entry.lineIds.push(line.id);
    totalsByType.set(line.activityType, entry);
  }

  const adjustedLines = [...lines];

  // For each rule with a minimum, check if category total meets it
  for (const rule of rules) {
    if (!rule.minMonthlyCharge || rule.minMonthlyCharge <= 0) continue;
    const categoryTotal = totalsByType.get(rule.category);
    if (!categoryTotal) continue;
    if (categoryTotal.sum >= rule.minMonthlyCharge) continue;

    const shortfall = +(rule.minMonthlyCharge - categoryTotal.sum).toFixed(2);
    // Add a minimum adjustment line
    adjustedLines.push({
      id: `min-adj-${rule.id}`,
      activityType: rule.category,
      description: `Minimum commitment adjustment (${rule.description})`,
      quantity: 1,
      rate: shortfall,
      total: shortfall,
    });
  }

  return adjustedLines;
}

/** Compute volumetric storage snapshots for a client/warehouse */
export type VolumetricStorageSnapshot = {
  clientId: string;
  tenantId: string;
  warehouseId: string;
  locationId: string;
  palletId: string;
  sku: string;
  cubeCuFt: number;
  daysInStorage: number;
  ratePerCuFtPerMonth: number;
  lineTotal: number;
};

export function computeLocationUtilizationCubicFeet(
  pallets: Pallet[],
  location: LocationRecord,
): { usedCuFt: number; capacityCuFt: number; utilizationPct: number } {
  const totalCube = pallets.reduce((sum, p) => sum + (p.cubeCuFt || computePalletCubeCuFt(p)), 0);
  const locCube = location.cubicFeet || computeLocationCubicFeet(location);
  return {
    usedCuFt: totalCube,
    capacityCuFt: locCube,
    utilizationPct: locCube > 0 ? +((totalCube / locCube) * 100).toFixed(1) : 0,
  };
}

export function computeLocationCubicFeet(l: LocationRecord): number {
  if (l.cubicFeet && l.cubicFeet > 0) return l.cubicFeet;
  const lFt = l.lengthFt ?? 0;
  const wFt = l.widthFt ?? 0;
  const hFt = l.heightFt ?? 0;
  return lFt * wFt * hFt;
}

export async function buildVolumetricStorageSnapshots(
  pallets: Pallet[],
  locations: Map<string, LocationRecord>,
  clientId: string,
  tenantId: string,
  warehouseId: string,
  ratePerCuFtPerMonth: number,
  asOfDate: Date = new Date(),
): Promise<VolumetricStorageSnapshot[]> {
  const snapshots: VolumetricStorageSnapshot[] = [];

  for (const pallet of pallets) {
    if (pallet.tenantId !== tenantId || pallet.warehouseId !== warehouseId) continue;
    if (pallet.status !== "putaway" || !pallet.location) continue;

    const cubeCuFt = pallet.cubeCuFt || computePalletCubeCuFt(pallet);
    if (cubeCuFt <= 0) continue;

    const receivedAt = new Date(pallet.receivedAt);
    const daysInStorage = Math.max(1, Math.ceil((asOfDate.getTime() - receivedAt.getTime()) / (1000 * 60 * 60 * 24)));

    // Pro-rate monthly rate by days in storage
    const monthlyRate = ratePerCuFtPerMonth;
    const dailyRate = monthlyRate / 30;
    const lineTotal = +(cubeCuFt * dailyRate * daysInStorage).toFixed(2);

    snapshots.push({
      clientId,
      tenantId,
      warehouseId,
      locationId: pallet.location,
      palletId: pallet.id,
      sku: pallet.sku,
      cubeCuFt,
      daysInStorage,
      ratePerCuFtPerMonth: monthlyRate,
      lineTotal,
    });
  }

  return snapshots;
}

/** Generate volumetric storage invoice lines from snapshots */
export function buildVolumetricStorageLines(
  snapshots: VolumetricStorageSnapshot[],
): InvoiceLine[] {
  // Group by location for summary lines, or keep per-pallet detail
  const lines: InvoiceLine[] = [];

  for (const snap of snapshots) {
    lines.push({
      id: `vol-${snap.palletId}`,
      activityType: "Storage",
      description: `Volumetric storage: ${snap.cubeCuFt} cu ft @ ${snap.locationId} (${snap.daysInStorage} days)`,
      quantity: snap.cubeCuFt,
      rate: snap.ratePerCuFtPerMonth,
      total: snap.lineTotal,
    });
  }

  return lines;
}

/** Build complete invoice lines from matched events, applying minimums per category */
export function buildInvoiceLines(
  matched: MatchedBillableEvent[],
  rules: ChargeRule[],
): InvoiceLine[] {
  // Group by rule category to apply minimums
  const byCategory = new Map<string, typeof matched>();
  for (const m of matched) {
    const cat = m.rule?.category || "Unknown";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(m);
  }

  const lines: InvoiceLine[] = [];

  for (const [category, items] of byCategory) {
    // Check if any rule in this category has a minimum
    const categoryRules = rules.filter((r) => r.category === category && r.enabled);
    const minRule = categoryRules.find((r) => r.minMonthlyCharge && r.minMonthlyCharge > 0);

    let categoryTotal = 0;
    for (const item of items) {
      lines.push({
        id: `ln-${item.event.id}`,
        activityType: category,
        description: `${item.event.description} (${item.event.reference})`,
        quantity: item.event.quantity,
        rate: item.rate,
        total: item.total,
      });
      categoryTotal += item.total;
    }

    // Apply minimum charge if needed
    if (minRule && categoryTotal < minRule.minMonthlyCharge!) {
      const adjustment = +(minRule.minMonthlyCharge! - categoryTotal).toFixed(2);
      lines.push({
        id: `min-adj-${minRule.id}`,
        activityType: category,
        description: `Minimum monthly commitment adjustment (${category})`,
        quantity: 1,
        rate: adjustment,
        total: adjustment,
      });
    }
  }

  return lines;
}

/** Match accessorial events to accessorial rules */
export function matchAccessorialEvent(
  event: BillableEvent,
  rules: ChargeRule[],
): ChargeRule | null {
  if (event.type !== "Custom" || !event.accessorialType) return null;
  return matchEventToRule(event, rules);
}

/** Attempt to auto-capture a billable event if an enabled autoCapture rule matches.
 *  Returns the created BillableEvent or undefined if no rule matched / capture disabled.
 */
export async function maybeCaptureBillableEvent(params: {
  clientId: string;
  tenantId: string;
  warehouseId?: string;
  type: BillableEvent["type"];
  reference: string;
  description: string;
  quantity: number;
  unit: BillableEvent["unit"];
  accessorialType?: BillableEvent["accessorialType"];
  rules: ChargeRule[];
  createEvent: (evt: BillableEvent) => Promise<string | void>;
}): Promise<BillableEvent | undefined> {
  const { clientId, tenantId, warehouseId, type, reference, description, quantity, unit, accessorialType, rules, createEvent } = params;

  const mockEvent: BillableEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    tenantId,
    warehouseId,
    date: new Date().toISOString().slice(0, 10),
    type,
    reference,
    description,
    quantity,
    unit,
    billed: false,
    accessorialType,
  };

  const rule = rules.find((r) => {
    if (!r.enabled || !r.autoCapture) return false;
    if (r.clientId !== clientId) return false;
    if (r.category !== type && !(r.category === "Custom" && type === "Custom")) return false;
    if (r.unit !== unit && !(r.unit === "flat" && unit === "flat")) return false;
    if (r.warehouseId && warehouseId && r.warehouseId !== warehouseId) return false;
    if (r.accessorialType && accessorialType && r.accessorialType !== accessorialType) return false;
    return true;
  });

  if (!rule) return undefined;

  await createEvent(mockEvent);
  return mockEvent;
}

/** Format rate unit for display including volumetric */
export function billingUnitLabel(unit: RateUnit | "flat"): string {
  switch (unit) {
    case "carton":
      return "per carton";
    case "pallet":
      return "per pallet";
    case "container":
      return "per container";
    case "bol":
      return "per BOL";
    case "location":
      return "per location / month";
    case "warehouse":
      return "per warehouse / month";
    case "cubicFeet":
      return "per cu ft / month";
    case "flat":
      return "flat";
  }
}

// ============================================================
// Accrual Accounting — Unbilled Period Tracking
// ============================================================

export type BillableAccrual = {
  id: string;
  clientId: string;
  tenantId: string;
  warehouseId?: string;
  category: ChargeRule["category"];
  description: string;
  amount: number;
  accrualDate: string;
  billableEventId?: string;
  status: "open" | "billed" | "adjusted";
  notes?: string;
};

export function buildAccrualsFromEvents(events: BillableEvent[], rules: ChargeRule[]): BillableAccrual[] {
  const accruals: BillableAccrual[] = [];
  for (const event of events) {
    if (event.billed) continue;
    const rule = matchEventToRule(event, rules);
    if (!rule) continue;

    let rate = rule.rate;
    if (rule.priceTiers && rule.priceTiers.length > 0) {
      rate = computeTieredRate(event.quantity, rule.priceTiers);
    }
    let total = +(event.quantity * rate).toFixed(2);
    if (rule.peakSurchargePct && rule.peakSurchargePct > 0) {
      total = applyPeakSurcharge(total, rule.peakSurchargePct, event.date, rule.peakStartMonth, rule.peakEndMonth);
    }

    accruals.push({
      id: `accr-${event.id}`,
      clientId: event.clientId,
      tenantId: event.tenantId,
      warehouseId: event.warehouseId,
      category: event.type,
      description: `${event.description} (${event.reference})`,
      amount: total,
      accrualDate: event.date,
      billableEventId: event.id,
      status: "open",
    });
  }
  return accruals;
}

export function summarizeAccrualsByClient(accruals: BillableAccrual[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const a of accruals) {
    if (a.status !== "open") continue;
    totals.set(a.clientId, (totals.get(a.clientId) || 0) + a.amount);
  }
  return totals;
}

// ============================================================
// Payments, Credits, Disputes
// ============================================================

export function recordPayment(invoice: Invoice, payment: { amount: number; paymentDate: string; paymentMethod: string; reference?: string; notes?: string }): Invoice {
  const total = lineTotal(invoice);
  const newPaidTotal = (invoice.paidDate ? total : 0) + payment.amount;
  const isPaid = newPaidTotal >= total;

  return {
    ...invoice,
    status: isPaid ? "Paid" : "Sent",
    paidDate: isPaid ? payment.paymentDate : invoice.paidDate,
    paymentMethod: payment.paymentMethod,
    notes: payment.notes ? `${invoice.notes ? invoice.notes + "; " : ""}Payment: ${payment.notes}` : invoice.notes,
  };
}

export function issueCreditMemo(invoice: Invoice, creditLines: { description: string; amount: number }[]): Invoice {
  const creditTotal = creditLines.reduce((s, l) => s + l.amount, 0);
  const newLines = [
    ...invoice.lines,
    ...creditLines.map((l, i) => ({
      id: `credit-${Date.now()}-${i}`,
      activityType: "Custom" as const,
      description: `Credit memo: ${l.description}`,
      quantity: 1,
      rate: l.amount,
      total: l.amount,
    })),
  ];

  return {
    ...invoice,
    lines: newLines,
    creditMemoIds: [...(invoice.creditMemoIds || []), `credit-${Date.now()}`],
    notes: `${invoice.notes ? invoice.notes + "; " : ""}Credit memo issued: ${creditTotal}`,
  };
}

export function markInvoiceDisputed(invoice: Invoice, notes: string): Invoice {
  return {
    ...invoice,
    disputeStatus: "disputed",
    disputeNotes: notes,
    status: "Disputed" as const,
  };
}

export function resolveDispute(invoice: Invoice, resolutionNotes: string): Invoice {
  return {
    ...invoice,
    disputeStatus: "resolved",
    notes: `${invoice.notes ? invoice.notes + "; " : ""}Dispute resolved: ${resolutionNotes}`,
  };
}

export function lineTotal(inv: Invoice): number {
  const sub = inv.lines.reduce((s, l) => s + l.total, 0);
  return +(sub * (1 + inv.taxRate)).toFixed(2);
}

export function buildAuditLogEntry(params: {
  tenantId: string;
  actor: string;
  action: BillingAuditLog["action"];
  entityType: BillingAuditLog["entityType"];
  entityId: string;
  changes?: Record<string, { before: any; after: any }>;
  notes?: string;
}): BillingAuditLog {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: params.tenantId,
    actor: params.actor,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    changes: params.changes,
    notes: params.notes,
    timestamp: new Date().toISOString(),
  };
}
