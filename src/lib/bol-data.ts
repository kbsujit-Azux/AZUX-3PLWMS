import { orders, type Order, type OrderLine } from "./edi-data";
import { inventoryItems, tenants, warehouses } from "./mock-data";
import { ediLogs, type EdiLog } from "./edi-data";

/** VICS Bill of Lading — Voluntary Interindustry Commerce Standards (v3.1) */
export type FreightChargeTerms = "prepaid" | "collect" | "third-party";
export type BolType = "single" | "master";
export type BolStatus = "draft" | "issued" | "tendered" | "in-transit" | "delivered" | "void";

export type Party = {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  contact?: string;
  phone?: string;
  sid?: string; // Shipper ID
  cid?: string; // Consignee ID
  fob?: boolean;
};

/** A single freight line on the VICS BOL — NMFC / freight class / pkg type. */
export type BolFreightLine = {
  qty: number; // Handling units (pallets / cartons)
  pkgType: "PLT" | "CTN" | "CRT" | "BAG";
  weightLbs: number;
  nmfc: string; // NMFC item code
  freightClass:
    | "50"
    | "55"
    | "60"
    | "65"
    | "70"
    | "77.5"
    | "85"
    | "92.5"
    | "100"
    | "110"
    | "125"
    | "150"
    | "175"
    | "200"
    | "250"
    | "300"
    | "400"
    | "500";
  hazmat: boolean;
  description: string;
  sku: string;
  poNumber: string; // Customer PO ref (links to source order)
  orderId: string; // Internal SO #
};

export type BillOfLading = {
  id: string; // Internal BOL #
  proNumber: string; // Carrier PRO #
  bolNumber: string; // Formal BOL number printed on doc
  type: BolType;
  status: BolStatus;
  tenantId: string;
  warehouseId: string;
  carrier: string;
  scac: string; // Standard Carrier Alpha Code
  serviceLevel: string;
  trailerNumber: string;
  sealNumber: string;
  freightChargeTerms: FreightChargeTerms;
  thirdPartyAccount?: string;
  cod: number; // Cash on delivery $
  declaredValue: number;
  shipper: Party;
  consignee: Party;
  billTo?: Party;
  specialInstructions: string;
  pickupDate: string; // ISO
  createdAt: string;
  childOrderIds: string[]; // 1 for single, N for master
  childBolIds?: string[]; // master BOL → underlying single BOL ids
  lines: BolFreightLine[];
  totals: { units: number; pallets: number; cartons: number; weightLbs: number };
};

export type Bol = BillOfLading;

/* ────────── derivation helpers ───────────────────────────────────── */

const SCAC: Record<string, string> = {
  FedEx: "FXFE",
  UPS: "UPSN",
  USPS: "USPS",
  Maersk: "MAEU",
  "JB Hunt": "JBHT",
  "OTR LTL": "OTRL",
  "Schneider National": "SNDR",
  OOCL: "OOLU",
};

const NMFC_BY_CATEGORY: Record<string, { nmfc: string; class: BolFreightLine["freightClass"] }> = {
  Camping: { nmfc: "087700", class: "150" },
  Apparel: { nmfc: "049880", class: "125" },
  Electronics: { nmfc: "063270", class: "92.5" },
  Wellness: { nmfc: "157800", class: "100" },
  Default: { nmfc: "999999", class: "100" },
};

