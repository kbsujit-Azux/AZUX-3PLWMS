import { describe, it, expect } from "vitest";
import { stripUndefinedDeep } from "@/lib/firestore-data";

/**
 * Regression guard for "Failed to save rule: Unsupported field value:
 * undefined (found in field warehouseId in document chargeRules/...)".
 *
 * Firestore's client SDK rejects `undefined` anywhere in a document, so
 * every optional field on a partially filled charge rule had to be
 * removed before the write.
 */
describe("stripUndefinedDeep", () => {
  it("removes an undefined optional field", () => {
    const rule = {
      id: "r1",
      clientId: "acme",
      warehouseId: undefined,
      enabled: true,
    };
    const clean = stripUndefinedDeep(rule);
    expect(clean).not.toHaveProperty("warehouseId");
    expect(clean.id).toBe("r1");
    expect(clean.enabled).toBe(true);
  });

  it("removes every undefined field of a charge rule", () => {
    const rule = {
      id: "r2",
      clientId: "northstar",
      tenantId: "northstar",
      category: "Inbound",
      description: "Custom charge",
      unit: "carton",
      rate: 0.45,
      enabled: true,
      autoCapture: true,
      warehouseId: undefined,
      locationId: undefined,
      ratePerCuFt: undefined,
      frequency: undefined,
      customCycleDays: undefined,
      trigger: undefined,
      priceTiers: undefined,
      minMonthlyCharge: undefined,
      peakSurchargePct: undefined,
      peakStartMonth: undefined,
      peakEndMonth: undefined,
      accessorialType: undefined,
    };
    const clean = stripUndefinedDeep(rule) as Record<string, unknown>;
    for (const key of [
      "warehouseId",
      "locationId",
      "ratePerCuFt",
      "frequency",
      "customCycleDays",
      "trigger",
      "priceTiers",
      "minMonthlyCharge",
      "peakSurchargePct",
      "peakStartMonth",
      "peakEndMonth",
      "accessorialType",
    ]) {
      expect(clean).not.toHaveProperty(key);
    }
    expect(clean.description).toBe("Custom charge");
    expect(clean.rate).toBe(0.45);
  });

  it("keeps meaningful falsy values", () => {
    const clean = stripUndefinedDeep({
      rate: 0,
      autoCapture: false,
      enabled: false,
      minMonthlyCharge: 0,
    }) as Record<string, unknown>;
    expect(clean.rate).toBe(0);
    expect(clean.autoCapture).toBe(false);
    expect(clean.enabled).toBe(false);
    expect(clean.minMonthlyCharge).toBe(0);
  });

  it("strips undefined inside nested objects and arrays", () => {
    const clean = stripUndefinedDeep({
      priceTiers: [{ minQty: 1, maxQty: null, rate: 1, note: undefined }],
      nested: { a: 1, b: undefined },
    }) as Record<string, any>;
    expect(clean.priceTiers[0]).not.toHaveProperty("note");
    expect(clean.nested).not.toHaveProperty("b");
    expect(clean.nested.a).toBe(1);
  });

  it("leaves null alone — null is a valid Firestore value", () => {
    const clean = stripUndefinedDeep({
      warehouseId: null,
      locationId: null,
    }) as Record<string, unknown>;
    expect(clean.warehouseId).toBeNull();
    expect(clean.locationId).toBeNull();
  });
});
