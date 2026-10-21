import { describe, it, expect } from "vitest";
import { palletWeightLbs, palletCasePack } from "@/lib/pallet-data";

/**
 * Regression guard for the pallet weight and case pack.
 *
 * A pallet built before the Item Master carried a unit weight ends up
 * with weightLbs = 0 and casePack = 1, which showed on the Palletization
 * screen as "0 lb" and "24 cases @ 1/case".
 */
const itemMaster = [
  { sku: "SKU-A", caseQty: 24, weightLbs: 1.1 },
  { sku: "SKU-B", caseQty: 48, weightLbs: 0.4 },
] as any;

describe("palletWeightLbs", () => {
  it("uses the stored weight when it is set", () => {
    const w = palletWeightLbs({ sku: "SKU-A", units: 24, weightLbs: 99 }, itemMaster);
    expect(w).toBe(99);
  });

  it("derives the weight from the Item Master when it is missing", () => {
    const w = palletWeightLbs({ sku: "SKU-A", units: 24, weightLbs: 0 }, itemMaster);
    expect(w).toBe(26.4);
  });

  it("derives the weight when the field is undefined", () => {
    const w = palletWeightLbs({ sku: "SKU-B", units: 48 }, itemMaster);
    expect(w).toBe(19.2);
  });

  it("returns 0 for an unknown SKU with no stored weight", () => {
    const w = palletWeightLbs({ sku: "NOPE", units: 10, weightLbs: 0 }, itemMaster);
    expect(w).toBe(0);
  });
});

describe("palletCasePack", () => {
  it("uses the stored case pack when it is set", () => {
    expect(palletCasePack({ sku: "SKU-A", casePack: 12 }, itemMaster)).toBe(12);
  });

  it("falls back to the Item Master when the case pack is 1", () => {
    expect(palletCasePack({ sku: "SKU-A", casePack: 1 }, itemMaster)).toBe(24);
  });

  it("falls back to the Item Master when the case pack is missing", () => {
    expect(palletCasePack({ sku: "SKU-B" }, itemMaster)).toBe(48);
  });

  it("returns 1 for an unknown SKU with no case pack", () => {
    expect(palletCasePack({ sku: "NOPE" }, itemMaster)).toBe(1);
  });
});
