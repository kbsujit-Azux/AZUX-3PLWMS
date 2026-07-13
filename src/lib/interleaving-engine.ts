/**
 * ============================================================
 *  MODULE INDEX — Task Interleaving Engine
 * ============================================================
 *
 *  Purpose: Reduce deadheading (empty travel) by intelligently
 *           sequencing tasks. When a worker finishes a task in
 *           aisle X, assign the next task also in aisle X (or
 *           adjacent aisle) instead of sending them across the
 *           warehouse.
 *
 *  Inputs:
 *    - Open picks: from PickTicket / PickInstruction (location -> aisle)
 *    - Open putaways: Pallets with status NEW/staged awaiting putaway (suggestedLocation -> aisle)
 *    - Worker's current aisle (from last completed task)
 *
 *  Output:
 *    - Suggested next task in same aisle, then adjacent, then any
 *
 *  Extension points:
 *    - Add priority weighting (hot picks, aging putaways)
 *    - Add distance matrix for true travel-time optimization
 *    - Add worker skill/certification filtering
 * ============================================================
 */

import type { Pallet } from "./pallet-data";
import type { PickTicket } from "./edi-data";
import { getAisleFromLocation } from "./labor-data";
import type { Task } from "./interleaving-types";

/**
 * Parse aisle from location ID.
 * Handles formats: "A12-03-B", "ATL1·A12-03-B", "DROP-AISLE-A"
 * Returns aisle identifier (e.g., "12" or "DROP-AISLE-A")
 */
export { getAisleFromLocation } from "./labor-data";

/**
 * Build the combined task queue from open picks and open putaways.
 * Filters by tenantId and warehouseId.
 */
export async function buildTaskQueue(
  picks: PickTicket[],
  putawayPallets: Pallet[],
  tenantId: string,
  warehouseId: string
): Promise<Task[]> {
  const tasks: Task[] = [];

  // Open picks (OPEN or PARTIAL)
  for (const pick of picks) {
    if (pick.clientId !== tenantId || pick.warehouseId !== warehouseId) continue;
    if (pick.status !== "OPEN" && pick.status !== "PARTIAL") continue;
    if (pick.qtyPicked >= pick.qtyOrdered) continue;

    // PickInstructions are in the pick wave, but PickTicket has locationId
    const loc = pick.locationId || "";
    const aisle = parseAisle(loc);

    tasks.push({
      id: pick.number,
      type: "PICK",
      description: `Pick ${pick.sku} x${pick.qtyOrdered - pick.qtyPicked}`,
      locationId: loc,
      aisle,
      qty: pick.qtyOrdered - pick.qtyPicked,
      uom: "EA",
      referenceId: pick.number,
      priority: pick.status === "PARTIAL" ? 2 : 1, // partial picks higher priority
      sku: pick.sku,
      status: pick.status,
    });
  }

  // Open putaways: pallets with status NEW or staged awaiting putaway
  for (const pallet of putawayPallets) {
    if (pallet.clientId !== tenantId || pallet.warehouseId !== warehouseId) continue;
    if (pallet.status !== "NEW" && pallet.status !== "staged") continue;

    const loc = pallet.suggestedLocation || pallet.location || "";
    const aisle = parseAisle(loc);

    tasks.push({
      id: pallet.id,
      type: "PUTAWAY",
      description: `Putaway ${pallet.sku} x${pallet.units}`,
      locationId: loc,
      aisle,
      qty: pallet.units,
      uom: "EA",
      referenceId: pallet.id,
      priority: 1,
      sku: pallet.sku,
      status: pallet.status,
    });
  }

  return tasks;
}

/**
 * Distance between aisles (simplified: numeric difference).
 * "12" vs "14" = 2 aisles apart.
 * Non-numeric aisles (e.g., "DROP") are treated as far.
 */
function aisleDistance(a: string, b: string): number {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (isNaN(numA) || isNaN(numB)) return 999; // non-numeric = far
  return Math.abs(numA - numB);
}

/**
 * Core interleaving logic.
 * Given current aisle and task queue, return the best next task.
 *
 * Priority:
 *   1. Same aisle, highest priority
 *   2. Adjacent aisle (±1), highest priority
 *   3. Any aisle, highest priority
 *
 * Returns null if queue empty.
 */
export function assignNextTask(
  currentAisle: string,
  queue: Task[]
): Task | null {
  if (queue.length === 0) return null;

  // Filter out completed/cancelled
  const available = queue.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  if (available.length === 0) return null;

  // Sort by priority desc, then by aisle distance
  const scored = available.map((t) => ({
    task: t,
    dist: aisleDistance(currentAisle, t.aisle),
    priority: t.priority ?? 1,
  }));

  // Same aisle first
  const sameAisle = scored.filter((s) => s.dist === 0);
  if (sameAisle.length > 0) {
    sameAisle.sort((a, b) => b.priority - a.priority);
    return sameAisle[0].task;
  }

  // Adjacent aisle (±1)
  const adjacent = scored.filter((s) => s.dist === 1);
  if (adjacent.length > 0) {
    adjacent.sort((a, b) => b.priority - a.priority);
    return adjacent[0].task;
  }

  // Any remaining, sort by distance then priority
  scored.sort((a, b) => a.dist - b.dist || b.priority - a.priority);
  return scored[0].task;
}

/**
 * Get aisle from the last completed labor event for a worker.
 * Falls back to parsing the locationId from the event.
 */
export async function getWorkerCurrentAisle(
  db: any,
  badgeId: string,
  tenantId: string,
  warehouseId: string
): Promise<string> {
  const { query, collection, where, orderBy, limit, getDocs } = await import("firebase/firestore");
  const { db: firebaseDb } = await import("./firestore");
  
  const q = query(
    collection(firebaseDb, "laborEvents"),
    where("badgeId", "==", badgeId),
    where("tenantId", "==", tenantId),
    where("warehouseId", "==", warehouseId),
    orderBy("completedAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return "UNKNOWN";
  
  const event = snap.docs[0].data();
  return event.aisle || parseAisle(event.locationId || "");
}

/**
 * Format a task for display in RF Gun suggestion UI.
 */
export function formatTaskSuggestion(task: Task): string {
  const typeIcon = task.type === "PICK" ? "📦" : "📥";
  return `${typeIcon} ${task.type}: ${task.description} @ ${task.locationId} (Aisle ${task.aisle})`;
}