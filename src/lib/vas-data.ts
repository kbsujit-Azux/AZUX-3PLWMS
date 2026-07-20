/**
 * ============================================================
 *  MODULE INDEX — Value-Added Services (VAS) & Kitting
 * ============================================================
 *
 *  Purpose: Work order management for VAS operations —
 *           kitting, de-kitting, labeling, assembly, re-pack,
 *           and custom packaging. 3PLs generate significant
 *           revenue from these billable services.
 *
 *  Key types exported:
 *    • VasWorkOrder              — VAS work order header
 *    • VasWorkOrderLine          — Component / output line
 *    • VasWorkOrderStatus        — Lifecycle states
 *    • VasWorkOrderType          — Service type enum
 *    • VasLaborEvent             — Time tracking for VAS
 *
 *  Data:
 *    • vasWorkOrders[]           — Mock active work orders
 *    • vasWorkOrderLines[]       — Mock lines
 *
 *  Helper functions:
 *    • vasProgressPct()          — Work order completion %
 *    • vasPriorityColor()        — Badge color by priority
 *    • vasTypeLabel()            — Human-readable type
 *    • vasStatusLabel()          — Human-readable status
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    fetchVasWorkOrders / subscribeVasWorkOrders / createVasWorkOrder / updateVasWorkOrder / deleteVasWorkOrder
 *    fetchVasWorkOrderLines / subscribeVasWorkOrderLines / createVasWorkOrderLine / updateVasWorkOrderLine
 *    batchWriteVasWorkOrderLines
 *
 *  Extension points:
 *    - Add station/location master for VAS work centers
 *    - Add quality inspection workflow
 *    - Add bill of materials (BOM) versioning
 * ============================================================
 */

export type VasWorkOrderType =
  | "KITTING"
  | "DEKITTING"
  | "LABELING"
  | "ASSEMBLY"
  | "REPACK"
  | "CUSTOM";

export type VasWorkOrderStatus =
  | "draft"
  | "released"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "exception";

export type VasPriority = "standard" | "rush" | "same_day";

export type VasWorkOrder = {
  id: string; // VAS-XXXXX
  tenantId: string;
  warehouseId: string;
  orderId?: string; // Link to outbound order (optional)
  clientRef: string; // Client PO or reference
  type: VasWorkOrderType;
  status: VasWorkOrderStatus;
  priority: VasPriority;

  scheduledStartAt: string;
  scheduledEndAt: string;
  startedAt?: string;
  completedAt?: string;

  assignedStation?: string;
  assignedEmployee?: string;

  outputSku?: string;
  outputQty?: number;
  outputUom?: string;

  billable: boolean;
  chargeRuleId?: string;
  estimatedCost?: number;

  notes?: string;
  createdAt: string;
  createdBy: string;
};

export type VasWorkOrderLine = {
  id: string;
  workOrderId: string;
  lineNo: number;

  sku: string;
  description: string;
  qtyRequired: number;
  qtyIssued: number;
  qtyConsumed: number;
  uom: string;

  lotNumber?: string;
  serialNumbers?: string[];

  sourcePalletId?: string;
  sourceLocation?: string;

  laborStandardSec?: number;
  actualLaborSec?: number;
};

export type VasLaborEvent = {
  id: string;
  workOrderId: string;
  lineId?: string;
  badgeId: string;
  employeeName: string;
  warehouseId: string;
  tenantId: string;

  action: "ISSUE" | "CONSUME" | "PACK" | "LABEL" | "ASSEMBLE" | "QA" | "COMPLETE";
  qty: number;
  uom: string;

  startedAt: string;
  completedAt: string;
  durationSec: number;

  notes?: string;
  createdAt: string;
};

const ts = (d: string) => new Date(d).toISOString();

