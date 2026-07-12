/**
 * ============================================================
 *  MODULE INDEX — Billing & Charge Management
 * ============================================================
 *
 *  Purpose: 3PL client billing — charge rules, billable event
 *           generation, and invoice creation. Supports inbound
 *           handling, outbound pick/pack, and storage billing
 *           at pallet, carton, container, BOL, location, and
 *           warehouse levels.
 *
 *  Key types exported:
 *    • BillingClient               — Client billing profile
 *    • ChargeRule                  — Rule that maps activity → rate
 *    • BillableEvent               — Captured billable activity
 *    • Invoice, InvoiceLine        — Generated invoices
 *    • RateUnit, StorageFrequency  — Billing configuration enums
 *
 *  Data:
 *    • billingClients[]            — Mock billing clients
 *    • defaultRules[]              — Seed charge rules per client
 *    • billableEvents[]            — Mock captured events
 *    • seedInvoices[]              — Mock invoices
 *
 *  Helper functions:
 *    • unitLabel()                 — Human-readable rate unit
 *    • fmtUSD()                    — Currency formatting
 *
 *  Firestore CRUD (in firestore-data.ts):
 *    subscribeBillingClients / createBillingClient / updateBillingClient / deleteBillingClient
 *    subscribeChargeRules / createChargeRule / updateChargeRule / deleteChargeRule
 *    subscribeBillableEvents / createBillableEvent / updateBillableEvent
 *    subscribeInvoices / createInvoice / updateInvoice / deleteInvoice
 *    seedBillingData               — Seed all billing collections
 *
 *  Extension points:
 *    - Add automated event capture hooks (e.g. on pick complete → create event)
 *    - Add tiered pricing (volume breaks, minimums)
 *    - Add minimum charge / minimum commitment logic
 *    - Add accrual-based billing for unbilled periods
 * ============================================================
 */

export type ClientId = string;

export type BillingClient = {
  id: ClientId;
  name: string;
  code: string;
  accountNumber: string;
  billToAddress: string[];
  email: string;
  tenantId: string;
};

export type RateUnit = "carton" | "pallet" | "container" | "bol" | "location" | "warehouse";
export type StorageFrequency = "daily" | "weekly" | "monthly" | "custom";

export type ChargeRule = {
  id: string;
  clientId: ClientId;
  tenantId: string;
  warehouseId?: string;
  locationId?: string;
  category: "Inbound" | "Outbound" | "Storage" | "Custom";
  description: string;
  unit: RateUnit | "flat";
  rate: number;
  frequency?: StorageFrequency;
  customCycleDays?: number;
  trigger?: string;
  enabled: boolean;
};

export type ActivityType = "Inbound" | "Outbound" | "Storage" | "Custom";

export type BillableEvent = {
  id: string;
  clientId: ClientId;
  tenantId: string;
  warehouseId?: string;
  locationId?: string;
  date: string;
  type: ActivityType;
  reference: string;
  description: string;
  quantity: number;
  unit: RateUnit | "flat";
  billed: boolean;
};

export type InvoiceLine = {
  id: string;
  activityType: string;
  description: string;
  quantity: number;
  rate: number;
  total: number;
};

export type Invoice = {
  id: string;
  number: string;
  clientId: ClientId;
  tenantId: string;
  issueDate: string;
  dueDate: string;
  status: "Draft" | "Sent" | "Paid";
  lines: InvoiceLine[];
  taxRate: number;
  notes?: string;
  source: "Automated" | "Manual";
};

export const billingClients: BillingClient[] = [
  {
    id: "acme",
    name: "Acme Outdoor Co.",
    code: "ACME",
    accountNumber: "AC-10001",
    billToAddress: ["Acme Outdoor Co.", "4500 Paces Ferry Rd", "Atlanta, GA 30339"],
    email: "billing@acmeoutdoor.com",
    tenantId: "acme",
  },
  {
    id: "northstar",
    name: "Northstar Apparel",
    code: "NSAP",
    accountNumber: "NS-20002",
    billToAddress: ["Northstar Apparel", "2200 N Irving Rd", "Chicago, IL 60618"],
    email: "billing@northstarapparel.com",
    tenantId: "northstar",
  },
  {
    id: "harborlite",
    name: "Harborlite Electronics",
    code: "HLE",
    accountNumber: "HL-30003",
    billToAddress: ["Harborlite Electronics", "1 Harbor Dr", "Newark, NJ 07102"],
    email: "billing@harborlite.com",
    tenantId: "harborlite",
  },
  {
    id: "verdant",
    name: "Verdant Wellness",
    code: "VRDN",
    accountNumber: "VD-40004",
    billToAddress: ["Verdant Wellness", "8800 Melrose Ave", "Los Angeles, CA 90069"],
    email: "billing@verdantwellness.com",
    tenantId: "verdant",
  },
];

