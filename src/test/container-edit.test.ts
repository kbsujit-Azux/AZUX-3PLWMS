import { describe, it, expect } from "vitest";
import { projectInboundLine, projectWorkOrderLines } from "@/lib/inbound-data";
import type { InboundLine } from "@/lib/inbound-data";

/**
 * Regression guard for editing a container.
 *
 * Editing a container must not silently wipe the receiving variance (OSD)
 * or reset the work order's receipt state.
 */
const line: InboundLine = {
  lineNo: 1,
  sku: "VRD-MAG-GLY",
  upc: "076500011137",
  itemStyle: "MAG-GLY",
  description: "Magnesium Glycinate 120ct",
  lot: "",
  expirationDate: "2030-12-31",
  qtyExpected: 144,
  cartonsExpected: 4,
  uom: "EA",
  weightLbsPerUnit: 0.5,
  unitsPerPallet: 36,
  receivedQty: 144,
  palletIds: ["PLT-1", "PLT-2", "PLT-DMG"],
  status: "received",
  foundQty: 180,
  damagedQty: 36,
  osdType: "damaged",
  osdReason: "factory damaged",
  damagePalletId: "PLT-DMG",
};

describe("projectInboundLine", () => {
  it("keeps the receiving variance", () => {
    const p = projectInboundLine(line, 0);
    expect(p.foundQty).toBe(180);
    expect(p.damagedQty).toBe(36);
    expect(p.osdType).toBe("damaged");
    expect(p.osdReason).toBe("factory damaged");
    expect(p.damagePalletId).toBe("PLT-DMG");
  });

  it("keeps the receipt state and the pallet links", () => {
    const p = projectInboundLine(line, 0);
    expect(p.receivedQty).toBe(144);
    expect(p.status).toBe("received");
    expect(p.palletIds).toEqual(["PLT-1", "PLT-2", "PLT-DMG"]);
  });

  it("renumbers the line", () => {
    expect(projectInboundLine(line, 4).lineNo).toBe(5);
  });

  it("omits the variance fields when there is no variance", () => {
    const clean = {
      ...line,
      foundQty: undefined,
      damagedQty: undefined,
      osdType: undefined,
      osdReason: undefined,
      damagePalletId: undefined,
    };
    const p = projectInboundLine(clean, 0);
    expect(p).not.toHaveProperty("foundQty");
    expect(p).not.toHaveProperty("osdType");
  });
});

describe("projectWorkOrderLines", () => {
  it("carries the received quantity from the container line", () => {
    const wo = projectWorkOrderLines([line], []);
    expect(wo[0].qtyReceived).toBe(144);
    expect(wo[0].status).toBe("received");
  });

  it("preserves the receipt of an existing work order line", () => {
    // A container that has not been received yet, but the work order already
    // recorded a receipt — the work order state must win.
    const notReceived = { ...line, receivedQty: 0, status: "expected" as const };
    const existing = [{ lineNo: 1, sku: "VRD-MAG-GLY", qtyReceived: 96, status: "partial" }];
    const wo = projectWorkOrderLines([notReceived], existing);
    expect(wo[0].qtyReceived).toBe(96);
    expect(wo[0].status).toBe("partial");
  });

  it("falls back to pending for a brand new unreceived line", () => {
    const wo = projectWorkOrderLines([{ ...line, receivedQty: 0, status: "expected" }], []);
    expect(wo[0].qtyReceived).toBe(0);
    // The work order vocabulary has no "expected" — an unreceived line is pending.
    expect(wo[0].status).toBe("pending");
  });

  it("adds a line for a SKU found on the truck", () => {
    const newLine: InboundLine = {
      ...line,
      lineNo: 2,
      sku: "VRD-MAG-CIT",
      receivedQty: 0,
      status: "expected",
    };
    const wo = projectWorkOrderLines([line, newLine], []);
    expect(wo).toHaveLength(2);
    expect(wo[1].sku).toBe("VRD-MAG-CIT");
    expect(wo[1].qtyReceived).toBe(0);
  });
});
