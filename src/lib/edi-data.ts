export type EdiTxnType = "832" | "940" | "943" | "944" | "945";
export type EdiDirection = "inbound" | "outbound";
export type EdiStatus = "accepted" | "processed" | "pending" | "warning" | "rejected";

export type EdiTxnMeta = {
  type: EdiTxnType;
  name: string;
  direction: EdiDirection;
  description: string;
};

export const EDI_TXNS: EdiTxnMeta[] = [
  {
    type: "832",
    name: "Price / Sales Catalog",
    direction: "inbound",
    description: "Item master — SKU, UPC, cost, case qty, dimensions",
  },
  {
    type: "940",
    name: "Warehouse Shipping Order",
    direction: "inbound",
    description: "Outbound order instructions from client / OMS",
  },
  {
    type: "943",
    name: "Stock Transfer Shipment Advice",
    direction: "inbound",
    description: "ASN-style inbound notice for replenishment receipts",
  },
  {
    type: "944",
    name: "Stock Transfer Receipt Advice",
    direction: "outbound",
    description: "Confirmation back to client once receipt is posted",
  },
  {
    type: "945",
    name: "Warehouse Shipping Advice",
    direction: "outbound",
    description: "Confirmation that an outbound 940 was picked & shipped",
  },
];

export type EdiLog = {
  id: string;
  txn: EdiTxnType;
  direction: EdiDirection;
  status: EdiStatus;
  partner: string; // Trading partner / VAN identifier
  isaControl: string; // ISA13
  gsControl: string; // GS06
  documentRef: string; // BSN02 / W05 / etc.
  tenantId: string;
  warehouseId: string;
  segments: number;
  bytes: number;
  receivedAt: string;
  ackStatus: "997-TA1" | "997-AK9" | "999" | "pending" | "—";
  message: string;
};

const ts = (d: string) => new Date(d).toISOString();

