import { seedBols, buildBolFromOrder, emit945ForBol, type BillOfLading } from "./bol-data";
import { orders } from "./edi-data";

/** 3PL shipment lifecycle — yard / dock operations layered on top of a BOL. */
export type ShipmentStatus =
  | "pending" // BOL drafted, awaiting staging
  | "staged" // Freight staged at a dock door
  | "loading" // Driver checked in, loading in progress
  | "tendered" // BOL signed, 945 sent, awaiting departure
  | "in-transit" // Trailer departed yard
  | "delivered" // POD captured
  | "exception"; // Hold / refused / damage

export type Shipment = {
  id: string; // SHP-xxxxx
  bolId: string; // FK → BillOfLading.id
  orderIds: string[]; // Underlying SO ids (1 for single BOL, N for master)
  tenantId: string;
  warehouseId: string;
  carrier: string;
  scac: string;
  serviceLevel: string;
  mode: "LTL" | "TL" | "Parcel" | "Intermodal";
  status: ShipmentStatus;

  // Yard / dock ops
  dockDoor: string; // e.g. "D-12"
  appointmentAt: string; // ISO — scheduled pickup window
  driverName?: string;
  driverPhone?: string;
  checkInAt?: string; // Driver check-in timestamp
  departedAt?: string; // Trailer left yard
  deliveredAt?: string; // POD captured
  podSignedBy?: string;

  // Equipment
  trailerNumber: string;
  sealNumber: string;
  proNumber: string;

  // Cargo snapshot (denormalized for the list view)
  shipTo: string;
  pallets: number;
  cartons: number;
  weightLbs: number;
  declaredValue: number;
};

const MODE_BY_CARRIER: Record<string, Shipment["mode"]> = {
  FedEx: "Parcel",
  UPS: "Parcel",
  USPS: "Parcel",
  "JB Hunt": "TL",
  "Schneider National": "TL",
  "OTR LTL": "LTL",
  Maersk: "Intermodal",
  OOCL: "Intermodal",
};

const DOORS = ["D-01", "D-02", "D-03", "D-05", "D-07", "D-09", "D-12", "D-14"];

function statusForBol(b: BillOfLading): ShipmentStatus {
  switch (b.status) {
    case "draft":
      return "pending";
    case "issued":
      return "staged";
    case "tendered":
      return "tendered";
    case "in-transit":
      return "in-transit";
    case "delivered":
      return "delivered";
    default:
      return "pending";
  }
}

function deriveShipment(b: BillOfLading): Shipment {
  const o = orders.find((x) => x.id === b.childOrderIds[0]);
  const seedNum = b.id.split("").reduce((h, c) => (h * 17 + c.charCodeAt(0)) >>> 0, 7);
  const door = DOORS[seedNum % DOORS.length];
  const hourOffset = (seedNum % 8) + 6; // 06:00 → 14:00 window
  const appt = new Date(b.pickupDate);
  appt.setUTCHours(hourOffset, 0, 0, 0);
  const status = statusForBol(b);

  return {
    id: `SHP-${b.id
      .replace(/^M?BOL-/, "")
      .slice(0, 10)
      .padEnd(5, "0")
      .toUpperCase()}-${((seedNum % 9000) + 1000).toString()}`,
    bolId: b.id,
    orderIds: b.childOrderIds,
    tenantId: b.tenantId,
    warehouseId: b.warehouseId,
    carrier: b.carrier,
    scac: b.scac,
    serviceLevel: b.serviceLevel,
    mode: MODE_BY_CARRIER[b.carrier] ?? (b.totals.pallets >= 12 ? "TL" : "LTL"),
    status,
    dockDoor: door,
    appointmentAt: appt.toISOString(),
    driverName:
      status !== "pending"
        ? ["M. Alvarez", "J. Chen", "R. O'Connell", "T. Brooks", "S. Whitfield"][seedNum % 5]
        : undefined,
    driverPhone:
      status !== "pending"
        ? `${((seedNum % 800) + 200).toString().padStart(3, "0")}-555-${((seedNum % 9000) + 1000).toString()}`
        : undefined,
    checkInAt:
      status === "loading" ||
      status === "tendered" ||
      status === "in-transit" ||
      status === "delivered"
        ? new Date(appt.getTime() - 15 * 60_000).toISOString()
        : undefined,
    departedAt:
      status === "in-transit" || status === "delivered"
        ? new Date(appt.getTime() + 90 * 60_000).toISOString()
        : undefined,
    deliveredAt:
      status === "delivered" ? new Date(appt.getTime() + 26 * 3600_000).toISOString() : undefined,
    podSignedBy: status === "delivered" ? (b.consignee.contact ?? "Receiving") : undefined,
    trailerNumber: b.trailerNumber,
    sealNumber: b.sealNumber,
    proNumber: b.proNumber,
    shipTo: `${b.consignee.city}, ${b.consignee.state}`,
    pallets: b.totals.pallets,
    cartons: b.totals.cartons,
    weightLbs: b.totals.weightLbs,
    declaredValue: b.declaredValue,
  };
}

export type CarrierDispatch = Shipment;

const _bols: BillOfLading[] = [...seedBols];
// Backfill any order missing a BOL so every shipment ties to one.
for (const o of orders) {
  if (!_bols.some((b) => b.childOrderIds.includes(o.id))) {
    _bols.push(buildBolFromOrder(o));
  }
}

const _shipments: Shipment[] = _bols.map(deriveShipment);

export const shipments = _shipments;
export const shipmentBols = _bols;

export function getBolForShipment(shipmentId: string): BillOfLading | undefined {
  const s = _shipments.find((x) => x.id === shipmentId);
  if (!s) return undefined;
  return _bols.find((b) => b.id === s.bolId);
}

export function getShipmentForOrder(orderId: string): Shipment | undefined {
  return _shipments.find((s) => s.orderIds.includes(orderId));
}

/* ────────── lifecycle transitions ──────────────────────────────── */

function patchBol(bolId: string, status: BillOfLading["status"]) {
  const i = _bols.findIndex((b) => b.id === bolId);
  if (i >= 0) _bols[i] = { ..._bols[i], status };
}

export function transitionShipment(
  id: string,
  next: ShipmentStatus,
  extras: Partial<Shipment> = {},
): Shipment | undefined {
  const i = _shipments.findIndex((s) => s.id === id);
  if (i < 0) return undefined;
  const now = new Date().toISOString();
  const updated: Shipment = { ..._shipments[i], status: next, ...extras };

  if (next === "loading" && !updated.checkInAt) updated.checkInAt = now;
  if (next === "in-transit" && !updated.departedAt) updated.departedAt = now;
  if (next === "delivered" && !updated.deliveredAt) updated.deliveredAt = now;

  _shipments[i] = updated;

  // Mirror to BOL + fire 945 on tender
  if (next === "staged") patchBol(updated.bolId, "issued");
  if (next === "tendered") {
    patchBol(updated.bolId, "tendered");
    const bol = _bols.find((b) => b.id === updated.bolId);
    if (bol) emit945ForBol(bol);
  }
  if (next === "in-transit") patchBol(updated.bolId, "in-transit");
  if (next === "delivered") patchBol(updated.bolId, "delivered");

  return updated;
}

export function recordPod(id: string, signedBy: string): Shipment | undefined {
  return transitionShipment(id, "delivered", { podSignedBy: signedBy });
}

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "pending",
  "staged",
  "loading",
  "tendered",
  "in-transit",
  "delivered",
  "exception",
];
