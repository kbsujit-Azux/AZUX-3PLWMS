/**
 * ============================================================
 *  MODULE INDEX — Dynamic Slotting Engine
 * ============================================================
 *
 *  Purpose: AI-driven slotting recommendations based on
 *           historical velocity. Analyzes movement history
 *           and current pallet locations to suggest SKU
 *           moves between forward pick faces and reserve.
 *
 *  Usage:
 *    const recommendations = analyzeSlottingEfficiency(
 *      pallets,
 *      locationMaster,
 *      movementHistory,
 *      itemMaster,
 *    );
 *
 *  Returns: SlottingRecommendation[] with priority ranking
 * ============================================================
 */

import type { Pallet, PalletStatus } from "./pallet-data";
import type { LocationRecord, LocationType } from "./master-data";
import type { MovementHistory, MovementType } from "./rf-types";
import type { ItemMasterRecord } from "./master-data";

export type SlottingZone = "forward_pick" | "reserve" | "staging" | "hazmat" | "cold";

export interface SlottingRecommendation {
  sku: string;
  itemStyle: string;
  currentLocationId: string;
  suggestedLocationId: string;
  currentZone: SlottingZone | string;
  suggestedZone: SlottingZone | string;
  reason: "velocity_mismatch" | "capacity_overflow" | "forward_full" | "reserve_underutilized" | "cube_inefficiency";
  priority: "high" | "medium" | "low";
  velocityScore: number;
  daysInCurrentLocation: number;
  impact: string;
}

export interface VelocityProfile {
  sku: string;
  itemStyle: string;
  picksPerDay: number;
  movesPerDay: number;
  totalVelocity: number;
  lastPickDate?: string;
  lastMoveDate?: string;
  fastMover: boolean;
  slowMover: boolean;
}

export function computeSkuVelocity(
  movements: MovementHistory[],
  sku: string,
  windowDays = 30,
): VelocityProfile {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const relevant = movements.filter((m) => {
    if (m.itemCode !== sku) return false;
    const ts = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp as unknown as string);
    return ts >= cutoff;
  });

  const picks = relevant.filter((m) => m.type === "DIRECTED_PICK");
  const moves = relevant.filter((m) => m.type === "MOVE_PALLET");

  const picksPerDay = windowDays > 0 ? picks.length / windowDays : 0;
  const movesPerDay = windowDays > 0 ? moves.length / windowDays : 0;
  const totalVelocity = picksPerDay + movesPerDay;

  const lastPick = picks.sort((a, b) => {
    const ta = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp as unknown as string);
    const tb = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp as unknown as string);
    return tb.getTime() - ta.getTime();
  })[0];

  const lastMove = moves.sort((a, b) => {
    const ta = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp as unknown as string);
    const tb = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp as unknown as string);
    return tb.getTime() - ta.getTime();
  })[0];

  return {
    sku,
    itemStyle: "",
    picksPerDay,
    movesPerDay,
    totalVelocity,
    lastPickDate: lastPick ? (lastPick.timestamp instanceof Date ? lastPick.timestamp.toISOString().slice(0, 10) : new Date(lastPick.timestamp as unknown as string).toISOString().slice(0, 10)) : undefined,
    lastMoveDate: lastMove ? (lastMove.timestamp instanceof Date ? lastMove.timestamp.toISOString().slice(0, 10) : new Date(lastMove.timestamp as unknown as string).toISOString().slice(0, 10)) : undefined,
    fastMover: totalVelocity >= 1,
    slowMover: totalVelocity < 0.1,
  };
}

export function classifyLocationZone(location: LocationRecord): SlottingZone {
  const zone = location.zone.toLowerCase();
  if (zone.includes("forward") || zone.includes("pick") || zone.includes("face")) return "forward_pick";
  if (zone.includes("reserve") || zone.includes("bulk")) return "reserve";
  if (zone.includes("hazmat") || zone.includes("haz")) return "hazmat";
  if (zone.includes("cold") || zone.includes("freeze") || zone.includes("chill")) return "cold";
  if (zone.includes("stage") || zone.includes("dock")) return "staging";
  if (location.type === "RACK") return "reserve";
  if (location.type === "FLR") return "forward_pick";
  return "reserve";
}

