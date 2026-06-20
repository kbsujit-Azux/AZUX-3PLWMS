import { warehouses } from "./mock-data";

/** EDI 943 — Stock Transfer Shipment Advice (inbound ASN). */
export type InboundLine = {
  lineNo: number;
  sku: string;
  upc: string;
  itemStyle: string;
  description: string;
  lot: string;                  // EDI 943 LOT01 — supplier lot / batch
  expirationDate: string;       // ISO date — EDI 943 DTM/036
  qtyExpected: number;          // Units
  cartonsExpected: number;      // EDI 943 N1*CN / cartons
  uom: string;
  weightLbsPerUnit: number;
  unitsPerPallet: number;       // Tied to item-style pallet build
  receivedQty: number;          // Updated post-receipt
  palletIds: string[];          // Pallets created from this line
  status: "expected" | "partial" | "received";
};

export type InboundShipment = {
  id: string;                   // Internal receipt id
  ediRef: string;               // EDI 943 BSN02
  isaControl: string;
  tenantId: string;
  warehouseId: string;
  partner: string;
  carrier: string;
  trailerNumber: string;        // Trailer / container #
  containerNumber: string;      // Ocean / intermodal container
  sealNumber: string;
  bolNumber: string;            // Bill of Lading
  origin: string;
  poNumber: string;
  appointmentAt: string;        // Scheduled gate appointment
  expectedAt: string;
  receivedAt: string | null;
  doorAssigned: string | null;
  status: "scheduled" | "arrived" | "unloading" | "received" | "exception";
  source: "EDI_943" | "EDI_944" | "CSV" | "MANUAL";
  lines: InboundLine[];
};

const ts = (d: string) => new Date(d).toISOString();