function consigneeFor(order: Order): Party {
  // Mock destination registry keyed by ship-to label
  const map: Record<string, Party> = {
    "Asheville, NC": {
      name: "Blue Ridge Outfitters",
      address1: "118 Patton Ave",
      city: "Asheville",
      state: "NC",
      zip: "28801",
      contact: "K. Watts",
      phone: "828-555-0118",
      cid: "CID-AVL-014",
    },
    "Madison, WI": {
      name: "Lakeside Apparel Hub",
      address1: "2401 University Ave",
      city: "Madison",
      state: "WI",
      zip: "53726",
      contact: "P. Larsen",
      phone: "608-555-2401",
      cid: "CID-MSN-007",
    },
    "Phoenix, AZ": {
      name: "Desert Wear Distribution",
      address1: "5012 N 7th St",
      city: "Phoenix",
      state: "AZ",
      zip: "85014",
      contact: "T. Ruiz",
      phone: "602-555-5012",
      cid: "CID-PHX-031",
    },
    "Boston, MA": {
      name: "Charles River Electronics",
      address1: "88 Sleeper St",
      city: "Boston",
      state: "MA",
      zip: "02210",
      contact: "M. Donovan",
      phone: "617-555-0088",
      cid: "CID-BOS-022",
    },
    "Austin, TX": {
      name: "Lone Star Wellness Co",
      address1: "6100 S Congress Ave",
      city: "Austin",
      state: "TX",
      zip: "78745",
      contact: "J. Hale",
      phone: "512-555-6100",
      cid: "CID-AUS-009",
    },
    "Knoxville, TN": {
      name: "Smoky Mtn Outdoor LLC",
      address1: "401 Henley St",
      city: "Knoxville",
      state: "TN",
      zip: "37902",
      contact: "R. Patel",
      phone: "865-555-0401",
      cid: "CID-TYS-018",
    },
    "Denver, CO": {
      name: "Front Range Wellness",
      address1: "1437 Larimer St",
      city: "Denver",
      state: "CO",
      zip: "80202",
      contact: "S. Becker",
      phone: "303-555-1437",
      cid: "CID-DEN-026",
    },
  };
  return (
    map[order.shipToName] ?? {
      name: order.shipToName,
      address1: order.shipToAddress1,
      city: order.shipToCity,
      state: order.shipToState,
      zip: order.shipToZip,
    }
  );
}

function shipperFor(warehouseId: string, tenantId: string): Party {
  const wh = warehouses.find((w) => w.id === warehouseId);
  const t = tenants.find((x) => x.id === tenantId);
  const map: Record<string, Omit<Party, "name">> = {
    atl1: {
      address1: "4825 Fulton Industrial Blvd SW",
      city: "Atlanta",
      state: "GA",
      zip: "30336",
      contact: "Receiving Dept",
      phone: "404-555-0102",
      sid: "SID-ATL1-001",
    },
    ord2: {
      address1: "1701 Pratt Blvd",
      city: "Elk Grove Vlg",
      state: "IL",
      zip: "60007",
      contact: "Receiving Dept",
      phone: "847-555-0204",
      sid: "SID-ORD2-001",
    },
    lax3: {
      address1: "2050 E Carson St",
      city: "Long Beach",
      state: "CA",
      zip: "90810",
      contact: "Receiving Dept",
      phone: "562-555-0306",
      sid: "SID-LAX3-001",
    },
    ewr1: {
      address1: "880 Doremus Ave",
      city: "Newark",
      state: "NJ",
      zip: "07105",
      contact: "Receiving Dept",
      phone: "973-555-0408",
      sid: "SID-EWR1-001",
    },
  };
  const base = map[warehouseId] ?? { address1: "—", city: "—", state: "—", zip: "—" };
  return { name: `AZUX 3PL · ${wh?.code ?? "WH"} (c/o ${t?.name ?? "Client"})`, ...base };
}

function lineForOrderLine(o: Order, ol: OrderLine): BolFreightLine {
  const item = inventoryItems.find((i) => i.sku === ol.sku);
  const cat = item?.category ?? "Default";
  const nmfc = NMFC_BY_CATEGORY[cat] ?? NMFC_BY_CATEGORY.Default;
  const weight = +(ol.qtyOrdered * (item?.weightLbs ?? 1)).toFixed(1);
  const isPallet = ol.qtyOrdered >= 48;
  const qty = isPallet
    ? Math.max(1, Math.ceil(ol.qtyOrdered / Math.max(1, item?.caseQty ?? 1) / 12))
    : Math.max(1, Math.ceil(ol.qtyOrdered / Math.max(1, item?.caseQty ?? 1)));
  return {
    qty,
    pkgType: isPallet ? "PLT" : "CTN",
    weightLbs: weight,
    nmfc: nmfc.nmfc,
    freightClass: nmfc.class,
    hazmat: false,
    description: ol.description,
    sku: ol.sku,
    poNumber: o.poNumber,
    orderId: o.id,
  };
}

function totalsOf(lines: BolFreightLine[]) {
  let pallets = 0,
    cartons = 0,
    weightLbs = 0;
  for (const l of lines) {
    if (l.pkgType === "PLT") pallets += l.qty;
    else cartons += l.qty;
    weightLbs += l.weightLbs;
  }
  const units = lines.reduce((a, l) => a + l.qty * 1, 0);
  return { units, pallets, cartons, weightLbs: +weightLbs.toFixed(1) };
}