export const ediLogs: EdiLog[] = [
  {
    id: "EDI-44120",
    txn: "832",
    direction: "inbound",
    status: "processed",
    partner: "ACME-VAN/SPS",
    isaControl: "000044120",
    gsControl: "44120",
    documentRef: "CAT-2026-Q2",
    tenantId: "acme",
    warehouseId: "atl1",
    segments: 1284,
    bytes: 184320,
    receivedAt: ts("2026-05-19T06:14:00Z"),
    ackStatus: "997-AK9",
    message: "Catalog refresh — 412 SKUs upserted, 3 deactivated",
  },
  {
    id: "EDI-44119",
    txn: "940",
    direction: "inbound",
    status: "accepted",
    partner: "NSAP-EDI/OpenText",
    isaControl: "000044119",
    gsControl: "44119",
    documentRef: "PO-770412",
    tenantId: "northstar",
    warehouseId: "ord2",
    segments: 86,
    bytes: 9216,
    receivedAt: ts("2026-05-19T05:58:00Z"),
    ackStatus: "997-TA1",
    message: "Outbound order received — 24 lines, ship by 2026-05-21",
  },
  {
    id: "EDI-44118",
    txn: "943",
    direction: "inbound",
    status: "processed",
    partner: "ACME-VAN/SPS",
    isaControl: "000044118",
    gsControl: "44118",
    documentRef: "ASN-554301",
    tenantId: "acme",
    warehouseId: "atl1",
    segments: 142,
    bytes: 14848,
    receivedAt: ts("2026-05-19T04:22:00Z"),
    ackStatus: "997-AK9",
    message: "ASN received — 6 pallets, gate appointment 09:00",
  },
  {
    id: "EDI-44117",
    txn: "945",
    direction: "outbound",
    status: "processed",
    partner: "HLE-EDI/Cleo",
    isaControl: "000044117",
    gsControl: "44117",
    documentRef: "SO-310995-A",
    tenantId: "harborlite",
    warehouseId: "ewr1",
    segments: 58,
    bytes: 6144,
    receivedAt: ts("2026-05-19T03:11:00Z"),
    ackStatus: "999",
    message: "Shipping advice transmitted — UPS 1Z…7F4, 18 cartons",
  },
  {
    id: "EDI-44116",
    txn: "944",
    direction: "outbound",
    status: "pending",
    partner: "VRDN-EDI/SPS",
    isaControl: "000044116",
    gsControl: "44116",
    documentRef: "RCT-220114",
    tenantId: "verdant",
    warehouseId: "atl1",
    segments: 41,
    bytes: 4096,
    receivedAt: ts("2026-05-19T02:40:00Z"),
    ackStatus: "pending",
    message: "Receipt advice queued for transmission to trading partner",
  },
  {
    id: "EDI-44115",
    txn: "940",
    direction: "inbound",
    status: "warning",
    partner: "NSAP-EDI/OpenText",
    isaControl: "000044115",
    gsControl: "44115",
    documentRef: "PO-770411",
    tenantId: "northstar",
    warehouseId: "lax3",
    segments: 92,
    bytes: 9728,
    receivedAt: ts("2026-05-19T01:05:00Z"),
    ackStatus: "997-AK9",
    message: "Order accepted with warnings — SKU NSA-TEE-WHT-L allocated short",
  },
  {
    id: "EDI-44114",
    txn: "832",
    direction: "inbound",
    status: "rejected",
    partner: "HLE-EDI/Cleo",
    isaControl: "000044114",
    gsControl: "44114",
    documentRef: "CAT-INC-04",
    tenantId: "harborlite",
    warehouseId: "ewr1",
    segments: 18,
    bytes: 1820,
    receivedAt: ts("2026-05-18T23:48:00Z"),
    ackStatus: "997-AK9",
    message: "Rejected — PRC02 missing on 4 line items (HLE-CHRG-65W…)",
  },
  {
    id: "EDI-44113",
    txn: "943",
    direction: "inbound",
    status: "processed",
    partner: "NSAP-EDI/OpenText",
    isaControl: "000044113",
    gsControl: "44113",
    documentRef: "ASN-770201",
    tenantId: "northstar",
    warehouseId: "ord2",
    segments: 210,
    bytes: 22528,
    receivedAt: ts("2026-05-18T22:30:00Z"),
    ackStatus: "997-AK9",
    message: "ASN received — 12 pallets cross-dock candidate",
  },
  {
    id: "EDI-44112",
    txn: "945",
    direction: "outbound",
    status: "processed",
    partner: "ACME-VAN/SPS",
    isaControl: "000044112",
    gsControl: "44112",
    documentRef: "SO-554120-A",
    tenantId: "acme",
    warehouseId: "atl1",
    segments: 64,
    bytes: 6656,
    receivedAt: ts("2026-05-18T21:15:00Z"),
    ackStatus: "999",
    message: "Shipping advice transmitted — FedEx 7724…2210, 4 cartons",
  },
  {
    id: "EDI-44111",
    txn: "940",
    direction: "inbound",
    status: "accepted",
    partner: "VRDN-EDI/SPS",
    isaControl: "000044111",
    gsControl: "44111",
    documentRef: "PO-220115",
    tenantId: "verdant",
    warehouseId: "ord2",
    segments: 72,
    bytes: 7680,
    receivedAt: ts("2026-05-18T20:02:00Z"),
    ackStatus: "997-TA1",
    message: "Outbound order received — 11 lines, hold flag on lot review",
  },
  {
    id: "EDI-44110",
    txn: "944",
    direction: "outbound",
    status: "processed",
    partner: "ACME-VAN/SPS",
    isaControl: "000044110",
    gsControl: "44110",
    documentRef: "RCT-554301",
    tenantId: "acme",
    warehouseId: "atl1",
    segments: 38,
    bytes: 3712,
    receivedAt: ts("2026-05-18T18:50:00Z"),
    ackStatus: "999",
    message: "Receipt advice acknowledged by trading partner",
  },
  {
    id: "EDI-44109",
    txn: "832",
    direction: "inbound",
    status: "processed",
    partner: "VRDN-EDI/SPS",
    isaControl: "000044109",
    gsControl: "44109",
    documentRef: "CAT-2026-05",
    tenantId: "verdant",
    warehouseId: "atl1",
    segments: 410,
    bytes: 51200,
    receivedAt: ts("2026-05-18T17:24:00Z"),
    ackStatus: "997-AK9",
    message: "Catalog refresh — 96 SKUs, 12 price changes",
  },
];

