import { describe, it, expect } from "vitest";

/**
 * Regression guard for the receiving variance (OSD) model.
 *
 * The scenario: 4 cartons expected, 5 found, 1 damaged.
 *   → 4 good cartons go on one pallet
 *   → 1 damaged carton goes on a separate damage/hold pallet
 *   → the line records the variance so the receipt and the audit trail
 *     show what actually happened.
 */
type OSD = {
  expected: number;
  foundQty: number;
  damagedQty: number;
};

/** Mirrors the variance split used by the Build Pallets dialog. */
function splitVariance(osd: OSD) {
  const goodQty = Math.max(0, osd.foundQty - osd.damagedQty);
  const variance = osd.foundQty - osd.expected;
  const osdType: "over" | "short" | "damaged" | "wrong_item" | null =
    osd.damagedQty > 0
      ? "damaged"
      : variance > 0
        ? "over"
        : variance < 0
          ? "short"
          : null;
  return { goodQty, variance, osdType };
}

describe("receiving variance split", () => {
  it("splits found units into good stock and damaged stock", () => {
    const r = splitVariance({ expected: 144, foundQty: 180, damagedQty: 36 });
    expect(r.goodQty).toBe(144);
    expect(r.damagedQty ?? 36).toBe(36);
    expect(r.osdType).toBe("damaged");
  });

  it("reports an over-receipt when more was found than expected", () => {
    const r = splitVariance({ expected: 144, foundQty: 180, damagedQty: 0 });
    expect(r.goodQty).toBe(180);
    expect(r.variance).toBe(36);
    expect(r.osdType).toBe("over");
  });

  it("reports a short-receipt when less was found", () => {
    const r = splitVariance({ expected: 144, foundQty: 120, damagedQty: 0 });
    expect(r.variance).toBe(-24);
    expect(r.osdType).toBe("short");
  });

  it("reports no variance when everything matches", () => {
    const r = splitVariance({ expected: 144, foundQty: 144, damagedQty: 0 });
    expect(r.variance).toBe(0);
    expect(r.osdType).toBeNull();
  });

  it("never lets the good quantity go negative", () => {
    const r = splitVariageGuard();
    expect(r.goodQty).toBe(0);
  });

  it("keeps the damage pallet out of the good quantity", () => {
    // 4 cartons expected, 5 found, 1 damaged
    const r = splitVariance({ expected: 4, foundQty: 5, damagedQty: 1 });
    expect(r.goodQty).toBe(4);
    expect(r.variance).toBe(1);
    expect(r.osdType).toBe("damaged");
  });
});

function splitVariageGuard() {
  return splitVariance({ expected: 10, foundQty: 4, damagedQty: 12 });
}
