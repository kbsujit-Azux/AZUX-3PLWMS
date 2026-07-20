/**
 * ============================================================
 *  MODULE INDEX — Billing Scheduler
 * ============================================================
 *
 *  Purpose: Scheduled billing jobs for enterprise 3PL operations.
 *           Handles:
 *           - Volumetric storage snapshots (daily / monthly)
 *           - Recurring minimum charge enforcement
 *           - Automated billing runs per tenant
 *
 *  Usage:
 *    import { startBillingScheduler, stopBillingScheduler } from "@/lib/billing-scheduler";
 *
 *    // Start the scheduler in your app entry point or admin dashboard
 *    startBillingScheduler({ pallets, locations, rules, clients, createEvent });
 *
 *  Note: This is a client-side scheduler using setInterval.
 *        For production, replace with a Cloud Scheduler + Cloud Function.
 * ============================================================
 */

import type { Pallet } from "./pallet-data";
import type { LocationRecord } from "./master-data";
import type { ChargeRule, BillableEvent, BillingClient } from "./billing-data";
import { buildVolumetricStorageSnapshots, buildVolumetricStorageLines, buildInvoiceLinesFromEvents, applyMinimumCharges } from "./billing-engine";

export interface BillingSchedulerConfig {
  pallets: Pallet[];
  locations: Map<string, LocationRecord>;
  rules: ChargeRule[];
  clients: BillingClient[];
  /** Callback to persist a billable event (e.g. createBillableEvent) */
  createEvent: (evt: BillableEvent) => Promise<string | void>;
  /** Callback to persist an invoice (e.g. createInvoice) */
  createInvoice?: (inv: any) => Promise<void>;
  /** Optional: filter to specific clients */
  clientIds?: string[];
}

export interface SnapshotJobResult {
  clientId: string;
  warehouseId: string;
  snapshotsCount: number;
  linesCount: number;
  error?: string;
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let running = false;

function isDue(frequency: string | undefined, customCycleDays?: number, lastRun?: string): boolean {
  if (!lastRun) return true;
  const now = new Date();
  const last = new Date(lastRun);
  const diffMs = now.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  switch (frequency) {
    case "daily":
      return diffDays >= 1;
    case "weekly":
      return diffDays >= 7;
    case "monthly":
      return diffDays >= 30;
    case "custom":
      return diffDays >= (customCycleDays || 30);
    default:
      return false;
  }
}

export async function runVolumetricSnapshots(config: BillingSchedulerConfig): Promise<SnapshotJobResult[]> {
  const results: SnapshotJobResult[] = [];
  const targetClients = config.clientIds?.length
    ? config.clients.filter((c) => config.clientIds!.includes(c.id))
    : config.clients;

  for (const client of targetClients) {
    const clientRules = config.rules.filter((r) => r.clientId === client.id && r.enabled);
    const storageRules = clientRules.filter((r) => r.category === "Storage" && r.unit === "cubicFeet");

    if (storageRules.length === 0) continue;

    for (const rule of storageRules) {
      if (!isDue(rule.frequency, rule.customCycleDays)) continue;

      try {
        const snapshots = await buildVolumetricStorageSnapshots(
          config.pallets,
          config.locations,
          client.id,
          client.tenantId,
          rule.warehouseId || "",
          rule.ratePerCuFt || rule.rate,
        );

        const lines = buildVolumetricStorageLines(snapshots);
        for (const line of lines) {
          await config.createEvent({
            id: `evt-vol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            clientId: client.id,
            tenantId: client.tenantId,
            warehouseId: rule.warehouseId,
            date: new Date().toISOString().slice(0, 10),
            type: "Storage",
            reference: `VOL-${rule.id}`,
            description: line.description,
            quantity: line.quantity,
            unit: "cubicFeet",
            billed: false,
            cubeCuFt: line.quantity,
            daysInStorage: 1,
          });
        }

        results.push({
          clientId: client.id,
          warehouseId: rule.warehouseId || "all",
          snapshotsCount: snapshots.length,
          linesCount: lines.length,
        });
      } catch (e: any) {
        results.push({
          clientId: client.id,
          warehouseId: rule.warehouseId || "all",
          snapshotsCount: 0,
          linesCount: 0,
          error: e?.message ?? "unknown error",
        });
      }
    }
  }

  return results;
}

export async function runAutomatedBillingPass(config: BillingSchedulerConfig): Promise<SnapshotJobResult[]> {
  const results: SnapshotJobResult[] = [];
  const targetClients = config.clientIds?.length
    ? config.clients.filter((c) => config.clientIds!.includes(c.id))
    : config.clients;

  for (const client of targetClients) {
    const clientRules = config.rules.filter((r) => r.clientId === client.id && r.enabled);
    const events = await (async () => {
      const { subscribeBillableEvents } = await import("./firestore-data");
      return new Promise<any[]>((resolve) => {
        const unsub = subscribeBillableEvents((all) => {
          const filtered = all.filter(
            (e) => e.clientId === client.id && !e.billed,
          );
          unsub();
          resolve(filtered);
        });
      });
    })();

    if (events.length === 0 || clientRules.length === 0) continue;

    const { matchEventToRule, computeTieredRate, applyPeakSurcharge } = await import("./billing-engine");

    const matched: { event: any; rule: any; rate: number; total: number }[] = [];
    for (const ev of events) {
      const rule = matchEventToRule(ev, clientRules);
      if (!rule) continue;
      let rate = rule.rate;
      if (rule.priceTiers && rule.priceTiers.length > 0) {
        rate = computeTieredRate(ev.quantity, rule.priceTiers);
      }
      let total = +(ev.quantity * rate).toFixed(2);
      if (rule.peakSurchargePct && rule.peakSurchargePct > 0) {
        total = applyPeakSurcharge(total, rule.peakSurchargePct, new Date(), rule.peakStartMonth, rule.peakEndMonth);
      }
      matched.push({ event: ev, rule, rate, total });
    }

    if (matched.length === 0) continue;

    const { buildInvoiceLines } = await import("./billing-engine");
    const lines = buildInvoiceLines(matched, clientRules);
    if (lines.length === 0) continue;

    const matchedIds = matched.map((m) => m.event.id);

    if (config.createInvoice) {
      const now = new Date();
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const invoice = {
        id: `inv-${Date.now()}-${client.id}`,
        number: `AZ-${now.getFullYear()}-${String(45 + results.length).padStart(4, "0")}`,
        clientId: client.id,
        tenantId: client.tenantId,
        issueDate: now.toISOString().slice(0, 10),
        dueDate: due.toISOString().slice(0, 10),
        status: "Draft",
        lines,
        taxRate: 0.0875,
        source: "Automated" as const,
      };

      await config.createInvoice(invoice);

      const { updateBillableEvent } = await import("./firestore-data");
      await Promise.all(matchedIds.map((id) => updateBillableEvent(id, { billed: true })));

      results.push({
        clientId: client.id,
        warehouseId: "all",
        snapshotsCount: matched.length,
        linesCount: lines.length,
      });
    }
  }

  return results;
}

export function startBillingScheduler(config: BillingSchedulerConfig, intervalMs = 60 * 60 * 1000): void {
  if (schedulerInterval) return;
  running = true;

  schedulerInterval = setInterval(async () => {
    if (!running) return;
    try {
      await runVolumetricSnapshots(config);
      await runAutomatedBillingPass(config);
    } catch (e) {
      console.error("[BillingScheduler] Error:", e);
    }
  }, intervalMs);
}

export function stopBillingScheduler(): void {
  running = false;
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

export function isBillingSchedulerRunning(): boolean {
  return running;
}
