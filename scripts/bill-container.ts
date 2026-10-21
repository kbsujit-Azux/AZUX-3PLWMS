/**
 * Bill a closed container using the automated billing rules.
 *
 * Usage:
 *   npx tsx scripts/bill-container.ts INB-20261020-6137
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

const shipmentId = process.argv[2];
if (!shipmentId) {
  console.error("Usage: npx tsx scripts/bill-container.ts <shipmentId>");
  process.exit(1);
}

/* ── Load the container ─────────────────────────────────────────────── */
const shipSnap = await db.collection("inboundShipments").doc(shipmentId).get();
if (!shipSnap.exists) {
  console.error(`Container ${shipmentId} not found`);
  process.exit(1);
}
const ship = shipSnap.data() as any;
const lines: any[] = Array.isArray(ship.lines) ? ship.lines : [];

/* ── Reference data ────────────────────────────────────────────────── */
const [itemSnap, palletSnap, clientSnap, woSnap] = await Promise.all([
  db.collection("itemMaster").get(),
  db.collection("pallets").get(),
  db.collection("billingClients").get(),
  db.collection("workOrders").get(),
]);
const items = new Map(itemSnap.docs.map((d) => [d.id, d.data() as any]));
const pallets = palletSnap.docs.map((d) => d.data() as any);
const clients = clientSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
const workOrders = woSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

const client = clients.find((c) => c.tenantId === ship.tenantId);
const clientId = client?.id ?? ship.tenantId;
const wo = workOrders.find((w) => w.id === ship.workOrderId);

console.log(`Container : ${shipmentId}`);
console.log(`Client   : ${clientId}${client ? ` (${client.name})` : ""}`);
console.log(`Warehouse: ${ship.warehouseId}`);
console.log(`PO       : ${ship.poNumber}`);

/* ── Quantities ────────────────────────────────────────────────────── */
let totalUnits = 0;
let totalCartons = 0;
let totalPallets = 0;
let totalCuFt = 0;
for (const l of lines) {
  const master = items.get(l.sku);
  const casePack = master?.caseQty || 1;
  const cartons = Math.ceil((l.receivedQty || 0) / casePack);
  const palletsForLine = l.palletIds?.length ?? 0;
  const cuFt = (master?.cbmPerCase ?? 0) * ((l.receivedQty || 0) / casePack) * 35.3147;
  totalUnits += l.receivedQty || 0;
  totalCartons += cartons;
  totalPallets += palletsForLine;
  totalCuFt += cuFt;
  console.log(
    `  ${l.sku}: ${l.receivedQty}/${l.qtyExpected} units → ${cartons} cartons, ${palletsForLine} pallets`,
  );
}
console.log(
  `\nTotals: ${totalUnits} units, ${totalCartons} cartons, ${totalPallets} pallets, ${totalCuFt.toFixed(2)} cu ft\n`,
);

/* ── Idempotency: has this container been billed? ──────────────────── */
const existingInv = await db
  .collection("invoices")
  .doc(`inv-auto-${shipmentId}`)
  .get();
if (existingInv.exists) {
  console.log(`Already billed: ${(existingInv.data() as any).number}`);
  process.exit(0);
}

/* ── Rules ─────────────────────────────────────────────────────────── */
const ruleSnap = await db
  .collection("chargeRules")
  .where("clientId", "==", clientId)
  .get();
const rules = ruleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
const inboundRules = rules.filter(
  (r) => r.enabled && r.autoCapture !== false && r.category === "Inbound",
);
console.log(`Inbound rules for ${clientId}:`);
inboundRules.forEach((r) =>
  console.log(`  ${r.id} ${r.unit} @ ${r.rate} — ${r.description}`),
);
if (inboundRules.length === 0) {
  console.log("\nNo enabled Inbound rules — nothing to bill.");
  process.exit(0);
}

/* ── Capture billable events ───────────────────────────────────────── */
const units: Array<{ unit: string; qty: number }> = [
  { unit: "carton", qty: totalCartons },
  { unit: "pallet", qty: totalPallets },
  { unit: "container", qty: 1 },
  { unit: "bol", qty: 1 },
  { unit: "cubicFeet", qty: +totalCuFt.toFixed(2) },
];

const containerRef =
  ship.containerNumber || ship.trailerNumber || shipmentId;
