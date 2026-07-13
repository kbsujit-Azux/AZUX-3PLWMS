/**
 * RF Gun Labor Module - Simplified for RF Gun App
 * Contains only what's needed for labor event recording in the RF Gun app
 */

import { db } from "@shared/lib/firestore";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { LABOR_STANDARDS, computeStandardSec, getAisleFromLocation } from "@shared/lib/labor-data";

/**
 * Record a labor event to Firestore.
 * Computes standard time and efficiency % automatically.
 */
export async function recordLaborEvent(event: Omit<LaborEvent, "eventId" | "completedAt"> & { startedAt: number | Date }): Promise<string> {
  const startedAt = event.startedAt instanceof Date ? event.startedAt : new Date(event.startedAt);
  const completedAt = new Date();

  const actualSec = Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000));
  const standardSec = computeStandardSec(event.taskType, event.qty);
  const efficiencyPct = actualSec > 0 && standardSec > 0
    ? Math.round((standardSec / actualSec) * 100)
    : 100;

  const aisle = getAisleFromLocation(event.locationId);

  const eventData = {
    ...event,
    eventId: "",
    startedAt,
    completedAt,
    durationSec: actualSec,
    standardSec,
    efficiencyPct,
    aisle,
  };

  const ref = await addDoc(collection(db, "laborEvents"), eventData);
  return ref.id;
}

/**
 * Compute aisle from location ID (e.g., "A12-03-B" -> "12")
 */
export { getAisleFromLocation } from "@shared/lib/labor-data";

/**
 * Compute standard seconds for a task
 */
export { computeStandardSec } from "@shared/lib/labor-data";

/**
 * Labor Task Types
 */
export type LaborTaskType = 
  | "DIRECTED_PICK"
  | "PUTAWAY"
  | "MOVE_PALLET"
  | "DOCK_RECEIVING";

/**
 * Labor Event shape for RF Gun
 */
export interface LaborEvent {
  eventId: string;
  badgeId: string;
  employeeName: string;
  warehouseId: string;
  tenantId: string;
  taskType: LaborTaskType;
  referenceId: string;
  qty: number;
  uom: string;
  locationId: string;
  aisle: string;
  startedAt: Date;
  completedAt: Date;
  durationSec: number;
  standardSec: number;
  efficiencyPct: number;
}