function bolNumberFor(seed: string, type: BolType): string {
  const hash = seed.split("").reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const prefix = type === "master" ? "MBOL" : "BOL";
  return `${prefix}-${hash.toString().slice(-9).padStart(9, "0")}`;
}

function proFor(scac: string, seed: string): string {
  const hash = seed.split("").reduce((h, c) => (h * 17 + c.charCodeAt(0)) >>> 0, 1);
  const n = (1000000 + (hash % 8999999)).toString();
  const check = (n.split("").reduce((a, d) => a + parseInt(d, 10), 0) % 10).toString();
  return `${scac}-${n}-${check}`;
}

/** Build a single-order VICS BOL from an Order. */
export function buildBolFromOrder(o: Order): BillOfLading {
  const scac = SCAC[o.carrier] ?? "MISC";
  const lines = o.lines.map((ol) => lineForOrderLine(o, ol));
  const totals = totalsOf(lines);
  return {
    id: `BOL-${o.id}`,
    proNumber: proFor(scac, o.id),
    bolNumber: bolNumberFor(o.id, "single"),
    type: "single",
    status: o.status === "shipped" ? "in-transit" : o.status === "packed" ? "issued" : "draft",
    tenantId: o.tenantId,
    warehouseId: o.warehouseId,
    carrier: o.carrier,
    scac,
    serviceLevel: o.serviceLevel,
    trailerNumber: `TRL-${scac}-${o.id.slice(-4)}`,
    sealNumber: `SL-${o.id.slice(-5)}`,
    freightChargeTerms: "prepaid",
    cod: 0,
    declaredValue: +o.lines.reduce((a, l) => a + l.qtyOrdered * l.unitPrice, 0).toFixed(2),
    shipper: shipperFor(o.warehouseId, o.tenantId),
    consignee: consigneeFor(o),
    specialInstructions:
      "Driver: count & sign for all pieces. Do not break seal without WH supervisor.",
    pickupDate: o.mustShipDate,
    createdAt: o.receivedAt,
    childOrderIds: [o.id],
    lines,
    totals,
  };
}

/** Group eligible orders by destination + carrier to surface Master BOL candidates. */
export type ConsolidationGroup = {
  key: string; // destination|carrier
  shipToName: string;
  carrier: string;
  warehouseId: string;
  orderIds: string[];
  totalUnits: number;
  totalWeightLbs: number;
  tenantIds: string[]; // Multi-tenant master BOLs allowed under same 3PL
};

