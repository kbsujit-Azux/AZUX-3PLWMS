export type Tenant = { id: string; name: string; code: string };
export type Warehouse = {
  id: string;
  name: string;
  code: string;
  city: string;
  capacityPct: number;
};

export const tenants: Tenant[] = [
  { id: "all", name: "All Clients", code: "ALL" },
  { id: "acme", name: "Acme Outdoor Co.", code: "ACME" },
  { id: "northstar", name: "Northstar Apparel", code: "NSAP" },
  { id: "harborlite", name: "Harborlite Electronics", code: "HLE" },
  { id: "verdant", name: "Verdant Wellness", code: "VRDN" },
];

export const warehouses: Warehouse[] = [
  { id: "all", name: "All Warehouses", code: "ALL", city: "—", capacityPct: 0 },
  { id: "atl1", name: "ATL-1 Distribution", code: "ATL1", city: "Atlanta, GA", capacityPct: 78 },
  { id: "ord2", name: "ORD-2 Fulfillment", code: "ORD2", city: "Chicago, IL", capacityPct: 64 },
  { id: "lax3", name: "LAX-3 Cross-Dock", code: "LAX3", city: "Los Angeles, CA", capacityPct: 91 },
  { id: "ewr1", name: "EWR-1 Bonded", code: "EWR1", city: "Newark, NJ", capacityPct: 47 },
];

/** EDI 832 Item Master batch — one inbound receipt of a SKU */
export type InventoryBatch = {
  batchId: string; // Lot / Receipt batch
  palletId: string; // Unique pallet ID
  receivedAt: string; // ISO timestamp drives LIFO/FIFO
  qty: number;
  location: string; // Aisle-Shelf-Bin or DROP001
  poNumber: string;
  ediSource: "EDI_943" | "EDI_944" | "CSV" | "MANUAL";
  qtyAllocated: number; // Allocation bucket tracking
  pickTicketNum?: number; // Populated when batch is in DROP001 transitional state
};

/** EDI 832 Item Master record */
export type InventoryItem = {
  sku: string; // Vendor SKU
  upc: string; // EDI 832: UPC / GTIN
  itemStyle: string; // Pallet grouping key
  description: string;
  category: string;
  uom: string; // Unit of measure
  unitCost: number; // EDI 832: PRC02
  unitPrice: number;
  caseQty: number;
  weightLbs: number;
  tenantId: string;
  warehouseId: string;
  batches: InventoryBatch[];
  status: "active" | "low" | "out" | "hold";
};

const ts = (d: string) => new Date(d).toISOString();

