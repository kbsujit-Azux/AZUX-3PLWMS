import { describe, it, expect } from "vitest";
import { checkDataIntegrity, INTEGRITY_CHECKS } from "@/lib/data-integrity";

/**
 * Regression guard for the data correlation checker.
 *
 * Every check must detect its broken reference and stay silent when the
 * data is consistent — a checker that cries wolf is worse than none.
 */
const base = {
  pallets: [
    {
      id: "PLT-1",
      sku: "SKU-A",
      units: 40,
      location: "LOC-1",
      shipmentId: "INB-1",
      status: "staged",
      tenantId: "acme",
      warehouseId: "atl1",
    },
  ],
  inboundShipments: [
    {
      id: "INB-1",
      tenantId: "acme",
      warehouseId: "atl1",
      workOrderId: "INB-1",
      lines: [
        {
          lineNo: 1,
          sku: "SKU-A",
          qtyExpected: 100,
          receivedQty: 40,
          palletIds: ["PLT-1"],
          status: "partial",
        },
      ],
    },
  ],
  workOrders: [{ id: "INB-1", tenantId: "acme", warehouseId: "atl1" }],
  inventoryItems: [
    { sku: "SKU-A", tenantId: "acme", warehouseId: "atl1", batches: [{ palletId: "PLT-1", qty: 40 }] },
  ],
  itemMaster: [{ sku: "SKU-A", itemStyle: "STYLE-A", description: "A", category: "C", uom: "EA", tenantId: "acme", caseQty: 1, unitCost: 0, unitPrice: 0, weightLbs: 1, lengthIn: 1, widthIn: 1, heightIn: 1, caseWeightLbs: 1, cbmPerCase: 1, nmfc: "x", freightClass: "100", packHierarchy: [], basePackLevel: "each", palletBuild: { maxPalletHeightIn: 60, maxPalletWeightLbs: 2500, stackability: "full", palletPattern: "interlock", allowMixedSku: false, palletType: "standard_48x40" }, active: true, source: "CSV", effectiveAt: "2026-01-01T00:00:00Z" }] as any,
  locationMaster: [
    { id: "LOC-1", warehouseId: "atl1", type: "RACK", zone: "Reserve", capacityPallets: 4, occupiedPallets: 1, pickable: true, allowedItemStyles: null, slottingRules: { allowedStorageClasses: ["reserve"], putawayPriority: 50, replenPriority: 50, allowedPalletTypes: ["standard_48x40"] }, status: "active" },
  ] as any,
  tenants: [{ id: "acme", code: "ACME", name: "Acme" }],
  warehouses: [{ id: "atl1", code: "ATL1", city: "Atlanta" }],
};

describe("Data integrity checker", () => {
  it("registers every correlation check", () => {
    expect(INTEGRITY_CHECKS.length).toBeGreaterThanOrEqual(10);
  });

  it("reports no issues for consistent data", () => {
    const issues = checkDataIntegrity(base as any);
    expect(issues.map((i) => i.type)).toEqual([]);
  });

  it("P1 — flags a pallet whose container is gone", () => {
    const issues = checkDataIntegrity({
      ...base,
      inboundShipments: [],
      workOrders: [],
    } as any);
    const issue = issues.find((i) => i.type === "pallet-missing-container");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    expect(issue!.autoFixable).toBe(true);
  });

  it("P2 — flags a receipt line that references a deleted pallet", () => {
    const issues = checkDataIntegrity({
      ...base,
      pallets: [],
    } as any);
    const issue = issues.find((i) => i.type === "line-missing-pallet");
    expect(issue).toBeDefined();
    expect(issue!.recordId).toBe("INB-1:1");
  });

  it("P3 — flags a pallet stored in an unknown location", () => {
    const issues = checkDataIntegrity({
      ...base,
      pallets: [{ ...base.pallets[0], location: "GONE" }],
    } as any);
    expect(issues.some((i) => i.type === "pallet-missing-location")).toBe(true);
  });

  it("P4 — flags a pallet with an unknown SKU", () => {
    const issues = checkDataIntegrity({
      ...base,
      pallets: [{ ...base.pallets[0], sku: "NOPE" }],
    } as any);
    const issue = issues.find((i) => i.type === "pallet-missing-item");
    expect(issue).toBeDefined();
    expect(issue!.autoFixable).toBe(false);
  });

  it("P5 — flags a received quantity that disagrees with the pallets", () => {
    const issues = checkDataIntegrity({
      ...base,
      inboundShipments: [
        {
          ...base.inboundShipments[0],
          lines: [{ ...base.inboundShipments[0].lines[0], receivedQty: 999 }],
        },
      ],
    } as any);
    const issue = issues.find((i) => i.type === "pallet-units-drift");
    expect(issue).toBeDefined();
    expect(issue!.detail).toContain("999");
  });

  it("S1 — flags a container with a missing work order", () => {
    const issues = checkDataIntegrity({
      ...base,
      workOrders: [],
    } as any);
    expect(issues.some((i) => i.type === "container-missing-workorder")).toBe(true);
  });

  it("S2 — flags an orphaned work order", () => {
    const issues = checkDataIntegrity({
      ...base,
      inboundShipments: [],
    } as any);
    expect(issues.some((i) => i.type === "orphan-workorder")).toBe(true);
  });

  it("S3 — flags a receipt line with an unknown SKU", () => {
    const issues = checkDataIntegrity({
      ...base,
      inboundShipments: [
        {
          ...base.inboundShipments[0],
          lines: [{ ...base.inboundShipments[0].lines[0], sku: "NOPE" }],
        },
      ],
    } as any);
    expect(issues.some((i) => i.type === "line-missing-item")).toBe(true);
  });

  it("S4 — flags a container booked to an unknown client", () => {
    const issues = checkDataIntegrity({
      ...base,
      inboundShipments: [{ ...base.inboundShipments[0], tenantId: "ghost" }],
    } as any);
    expect(issues.some((i) => i.type === "container-missing-party")).toBe(true);
  });

  it("I1 — flags an inventory batch with no pallet", () => {
    const issues = checkDataIntegrity({
      ...base,
      pallets: [],
    } as any);
    expect(issues.some((i) => i.type === "inventory-missing-pallet")).toBe(true);
  });

  it("L1 — flags a putaway pallet with no location", () => {
    const issues = checkDataIntegrity({
      ...base,
      pallets: [{ ...base.pallets[0], status: "putaway", location: null }],
    } as any);
    expect(issues.some((i) => i.type === "putaway-without-location")).toBe(true);
  });

  it("L2 — flags a location whose occupancy counter is stale", () => {
    const issues = checkDataIntegrity({
      ...base,
      locationMaster: [{ ...base.locationMaster[0], occupiedPallets: 7 }],
    } as any);
    const issue = issues.find((i) => i.type === "location-occupancy-drift");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  it("sorts errors before warnings", () => {
    const issues = checkDataIntegrity({
      ...base,
      locationMaster: [{ ...base.locationMaster[0], occupiedPallets: 7 }],
      pallets: [{ ...base.pallets[0], status: "putaway", location: null }],
    } as any);
    const firstWarning = issues.findIndex((i) => i.severity === "warning");
    const lastError = issues.map((i) => i.severity).lastIndexOf("error");
    if (firstWarning !== -1 && lastError !== -1) {
      expect(lastError).toBeLessThan(firstWarning);
    }
  });

  it("does not throw on empty data", () => {
    expect(() => checkDataIntegrity({})).not.toThrow();
    expect(checkDataIntegrity({})).toEqual([]);
  });
});