export function buildConsolidationGroups(pool: Order[] = orders): ConsolidationGroup[] {
  const groups = new Map<string, ConsolidationGroup>();
  for (const o of pool) {
    if (o.status === "shipped" || o.status === "exception") continue;
    const key = `${o.shipToName}|${o.carrier}|${o.warehouseId}`;
    const ex = groups.get(key);
    const units = o.lines.reduce((a, l) => a + l.qtyOrdered, 0);
    const weight = o.lines.reduce((a, l) => {
      const i = inventoryItems.find((x) => x.sku === l.sku);
      return a + l.qtyOrdered * (i?.weightLbs ?? 1);
    }, 0);
    if (ex) {
      ex.orderIds.push(o.id);
      ex.totalUnits += units;
      ex.totalWeightLbs = +(ex.totalWeightLbs + weight).toFixed(1);
      if (!ex.tenantIds.includes(o.tenantId)) ex.tenantIds.push(o.tenantId);
    } else {
      groups.set(key, {
        key,
        shipToName: o.shipToName,
        carrier: o.carrier,
        warehouseId: o.warehouseId,
        orderIds: [o.id],
        totalUnits: units,
        totalWeightLbs: +weight.toFixed(1),
        tenantIds: [o.tenantId],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.orderIds.length - a.orderIds.length);
}

/** Consolidate a group of orders into a Master BOL. */
export function buildMasterBol(orderIds: string[]): BillOfLading {
  const subset = orders.filter((o) => orderIds.includes(o.id));
  if (subset.length === 0) throw new Error("No orders to consolidate");
  const first = subset[0];
  const scac = SCAC[first.carrier] ?? "MISC";
  const lines: BolFreightLine[] = [];
  const childBolIds: string[] = [];
  for (const o of subset) {
    childBolIds.push(`BOL-${o.id}`);
    for (const ol of o.lines) lines.push(lineForOrderLine(o, ol));
  }
  const totals = totalsOf(lines);
  const seed = `MBOL-${orderIds.join("+")}`;
  return {
    id: `MBOL-${first.shipToName.replace(/\W+/g, "")}-${first.carrier.replace(/\W+/g, "")}`,
    proNumber: proFor(scac, seed),
    bolNumber: bolNumberFor(seed, "master"),
    type: "master",
    status: "draft",
    tenantId: first.tenantId, // Originating tenant
    warehouseId: first.warehouseId,
    carrier: first.carrier,
    scac,
    serviceLevel: first.serviceLevel,
    trailerNumber: `TRL-${scac}-MAS${seed.length}`,
    sealNumber: `SL-MAS-${seed.length.toString().padStart(5, "0")}`,
    freightChargeTerms: "prepaid",
    cod: 0,
    declaredValue: +subset
      .reduce((a, o) => a + o.lines.reduce((b, l) => b + l.qtyOrdered * l.unitPrice, 0), 0)
      .toFixed(2),
    shipper: shipperFor(first.warehouseId, first.tenantId),
    consignee: consigneeFor(first),
    specialInstructions: `Master BOL consolidating ${subset.length} underlying shipments. Deliver as single drop — segregate by underlying BOL upon receipt.`,
    pickupDate: subset.map((o) => o.mustShipDate).sort()[0],
    createdAt: new Date().toISOString(),
    childOrderIds: subset.map((o) => o.id),
    childBolIds,
    lines,
    totals,
  };
}

/** Seed BOLs derived from existing orders so the documents view is never empty. */
export const seedBols: BillOfLading[] = orders
  .filter((o) => o.status === "shipped" || o.status === "packed" || o.status === "released")
  .map((o) => buildBolFromOrder(o));

/* ────────── EDI 945 auto-transmission ──────────────────────────────── */

const PARTNER_BY_TENANT: Record<string, string> = {
  acme: "ACME-VAN/SPS",
  northstar: "NSAP-EDI/OpenText",
  harborlite: "HLE-EDI/Cleo",
  verdant: "VRDN-EDI/SPS",
};

let _ctrlSeq = 44200;
const nextCtrl = () => {
  _ctrlSeq += 1;
  return _ctrlSeq.toString().padStart(9, "0");
};

/** Build an EDI 945 (Warehouse Shipping Advice) log entry from a BOL and
 *  prepend it to the shared EDI log stream so the EDI Hub sees the auto-fire. */
export function emit945ForBol(bol: BillOfLading): EdiLog {
  const isa = nextCtrl();
  const gs = isa.slice(-5);
  const segments = 18 + bol.lines.length * 6 + bol.childOrderIds.length * 3;
  const bytes = segments * 104;
  const refId =
    bol.type === "master"
      ? `MBOL-${bol.bolNumber.slice(-6)}`
      : `SO-${bol.childOrderIds[0]?.replace(/^SO-/, "") ?? bol.bolNumber.slice(-6)}-A`;
  const log: EdiLog = {
    id: `EDI-${_ctrlSeq}`,
    txn: "945",
    direction: "outbound",
    status: "processed",
    partner: PARTNER_BY_TENANT[bol.tenantId] ?? "ACME-VAN/SPS",
    isaControl: isa,
    gsControl: gs,
    documentRef: refId,
    tenantId: bol.tenantId,
    warehouseId: bol.warehouseId,
    segments,
    bytes,
    receivedAt: new Date().toISOString(),
    ackStatus: "999",
    message:
      bol.type === "master"
        ? `945 auto-fired — Master BOL ${bol.bolNumber} tendered to ${bol.carrier} (${bol.scac}), ${bol.childOrderIds.length} sub-shipments, PRO ${bol.proNumber}`
        : `945 auto-fired — BOL ${bol.bolNumber} tendered to ${bol.carrier} (${bol.scac}), ${bol.totals.pallets} PLT / ${bol.totals.cartons} CTN, PRO ${bol.proNumber}`,
  };
  ediLogs.unshift(log);
  return log;
}