export const inboundShipments: InboundShipment[] = [
  {
    id: "INB-2026-0519-001",
    ediRef: "ASN-554301",
    isaControl: "000044118",
    tenantId: "acme",
    warehouseId: "atl1",
    partner: "ACME-VAN/SPS",
    carrier: "Schneider National",
    trailerNumber: "SNDR-884221",
    containerNumber: "—",
    sealNumber: "SL-77104",
    bolNumber: "BOL-554301",
    origin: "Greenville, SC (DC-04)",
    poNumber: "PO-554301",
    appointmentAt: ts("2026-05-19T09:00:00Z"),
    expectedAt: ts("2026-05-19T09:00:00Z"),
    receivedAt: null,
    doorAssigned: "D-07",
    status: "arrived",
    source: "EDI_943",
    lines: [
      { lineNo: 1, sku: "ACM-TENT-2P-OLV", upc: "081234500017", itemStyle: "TENT-2P", description: "Ridgeline 2P Tent, Olive",
        lot: "LOT-TNT-2604A", expirationDate: ts("2029-05-01T00:00:00Z"),
        qtyExpected: 96, cartonsExpected: 24, uom: "EA", weightLbsPerUnit: 6.2,
        unitsPerPallet: 48, receivedQty: 0, palletIds: [], status: "expected" },
      { lineNo: 2, sku: "ACM-STV-CMP-01", upc: "081234500024", itemStyle: "STV-CMP", description: "Compact Camp Stove",
        lot: "LOT-STV-2605B", expirationDate: ts("2030-12-31T00:00:00Z"),
        qtyExpected: 144, cartonsExpected: 12, uom: "EA", weightLbsPerUnit: 1.8,
        unitsPerPallet: 72, receivedQty: 0, palletIds: [], status: "expected" },
      { lineNo: 3, sku: "ACM-LANTERN-LED", upc: "081234500048", itemStyle: "LANTERN-LED", description: "Trailhead LED Lantern, 400lm",
        lot: "LOT-LTN-2605C", expirationDate: ts("2030-05-01T00:00:00Z"),
        qtyExpected: 60, cartonsExpected: 10, uom: "EA", weightLbsPerUnit: 0.9,
        unitsPerPallet: 60, receivedQty: 0, palletIds: [], status: "expected" },
    ],
  },
  {
    id: "INB-2026-0519-002",
    ediRef: "ASN-770201",
    isaControl: "000044113",
    tenantId: "northstar",
    warehouseId: "ord2",
    partner: "NSAP-EDI/OpenText",
    carrier: "Maersk",
    trailerNumber: "—",
    containerNumber: "MSKU-7720418",
    sealNumber: "SL-22019",
    bolNumber: "BOL-770201",
    origin: "Long Beach, CA (Port)",
    poNumber: "PO-770221",
    appointmentAt: ts("2026-05-19T11:30:00Z"),
    expectedAt: ts("2026-05-19T11:30:00Z"),
    receivedAt: null,
    doorAssigned: "D-12",
    status: "unloading",
    source: "EDI_943",
    lines: [
      { lineNo: 1, sku: "NSA-HOOD-BLK-M", upc: "087654300010", itemStyle: "HOOD-CLASSIC", description: "Classic Hoodie, Black, M",
        lot: "LOT-HD-26Q2-01", expirationDate: ts("2031-01-01T00:00:00Z"),
        qtyExpected: 960, cartonsExpected: 40, uom: "EA", weightLbsPerUnit: 1.1,
        unitsPerPallet: 240, receivedQty: 480, palletIds: ["PLT-ORD2-01244", "PLT-ORD2-01302"], status: "partial" },
      { lineNo: 2, sku: "NSA-TEE-WHT-L", upc: "087654300027", itemStyle: "TEE-PREMIUM", description: "Premium Tee White, L",
        lot: "LOT-TEE-26Q2-04", expirationDate: ts("2031-01-01T00:00:00Z"),
        qtyExpected: 2880, cartonsExpected: 60, uom: "EA", weightLbsPerUnit: 0.4,
        unitsPerPallet: 1440, receivedQty: 0, palletIds: [], status: "expected" },
    ],
  },
  {
    id: "INB-2026-0519-003",
    ediRef: "ASN-310995",
    isaControl: "000044107",
    tenantId: "harborlite",
    warehouseId: "ewr1",
    partner: "HLE-EDI/Cleo",
    carrier: "OOCL",
    trailerNumber: "—",
    containerNumber: "OOLU-3109952",
    sealNumber: "SL-91044",
    bolNumber: "BOL-310995",
    origin: "Shenzhen, CN (CFS)",
    poNumber: "PO-310995",
    appointmentAt: ts("2026-05-19T14:15:00Z"),
    expectedAt: ts("2026-05-19T14:15:00Z"),
    receivedAt: null,
    doorAssigned: null,
    status: "scheduled",
    source: "EDI_943",
    lines: [
      { lineNo: 1, sku: "HLE-EARB-PRO", upc: "099887700013", itemStyle: "EARB-PRO", description: "ProSound Earbuds Gen 3",
        lot: "LOT-EARB-2605", expirationDate: ts("2030-05-01T00:00:00Z"),
        qtyExpected: 1200, cartonsExpected: 60, uom: "EA", weightLbsPerUnit: 0.3,
        unitsPerPallet: 600, receivedQty: 0, palletIds: [], status: "expected" },
      { lineNo: 2, sku: "HLE-CHRG-65W", upc: "099887700020", itemStyle: "CHRG-USBC", description: "65W GaN USB-C Charger",
        lot: "LOT-CHRG-2605", expirationDate: ts("2030-05-01T00:00:00Z"),
        qtyExpected: 900, cartonsExpected: 30, uom: "EA", weightLbsPerUnit: 0.4,
        unitsPerPallet: 450, receivedQty: 0, palletIds: [], status: "expected" },
    ],
  },
  {
    id: "INB-2026-0518-014",
    ediRef: "ASN-220114",
    isaControl: "000044091",
    tenantId: "verdant",
    warehouseId: "atl1",
    partner: "VRDN-EDI/SPS",
    carrier: "JB Hunt",
    trailerNumber: "JBHT-554019",
    containerNumber: "—",
    sealNumber: "SL-44091",
    bolNumber: "BOL-220114",
    origin: "Salt Lake City, UT (DC-02)",
    poNumber: "PO-220114",
    appointmentAt: ts("2026-05-18T16:00:00Z"),
    expectedAt: ts("2026-05-18T16:00:00Z"),
    receivedAt: ts("2026-05-18T17:42:00Z"),
    doorAssigned: "D-03",
    status: "received",
    source: "EDI_944",
    lines: [
      { lineNo: 1, sku: "VRD-COLL-30CT", upc: "076500011120", itemStyle: "COLL-PWDR", description: "Collagen Peptides 30ct",
        lot: "LOT-COLL-26Q2", expirationDate: ts("2028-05-18T00:00:00Z"),
        qtyExpected: 72, cartonsExpected: 3, uom: "EA", weightLbsPerUnit: 0.8,
        unitsPerPallet: 72, receivedQty: 72, palletIds: ["PLT-ATL1-00955"], status: "received" },
    ],
  },
];

export function warehouseCode(warehouseId: string): string {
  return warehouses.find((w) => w.id === warehouseId)?.code ?? "WH";
}

export function inboundProgressPct(line: InboundLine): number {
  if (line.qtyExpected === 0) return 0;
  return Math.min(100, Math.round((line.receivedQty / line.qtyExpected) * 100));
}

export function shipmentProgressPct(s: InboundShipment): number {
  const exp = s.lines.reduce((a, l) => a + l.qtyExpected, 0);
  const rec = s.lines.reduce((a, l) => a + l.receivedQty, 0);
  return exp === 0 ? 0 : Math.min(100, Math.round((rec / exp) * 100));
}