export function analyzeSlottingEfficiency(
  pallets: Pallet[],
  locations: LocationRecord[],
  movements: MovementHistory[],
  itemMaster: ItemMasterRecord[],
  warehouseId?: string,
): SlottingRecommendation[] {
  const recommendations: SlottingRecommendation[] = [];
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  const itemMap = new Map(itemMaster.map((i) => [i.sku, i]));

  const activePallets = pallets.filter((p) => p.status !== "shipped" && p.location);

  const velocityBySku = new Map<string, VelocityProfile>();
  for (const sku of new Set(activePallets.map((p) => p.sku))) {
    velocityBySku.set(sku, computeSkuVelocity(movements, sku));
  }

  const forwardLocations = locations.filter((l) => {
    if (warehouseId && l.warehouseId !== warehouseId) return false;
    return classifyLocationZone(l) === "forward_pick" && l.pickable;
  });

  const reserveLocations = locations.filter((l) => {
    if (warehouseId && l.warehouseId !== warehouseId) return false;
    return classifyLocationZone(l) === "reserve";
  });

  const forwardOccupancy = new Map<string, Pallet[]>();
  for (const loc of forwardLocations) {
    forwardOccupancy.set(loc.id, []);
  }
  for (const pallet of activePallets) {
    if (forwardOccupancy.has(pallet.location!)) {
      forwardOccupancy.get(pallet.location!)!.push(pallet);
    }
  }

  const forwardSlotsAvailable = forwardLocations.filter((l) => {
    const occupants = forwardOccupancy.get(l.id) || [];
    return occupants.length < l.capacityPallets;
  });

  for (const pallet of activePallets) {
    const location = locationMap.get(pallet.location!);
    if (!location) continue;

    const velocity = velocityBySku.get(pallet.sku);
    if (!velocity) continue;

    const currentZone = classifyLocationZone(location);
    const item = itemMap.get(pallet.sku);
    const itemStyle = item?.itemStyle ?? pallet.itemStyle;

    if (velocity.fastMover && currentZone !== "forward_pick") {
      if (forwardSlotsAvailable.length === 0) {
        recommendations.push({
          sku: pallet.sku,
          itemStyle,
          currentLocationId: pallet.location!,
          suggestedLocationId: "",
          currentZone,
          suggestedZone: "forward_pick",
          reason: "velocity_mismatch",
          priority: "high",
          velocityScore: Math.round(velocity.totalVelocity * 100),
          daysInCurrentLocation: 0,
          impact: `Fast mover (${velocity.picksPerDay.toFixed(1)} picks/day) in ${currentZone}. No forward slots available.`,
        });
      } else {
        const bestSlot = forwardSlotsAvailable[0];
        recommendations.push({
          sku: pallet.sku,
          itemStyle,
          currentLocationId: pallet.location!,
          suggestedLocationId: bestSlot.id,
          currentZone,
          suggestedZone: "forward_pick",
          reason: "velocity_mismatch",
          priority: "high",
          velocityScore: Math.round(velocity.totalVelocity * 100),
          daysInCurrentLocation: 0,
          impact: `Fast mover → forward pick face ${bestSlot.id}`,
        });
      }
    } else if (velocity.slowMover && currentZone === "forward_pick") {
      const bestReserve = reserveLocations[0];
      if (bestReserve) {
        recommendations.push({
          sku: pallet.sku,
          itemStyle,
          currentLocationId: pallet.location!,
          suggestedLocationId: bestReserve.id,
          currentZone,
          suggestedZone: "reserve",
          reason: "velocity_mismatch",
          priority: "medium",
          velocityScore: Math.round(velocity.totalVelocity * 100),
          daysInCurrentLocation: 0,
          impact: `Slow mover → reserve ${bestReserve.id} to free forward pick face`,
        });
      }
    }
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

export function getVelocityColor(score: number): string {
  if (score >= 100) return "text-red-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 10) return "text-yellow-400";
  return "text-green-400";
}

export function getPriorityBadge(priority: SlottingRecommendation["priority"]): string {
  switch (priority) {
    case "high":
      return "bg-red-500/20 text-red-400 border-red-500/40";
    case "medium":
      return "bg-orange-500/20 text-orange-400 border-orange-500/40";
    case "low":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  }
}
