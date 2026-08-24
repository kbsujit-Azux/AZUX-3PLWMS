import { describe, it, expect } from "vitest";
import { canAllocate, canPick, canShip, getOrderStatusLabel } from "@/lib/allocation-engine";

describe("Allocation Engine Authority", () => {
  it("canAllocate returns true for new order", () => {
    const order = {
      id: "test-1",
      status: "new" as const,
      lines: [{ sku: "TEST-1", qty: 10 }],
    };
    expect(canAllocate(order)).toBe(true);
  });

  it("canAllocate returns false for shipped order", () => {
    const order = {
      id: "test-2",
      status: "shipped" as const,
      lines: [{ sku: "TEST-2", qty: 5 }],
    };
    expect(canAllocate(order)).toBe(false);
  });

  it("canPick returns true for allocated order", () => {
    const order = {
      id: "test-3",
      status: "ALLOCATED" as const,
      lines: [{ sku: "TEST-3", qty: 3 }],
    };
    expect(canPick(order)).toBe(true);
  });

  it("canShip returns true for picked order", () => {
    const order = {
      id: "test-4",
      status: "PICKED" as const,
      lines: [{ sku: "TEST-4", qty: 2 }],
    };
    expect(canShip(order)).toBe(true);
  });

  it("getOrderStatusLabel returns human readable status", () => {
    expect(getOrderStatusLabel("new")).toBe("NEW");
    expect(getOrderStatusLabel("ALLOCATED")).toBe("ALLOCATED");
    expect(getOrderStatusLabel("PICKED")).toBe("PICKED");
    expect(getOrderStatusLabel("shipped")).toBe("SHIPPED");
  });
});