export const defaultRules: ChargeRule[] = [
  {
    id: "r1",
    clientId: "acme",
    tenantId: "acme",
    category: "Inbound",
    description: "Inbound handling per pallet",
    unit: "pallet",
    rate: 8.5,
    enabled: true,
  },
  {
    id: "r2",
    clientId: "acme",
    tenantId: "acme",
    category: "Inbound",
    description: "Inbound handling — carton receive",
    unit: "carton",
    rate: 0.35,
    enabled: true,
  },
  {
    id: "r3",
    clientId: "acme",
    tenantId: "acme",
    warehouseId: "atl1",
    category: "Outbound",
    description: "Pick & pack per carton (ATL1)",
    unit: "carton",
    rate: 1.75,
    enabled: true,
  },
  {
    id: "r4",
    clientId: "acme",
    tenantId: "acme",
    category: "Outbound",
    description: "BOL generation fee",
    unit: "bol",
    rate: 15,
    enabled: true,
  },
  {
    id: "r5",
    clientId: "acme",
    tenantId: "acme",
    category: "Storage",
    description: "Pallet storage — daily",
    unit: "pallet",
    rate: 0.65,
    frequency: "daily",
    enabled: true,
  },

  {
    id: "r6",
    clientId: "northstar",
    tenantId: "northstar",
    category: "Inbound",
    description: "Carton receive fee",
    unit: "carton",
    rate: 0.45,
    enabled: true,
  },
  {
    id: "r7",
    clientId: "northstar",
    tenantId: "northstar",
    warehouseId: "lax3",
    category: "Outbound",
    description: "Apparel pick & pack (LAX3)",
    unit: "carton",
    rate: 2.1,
    enabled: true,
  },
  {
    id: "r8",
    clientId: "northstar",
    tenantId: "northstar",
    warehouseId: "ord2",
    category: "Outbound",
    description: "Apparel pallet ship-out (ORD2)",
    unit: "pallet",
    rate: 12,
    enabled: true,
  },
  {
    id: "r9",
    clientId: "northstar",
    tenantId: "northstar",
    category: "Storage",
    description: "Pallet storage — monthly",
    unit: "pallet",
    rate: 18,
    frequency: "monthly",
    enabled: true,
  },

  {
    id: "r10",
    clientId: "harborlite",
    tenantId: "harborlite",
    category: "Inbound",
    description: "Electronics inbound per pallet (EWR1)",
    unit: "pallet",
    rate: 9.75,
    enabled: true,
  },
  {
    id: "r11",
    clientId: "harborlite",
    tenantId: "harborlite",
    category: "Outbound",
    description: "BOL generation fee",
    unit: "bol",
    rate: 18,
    enabled: true,
  },
  {
    id: "r12",
    clientId: "harborlite",
    tenantId: "harborlite",
    category: "Storage",
    description: "Pallet storage — monthly",
    unit: "pallet",
    rate: 22,
    frequency: "monthly",
    enabled: true,
  },

  {
    id: "r13",
    clientId: "verdant",
    tenantId: "verdant",
    category: "Inbound",
    description: "Supplement inbound per pallet",
    unit: "pallet",
    rate: 7.25,
    enabled: true,
  },
  {
    id: "r14",
    clientId: "verdant",
    tenantId: "verdant",
    warehouseId: "atl1",
    category: "Outbound",
    description: "Pick & pack per carton (ATL1)",
    unit: "carton",
    rate: 1.95,
    enabled: true,
  },
  {
    id: "r15",
    clientId: "verdant",
    tenantId: "verdant",
    category: "Storage",
    description: "Pallet storage — daily",
    unit: "pallet",
    rate: 0.55,
    frequency: "daily",
    enabled: true,
  },
];

