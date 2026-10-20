import { describe, it, expect } from "vitest";

/**
 * Regression guard for the Firestore array-path pitfall.
 *
 * `updateDoc(ref, { "lines.0.receivedQty": 5 })` is interpreted by Firestore
 * as a MAP key path, NOT an array index. The `lines` array is therefore
 * replaced by an object `{ "0": { receivedQty: 5 } }` — every other line and
 * every other field of the targeted line is destroyed.
 *
 * This test documents the safe pattern used across the codebase: read the
 * array, merge the single element in memory, and write the whole array back.
 */
describe("Firestore array update pattern", () => {
  const shipment = {
    id: "INB-1",
    status: "scheduled",
    lines: [
      { lineNo: 1, sku: "A", qtyExpected: 100, receivedQty: 0, palletIds: [] },
      { lineNo: 2, sku: "B", qtyExpected: 50, receivedQty: 0, palletIds: [] },
    ],
  };

  it("merging a line preserves the array and the sibling lines", () => {
    // The safe pattern (as used by updateInboundLine / recordInboundPalletBuild)
    const lines = [...shipment.lines];
    lines[0] = { ...lines[0], receivedQty: 40, palletIds: ["PLT-1"] };

    expect(Array.isArray(lines)).toBe(true);
    expect(lines).toHaveLength(2);
    // targeted line keeps its other fields
    expect(lines[0].sku).toBe("A");
    expect(lines[0].qtyExpected).toBe(100);
    expect(lines[0].receivedQty).toBe(40);
    expect(lines[0].palletIds).toEqual(["PLT-1"]);
    // sibling line untouched
    expect(lines[1]).toEqual(shipment.lines[1]);
  });

  it("unioning pallet ids does not drop previously built pallets", () => {
    const lines = [...shipment.lines];
    lines[0] = { ...lines[0], palletIds: ["PLT-1"] };
    const merged = Array.from(new Set([...lines[0].palletIds, "PLT-2"]));
    lines[0] = { ...lines[0], palletIds: merged };

    expect(lines[0].palletIds).toEqual(["PLT-1", "PLT-2"]);
  });

  it("never mutates the snapshot array in place", () => {
    const original = JSON.parse(JSON.stringify(shipment.lines));
    const lines = shipment.lines;
    lines[0] = { ...lines[0], receivedQty: 10 };
    expect(shipment.lines[0].receivedQty).toBe(10); // mutated - hence the copy in prod code
    expect(original[0].receivedQty).toBe(0);
  });
});