export const vasWorkOrders: VasWorkOrder[] = [
  {
    id: "VAS-2026-0519-001",
    tenantId: "acme",
    warehouseId: "atl1",
    orderId: "SO-2026-4401",
    clientRef: "ACM-VAS-2201",
    type: "KITTING",
    status: "in_progress",
    priority: "rush",
    scheduledStartAt: ts("2026-05-19T07:00:00Z"),
    scheduledEndAt: ts("2026-05-19T10:00:00Z"),
    startedAt: ts("2026-05-19T07:05:00Z"),
    assignedStation: "KIT-01",
    assignedEmployee: "j.patel",
    outputSku: "ACM-TENT-KIT-OLV",
    outputQty: 24,
    outputUom: "KIT",
    billable: true,
    chargeRuleId: "CR-VAS-KIT",
    estimatedCost: 450,
    notes: "Rush order for summer promo",
    createdAt: ts("2026-05-18T16:00:00Z"),
    createdBy: "s.becker",
  },
  {
    id: "VAS-2026-0519-002",
    tenantId: "northstar",
    warehouseId: "ord2",
    clientRef: "NS-LABEL-881",
    type: "LABELING",
    status: "released",
    priority: "standard",
    scheduledStartAt: ts("2026-05-19T09:00:00Z"),
    scheduledEndAt: ts("2026-05-19T11:00:00Z"),
    assignedStation: "LBL-03",
    assignedEmployee: "m.alvarez",
    outputSku: "NSA-HOOD-BLK-M",
    outputQty: 480,
    outputUom: "EA",
    billable: true,
    chargeRuleId: "CR-VAS-LBL",
    estimatedCost: 120,
    createdAt: ts("2026-05-19T06:00:00Z"),
    createdBy: "s.becker",
  },
];

export const vasWorkOrderLines: VasWorkOrderLine[] = [
  {
    id: "VASL-2026-0519-001-01",
    workOrderId: "VAS-2026-0519-001",
    lineNo: 1,
    sku: "ACM-TENT-2P-OLV",
    description: "Ridgeline 2P Tent, Olive",
    qtyRequired: 24,
    qtyIssued: 24,
    qtyConsumed: 0,
    uom: "EA",
    sourceLocation: "A12-03-B",
    laborStandardSec: 120,
  },
  {
    id: "VASL-2026-0519-001-02",
    workOrderId: "VAS-2026-0519-001",
    lineNo: 2,
    sku: "ACM-STV-CMP-01",
    description: "Compact Camp Stove",
    qtyRequired: 24,
    qtyIssued: 0,
    qtyConsumed: 0,
    uom: "EA",
    sourceLocation: "B03-02-A",
    laborStandardSec: 60,
  },
  {
    id: "VASL-2026-0519-001-03",
    workOrderId: "VAS-2026-0519-001",
    lineNo: 3,
    sku: "ACM-LANTERN-LED",
    description: "Trailhead LED Lantern, 400lm",
    qtyRequired: 24,
    qtyIssued: 0,
    qtyConsumed: 0,
    uom: "EA",
    sourceLocation: "C05-01-A",
    laborStandardSec: 45,
  },
  {
    id: "VASL-2026-0519-001-04",
    workOrderId: "VAS-2026-0519-001",
    lineNo: 4,
    sku: "ACM-TENT-BAG-01",
    description: "Tent Storage Bag, Waterproof",
    qtyRequired: 24,
    qtyIssued: 0,
    qtyConsumed: 0,
    uom: "EA",
    sourceLocation: "D02-04-B",
    laborStandardSec: 30,
  },
];

export function vasProgressPct(workOrder: VasWorkOrder): number {
  if (workOrder.status === "completed") return 100;
  if (workOrder.status === "draft" || workOrder.status === "cancelled") return 0;
  return Math.min(100, Math.round((workOrder.outputQty || 0) / Math.max(1, workOrder.outputQty || 0) * 100));
}

export function vasPriorityColor(priority: VasPriority): "default" | "destructive" | "secondary" | "outline" {
  switch (priority) {
    case "same_day":
      return "destructive";
    case "rush":
      return "default";
    case "standard":
      return "secondary";
  }
}

export function vasTypeLabel(type: VasWorkOrderType): string {
  switch (type) {
    case "KITTING":
      return "Kitting";
    case "DEKITTING":
      return "De-Kitting";
    case "LABELING":
      return "Labeling";
    case "ASSEMBLY":
      return "Assembly";
    case "REPACK":
      return "Re-Pack";
    case "CUSTOM":
      return "Custom VAS";
  }
}

export function vasStatusLabel(status: VasWorkOrderStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "released":
      return "Released";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "exception":
      return "Exception";
  }
}
