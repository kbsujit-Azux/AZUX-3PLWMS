import { describe, it, expect } from "vitest";
import { isPalletLocked, isAwaitingPutaway } from "@/lib/pallet-data";

/**
 * Regression guard for the Pallet screen behaviour:
 *
 *  • A pallet that has been put away is LOCKED — its edit and delete
 *    actions are disabled on the Palletization (builder) screen.
 *  • A pallet that is already stored must NOT appear on the Directed
 *    putaway tab.
 *  • After the pallet is released from the Inventory it returns to
 *    "staged" with no location, so it becomes editable, deletable and
 *    putaway-able again.
 */
describe("pallet lock rules", () => {
  it("locks a pallet that is stored in a location", () => {
    expect(isPalletLocked({ location: "D04-01-A", status: "putaway" })).toBe(true);
  });

  it("locks a pallet on pick or shipped", () => {
    expect(isPalletLocked({ location: null, status: "picking" })).toBe(true);
    expect(isPalletLocked({ location: null, status: "shipped" })).toBe(true);
  });

  it("does not lock a staged or building pallet", () => {
    expect(isPalletLocked({ location: null, status: "staged" })).toBe(false);
    expect(isPalletLocked({ location: null, status: "building" })).toBe(false);
  });

  it("locks a pallet even when the status was not updated", () => {
    // A released pallet has no location — but a stale "putaway" status
    // must still lock it.
    expect(isPalletLocked({ location: null, status: "putaway" })).toBe(true);
  });
});

describe("awaiting putaway rules", () => {
  it("includes a staged pallet with no location", () => {
    expect(isAwaitingPutaway({ location: null, status: "staged" })).toBe(true);
  });

  it("includes a building pallet", () => {
    expect(isAwaitingPutaway({ location: null, status: "building" })).toBe(true);
  });

  it("excludes a pallet that is already stored", () => {
    expect(isAwaitingPutaway({ location: "D04-01-A", status: "putaway" })).toBe(false);
  });

  it("excludes shipped and picking pallets", () => {
    expect(isAwaitingPutaway({ location: null, status: "shipped" })).toBe(false);
    expect(isAwaitingPutaway({ location: null, status: "picking" })).toBe(false);
  });

  it("includes a released pallet again (no location, staged)", () => {
    // After the release the pallet is back to "staged" with no location.
    expect(isAwaitingPutaway({ location: null, status: "staged" })).toBe(true);
    expect(isPalletLocked({ location: null, status: "staged" })).toBe(false);
  });
});
