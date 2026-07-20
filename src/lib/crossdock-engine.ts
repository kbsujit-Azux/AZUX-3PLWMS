/**
 * ============================================================
 *  MODULE INDEX — Cross-Dock Engine
 * ============================================================
 *
 *  Purpose: Core matching logic for cross-dock operations.
 *           Evaluates inbound ASN lines against open outbound
 *           orders to identify direct-ship opportunities.
 *
 *  Usage:
 *    const matches = await evaluateCrossDockEligibility(inboundShipment);
 *    await executeCrossDockReceipt(match, receivedQty);
 *
 *  Extension points:
 *    - Add door scheduling integration
 *    - Add carrier appointment linking
 *    - Add real-time location tracking for cross-dock inventory
 * ============================================================
 */

import type { InboundShipment, InboundLine } from "./inbound-data";
import type { Order, OrderLine } from "./edi-data";
import type { CrossDockMatch, CrossDockMatchPriority } from "./crossdock-data";

export interface CrossDockEvaluationResult {
  shipmentId: string;
  matches: CrossDockMatch[];
  unmatchedLines: InboundLine[];
  totalMatchedQty: number;
  totalUnmatchedQty: number;
}

export function findOpenOrdersForSku(
  orders: Order[],
  sku: string,
): Order[] {
  return orders.filter((o) => {
    const closed = ["shipped", "exception"];
    if (closed.includes(o.status)) return false;
    return o.lines.some((l) => l.qtyOrdered - l.qtyAllocated > 0);
  });
}

export function findOpenPickTicketsForOrder(
  pickTickets: { orderId: string; qtyOrdered: number; qtyPicked: number }[],
  orderId: string,
): { pickTicketId: string; qtyRemaining: number }[] {
  return pickTickets
    .filter((pt) => pt.orderId === orderId)
    .map((pt) => ({
      pickTicketId: `PT-${orderId}`,
      qtyRemaining: pt.qtyOrdered - pt.qtyPicked,
    }))
    .filter((pt) => pt.qtyRemaining > 0);
}

export function findAvailableStagingLane(
  warehouseId: string,
  existingMatches: CrossDockMatch[],
): string {
  const usedLanes = new Set(existingMatches.map((m) => m.stagingLocation));
  const lanePrefix = "STG";
  let counter = 1;

  while (counter <= 20) {
    const lane = `${lanePrefix}-${String(counter).padStart(2, "0")}`;
    if (!usedLanes.has(lane)) {
      return lane;
    }
    counter++;
  }

  return `${lanePrefix}-${String(counter).padStart(2, "0")}`;
}

export function evaluateCrossDockEligibility(
  inboundShipment: InboundShipment,
  openOrders: Order[],
  pickTickets: { orderId: string; qtyOrdered: number; qtyPicked: number }[],
  existingMatches: CrossDockMatch[] = [],
): CrossDockEvaluationResult {
  const matches: CrossDockMatch[] = [];
  const unmatchedLines: InboundLine[] = [];

  for (const line of inboundShipment.lines) {
    const matchingOrders = findOpenOrdersForSku(openOrders, line.sku);

    if (matchingOrders.length === 0) {
      unmatchedLines.push(line);
      continue;
    }

    const order = matchingOrders[0];
    const openTickets = findOpenPickTicketsForOrder(pickTickets, order.id);
    const qtyDemand = openTickets.reduce((sum, t) => sum + t.qtyRemaining, 0);
    const qtyMatch = Math.min(line.qtyExpected, qtyDemand);

    if (qtyMatch <= 0) {
      unmatchedLines.push(line);
      continue;
    }

    const stagingLocation = findAvailableStagingLane(inboundShipment.warehouseId, existingMatches);

    const priority: CrossDockMatchPriority =
      qtyMatch > 500 ? "critical" : qtyMatch > 100 ? "high" : qtyMatch > 20 ? "medium" : "low";

    matches.push({
      id: `XD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenantId: inboundShipment.tenantId,
      warehouseId: inboundShipment.warehouseId,
      inboundShipmentId: inboundShipment.id,
      inboundLineNo: line.lineNo,
      sku: line.sku,
      qtyExpected: line.qtyExpected,
      qtyMatched: qtyMatch,
      orderId: order.id,
      pickTicketId: openTickets[0]?.pickTicketId,
      shipmentId: `SHP-${order.id.slice(-6)}`,
      dockDoor: undefined,
      stagingLocation,
      status: "matched",
      priority,
      matchedAt: new Date().toISOString(),
    });
  }

  const totalMatchedQty = matches.reduce((sum, m) => sum + m.qtyMatched, 0);
  const totalUnmatchedQty = unmatchedLines.reduce((sum, l) => sum + l.qtyExpected, 0);

  return {
    shipmentId: inboundShipment.id,
    matches,
    unmatchedLines,
    totalMatchedQty,
    totalUnmatchedQty,
  };
}

export function canDispatchCrossDock(match: CrossDockMatch): boolean {
  return match.status === "matched";
}

export function getCrossDockSummary(matches: CrossDockMatch[]): {
  totalMatches: number;
  totalMatchedQty: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
} {
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const m of matches) {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    byPriority[m.priority] = (byPriority[m.priority] || 0) + 1;
  }

  return {
    totalMatches: matches.length,
    totalMatchedQty: matches.reduce((sum, m) => sum + m.qtyMatched, 0),
    byStatus,
    byPriority,
  };
}
