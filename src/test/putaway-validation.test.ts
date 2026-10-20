import { describe, it, expect } from "vitest";
import { validatePutaway } from "@/lib/firestore-data";

/**
 * Regression guard for the putaway rules.
 *
 * A pallet that is available for putaway must ALWAYS be putaway-able, and a
 * pallet that is already in the inventory must be rejected (it has to be
 * released first) so the on-hand quantity can never be double counted.
 */
describe("validatePutaway", () => {
  const base = {
    palletId: "PLT-1",
    palletLocation: null as string | null,
    hasInventoryBatch: false,
    location: "D04-01-A",
    occupiedPallets: 0,
    capacityPallets: 4,
  };

  it("allows a staged pallet with no inventory batch", () => {
    const r = validatePutaway(base);
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("rejects a pallet already in the inventory, even in the same location", () => {
    // The rule is simple: if the pallet is in the inventory it must be
    // released first, whatever location it currently sits in.
    const r = validatePutaway({
      ...base,
      palletLocation: "D04-01-A",
      hasInventoryBatch: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("already in the inventory");
  });

  it("rejects a pallet that is already in the inventory elsewhere", () => {
    const r = validatePutaway({
      ...base,
      palletLocation: "A12-03-B",
      hasInventoryBatch: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("already in the inventory");
    expect(r.error).toContain("A12-03-B");
  });

  it("rejects a full location", () => {
    const r = validatePutaway({
      ...base,
      occupiedPallets: 4,
      capacityPallets: 4,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("is full");
  });

  it("allows a location with free positions", () => {
    const r = validatePutaway({
      ...base,
      occupiedPallets: 3,
      capacityPallets: 4,
    });
    expect(r.ok).toBe(true);
  });

  it("treats a location with no capacity limit as unlimited", () => {
    const r = validatePutaway({
      ...base,
      occupiedPallets: 99,
      capacityPallets: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("allows a move out of a full location into a free one", () => {
    const r = validatePutaway({
      ...base,
      palletLocation: "OLD-LOC",
      hasInventoryBatch: true,
      location: "NEW-LOC",
      occupiedPallets: 4,
      capacityPallets: 4,
    });
    // The pallet is in the inventory at the old location, so it must be
    // released first — the capacity check must not mask that.
    expect(r.ok).toBe(false);
    expect(r.error).toContain("already in the inventory");
  });
});
