import { describe, it, expect } from "vitest";
import {
  validatePutawayTarget,
  validLocationsFor,
  locationAvailableToClient,
} from "@/lib/putaway-validation";
import type { LocationRecord } from "@/lib/master-data";

/**
 * Regression guard for the putaway validation.
 *
 * A putaway must:
 *   1. scan the pallet that is actually being put away
 *   2. target a location that exists in the Location Master for the
 *      (client, physical warehouse) combination
 *
 * A location owned by ANOTHER client is never a valid target — that was how
 * acme's stock ended up in harborlite's slots at EWR1.
 */
function loc(over: Partial<LocationRecord> = {}): LocationRecord {
  return {
    id: "A03-01-B",
    warehouseId: "ewr1",
    tenantId: "acme",
    type: "RACK",
    zone: "Camping Reserve",
    capacityPallets: 4,
    occupiedPallets: 0,
    pickable: true,
    allowedItemStyles: null,
    slottingRules: {
      allowedStorageClasses: ["forward", "reserve"],
      putawayPriority: 50,
      replenPriority: 50,
      allowedPalletTypes: ["standard_48x40"],
    },
    status: "active",
    ...over,
  } as LocationRecord;
}

const locations = [
  loc(),
  loc({ id: "C08-02-B", tenantId: "harborlite" }),
  loc({ id: "DROP-EWR1-01", tenantId: undefined, type: "DROP" }),
];

const base = {
  expectedPalletId: "PLT-EWR1-09807",
  scannedLocation: "A03-01-B",
  locations,
  tenantId: "acme",
  warehouseId: "ewr1",
};

describe("locationAvailableToClient", () => {
  it("allows a shared location (no tenant)", () => {
    expect(locationAvailableToClient({ tenantId: undefined }, "acme")).toBe(true);
  });

  it("allows the owning client", () => {
    expect(locationAvailableToClient({ tenantId: "acme" }, "acme")).toBe(true);
  });

  it("rejects another client's location", () => {
    expect(locationAvailableToClient({ tenantId: "harborlite" }, "acme")).toBe(false);
  });
});

describe("validatePutawayTarget", () => {
  it("accepts a matching pallet and a valid location", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a scanned pallet that is not the one being put away", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09808",
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("does not match");
  });

  it("accepts a different valid location than the recommendation", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      scannedLocation: "DROP-EWR1-01",
      suggestedLocation: "A03-01-B",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a location that does not exist in the master", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      scannedLocation: "NOPE-99",
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("not in the Location Master");
  });

  it("rejects a location belonging to another client", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      scannedLocation: "C08-02-B",
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("another client");
  });

  it("rejects a location in a different warehouse", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      scannedLocation: "A12-03-B",
      locations: [...locations, loc({ id: "A12-03-B", warehouseId: "atl1" })],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("belongs to warehouse");
  });

  it("rejects a full location", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      locations: [loc({ occupiedPallets: 4, capacityPallets: 4 })],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("full");
  });

  it("rejects an inactive location", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      locations: [loc({ status: "quarantine" })],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("quarantine");
  });

  it("warns but does not block when the recommendation is not valid here", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      suggestedLocation: "C08-02-B", // belongs to another client
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain("No directed putaway recommendation");
  });

  it("warns when there is no recommendation at all", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      suggestedLocation: undefined,
    });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toContain("No directed putaway recommendation");
  });

  it("requires a location to be scanned", () => {
    const r = validatePutawayTarget({
      ...base,
      scannedPalletId: "PLT-EWR1-09807",
      scannedLocation: "",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validLocationsFor", () => {
  it("returns only the locations this client may use at this warehouse", () => {
    const valid = validLocationsFor(locations, "acme", "ewr1");
    const ids = valid.map((l) => l.id).sort();
    expect(ids).toEqual(["A03-01-B", "DROP-EWR1-01"]);
  });

  it("excludes full locations", () => {
    const valid = validLocationsFor(
      [loc({ occupiedPallets: 4, capacityPallets: 4 })],
      "acme",
      "ewr1",
    );
    expect(valid).toHaveLength(0);
  });

  it("excludes locations in another warehouse", () => {
    const valid = validLocationsFor(
      [loc({ warehouseId: "atl1" })],
      "acme",
      "ewr1",
    );
    expect(valid).toHaveLength(0);
  });
});
