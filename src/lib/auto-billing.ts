/**
 * ============================================================
 *  MODULE INDEX — Automated container billing
 * ============================================================
 *
 *  Purpose: When a container is closed, the 3PL bills the client for the
 *           work performed. This module turns the quantities captured at
 *           receipt into billable events, applies the client's configured
 *           charge rules (tiered pricing, peak surcharges, minimum
 *           commitments) and produces a draft invoice.
 *
 *           It is deliberately configuration driven — nothing here is
 *           hard-coded per client. The client's ChargeRules decide what
 *           is billed and at what rate, so the same function serves any
 *           container of any 3PL client.
 *
 *  Key exports:
 *    • AutoBillInput       — what was received
 *    • AutoBillResult      — the outcome
 *    • autoBillContainer() — the entry point
 *    • resolveBillingClientId() — tenant → billable client
 *
 *  Guarantees:
 *    • IDEMPOTENT — a container is billed once. The billable events are
 *      keyed by the container id, so re-closing reuses them instead of
 *      double billing.
 *    • NON-BLOCKING — if the client has no Inbound rules, or the invoice
 *      cannot be produced, the container still closes and the reason is
 *      reported back to the operator.
 *
 *  Usage:
 *    const result = await autoBillContainer({ ... });
 *    if (result.invoiceId) toast.success(`Invoice ${result.invoiceNumber}`);
 * ============================================================
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firestore";
import {
  createBillableEvent,
  createInvoice,
  updateBillableEvent,
} from "./firestore-data";
import { buildInvoiceLines, matchEventToRule, applyPeakSurcharge } from "./billing-engine";
import type { MatchedBillableEvent } from "./billing-engine";
import type {
  BillableEvent,
  ChargeRule,
  Invoice,
  InvoiceLine,
  RateUnit,
} from "./billing-data";

/** What the container close captured. */
export type AutoBillInput = {
  /** Billing client id (the billable party). */
  clientId: string;
  /** Owning tenant of the container. */
  tenantId: string;
  warehouseId?: string;
  /** The container — used as the billable reference (idempotency key). */
  shipmentId: string;
  poNumber?: string;
  containerNumber?: string;
  trailerNumber?: string;
  /** Units received across all lines. */
  units: number;
  /** Cartons received across all lines. */
  cartons: number;
  /** Pallets built. */
  pallets: number;
  /** Total cubic feet received (for volumetric rules). */
  cuFt?: number;
  /** ISO timestamp of the close. */
  closedAt: string;
};

export type AutoBillResult = {
  /** The invoice that was created, when one was. */
  invoiceId?: string;
  invoiceNumber?: string;
  /** Number of invoice lines. */
  lines: number;
  /** Invoice subtotal (before tax). */
  subtotal: number;
  /** Billable events created for this container. */
  eventsCreated: number;
  /** Why nothing was billed, when nothing was. */
  skipped?: string;
};

/**
 * The units a charge rule can bill on, with the quantity captured for
 * each. Only the units a rule actually prices are billed.
 */
type BillableUnit = {
  unit: RateUnit | "flat";
  quantity: number;
};

function billableUnits(input: AutoBillInput): BillableUnit[] {
  return [
    { unit: "carton", quantity: input.cartons },
    { unit: "pallet", quantity: input.pallets },
    { unit: "container", quantity: 1 },
    { unit: "bol", quantity: 1 },
    { unit: "cubicFeet", quantity: input.cuFt ?? 0 },
  ];
}

/**
 * Decide which units get billed.
 *
 * A unit is billed when the client's rules price it AND the captured
 * quantity is above zero. This is the decision that makes the bill
 * configuration driven — a client with only a carton rule is billed for
 * cartons, a client with a pallet rule is also billed for palletising.
 */
export function selectBillableUnits(
  input: AutoBillInput,
  rules: ChargeRule[],
): BillableUnit[] {
  return billableUnits(input).filter(
    (u) =>
      u.quantity > 0 &&
      rules.some(
        (r) => r.enabled && r.category === "Inbound" && r.unit === u.unit,
      ),
  );
}