const today = new Date();
const iso = (offsetDays: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

export const billableEvents: BillableEvent[] = [
  {
    id: "e1",
    clientId: "acme",
    tenantId: "acme",
    warehouseId: "atl1",
    date: iso(-12),
    type: "Inbound",
    reference: "PO-88210",
    description: "Container MSCU7723441 received",
    quantity: 1,
    unit: "container",
    billed: false,
  },
  {
    id: "e2",
    clientId: "acme",
    tenantId: "acme",
    warehouseId: "atl1",
    date: iso(-12),
    type: "Inbound",
    reference: "PO-88210",
    description: "Pallets received and putaway",
    quantity: 22,
    unit: "pallet",
    billed: false,
  },
  {
    id: "e3",
    clientId: "acme",
    tenantId: "acme",
    warehouseId: "atl1",
    date: iso(-12),
    type: "Custom",
    reference: "PO-88210",
    description: "Container Inbounded + Putaway trigger fired",
    quantity: 1,
    unit: "flat",
    billed: false,
  },
  {
    id: "e4",
    clientId: "acme",
    tenantId: "acme",
    warehouseId: "atl1",
    date: iso(-8),
    type: "Outbound",
    reference: "SO-55012",
    description: "Pick & pack cartons for Apex.com FC-LAX",
    quantity: 184,
    unit: "carton",
    billed: false,
  },
  {
    id: "e5",
    clientId: "acme",
    tenantId: "acme",
    warehouseId: "atl1",
    date: iso(-8),
    type: "Outbound",
    reference: "BOL-AX-2210",
    description: "BOL generated for outbound shipment",
    quantity: 1,
    unit: "bol",
    billed: false,
  },
  {
    id: "e6",
    clientId: "acme",
    tenantId: "acme",
    warehouseId: "atl1",
    date: iso(-1),
    type: "Storage",
    reference: "SNAP-04",
    description: "Daily storage snapshot",
    quantity: 138,
    unit: "pallet",
    billed: false,
  },

  {
    id: "e7",
    clientId: "northstar",
    tenantId: "northstar",
    warehouseId: "lax3",
    date: iso(-15),
    type: "Inbound",
    reference: "PO-77004",
    description: "Cartons received from CMA-CGM",
    quantity: 412,
    unit: "carton",
    billed: false,
  },
  {
    id: "e8",
    clientId: "northstar",
    tenantId: "northstar",
    warehouseId: "ord2",
    date: iso(-6),
    type: "Outbound",
    reference: "SO-77910",
    description: "Pallets shipped to retail DC",
    quantity: 14,
    unit: "pallet",
    billed: false,
  },
  {
    id: "e9",
    clientId: "northstar",
    tenantId: "northstar",
    warehouseId: "ord2",
    date: iso(-1),
    type: "Storage",
    reference: "SNAP-MO",
    description: "Monthly storage snapshot",
    quantity: 86,
    unit: "pallet",
    billed: false,
  },

  {
    id: "e10",
    clientId: "harborlite",
    tenantId: "harborlite",
    warehouseId: "ewr1",
    date: iso(-4),
    type: "Inbound",
    reference: "PO-30021",
    description: "LTL inbound — 6 pallets",
    quantity: 6,
    unit: "pallet",
    billed: false,
  },
  {
    id: "e11",
    clientId: "verdant",
    tenantId: "verdant",
    warehouseId: "atl1",
    date: iso(-3),
    type: "Inbound",
    reference: "PO-40015",
    description: "Supplement inbound — 48 cartons",
    quantity: 48,
    unit: "carton",
    billed: false,
  },
];

export const seedInvoices: Invoice[] = [
  {
    id: "inv-seed-1",
    number: "AZ-2026-0044",
    clientId: "northstar",
    tenantId: "northstar",
    issueDate: iso(-30),
    dueDate: iso(0),
    status: "Sent",
    taxRate: 0.0875,
    source: "Automated",
    lines: [
      {
        id: "l1",
        activityType: "Inbound",
        description: "Carton receive fee (Mar cycle)",
        quantity: 1820,
        rate: 0.45,
        total: 819,
      },
      {
        id: "l2",
        activityType: "Storage",
        description: "Pallet storage — monthly",
        quantity: 86,
        rate: 18,
        total: 1548,
      },
      {
        id: "l3",
        activityType: "Outbound",
        description: "Pallet ship-out",
        quantity: 42,
        rate: 12,
        total: 504,
      },
    ],
  },
  {
    id: "inv-seed-2",
    number: "AZ-2026-0045",
    clientId: "acme",
    tenantId: "acme",
    issueDate: iso(-15),
    dueDate: iso(15),
    status: "Draft",
    taxRate: 0.0875,
    source: "Automated",
    lines: [
      {
        id: "l4",
        activityType: "Inbound",
        description: "Inbound handling per pallet",
        quantity: 35,
        rate: 8.5,
        total: 297.5,
      },
      {
        id: "l5",
        activityType: "Outbound",
        description: "Pick & pack per carton",
        quantity: 210,
        rate: 1.75,
        total: 367.5,
      },
      {
        id: "l6",
        activityType: "Storage",
        description: "Daily pallet storage",
        quantity: 28,
        rate: 0.65,
        total: 18.2,
      },
    ],
  },
];

export function unitLabel(u: RateUnit | "flat"): string {
  switch (u) {
    case "carton":
      return "per carton";
    case "pallet":
      return "per pallet";
    case "container":
      return "per container";
    case "bol":
      return "per BOL";
    case "location":
      return "per location";
    case "warehouse":
      return "per warehouse";
    case "flat":
      return "flat";
  }
}

export function fmtUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
