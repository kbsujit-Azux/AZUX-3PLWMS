import { describe, it, expect } from "vitest";
import { assessContainer } from "@/components/container-confirm-dialog";

/**
 * Regression guard for the close / depart confirmation.
 *
 * Closing a container is irreversible. The operator must be shown what is
 * outstanding: short lines, over-receipts, damaged stock and pallets that
 * are not put away. Anything blocking must be visible and acknowledged.
 */
const inbound = {
  id: "INB-1",
  lines: [
    {
      lineNo: 1,
      sku: "A",
      qtyExpected: 100,
      receivedQty: 100,
      damagedQty: 0,
      palletIds: ["PLT-1"],
    },
    {
      lineNo: 2,
      sku: "B",
      qtyExpected: 50,
      receivedQty: 50,
      damagedQty: 0,
      palletIds: ["PLT-2"],
    },
  ],
};

const pallets = [
  { id: "PLT-1", shipmentId: "INB-1", status: "putaway", location: "A12-03-B" },
  { id: "PLT-2", shipmentId: "INB-1", status: "putaway", location: "A12-04-A" },
];

describe("assessContainer", () => {
  it("reports everything in order when the container is complete", () => {
    const a = assessContainer(inbound, pallets);
    expect(a.issues).toHaveLength(1);
    expect(a.issues[0].severity).toBe("ok");
    expect(a.blocking).toHaveLength(0);
    expect(a.totals).toMatchObject({
      expectedUnits: 150,
      receivedUnits: 150,
      variance: 0,
      damagedUnits: 0,
      palletsTotal: 2,
      palletsPutAway: 2,
      palletsStaged: 0,
    });
  });

  it("flags a short line as blocking", () => {
    const a = assessContainer(
      {
        ...inbound,
        lines: [{ ...inbound.lines[0], receivedQty: 60 }, inbound.lines[1]],
      },
      pallets,
    );
    const short = a.issues.find((i) => i.title.includes("is short"));
    expect(short).toBeDefined();
    expect(short!.severity).toBe("error");
    expect(a.blocking.length).toBeGreaterThan(0);
  });

  it("flags a pallet that is not put away as blocking", () => {
    const a = assessContainer(inbound, [
      pallets[0],
      { id: "PLT-2", shipmentId: "INB-1", status: "staged", location: null },
    ]);
    const notPut = a.issues.find((i) => i.title.includes("not put away"));
    expect(notPut).toBeDefined();
    expect(notPut!.severity).toBe("error");
    expect(a.totals.palletsStaged).toBe(1);
  });

  it("flags damaged stock as a warning", () => {
    const a = assessContainer(
      {
        ...inbound,
        lines: [{ ...inbound.lines[0], damagedQty: 10, osdReason: "crushed" }, inbound.lines[1]],
      },
      pallets,
    );
    const dmg = a.issues.find((i) => i.title.includes("damaged"));
    expect(dmg).toBeDefined();
    expect(dmg!.severity).toBe("warning");
    expect(dmg!.detail).toContain("crushed");
    expect(a.totals.damagedUnits).toBe(10);
  });

  it("flags an over-receipt against the ASN", () => {
    const a = assessContainer(
      {
        ...inbound,
        lines: [
          { ...inbound.lines[0], qtyExpected: 80, receivedQty: 100, foundQty: 100 },
          inbound.lines[1],
        ],
      },
      pallets,
    );
    const over = a.issues.find((i) => i.title.includes("over the ASN"));
    expect(over).toBeDefined();
    expect(over!.severity).toBe("warning");
  });

  it("ignores pallets that belong to another container", () => {
    const a = assessContainer(inbound, [
      ...pallets,
      { id: "PLT-9", shipmentId: "INB-OTHER", status: "staged", location: null },
    ]);
    expect(a.issues.some((i) => i.title.includes("PLT-9"))).toBe(false);
    expect(a.totals.palletsTotal).toBe(2);
  });

  it("links the operator to the screen that fixes the problem", () => {
    const a = assessContainer(
      {
        ...inbound,
        lines: [{ ...inbound.lines[0], receivedQty: 60 }, inbound.lines[1]],
      },
      pallets,
    );
    expect(a.issues[0].action?.to).toBeTruthy();
  });

  it("reports the variance", () => {
    const a = assessContainer(
      {
        ...inbound,
        lines: [
          { ...inbound.lines[0], receivedQty: 80 },
          { ...inbound.lines[1], receivedQty: 50 },
        ],
      },
      pallets,
    );
    expect(a.totals.variance).toBe(-20);
  });
});
