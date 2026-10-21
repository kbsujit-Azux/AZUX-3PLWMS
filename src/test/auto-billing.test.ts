import { describe, it, expect } from "vitest";
import { selectBillableUnits, type AutoBillInput } from "@/lib/auto-billing";
import type { ChargeRule } from "@/lib/billing-data";

/**
 * The bill for a closed container is configuration driven: the client's
 * charge rules decide what is billed. These tests lock down that decision
 * so a client with a carton rule is not accidentally billed for palletising
 * (and vice versa).
 */
const base: AutoBillInput = {
  clientId: "northstar",
  tenantId: "northstar",
  warehouseId: "ord2",
  shipmentId: "INB-1",
  units: 288,
  cartons: 9,
  pallets: 9,
  cuFt: 22.96,
  closedAt: "2026-10-21T12:00:00.000Z",
};

const rule = (over: Partial<ChargeRule>): ChargeRule =>
  ({
    id: "r",
    clientId: "northstar",
    tenantId: "northstar",
    category: "Inbound",
    description: "",
    unit: "carton",
    rate: 0.45,
    enabled: true,
    ...over,
  }) as ChargeRule;

describe("auto-billing unit selection", () => {
  it("bills only the units the client has rules for", () => {
    const units = selectBillableUnits(base, [
      rule({ unit: "carton" }),
    ]);
    expect(units).toEqual([{ unit: "carton", quantity: 9 }]);
  });

  it("bills cartons AND pallets when both are configured", () => {
    const units = selectBillableUnits(base, [
      rule({ unit: "carton" }),
      rule({ unit: "pallet", rate: 8.25 }),
    ]);
    expect(units.map((u) => u.unit).sort()).toEqual(["carton", "pallet"]);
  });

  it("ignores disabled rules", () => {
    const units = selectBillableUnits(base, [
      rule({ unit: "carton" }),
      rule({ unit: "pallet", enabled: false }),
    ]);
    expect(units).toEqual([{ unit: "carton", quantity: 9 }]);
  });

  it("ignores rules for another category", () => {
    const units = selectBillableUnits(base, [
      rule({ unit: "carton", category: "Outbound" }),
    ]);
    expect(units).toEqual([]);
  });

  it("ignores a unit with nothing captured", () => {
    const units = selectBillableUnits(
      { ...base, pallets: 0, cartons: 0 },
      [rule({ unit: "carton" }), rule({ unit: "pallet" })],
    );
    expect(units).toEqual([]);
  });

  it("always bills the container handling once per container", () => {
    const units = selectBillableUnits(base, [rule({ unit: "container" })]);
    expect(units).toEqual([{ unit: "container", quantity: 1 }]);
  });

  it("bills volume only when cubic feet were captured", () => {
    const withCuFt = selectBillableUnits(base, [rule({ unit: "cubicFeet" })]);
    expect(withCuFt).toEqual([{ unit: "cubicFeet", quantity: 22.96 }]);

    const withoutCuFt = selectBillableUnits(
      { ...base, cuFt: 0 },
      [rule({ unit: "cubicFeet" })],
    );
    expect(withoutCuFt).toEqual([]);
  });

  it("returns nothing when the client has no rules at all", () => {
    expect(selectBillableUnits(base, [])).toEqual([]);
  });
});
