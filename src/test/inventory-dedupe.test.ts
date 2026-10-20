import { describe, it, expect } from "vitest";
import { dedupeBatches } from "@/lib/firestore-data";

/**
 * Regression guard for the duplicate inventory batch problem.
 *
 * Firestore's `set(ref, data, { merge: true })` MERGES arrays
 * element-by-element instead of replacing them. Re-saving an inventory
 * record therefore appended the batch again, and the pallet showed up
 * several times in the grid with its units counted several times.
 *
 * Every inventory write must dedupe by palletId first.
 */
describe("dedupeBatches", () => {
  it("keeps one batch per pallet", () => {
    const batches = dedupeBatches([
      { batchId: "A-1", palletId: "PLT-1", qty: 8, location: "D04-01-A" },
      { batchId: "A-1", palletId: "PLT-1", qty: 8, location: "D04-01-A" },
      { batchId: "A-1", palletId: "PLT-1", qty: 8, location: "D04-01-A" },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].palletId).toBe("PLT-1");
    expect(batches[0].qty).toBe(8);
  });

  it("keeps distinct pallets separate", () => {
    const batches = dedupeBatches([
      { batchId: "A-1", palletId: "PLT-1", qty: 8 },
      { batchId: "A-2", palletId: "PLT-2", qty: 16 },
    ]);
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.palletId)).toEqual(["PLT-1", "PLT-2"]);
  });

  it("uses the newest record for a duplicated pallet", () => {
    const batches = dedupeBatches([
      { batchId: "A-1", palletId: "PLT-1", qty: 8, location: "OLD" },
      { batchId: "A-1", palletId: "PLT-1", qty: 20, location: "NEW" },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].qty).toBe(20);
    expect(batches[0].location).toBe("NEW");
  });

  it("preserves the allocation state", () => {
    const batches = dedupeBatches([
      { batchId: "A-1", palletId: "PLT-1", qty: 20, qtyAllocated: 12 },
      { batchId: "A-1", palletId: "PLT-1", qty: 20, qtyAllocated: 0 },
    ]);
    expect(batches[0].qtyAllocated).toBe(12);
  });

  it("handles an empty or missing list", () => {
    expect(dedupeBatches([])).toEqual([]);
    expect(dedupeBatches(undefined as any)).toEqual([]);
  });

  it("drops entries without a pallet or batch id", () => {
    const batches = dedupeBatches([
      { qty: 5 } as any,
      { batchId: "A-1", palletId: "PLT-1", qty: 8 },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].palletId).toBe("PLT-1");
  });
});