export type OrderLine = {
  sku: string;
  description: string;
  upc?: string;
  style?: string;
  color?: string;
  size?: string;
  dim?: string;
  qtyOrdered: number;
  qtyAllocated: number;
  cartons?: number;
  unitPrice: number;
};

export type OrderStatus =
  | "new"
  | "released"
  | "picking"
  | "packed"
  | "shipped"
  | "exception"
  | "ALLOCATED"
  | "PICKED";

export type Order = {
  id: string; // Internal order number
  customerOrderNumber?: string;
  poNumber: string; // EDI 940 BEG03 / customer PO
  ediRef: string; // EDI 940 W05 shipment id
  tenantId: string;
  warehouseId: string;

  shipToCode: string;
  shipToName: string;
  shipToAddress1: string;
  shipToAddress2?: string;
  shipToCity: string;
  shipToState: string;
  shipToZip: string;

  billToCode?: string;
  billToName?: string;
  billToAddress1?: string;
  billToAddress2?: string;
  billToCity?: string;
  billToState?: string;
  billToZip?: string;

  carrier: string;
  serviceLevel: string;
  status:
    | "new"
    | "released"
    | "picking"
    | "packed"
    | "shipped"
    | "exception"
    | "ALLOCATED"
    | "PICKED";
  source: "EDI-940" | "CSV" | "API" | "MANUAL";
  receivedAt: string;
  entryDate: string;
  cancelDate: string;
  mustShipDate: string;

  lines: OrderLine[];
};

const defaultAddress = {
  shipToCode: "DEF",
  shipToAddress1: "123 Main St",
  shipToCity: "Anytown",
  shipToState: "NY",
  shipToZip: "10001",
  entryDate: ts("2026-05-17T14:00:00Z"),
  cancelDate: ts("2026-06-18T23:59:00Z"),
};

