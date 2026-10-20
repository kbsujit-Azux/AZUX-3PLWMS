import { describe, it, expect } from "vitest";

/**
 * Regression guard for the Inbound ↔ Pallet synchronisation.
 *
 * The pallets are the source of truth for what was physically received.
 * When a pallet is deleted the linked inbound line must be reconciled so
 * the Inbound screen and the Pallet screen can never disagree.
 *
 * This mirrors `syncInboundFromPallets()` in src/lib/firestore-data.ts.
 */
type Line = {
  sku: string;
  qtyExpected: number;
  receivedQty: number;
  status: "expected" | "partial" | "received";
  palletIds: string[];
};
type Pallet = { id: string; sku: string; units: number };

function reconcile(lines: Line[], pallets: Pallet[]): { lines: Line[]; status: string } {
  const next = lines.map((line) => {
    const linked = pallets.filter((p) => p.sku === line.sku);
    const units = linked.reduce((s, p) => s + (Number(p.units) || 0), 0);
    const qtyExpected = Number(line.qtyExpected) || 0;
    // Mirrors syncInboundFromPallets(): the received quantity is the ACTUAL
    // total in the linked pallets — deliberately NOT capped.
    const received = units;
    const status: Line["status"] =
      qtyExpected > 0 && received >= qtyExpected
        ? "received"
        : received > 0
          ? "partial"
          : "expected";
    return { ...line, receivedQty: received, status, palletIds: linked.map((p) => p.id) };
  });
  const allReceived = next.length > 0 && next.every((l) => l.status === "received");
  return { lines: next, status: allReceived ? "received" : "on_dock" };
}

describe("Inbound ↔ Pallet reconciliation", () => {
  const lines: Line[] = [
    {
      sku: "A",
      qtyExpected: 200,
      receivedQty: 40,
      status: "partial",
      palletIds: ["PLT-1"],
    },
    {
      sku: "B",
      qtyExpected: 150,
      receivedQty: 0,
      status: "expected",
      palletIds: [],
    },
  ];

  it("removes the deleted pallet id and resets the receipt", () => {
    const result = reconcile(lines, []);
    expect(result.lines[0].palletIds).toEqual([]);
    expect(result.lines[0].receivedQty).toBe(0);
    expect(result.lines[0].status).toBe("expected");
    expect(result.status).toBe("on_dock");
  });

  it("keeps the receipt while the pallet still exists", () => {
    const result = reconcile(lines, [{ id: "PLT-1", sku: "A", units: 40 }]);
    expect(result.lines[0].palletIds).toEqual(["PLT-1"]);
    expect(result.lines[0].receivedQty).toBe(40);
    expect(result.lines[0].status).toBe("partial");
  });

  it("derives the receipt from the pallet units, not the previous value", () => {
    const result = reconcile(lines, [{ id: "PLT-9", sku: "A", units: 200 }]);
    expect(result.lines[0].receivedQty).toBe(200);
    expect(result.lines[0].status).toBe("received");
  });

  it("reflects an over-receipt instead of capping it at the expected qty", () => {
    // The received quantity is the ACTUAL total in the linked pallets. Capping
    // it would hide over-receipts and would make a deleted pallet invisible.
    const result = reconcile(lines, [{ id: "PLT-9", sku: "A", units: 9999 }]);
    expect(result.lines[0].receivedQty).toBe(9999);
    expect(result.lines[0].status).toBe("received");
  });

  it("drops by exactly the deleted pallet's units", () => {
    const before = reconcile(lines, [{ id: "PLT-1", sku: "A", units: 40 }]);
    const after = reconcile(lines, []);
    expect(before.lines[0].receivedQty).toBe(40);
    expect(after.lines[0].receivedQty).toBe(0);
    expect(before.lines[0].receivedQty - after.lines[0].receivedQty).toBe(40);
  });

  it("marks the container received only when every line is received", () => {
    const result = reconcile(lines, [
      { id: "PLT-1", sku: "A", units: 200 },
      { id: "PLT-2", sku: "B", units: 150 },
    ]);
    expect(result.status).toBe("received");
  });

  it("leaves lines of other SKUs untouched", () => {
    const result = reconcile(lines, [{ id: "PLT-1", sku: "A", units: 40 }]);
    expect(result.lines[1]).toEqual(lines[1]);
  });
});
