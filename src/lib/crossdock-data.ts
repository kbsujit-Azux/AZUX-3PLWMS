/**
 * ============================================================
 *  MODULE INDEX — Cross-Docking Engine
 * ============================================================
 *
 *  Purpose: Automatically route incoming inventory directly
 *           to open outbound staging lanes to bypass putaway.
 *           Reduces handling, storage time, and labor cost.
 *
 *  Key types exported:
 *    • CrossDockMatch             — Inbound→outbound match
 *    • CrossDockMatchStatus       — Lifecycle states
 *    • CrossDockMatchPriority     — Routing priority
 *
 *  Data:
 *    • crossdockMatches[]         — Mock active matches
 *
 *  Helper functions:
 *    • crossdockPriorityColor()   — Badge color by priority
 *    • crossdockStatusLabel()     — Human-readable status
 *    • crossdockProgressPct()     — Match completion %
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    fetchCrossDockMatches / subscribeCrossDockMatches / createCrossDockMatch / updateCrossDockMatch
 *    fetchCrossDockMatchesByInbound / fetchCrossDockMatchesByOrder
 *
 *  Extension points:
 *    - Add door/scheduling integration
 *    - Add carrier appointment linking
 *    - Add real-time location tracking for cross-dock inventory
 * ============================================================
 */

import type { InboundShipment, InboundLine } from "./inbound-data";
import type { Order } from "./edi-data";

export type CrossDockMatchStatus = "pending" | "matched" | "dispatched" | "exception" | "cancelled";

export type CrossDockMatchPriority = "low" | "medium" | "high" | "critical";

export type CrossDockMatch = {
  id: string; // XD-XXXXX
  tenantId: string;
  warehouseId: string;

  inboundShipmentId: string;
  inboundLineNo: number;
  sku: string;
  qtyExpected: number;
  qtyMatched: number;

  orderId: string;
  pickTicketId?: string;
  shipmentId?: string;
  dockDoor?: string;

  stagingLocation: string;
  status: CrossDockMatchStatus;
  priority: CrossDockMatchPriority;

  matchedAt: string;
  dispatchedAt?: string;

  notes?: string;
};

const ts = (d: string) => new Date(d).toISOString();

export const crossdockMatches: CrossDockMatch[] = [
  {
    id: "XD-2026-0519-001",
    tenantId: "acme",
    warehouseId: "atl1",
    inboundShipmentId: "INB-2026-0519-001",
    inboundLineNo: 1,
    sku: "ACM-TENT-2P-OLV",
    qtyExpected: 96,
    qtyMatched: 48,
    orderId: "SO-2026-4401",
    pickTicketId: "PT-4401-01",
    shipmentId: "SHP-4401",
    dockDoor: "D-03",
    stagingLocation: "STG-01",
    status: "matched",
    priority: "high",
    matchedAt: ts("2026-05-19T08:30:00Z"),
  },
  {
    id: "XD-2026-0519-002",
    tenantId: "northstar",
    warehouseId: "ord2",
    inboundShipmentId: "INB-2026-0519-002",
    inboundLineNo: 1,
    sku: "NSA-HOOD-BLK-M",
    qtyExpected: 960,
    qtyMatched: 240,
    orderId: "SO-2026-4415",
    pickTicketId: "PT-4415-01",
    shipmentId: "SHP-4415",
    dockDoor: "D-08",
    stagingLocation: "STG-03",
    status: "dispatched",
    priority: "medium",
    matchedAt: ts("2026-05-19T09:00:00Z"),
    dispatchedAt: ts("2026-05-19T09:15:00Z"),
  },
];

export function crossdockPriorityColor(priority: CrossDockMatchPriority): "default" | "destructive" | "secondary" | "outline" {
  switch (priority) {
    case "critical":
      return "destructive";
    case "high":
      return "default";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
  }
}

export function crossdockStatusLabel(status: CrossDockMatchStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "matched":
      return "Matched";
    case "dispatched":
      return "Dispatched";
    case "exception":
      return "Exception";
    case "cancelled":
      return "Cancelled";
  }
}

export function crossdockProgressPct(match: CrossDockMatch): number {
  if (match.status === "dispatched") return 100;
  if (match.qtyExpected === 0) return 0;
  return Math.round((match.qtyMatched / match.qtyExpected) * 100);
}