const descriptions: Record<string, string> = {
  carton: `Inbound receiving — ${totalCartons.toLocaleString()} cartons received on ${containerRef}`,
  pallet: `Inbound palletising — ${totalPallets.toLocaleString()} pallet(s) built on ${containerRef}`,
  container: `Inbound container handling — 1 container (${containerRef})`,
  bol: `Inbound BOL / documentation — 1 BOL (${containerRef})`,
  cubicFeet: `Inbound volume — ${totalCuFt.toFixed(2)} cu ft received on ${containerRef}`,
};

const eventIds: string[] = [];
for (const u of units) {
  if (u.qty <= 0) continue;
  const priced = inboundRules.some((r) => r.unit === u.unit);
  if (!priced) continue;
  const id = `evt-in-${shipmentId}-${u.unit}`;
  const existing = await db.collection("billableEvents").doc(id).get();
  if (!existing.exists) {
    await db.collection("billableEvents").doc(id).set({
      id,
      clientId,
      tenantId: ship.tenantId,
      warehouseId: ship.warehouseId,
      date: new Date().toISOString().slice(0, 10),
      type: "Inbound",
      reference: shipmentId,
      description: descriptions[u.unit],
      quantity: u.qty,
      unit: u.unit,
      billed: false,
      notes: `Auto-captured on container close (${shipmentId})`,
    });
    console.log(`  captured event ${id}: ${u.qty} ${u.unit}`);
  }
  eventIds.push(id);
}

/* ── Price and build the invoice ───────────────────────────────────── */
function tierRate(qty: number, tiers: any[]): number {
  if (!tiers || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const t = sorted.find(
    (x) => qty >= x.minQty && (x.maxQty === null || qty <= x.maxQty),
  );
  return t ? t.rate : sorted[0]?.rate ?? 0;
}

const linesOut: any[] = [];
for (const eventId of eventIds) {
  const evSnap = await db.collection("billableEvents").doc(eventId).get();
  const ev = evSnap.data() as any;
  const rule = inboundRules.find((r) => r.unit === ev.unit);
  if (!rule) continue;
  const rate = rule.priceTiers?.length
    ? tierRate(ev.quantity, rule.priceTiers)
    : rule.rate;
  const total = +(ev.quantity * rate).toFixed(2);
  linesOut.push({
    id: `ln-${ev.id}`,
    activityType: rule.category,
    description: ev.description,
    quantity: ev.quantity,
    rate,
    total,
  });
  console.log(
    `  ${ev.description} — ${ev.quantity} × ${rate} = ${total.toFixed(2)}`,
  );
}

if (linesOut.length === 0) {
  console.log("\nNo invoice lines produced.");
  process.exit(0);
}

/* ── Create the draft invoice ──────────────────────────────────────── */
const now = new Date();
const due = new Date();
due.setDate(due.getDate() + 30);
const invCount = (await db.collection("invoices").get()).size;
const invoiceId = `inv-auto-${shipmentId}`;
const number = `AZ-${now.getFullYear()}-${String(45 + invCount).padStart(4, "0")}`;

await db.collection("invoices").doc(invoiceId).set({
  id: invoiceId,
  number,
  clientId,
  tenantId: ship.tenantId,
  issueDate: now.toISOString().slice(0, 10),
  dueDate: due.toISOString().slice(0, 10),
  status: "Draft",
  lines: linesOut,
  taxRate: 0.0875,
  source: "Automated",
  notes: [
    "Auto-generated on container close",
    `Container: ${shipmentId}`,
    ship.containerNumber ? `Container # ${ship.containerNumber}` : "",
    ship.trailerNumber ? `Trailer # ${ship.trailerNumber}` : "",
    ship.poNumber ? `PO: ${ship.poNumber}` : "",
  ]
    .filter(Boolean)
    .join(" · "),
});

// Mark the events as billed
const batch = db.batch();
eventIds.forEach((id) => batch.update(db.collection("billableEvents").doc(id), { billed: true }));
await batch.commit();

const subtotal = linesOut.reduce((a: number, l: any) => a + l.total, 0);
console.log(`\nInvoice ${number} created (${invoiceId})`);
console.log(`  ${linesOut.length} line(s), subtotal $${subtotal.toFixed(2)}`);
console.log(`  Tax $${(subtotal * 0.0875).toFixed(2)} → total $${(subtotal * 1.0875).toFixed(2)}`);
process.exit(0);