/**
 * Load the client's enabled Inbound charge rules.
 *
 * A rule participates unless it explicitly opts out with
 * `autoCapture: false` — closing a container bills the client's configured
 * Inbound rules by default.
 */
async function loadAutoRules(
  clientId: string,
  warehouseId?: string,
): Promise<ChargeRule[]> {
  const snap = await getDocs(
    query(collection(db, "chargeRules"), where("clientId", "==", clientId)),
  );
  const rules = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() ?? {}) }) as ChargeRule,
  );
  return rules.filter(
    (r) =>
      r.enabled &&
      r.autoCapture !== false &&
      r.category === "Inbound" &&
      (!r.warehouseId || !warehouseId || r.warehouseId === warehouseId),
  );
}

/**
 * Resolve the billable client for a tenant.
 *
 * The billable party is the client record, which may differ from the
 * owning tenant. Falls back to the tenant id when no client exists.
 */
export async function resolveBillingClientId(tenantId: string): Promise<string> {
  const snap = await getDocs(
    query(collection(db, "billingClients"), where("tenantId", "==", tenantId)),
  );
  const first = snap.docs[0];
  return first ? first.id : tenantId;
}

/** The billable events already recorded against a container. */
async function eventsForContainer(
  shipmentId: string,
): Promise<BillableEvent[]> {
  const snap = await getDocs(
    query(collection(db, "billableEvents"), where("reference", "==", shipmentId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as BillableEvent);
}

/** A human-readable description for a captured event. */
function buildDescription(
  input: AutoBillInput,
  unit: string,
  qty: number,
): string {
  const container = input.containerNumber || input.trailerNumber || input.shipmentId;
  switch (unit) {
    case "carton":
      return `Inbound receiving — ${qty.toLocaleString()} cartons received on ${container}`;
    case "pallet":
      return `Inbound palletising — ${qty.toLocaleString()} pallet(s) built on ${container}`;
    case "container":
      return `Inbound container handling — 1 container (${container})`;
    case "bol":
      return `Inbound BOL / documentation — 1 BOL (${container})`;
    case "cubicFeet":
      return `Inbound volume — ${qty.toFixed(2)} cu ft received on ${container}`;
    default:
      return `Inbound — ${qty.toLocaleString()} ${unit} on ${container}`;
  }
}

/**
 * Bill a closed container.
 *
 * The billable events are keyed by the container id, so calling this twice
 * for the same container reuses the events and never double bills.
 */
export async function autoBillContainer(
  input: AutoBillInput,
): Promise<AutoBillResult> {
  // 1. Has this container already been billed?
  const priorEvents = await eventsForContainer(input.shipmentId);
  if (priorEvents.length > 0 && priorEvents.every((e) => e.billed)) {
    return {
      lines: 0,
      subtotal: 0,
      eventsCreated: 0,
      skipped: "Container has already been billed",
    };
  }

  // 2. The client's configured rules decide what is billable.
  const rules = await loadAutoRules(input.clientId, input.warehouseId);
  if (rules.length === 0) {
    return {
      lines: 0,
      subtotal: 0,
      eventsCreated: 0,
      skipped: "No enabled Inbound charge rules for this client",
    };
  }

  // 3. Create (or reuse) one billable event per priced unit.
  const events: BillableEvent[] = [];
  let created = 0;

  for (const { unit, quantity } of selectBillableUnits(input, rules)) {
    const eventId = `evt-in-${input.shipmentId}-${unit}`;
    const existing = priorEvents.find((e) => e.id === eventId);
    if (existing) {
      events.push(existing);
      continue;
    }

    const event: BillableEvent = {
      id: eventId,
      clientId: input.clientId,
      tenantId: input.tenantId,
      warehouseId: input.warehouseId,
      date: input.closedAt.slice(0, 10),
      type: "Inbound",
      reference: input.shipmentId,
      description: buildDescription(input, unit, quantity),
      quantity,
      unit: unit as BillableEvent["unit"],
      billed: false,
      notes: `Auto-captured on container close (${input.shipmentId})`,
    };
    await createBillableEvent(event);
    events.push(event);
    created++;
  }

  if (events.length === 0) {
    return {
      lines: 0,
      subtotal: 0,
      eventsCreated: 0,
      skipped: "No billable quantity matched the configured Inbound rules",
    };
  }

  // 4. Price the events (tiered pricing, peak surcharge, minimums).
  const matched = events
    .map((event) => {
      const rule = matchEventToRule(event, rules);
      if (!rule) return null;

      // Tiered pricing
      let rate = rule.rate;
      let tierBreakdown: MatchedBillableEvent["tierBreakdown"];
      if (rule.priceTiers && rule.priceTiers.length > 0) {
        const sorted = [...rule.priceTiers].sort((a, b) => a.minQty - b.minQty);
        const matchedTier = sorted.find(
          (t) => event.quantity >= t.minQty && (t.maxQty === null || event.quantity <= t.maxQty),
        );
        if (matchedTier) {
          rate = matchedTier.rate;
          tierBreakdown = {
            effectiveRate: matchedTier.rate,
            breakdown: sorted.map((t) => ({
              minQty: t.minQty,
              maxQty: t.maxQty,
              rate: t.rate,
            })),
          };
        }
      }

      let total = +(event.quantity * rate).toFixed(2);

      // Peak season surcharge
      let peakSurcharge: MatchedBillableEvent["peakSurcharge"];
      if (rule.peakSurchargePct && rule.peakSurchargePct > 0) {
        const baseAmount = total;
        const totalAmount = applyPeakSurcharge(
          baseAmount,
          rule.peakSurchargePct,
          new Date(input.closedAt),
          rule.peakStartMonth,
          rule.peakEndMonth,
        );
        peakSurcharge = { baseAmount, surchargePct: rule.peakSurchargePct, totalAmount };
        total = totalAmount;
      }

      return { event, rule, rate, total, tierBreakdown, peakSurcharge } as MatchedBillableEvent;
    })
    .filter((m): m is MatchedBillableEvent => m !== null);

  if (matched.length === 0) {
    return {
      lines: 0,
      subtotal: 0,
      eventsCreated: created,
      skipped: "The configured rules did not match the captured events",
    };
  }

  const lines: InvoiceLine[] = buildInvoiceLines(matched, rules);
  if (lines.length === 0) {
    return {
      lines: 0,
      subtotal: 0,
      eventsCreated: created,
      skipped: "No invoice lines could be produced from the configured rules",
    };
  }

  // 5. Produce the draft invoice.
  const now = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const seq = (await getDocs(collection(db, "invoices"))).size;

  const invoice: Invoice = {
    id: `inv-auto-${input.shipmentId}`,
    number: `AZ-${now.getFullYear()}-${String(45 + seq).padStart(4, "0")}`,
    clientId: input.clientId,
    tenantId: input.tenantId,
    issueDate: now.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    status: "Draft",
    lines,
    taxRate: 0.0875,
    source: "Automated",
    notes: [
      "Auto-generated on container close",
      `Container: ${input.shipmentId}`,
      input.containerNumber ? `Container # ${input.containerNumber}` : "",
      input.trailerNumber ? `Trailer # ${input.trailerNumber}` : "",
      input.poNumber ? `PO: ${input.poNumber}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };

  await createInvoice(invoice);
  await Promise.all(events.map((e) => updateBillableEvent(e.id, { billed: true })));

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    lines: lines.length,
    subtotal: +lines.reduce((a, l) => a + l.total, 0).toFixed(2),
    eventsCreated: created,
  };
}

/**
 * Check whether a container already has an auto-generated invoice.
 * Used by the UI to show the "already billed" state.
 */
export async function findAutoInvoiceForContainer(
  shipmentId: string,
): Promise<Invoice | null> {
  const snap = await getDocs(
    query(collection(db, "invoices"), where("id", "==", `inv-auto-${shipmentId}`)),
  );
  const first = snap.docs[0];
  return first ? ((first.data() ?? {}) as Invoice) : null;
}
