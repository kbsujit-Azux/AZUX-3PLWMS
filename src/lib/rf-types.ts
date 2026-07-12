/**
 * ============================================================
 *  MODULE INDEX — RF Gun Domain Types
 * ============================================================
 *
 *  Purpose: TypeScript interfaces for the RF Gun (mobile scanner)
 *           and Employee Master modules. These types map 1:1 to
 *           Firestore collections /employees and /movementHistory.
 *
 *  Firestore collections:
 *    /employees/{badgeId}         — Warehouse employee profiles
 *    /movementHistory/{autoId}    — Append-only movement audit log
 *
 *  Extension points:
 *    - Add new movement types to MovementType union
 *    - Add new UOM options to MovementUom union
 *    - Extend WarehouseEmployee with role/permission fields
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
