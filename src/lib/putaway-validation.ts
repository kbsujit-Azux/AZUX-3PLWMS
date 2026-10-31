/**
 * ============================================================
 *  MODULE INDEX — Putaway target validation
 * ============================================================
 *
 *  Purpose: Validate a putaway before it is posted. Three things must
 *           hold:
 *
 *            1. PALLET IDENTITY — the scanned pallet licence plate must be
 *               the pallet that is actually being put away. A scan of a
 *               different pallet must never move the wrong stock.
 *
 *            2. LOCATION VALIDITY — the scanned location must exist in the
 *               Location Master for the (client, physical warehouse)
 *               combination. A location assigned to another client, or one
 *               that does not exist at all, must be rejected.
 *
 *            3. CAPACITY — the location must have a free pallet position.
 *
 *           The directed putaway RECOMMENDATION is advisory. When the
 *           recommended location is not valid for this client/warehouse the
 *           system warns and offers no recommendation, but the operator may
 *           still scan any other valid location.
 *
 *  Key exports:
 *    • locationAvailableToClient() — shared vs. client-owned
 *    • validatePutawayTarget()     — the full check
 *    • validLocationsFor()         — the locations an operator may scan
 * ============================================================
 */

import type { LocationRecord } from "./master-data";

/**
 * A location is usable by a client when it is SHARED (no tenant assigned)
 * or assigned to that client. A location owned by another client is never
 * a valid putaway target.
 */
export function locationAvailableToClient(
  location: { tenantId?: string | null },
  tenantId: string,
): boolean {
  if (!tenantId) return true;
  if (!location.tenantId) return true;
  return location.tenantId === tenantId;
}

export type PutawayValidation = {
  /** True when the putaway may be posted. */
  ok: boolean;
  /** Blocking problems. */
  errors: string[];
  /** Non-blocking advisories. */
  warnings: string[];
};

export type ValidatePutawayTargetArgs = {
  /** The pallet licence plate the operator scanned (optional). */
  scannedPalletId?: string;
  /** The pallet that is actually being put away. */
  expectedPalletId: string;
  /** The location the operator scanned. */
  scannedLocation: string;
  /** The live Location Master. */
  locations: LocationRecord[];
  /** The owning client. */
  tenantId: string;
  /** The physical warehouse (facility). */
  warehouseId: string;
  /** The directed putaway recommendation, when there is one. */
  suggestedLocation?: string | null;
};

/**
 * Validate a putaway target.
 */
export function validatePutawayTarget(args: ValidatePutawayTargetArgs): PutawayValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  /* 1. Pallet identity */
  if (args.scannedPalletId !== undefined) {
    const scanned = args.scannedPalletId.trim().toUpperCase();
    const expected = args.expectedPalletId.trim().toUpperCase();
    if (!scanned) {
      errors.push("Scan the pallet licence plate");
    } else if (scanned !== expected) {
      errors.push(
        `Scanned pallet ${scanned} does not match the pallet being put away (${expected})`,
      );
    }
  }

  /* 2. Location validity */
  const scanned = args.scannedLocation.trim();
  if (!scanned) {
    errors.push("Scan the rack location");
    return { ok: false, errors, warnings };
  }

  const location = args.locations.find((l) => l.id.toUpperCase() === scanned.toUpperCase());

  if (!location) {
    errors.push(
      `Location ${scanned} is not in the Location Master for ${warehouseLabel(args.warehouseId)}`,
    );
  } else if (location.warehouseId !== args.warehouseId) {
    errors.push(
      `Location ${scanned} belongs to warehouse ${location.warehouseId}, not ${warehouseLabel(
        args.warehouseId,
      )}`,
    );
  } else if (!locationAvailableToClient(location, args.tenantId)) {
    errors.push(
      `Location ${scanned} is assigned to another client and cannot be used for this receipt`,
    );
  } else if (location.status && location.status !== "active") {
    errors.push(`Location ${scanned} is ${location.status} and cannot accept stock`);
  } else if (
    location.capacityPallets > 0 &&
    (location.occupiedPallets ?? 0) >= location.capacityPallets
  ) {
    errors.push(
      `Location ${scanned} is full (${location.occupiedPallets}/${location.capacityPallets} positions)`,
    );
  }

  /* 3. The recommendation is advisory */
  const suggestedId = args.suggestedLocation?.trim();
  if (suggestedId) {
    const suggested = args.locations.find((l) => l.id.toUpperCase() === suggestedId.toUpperCase());
    if (
      !suggested ||
      suggested.warehouseId !== args.warehouseId ||
      !locationAvailableToClient(suggested, args.tenantId)
    ) {
      warnings.push(
        `No directed putaway recommendation for this client at ${warehouseLabel(
          args.warehouseId,
        )} — the recommended location is not set up in the Location Master for this client. Scan any valid location below.`,
      );
    }
  } else {
    warnings.push(
      `No directed putaway recommendation for this client at ${warehouseLabel(
        args.warehouseId,
      )}. Scan any valid location below.`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * The locations an operator may scan for this client/warehouse.
 */
export function validLocationsFor(
  locations: LocationRecord[],
  tenantId: string,
  warehouseId: string,
): LocationRecord[] {
  return locations.filter(
    (l) =>
      l.warehouseId === warehouseId &&
      locationAvailableToClient(l, tenantId) &&
      (!l.status || l.status === "active") &&
      (l.capacityPallets === 0 || (l.occupiedPallets ?? 0) < l.capacityPallets),
  );
}

function warehouseLabel(warehouseId: string): string {
  return warehouseId ? warehouseId.toUpperCase() : "the warehouse";
}
