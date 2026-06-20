export type ClientId = "APEX" | "GLOBAL" | "NORTHSTAR";

export type BillingClient = {
  id: ClientId;
  name: string;
  accountNumber: string;
  billToAddress: string[];
  email: string;
};

export type RateUnit = "carton" | "pallet" | "container" | "bol";
export type StorageFrequency = "daily" | "weekly" | "monthly" | "custom";

export type ChargeRule = {
  id: string;
  clientId: ClientId;
  category: "Inbound" | "Outbound" | "Storage" | "Custom";
  description: string;
  unit: RateUnit | "flat";
  rate: number;
  frequency?: StorageFrequency;
  customCycleDays?: number;
  trigger?: string; // for Custom rules
  enabled: boolean;
};

export type ActivityType = "Inbound" | "Outbound" | "Storage" | "Custom";

export type BillableEvent = {
  id: string;
  clientId: ClientId;
  date: string; // ISO
  type: ActivityType;
  reference: string; // e.g. PO# / BOL# / Container#
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
  issueDate: string;
  dueDate: string;
  status: "Draft" | "Sent" | "Paid";
  lines: InvoiceLine[];
  taxRate: number; // e.g. 0.0875
  notes?: string;
  source: "Automated" | "Manual";
};

export const billingClients: BillingClient[] = [
  {
    id: "APEX",
    name: "Apex Retail",
    accountNumber: "AR-10231",
    billToAddress: ["Apex Retail, Inc.", "455 Market Street, Suite 900", "San Francisco, CA 94105"],
    email: "ap@apexretail.com",
  },
  {
    id: "GLOBAL",
    name: "Global Logistics",
    accountNumber: "GL-44087",
    billToAddress: ["Global Logistics Co.", "2200 Harbor Blvd", "Long Beach, CA 90802"],
    email: "billing@globallog.com",
  },
  {
    id: "NORTHSTAR",
    name: "Northstar Goods",
    accountNumber: "NS-90012",
    billToAddress: ["Northstar Goods LLC", "18 Industrial Park Dr", "Edison, NJ 08820"],
    email: "ap@northstargoods.com",
  },
];

export const defaultRules: ChargeRule[] = [
  // Apex Retail
  { id: "r1", clientId: "APEX", category: "Inbound", description: "Inbound handling per pallet", unit: "pallet", rate: 8.5, enabled: true },
  { id: "r2", clientId: "APEX", category: "Inbound", description: "Container unload (flat)", unit: "container", rate: 325, enabled: true },
  { id: "r3", clientId: "APEX", category: "Outbound", description: "Pick & pack per carton", unit: "carton", rate: 1.75, enabled: true },
  { id: "r4", clientId: "APEX", category: "Outbound", description: "BOL generation fee", unit: "bol", rate: 15, enabled: true },
  { id: "r5", clientId: "APEX", category: "Storage", description: "Pallet storage", unit: "pallet", rate: 0.65, frequency: "daily", enabled: true },
  { id: "r6", clientId: "APEX", category: "Custom", description: "Container received + putaway bonus charge", unit: "flat", rate: 75, trigger: "Container Inbounded AND Putaway", enabled: true },

  // Global Logistics
  { id: "r7", clientId: "GLOBAL", category: "Inbound", description: "Carton receive fee", unit: "carton", rate: 0.45, enabled: true },
  { id: "r8", clientId: "GLOBAL", category: "Outbound", description: "Pallet ship-out", unit: "pallet", rate: 12, enabled: true },
  { id: "r9", clientId: "GLOBAL", category: "Storage", description: "Pallet storage", unit: "pallet", rate: 18, frequency: "monthly", enabled: true },

  // Northstar Goods — no rules (will fall back to manual)
];

const today = new Date();
const iso = (offsetDays: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

export const billableEvents: BillableEvent[] = [
  { id: "e1", clientId: "APEX", date: iso(-12), type: "Inbound", reference: "PO-88210", description: "Container MSCU7723441 received", quantity: 1, unit: "container", billed: false },
  { id: "e2", clientId: "APEX", date: iso(-12), type: "Inbound", reference: "PO-88210", description: "Pallets received and putaway", quantity: 22, unit: "pallet", billed: false },
  { id: "e3", clientId: "APEX", date: iso(-12), type: "Custom", reference: "PO-88210", description: "Container Inbounded + Putaway trigger fired", quantity: 1, unit: "flat", billed: false },
  { id: "e4", clientId: "APEX", date: iso(-8),  type: "Outbound", reference: "SO-55012", description: "Pick & pack cartons for Apex.com FC-LAX", quantity: 184, unit: "carton", billed: false },
  { id: "e5", clientId: "APEX", date: iso(-8),  type: "Outbound", reference: "BOL-AX-2210", description: "BOL generated for outbound shipment", quantity: 1, unit: "bol", billed: false },
  { id: "e6", clientId: "APEX", date: iso(-1),  type: "Storage", reference: "SNAP-04", description: "Daily storage snapshot", quantity: 138, unit: "pallet", billed: false },

  { id: "e7", clientId: "GLOBAL", date: iso(-15), type: "Inbound", reference: "PO-77004", description: "Cartons received from CMA-CGM", quantity: 412, unit: "carton", billed: false },
  { id: "e8", clientId: "GLOBAL", date: iso(-6),  type: "Outbound", reference: "SO-77910", description: "Pallets shipped to retail DC", quantity: 14, unit: "pallet", billed: false },
  { id: "e9", clientId: "GLOBAL", date: iso(-1),  type: "Storage", reference: "SNAP-MO", description: "Monthly storage snapshot", quantity: 86, unit: "pallet", billed: false },

  { id: "e10", clientId: "NORTHSTAR", date: iso(-4), type: "Inbound", reference: "PO-30021", description: "LTL inbound — 6 pallets", quantity: 6, unit: "pallet", billed: false },
];

export const seedInvoices: Invoice[] = [
  {
    id: "inv-seed-1",
    number: "AZ-2026-0044",
    clientId: "GLOBAL",
    issueDate: iso(-30),
    dueDate: iso(0),
    status: "Sent",
    taxRate: 0.0875,
    source: "Automated",
    lines: [
      { id: "l1", activityType: "Inbound", description: "Carton receive fee (Mar cycle)", quantity: 1820, rate: 0.45, total: 819 },
      { id: "l2", activityType: "Storage", description: "Pallet storage — monthly", quantity: 86, rate: 18, total: 1548 },
      { id: "l3", activityType: "Outbound", description: "Pallet ship-out", quantity: 42, rate: 12, total: 504 },
    ],
  },
];

export function unitLabel(u: RateUnit | "flat"): string {
  switch (u) {
    case "carton": return "per carton";
    case "pallet": return "per pallet";
    case "container": return "per container";
    case "bol": return "per BOL";
    case "flat": return "flat";
  }
}

export function fmtUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}