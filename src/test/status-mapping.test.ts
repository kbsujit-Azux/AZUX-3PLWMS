import { describe, it, expect } from "vitest";
import { mapWoStatusToInboundStatus } from "@/lib/firestore-data";

/**
 * Regression guard for:
 *   "Failed to update status: Function WriteBatch.update() called with
 *    invalid data. Unsupported field value: undefined (found in field
 *    status in document workOrders/...)"
 *
 * The work order and the inbound container use DIFFERENT status
 * vocabularies. Passing one straight into the other produced `undefined`,
 * which Firestore rejects on a batch write.
 */
describe("work order ⇄ inbound status mapping", () => {
  it("maps every work order status to a valid inbound status", () => {
    const woStatuses = [
      "scheduled",
      "at_dock",
      "unloading",
      "received",
      "departed",
      "closed",
    ] as const;
    for (const s of woStatuses) {
      const mapped = mapWoStatusToInboundStatus(s);
      expect(mapped).toBeTruthy();
      expect(["scheduled", "arrived", "on_dock", "putaway", "received", "exception"]).toContain(
        mapped,
      );
    }
  });

  it("maps the unloading state to the inbound putaway state", () => {
    expect(mapWoStatusToInboundStatus("unloading")).toBe("putaway");
  });

  it("maps at dock to arrived and the terminal states to received", () => {
    expect(mapWoStatusToInboundStatus("at_dock")).toBe("arrived");
    expect(mapWoStatusToInboundStatus("departed")).toBe("received");
    expect(mapWoStatusToInboundStatus("closed")).toBe("received");
  });

  it("passes inbound statuses through unchanged", () => {
    expect(mapWoStatusToInboundStatus("arrived")).toBe("arrived");
    expect(mapWoStatusToInboundStatus("on_dock")).toBe("on_dock");
    expect(mapWoStatusToInboundStatus("putaway")).toBe("putaway");
    expect(mapWoStatusToInboundStatus("exception")).toBe("exception");
  });

  it("falls back for an unknown status instead of returning undefined", () => {
    expect(mapWoStatusToInboundStatus("something-else")).toBe("scheduled");
    expect(mapWoStatusToInboundStatus("something-else", "on_dock")).toBe("on_dock");
  });

  it("never returns undefined for any input", () => {
    for (const s of ["", "x", "RECEIVED", "at_dock", "unloading", "12"]) {
      expect(mapWoStatusToInboundStatus(s)).toBeDefined();
    }
  });
});