export const orders: Order[] = [
  {
    id: "SO-2026-001",
    customerOrderNumber: "CO-2026-001",
    poNumber: "PO-2026-001",
    ediRef: "EDI-940-001",
    tenantId: "acme",
    warehouseId: "atl1",
    shipToCode: "AVL",
    shipToName: "Asheville, NC",
    shipToAddress1: "118 Patton Ave",
    shipToCity: "Asheville",
    shipToState: "NC",
    shipToZip: "28801",
    carrier: "FedEx",
    serviceLevel: "Ground",
    status: "new",
    source: "EDI-940",
    receivedAt: ts("2026-05-19T08:00:00Z"),
    entryDate: ts("2026-05-19T08:00:00Z"),
    cancelDate: ts("2026-06-18T23:59:00Z"),
    mustShipDate: ts("2026-05-21T17:00:00Z"),
    lines: [
      {
        sku: "ACM-TENT-2P-OLV",
        description: "Ridgeline 2-Person Tent, Olive",
        qtyOrdered: 48,
        qtyAllocated: 0,
        unitPrice: 189,
      },
    ],
  },
  {
    id: "SO-2026-002",
    customerOrderNumber: "CO-2026-002",
    poNumber: "PO-2026-002",
    ediRef: "EDI-940-002",
    tenantId: "northstar",
    warehouseId: "ord2",
    shipToCode: "ORD",
    shipToName: "Madison, WI",
    shipToAddress1: "2401 University Ave",
    shipToCity: "Madison",
    shipToState: "WI",
    shipToZip: "53726",
    carrier: "UPS",
    serviceLevel: "Ground",
    status: "new",
    source: "EDI-940",
    receivedAt: ts("2026-05-19T08:30:00Z"),
    entryDate: ts("2026-05-19T08:30:00Z"),
    cancelDate: ts("2026-06-18T23:59:00Z"),
    mustShipDate: ts("2026-05-21T17:00:00Z"),
    lines: [
      {
        sku: "NSA-HOOD-BLK-M",
        description: "Classic Pullover Hoodie, Black, M",
        qtyOrdered: 240,
        qtyAllocated: 0,
        unitPrice: 48,
      },
    ],
  },
  {
    id: "SO-2026-003",
    customerOrderNumber: "CO-2026-003",
    poNumber: "PO-2026-003",
    ediRef: "EDI-940-003",
    tenantId: "harborlite",
    warehouseId: "ewr1",
    shipToCode: "BOS",
    shipToName: "Boston, MA",
    shipToAddress1: "88 Sleeper St",
    shipToCity: "Boston",
    shipToState: "MA",
    shipToZip: "02210",
    carrier: "FedEx",
    serviceLevel: "Express",
    status: "new",
    source: "API",
    receivedAt: ts("2026-05-19T09:00:00Z"),
    entryDate: ts("2026-05-19T09:00:00Z"),
    cancelDate: ts("2026-06-18T23:59:00Z"),
    mustShipDate: ts("2026-05-20T17:00:00Z"),
    lines: [
      {
        sku: "HLE-EARB-PRO",
        description: "ProSound Wireless Earbuds Gen 3",
        qtyOrdered: 150,
        qtyAllocated: 0,
        unitPrice: 129,
      },
    ],
  },
  {
    id: "SO#-000000005",
    customerOrderNumber: "CO#-000000005",
    poNumber: "PO#-000000005",
    ediRef: "EDI-940-005",
    tenantId: "acme",
    warehouseId: "atl1",
    shipToCode: "AVL",
    shipToName: "Test Order 5",
    shipToAddress1: "123 Test St",
    shipToCity: "Testville",
    shipToState: "NY",
    shipToZip: "10001",
    carrier: "FedEx",
    serviceLevel: "Ground",
    status: "new",
    source: "MANUAL",
    receivedAt: ts("2026-01-15T08:00:00Z"),
    entryDate: ts("2026-01-15T08:00:00Z"),
    cancelDate: ts("2026-02-15T23:59:00Z"),
    mustShipDate: ts("2026-01-20T17:00:00Z"),
    lines: [
      {
        sku: "ACM-TENT-2P-OLV",
        description: "Ridgeline 2-Person Tent, Olive",
        qtyOrdered: 24,
        qtyAllocated: 0,
        unitPrice: 189,
      },
      {
        sku: "ACM-STV-CMP-01",
        description: "Compact Camp Stove, Single Burner",
        qtyOrdered: 36,
        qtyAllocated: 0,
        unitPrice: 54.99,
      },
    ],
  },
  {
    id: "SO#-000000006",
    customerOrderNumber: "CO#-000000006",
    poNumber: "PO#-000000006",
    ediRef: "EDI-940-006",
    tenantId: "acme",
    warehouseId: "atl1",
    shipToCode: "AVL",
    shipToName: "Test Order 6",
    shipToAddress1: "123 Test St",
    shipToCity: "Testville",
    shipToState: "NY",
    shipToZip: "10001",
    carrier: "FedEx",
    serviceLevel: "Ground",
    status: "new",
    source: "MANUAL",
    receivedAt: ts("2026-01-16T08:00:00Z"),
    entryDate: ts("2026-01-16T08:00:00Z"),
    cancelDate: ts("2026-02-16T23:59:00Z"),
    mustShipDate: ts("2026-01-21T17:00:00Z"),
    lines: [
      {
        sku: "ACM-TENT-2P-OLV",
        description: "Ridgeline 2-Person Tent, Olive",
        qtyOrdered: 48,
        qtyAllocated: 0,
        unitPrice: 189,
      },
    ],
  },
  {
    id: "SO#-000000002",
    customerOrderNumber: "CO#-000000002",
    poNumber: "PO#-000000002",
    ediRef: "EDI-940-002",
    tenantId: "acme",
    warehouseId: "atl1",
    shipToCode: "AVL",
    shipToName: "Test Order 2",
    shipToAddress1: "123 Test St",
    shipToCity: "Testville",
    shipToState: "NY",
    shipToZip: "10001",
    carrier: "FedEx",
    serviceLevel: "Ground",
    status: "new",
    source: "MANUAL",
    receivedAt: ts("2026-01-15T08:00:00Z"),
    entryDate: ts("2026-01-15T08:00:00Z"),
    cancelDate: ts("2026-02-15T23:59:00Z"),
    mustShipDate: ts("2026-01-20T17:00:00Z"),
    lines: [
      {
        sku: "ACM-TENT-2P-OLV",
        description: "Ridgeline 2-Person Tent, Olive",
        qtyOrdered: 48,
        qtyAllocated: 0,
        unitPrice: 189,
      },
    ],
  },
];