export const inventoryItems: InventoryItem[] = [
  {
    sku: "ACM-TENT-2P-OLV",
    upc: "081234500017",
    itemStyle: "TENT-2P",
    description: "Ridgeline 2-Person Tent, Olive",
    category: "Camping",
    uom: "EA",
    unitCost: 84.5,
    unitPrice: 189,
    caseQty: 4,
    weightLbs: 6.2,
    tenantId: "acme",
    warehouseId: "atl1",
    status: "active",
    batches: [
      {
        batchId: "B-24091",
        palletId: "PLT-ATL1-00871",
        receivedAt: ts("2026-05-12T14:20:00Z"),
        qty: 96,
        location: "A12-03-B",
        poNumber: "PO-554120",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
      {
        batchId: "B-24033",
        palletId: "PLT-ATL1-00712",
        receivedAt: ts("2026-03-04T09:11:00Z"),
        qty: 48,
        location: "A12-04-A",
        poNumber: "PO-551003",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
      {
        batchId: "B-23420",
        palletId: "PLT-ATL1-00455",
        receivedAt: ts("2025-11-22T16:00:00Z"),
        qty: 24,
        location: "A14-01-C",
        poNumber: "PO-548810",
        ediSource: "CSV",
        qtyAllocated: 0,
      },
    ],
  },
  {
    sku: "ACM-STV-CMP-01",
    upc: "081234500024",
    itemStyle: "STV-CMP",
    description: "Compact Camp Stove, Single Burner",
    category: "Camping",
    uom: "EA",
    unitCost: 22.1,
    unitPrice: 54.99,
    caseQty: 12,
    weightLbs: 1.8,
    tenantId: "acme",
    warehouseId: "atl1",
    status: "low",
    batches: [
      {
        batchId: "B-24102",
        palletId: "PLT-ATL1-00902",
        receivedAt: ts("2026-05-15T11:00:00Z"),
        qty: 36,
        location: "B03-02-A",
        poNumber: "PO-554301",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
    ],
  },
  {
    sku: "NSA-HOOD-BLK-M",
    upc: "087654300010",
    itemStyle: "HOOD-CLASSIC",
    description: "Classic Pullover Hoodie, Black, M",
    category: "Apparel",
    uom: "EA",
    unitCost: 14.2,
    unitPrice: 48,
    caseQty: 24,
    weightLbs: 1.1,
    tenantId: "northstar",
    warehouseId: "ord2",
    status: "active",
    batches: [
      {
        batchId: "B-24210",
        palletId: "PLT-ORD2-01244",
        receivedAt: ts("2026-05-17T08:30:00Z"),
        qty: 480,
        location: "D04-01-A",
        poNumber: "PO-770221",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
      {
        batchId: "B-24180",
        palletId: "PLT-ORD2-01177",
        receivedAt: ts("2026-04-29T12:10:00Z"),
        qty: 240,
        location: "D04-02-B",
        poNumber: "PO-770198",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
    ],
  },
  {
    sku: "NSA-TEE-WHT-L",
    upc: "087654300027",
    itemStyle: "TEE-PREMIUM",
    description: "Premium Cotton Tee, White, L",
    category: "Apparel",
    uom: "EA",
    unitCost: 6.4,
    unitPrice: 22,
    caseQty: 48,
    weightLbs: 0.4,
    tenantId: "northstar",
    warehouseId: "lax3",
    status: "active",
    batches: [
      {
        batchId: "B-24222",
        palletId: "PLT-LAX3-02011",
        receivedAt: ts("2026-05-18T17:45:00Z"),
        qty: 1440,
        location: "F02-05-A",
        poNumber: "PO-770301",
        ediSource: "CSV",
        qtyAllocated: 0,
      },
    ],
  },
  {
    sku: "HLE-EARB-PRO",
    upc: "099887700013",
    itemStyle: "EARB-PRO",
    description: "ProSound Wireless Earbuds Gen 3",
    category: "Audio",
    uom: "EA",
    unitCost: 41.0,
    unitPrice: 129,
    caseQty: 20,
    weightLbs: 0.3,
    tenantId: "harborlite",
    warehouseId: "ewr1",
    status: "active",
    batches: [
      {
        batchId: "B-24255",
        palletId: "PLT-EWR1-00388",
        receivedAt: ts("2026-05-10T10:00:00Z"),
        qty: 600,
        location: "C08-02-B",
        poNumber: "PO-310995",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
      {
        batchId: "B-24190",
        palletId: "PLT-EWR1-00352",
        receivedAt: ts("2026-04-22T13:25:00Z"),
        qty: 300,
        location: "C08-03-A",
        poNumber: "PO-310902",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
    ],
  },
  {
    sku: "HLE-CHRG-65W",
    upc: "099887700020",
    itemStyle: "CHRG-USBC",
    description: "65W GaN USB-C Charger",
    category: "Accessories",
    uom: "EA",
    unitCost: 11.8,
    unitPrice: 39,
    caseQty: 30,
    weightLbs: 0.4,
    tenantId: "harborlite",
    warehouseId: "ewr1",
    status: "out",
    batches: [],
  },
  {
    sku: "VRD-COLL-30CT",
    upc: "076500011120",
    itemStyle: "COLL-PWDR",
    description: "Collagen Peptides Powder, 30ct",
    category: "Supplements",
    uom: "EA",
    unitCost: 9.5,
    unitPrice: 32,
    caseQty: 24,
    weightLbs: 0.8,
    tenantId: "verdant",
    warehouseId: "atl1",
    status: "low",
    batches: [
      {
        batchId: "B-24277",
        palletId: "PLT-ATL1-00955",
        receivedAt: ts("2026-05-19T07:15:00Z"),
        qty: 72,
        location: "G01-01-A",
        poNumber: "PO-220114",
        ediSource: "EDI_944",
        qtyAllocated: 0,
      },
    ],
  },
  {
    sku: "VRD-MAG-GLY",
    upc: "076500011137",
    itemStyle: "MAG-GLY",
    description: "Magnesium Glycinate 120ct",
    category: "Supplements",
    uom: "EA",
    unitCost: 7.2,
    unitPrice: 24,
    caseQty: 36,
    weightLbs: 0.5,
    tenantId: "verdant",
    warehouseId: "ord2",
    status: "hold",
    batches: [
      {
        batchId: "B-24201",
        palletId: "PLT-ORD2-01290",
        receivedAt: ts("2026-05-02T15:00:00Z"),
        qty: 432,
        location: "E05-02-C",
        poNumber: "PO-220088",
        ediSource: "EDI_943",
        qtyAllocated: 0,
      },
    ],
  },
];

export type AllocationStrategy = "LIFO" | "FIFO";

export function totalOnHand(item: InventoryItem) {
  return item.batches.reduce((s, b) => s + b.qty, 0);
}

export function sortedBatches(item: InventoryItem, strategy: AllocationStrategy) {
  const copy = [...item.batches];
  copy.sort((a, b) =>
    strategy === "LIFO"
      ? +new Date(b.receivedAt) - +new Date(a.receivedAt)
      : +new Date(a.receivedAt) - +new Date(b.receivedAt),
  );
  return copy;
}

/** ============================================================
 *  Allocation Engine Types
 *  ============================================================ */

/** Client-level allocation configuration */
export type ClientAllocationConfig = {
  tenantId: string;
  strategy: AllocationStrategy;
  locationPrefix?: string; // Optional location prefix to prioritize
};

/** Inventory allocation buckets */
export type InventoryAllocation = {
  sku: string;
  palletId: string;
  location: string;
  batchId: string;
  qtyOnHand: number;
  qtyAllocated: number;
  qtyAvailable: number; // OnHand - Allocated
  receivedAt: string;
  tenantId: string;
  warehouseId: string;
};

/** Pick Ticket record */
export type PickTicket = {
  pickTicketNum: number; // Auto-incremented sequence number
  orderId: string;
  sku: string;
  palletId: string;
  fromLocation: string;
  quantityToPick: number;
  status: "GENERATED" | "PICKED" | "CLOSED";
  createdAt: string;
  pickedAt?: string;
  closedAt?: string;
};

/** Order status lifecycle */
export type OrderStatus = "NEW" | "ALLOCATED" | "PICKED" | "SHIPPED";

/** Pick Ticket status lifecycle */
export type PickTicketStatus = "GENERATED" | "PICKED" | "CLOSED";

/** BOL / Shipment record */
export type BOLShipment = {
  bolNumber: string;
  orderId: string;
  pickTicketNum: number;
  tenantId: string;
  warehouseId: string;
  carrier: string;
  shippedAt: string;
  status: "SHIPPED";
};

/** Allocation result */
export type AllocationResult = {
  success: boolean;
  pickTicketNum?: number;
  allocatedLines: Array<{
    sku: string;
    palletId: string;
    location: string;
    qtyAllocated: number;
  }>;
  error?: string;
};

/** Deallocation result */
export type DeallocationResult = {
  success: boolean;
  deallocatedLines: Array<{
    sku: string;
    palletId: string;
    location: string;
    qtyDeallocated: number;
  }>;
  error?: string;
};

/** Pick result */
export type PickResult = {
  success: boolean;
  pickTicketNum: number;
  pickedLines: Array<{
    sku: string;
    palletId: string;
    fromLocation: string;
    toLocation: string; // DROP001
    qtyPicked: number;
  }>;
  error?: string;
};

/** Unpick result */
export type UnpickResult = {
  success: boolean;
  pickTicketNum: number;
  unpickedLines: Array<{
    sku: string;
    palletId: string;
    fromLocation: string; // DROP001
    toLocation: string; // Original location
    qtyUnpicked: number;
  }>;
  error?: string;
};

/** Ship result */
export type ShipResult = {
  success: boolean;
  bolNumber: string;
  pickTicketNum: number;
  shippedLines: Array<{
    sku: string;
    palletId: string;
    location: string; // DROP001
    qtyShipped: number;
  }>;
  error?: string;
};

/** Constants */
export const DROP001_LOCATION = "DROP001";
export const NON_ALLOCATABLE_LOCATIONS = [DROP001_LOCATION];

/* ───── Client allocation configs ─────────────────────────────────── */

export const clientAllocationConfigs: ClientAllocationConfig[] = [
  { tenantId: "acme", strategy: "LIFO", locationPrefix: "A" },
  { tenantId: "northstar", strategy: "LIFO", locationPrefix: "D" },
  { tenantId: "harborlite", strategy: "LIFO", locationPrefix: "C" },
  { tenantId: "verdant", strategy: "LIFO" },
];

export function getClientAllocationConfig(tenantId: string): ClientAllocationConfig | undefined {
  return clientAllocationConfigs.find((c) => c.tenantId === tenantId);
}

/* ───── Pick ticket store ─────────────────────────────────────────── */

export const pickTickets: PickTicket[] = [];

let _nextPickTicketSeq = 1000;
export function nextPickTicketSeq(): number {
  _nextPickTicketSeq += 1;
  return _nextPickTicketSeq;
}

export function findPickTicketsByOrder(orderId: string): PickTicket[] {
  return pickTickets.filter((pt) => pt.orderId === orderId);
}

export function findPickTicketByNum(pickTicketNum: number): PickTicket | undefined {
  return pickTickets.find((pt) => pt.pickTicketNum === pickTicketNum);
}
