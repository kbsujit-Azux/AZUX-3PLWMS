/**
 * ============================================================
 *  MODULE INDEX — Task Interleaving Types
 * ============================================================
 *
 *  Shared types for the interleaving engine.
 * ============================================================
 */

export type TaskType = "PICK" | "PUTAWAY";

export interface Task {
  id: string;                    // pick ticket # or pallet ID
  type: TaskType;
  description: string;           // human-readable
  locationId: string;            // e.g., "A12-03-B"
  aisle: string;                 // parsed from locationId (e.g., "12")
  qty: number;
  uom: string;
  referenceId: string;           // pick ticket # or pallet ID
  priority?: number;             // higher = more urgent (optional)
  sku?: string;
  status?: string;               // for picks: OPEN/PARTIAL; for putaways: NEW/staged
}