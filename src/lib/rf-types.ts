/**
 * ============================================================
 *  MODULE INDEX — RF Gun Domain Types
 * ============================================================
 *
 *  Purpose: TypeScript interfaces for the RF Gun (mobile scanner)
 *           and Employee Master modules. These types map 1:1 to
 *           Firestore collections /employees, /movementHistory,
 *           /laborStandards, and /laborEvents.
 *
 *  Firestore collections:
 *    /employees/{badgeId}         — Warehouse employee profiles
 *    /movementHistory/{autoId}    — Append-only movement audit log
 *    /laborStandards/{taskType}   — Engineered labor standards (ELS)
 *    /laborEvents/{autoId}        — Labor event capture (start/end/duration)
 *
 *  Extension points:
 *    - Add new movement types to MovementType union
 *    - Add new UOM options to MovementUom union
 *    - Extend WarehouseEmployee with role/permission fields
 *    - Add new labor task types to LaborTaskType union
 * ============================================================
 */

/** Warehouse employee authorized to use RF terminals. */
export type WarehouseEmployee = {
  badgeId: string;
  name: string;
  email: string;
  assignedClientId: string;
  assignedWarehouseId: string;
  isActive: boolean;
  createdAt: string;
  passwordHash: string;
  role: string;              // "Picker" | "Packer" | "Receiver" | "Putaway" | "Lead" | "Admin"
  team?: string;             // Team/shift group assignment
  shift?: string;            // "A" | "B" | "C" | "Day" | "Night"
  supervisorId?: string;     // badgeId of supervisor
};

/** Labor task types aligned with RF movement types for direct ELS lookup. */
export type LaborTaskType =
  | "DIRECTED_PICK"
  | "PUTAWAY"
  | "MOVE_PALLET"
  | "DOCK_RECEIVING";

/** Engineered Labor Standard definition for a task type. */
export type LaborStandard = {
  taskType: LaborTaskType;
  secFixed: number;          // base seconds per task (e.g., walk to location, scan)
  secPerUnit: number;        // seconds per unit (line, case, pallet)
  uom: "line" | "case" | "pallet";
  description: string;
};

/** Labor event captured at task completion. */
export type LaborEvent = {
  eventId: string;
  badgeId: string;
  employeeName: string;
  warehouseId: string;
  tenantId: string;
  taskType: LaborTaskType;
  referenceId: string;       // pick ticket #, pallet ID, shipment ID, etc.
  qty: number;
  uom: string;
  locationId: string;
  aisle: string;
  startedAt: Date;
  completedAt: Date;
  durationSec: number;       // actual elapsed seconds
  standardSec: number;       // ELS computed: secFixed + secPerUnit * qty
  efficiencyPct: number;     // standardSec / durationSec * 100
};

/** Append-only audit record for every physical inventory movement. */
export type MovementType = "PUTAWAY" | "MOVE_PALLET" | "DIRECTED_PICK" | "DOCK_RECEIVING";
export type MovementUom = "CASES" | "UNITS";

export type MovementHistory = {
  movementId: string;
  timestamp: ReturnType<typeof import("firebase/firestore").serverTimestamp>;
  badgeId: string;
  tenantId: string;
  type: MovementType;
  referenceId: string;
  itemCode: string;
  fromLocationId: string;
  toLocationId: string;
  originalQty: number;
  movedQty: number;
  uom: MovementUom;
};

/** Result shape returned by RF transaction operations. */
export type RfResult<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
};
