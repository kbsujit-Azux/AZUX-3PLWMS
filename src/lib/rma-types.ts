/**
 * ============================================================
 *  MODULE INDEX � Returns Management (RMA)
 * ============================================================
 *
 *  Purpose: Reverse logistics, disposition workflows,
 *           return-to-stock/quarantine/destroy flows,
 *           and auto-billing for return processing.
 *
 *  Collections:
 *    - rmaOrders             � RMA headers
 *    - rmaLines              � Return line items
 *    - rmaDispositions       � Disposition records
 * ============================================================
 */

import type { TenantPortalReport } from "./tenant-portal";

// ============================================================
// RMA Types
// ============================================================

export type RmaStatus = "draft" | "submitted" | "received" | "inspected" | "dispositioned" | "closed" | "cancelled";

export type DispositionType = "return_to_stock" | "quarantine" | "destroy" | "vendor_return" | "refurbish";

export type DispositionStatus = "pending" | "in_progress" | "completed" | "failed";

export type ReturnReason = "customer_return" | "damaged" | "defective" | "over_shipment" | "wrong_item" | "expired" | "recall";

export type RmaOrder = {
  id: string;
  tenantId: string;
  warehouseId: string;
  rmaNumber: string;
  status: RmaStatus;
  returnReason: ReturnReason;
  originalOrderId?: string;
  originalShipmentId?: string;
  customerId?: string;
  customerName?: string;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type RmaLine = {
  id: string;
  rmaId: string;
  tenantId: string;
  sku: string;
  upc?: string;
  description: string;
  qtyExpected: number;
  qtyReceived: number;
  unitCost: number;
  condition?: string;
  serialNumbers?: string[];
  batchId?: string;
  disposition?: DispositionType;
  dispositionStatus?: DispositionStatus;
  dispositionNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type RmaDisposition = {
  id: string;
  rmaId: string;
  lineId: string;
  tenantId: string;
  dispositionType: DispositionType;
  status: DispositionStatus;
  fromLocation?: string;
  toLocation?: string;
  qty: number;
  processedBy?: string;
  notes?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
};

// ============================================================
// Return Processing Fee
// ============================================================

export type ReturnProcessingFeeType = "restocking" | "inspection" | "disposal" | "refurbish" | "vendor_return";

export type ReturnProcessingFee = {
  id: string;
  tenantId: string;
  rmaId: string;
  lineId: string;
  feeType: ReturnProcessingFeeType;
  amount: number;
  currency: string;
  description?: string;
  autoBilled: boolean;
  billableEventId?: string;
  createdAt: string;
};

// ============================================================
// Helpers
// ============================================================

export function getDefaultDisposition(returnReason: ReturnReason): DispositionType {
  switch (returnReason) {
    case "customer_return":
      return "return_to_stock";
    case "damaged":
    case "defective":
      return "quarantine";
    case "expired":
    case "recall":
      return "destroy";
    case "over_shipment":
    case "wrong_item":
      return "vendor_return";
    default:
      return "quarantine";
  }
}

export function getDispositionLabel(disposition: DispositionType): string {
  const labels: Record<DispositionType, string> = {
    return_to_stock: "Return to Stock",
    quarantine: "Quarantine",
    destroy: "Destroy",
    vendor_return: "Vendor Return",
    refurbish: "Refurbish",
  };
  return labels[disposition] || disposition;
}

export function getRmaStatusLabel(status: RmaStatus): string {
  const labels: Record<RmaStatus, string> = {
    draft: "Draft",
    submitted: "Submitted",
    received: "Received",
    inspected: "Inspected",
    dispositioned: "Dispositioned",
    closed: "Closed",
    cancelled: "Cancelled",
  };
  return labels[status] || status;
}
