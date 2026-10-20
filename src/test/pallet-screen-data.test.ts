import { describe, it, expect } from "vitest";
import { pickWaves, pallets } from "@/lib/pallet-data";
import { warehouses, tenants } from "@/lib/mock-data";
import { orders } from "@/lib/edi-data";
import { inboundShipments } from "@/lib/inbound-data";

/**
 * Regression guard for the "Cannot read properties of undefined (reading 'id')"
 * crash on the Pallet screen.
 *
 * The Pallet page seeds its state from these collections
 * (`useState(pickWaves[0].id)` and `useState(warehouses[0].id)`), so if any of
 * them resolve to an empty array at module-evaluation time the page throws
 * before it can render. These assertions fail loudly at build time instead of
 * crashing in the browser.
 */
describe("Pallet screen data prerequisites", () => {
  it("exposes at least one pick wave with an id", () => {
    expect(Array.isArray(pickWaves)).toBe(true);
    expect(pickWaves.length).toBeGreaterThan(0);
    expect(pickWaves[0]?.id).toBeTruthy();
  });

  it("exposes at least one warehouse with an id", () => {
    expect(Array.isArray(warehouses)).toBe(true);
    expect(warehouses.length).toBeGreaterThan(0);
    expect(warehouses[0]?.id).toBeTruthy();
  });

  it("exposes at least one client with an id", () => {
    expect(tenants.length).toBeGreaterThan(0);
    expect(tenants[0]?.id).toBeTruthy();
  });

  it("exposes pallet and order collections", () => {
    expect(Array.isArray(pallets)).toBe(true);
    expect(Array.isArray(orders)).toBe(true);
    expect(Array.isArray(inboundShipments)).toBe(true);
  });

  it("every pick wave resolves to an id and order reference", () => {
    for (const w of pickWaves) {
      expect(w.id).toBeTruthy();
      expect(w.orderId).toBeTruthy();
    }
  });

  it("every warehouse entry resolves to an id", () => {
    for (const w of warehouses) {
      expect(w.id).toBeTruthy();
    }
  });
});
