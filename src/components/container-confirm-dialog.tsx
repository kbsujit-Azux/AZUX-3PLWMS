/**
 * ============================================================
 *  MODULE INDEX — Container close / depart confirmation
 * ============================================================
 *
 *  Purpose: Closing a container and marking it departed are irreversible
 *           operational events. Before either happens the operator must be
 *           shown exactly what is outstanding on the container:
 *
 *            • lines that are not fully received (short)
 *            • over-receipts and damaged units (OSD)
 *            • pallets that are built but not put away
 *
 *           Anything blocking is shown in RED, informational items in amber,
 *           and the operator can either correct the data (the dialog links
 *           to the screen that fixes it) or cancel the action.
 *
 *  Key exports:
 *    • ContainerConfirmDialog — the dialog
 *    • assessContainer()    — the pure assessment used by the dialog
 * ============================================================
 */

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, PackageCheck, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ContainerIssue = {
  severity: "error" | "warning" | "ok";
  title: string;
  detail: string;
  /** Where the operator can fix it. */
  action?: { label: string; to: string };
};

export type ContainerAssessment = {
  issues: ContainerIssue[];
  /** Issues that must be acknowledged before the action can be confirmed. */
  blocking: ContainerIssue[];
  totals: {
    expectedUnits: number;
    receivedUnits: number;
    damagedUnits: number;
    variance: number;
    palletsTotal: number;
    palletsPutAway: number;
    palletsStaged: number;
  };
};

/**
 * Work out everything that is outstanding on a container.
 */
export function assessContainer(inbound: any, pallets: any[]): ContainerAssessment {
  const lines = (inbound?.lines ?? []) as any[];
  const issues: ContainerIssue[] = [];

  const expectedUnits = lines.reduce((a, l) => a + (l.qtyExpected || 0), 0);
  const receivedUnits = lines.reduce((a, l) => a + (l.receivedQty || 0), 0);
  const damagedUnits = lines.reduce((a, l) => a + (l.damagedQty || 0), 0);
  const variance = receivedUnits - expectedUnits;

  // ── Lines not fully received ──
  for (const l of lines.filter((x) => (x.receivedQty || 0) < (x.qtyExpected || 0))) {
    const missing = (l.qtyExpected || 0) - (l.receivedQty || 0);
    issues.push({
      severity: "error",
      title: `Line ${l.lineNo} · ${l.sku} is short`,
      detail: `${missing.toLocaleString()} of ${(l.qtyExpected || 0).toLocaleString()} expected units have not been received.`,
      action: { label: "Open the container", to: "/inbound" },
    });
  }

  // ── Over-receipt ──
  for (const l of lines) {
    const found = l.foundQty ?? l.receivedQty ?? 0;
    const extra = found - (l.qtyExpected || 0);
    if (extra > 0) {
      issues.push({
        severity: "warning",
        title: `Line ${l.lineno ?? l.lineNo} · ${l.sku} is over the ASN`,
        detail: `${extra.toLocaleString()} unit(s) more than the ASN expected${l.osdReason ? ` — ${l.osdReason}` : ""}.`,
        action: { label: "Open the container", to: "/inbound" },
      });
    }
  }

  // ── Damaged units (OSD) ──
  for (const l of lines.filter((x) => (x.damagedQty || 0) > 0)) {
    issues.push({
      severity: "warning",
      title: `Line ${l.lineNo} · ${l.sku} has damaged stock`,
      detail: `${(l.damagedQty || 0).toLocaleString()} unit(s) damaged${l.osdReason ? ` — ${l.osdReason}` : ""}${l.damagePalletId ? ` (held on ${l.damagePalletId})` : ""}.`,
      action: { label: "Open the container", to: "/inbound" },
    });
  }

  // ── Pallets built but not put away ──
  const containerPallets = pallets.filter(
    (p) => (p.shipmentId ?? p.inboundShipmentId) === inbound?.id,
  );
  const notPutAway = containerPallets.filter((p) => p.status !== "putaway" || !p.location);
  for (const p of notPutAway) {
    issues.push({
      severity: "error",
      title: `Pallet ${p.id} is not put away`,
      detail: `Status "${p.status}"${p.suggestedLocation ? ` · suggested ${p.suggestedLocation}` : ""}. It is still on the floor and has no stock location.`,
      action: { label: "Go to Palletization", to: "/pallets" },
    });
  }

  const palletsPutAway = containerPallets.length - notPutAway.length;
  const palletsStaged = notPutAway.length;

  // ── Nothing outstanding ──
  if (issues.length === 0) {
    issues.push({
      severity: "ok",
      title: "Everything is in order",
      detail: `${expectedUnits.toLocaleString()} expected units received, ${containerPallets.length} pallet(s) built and put away.`,
    });
  }

  return {
    issues,
    blocking: issues.filter((i) => i.severity === "error"),
    totals: {
      expectedUnits,
      receivedUnits,
      damagedUnits,
      variance,
      palletsTotal: containerPallets.length,
      palletsPutAway,
      palletsStaged,
    },
  };
}

/**
 * The confirmation dialog for closing a container or marking it departed.
 */
export function ContainerConfirmDialog({
  open,
  onOpenChange,
  mode,
  workOrder,
  inbound,
  pallets,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** "close" ends the receipt, "depart" records the departure. */
  mode: "close" | "depart";
  workOrder: any;
  inbound: any;
  pallets: any[];
  busy?: boolean;
  onConfirm: (opts: { departDate?: string; acknowledged: boolean }) => void | Promise<void>;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [departDate, setDepartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lastOpen, setLastOpen] = useState(open);

  const assessment = useMemo(() => assessContainer(inbound, pallets), [inbound, pallets]);

  const title = mode === "close" ? "Close container" : "Mark container departed";
  const description =
    mode === "close"
      ? "Review the container status before closing it. Closing is a permanent operation."
      : "Review the container status and record the departure date.";

  // Reset the acknowledgement whenever the dialog is reopened.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setAcknowledged(false);
      setDepartDate(new Date().toISOString().slice(0, 10));
    }
  }

  const canConfirm = assessment.blocking.length === 0 || acknowledged;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {mode === "close" ? (
              <PackageCheck className="h-4 w-4 text-primary" />
            ) : (
              <Truck className="h-4 w-4 text-primary" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {description} {workOrder?.woNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              {
                k: "Expected units",
                v: assessment.totals.expectedUnits.toLocaleString(),
                tone: "",
              },
              {
                k: "Received units",
                v: assessment.totals.receivedUnits.toLocaleString(),
                tone: "",
              },
              {
                k: "Variance",
                v: `${assessment.totals.variance > 0 ? "+" : ""}${assessment.totals.variance.toLocaleString()}`,
                tone:
                  assessment.totals.variance < 0
                    ? "text-destructive"
                    : assessment.totals.variance > 0
                      ? "text-amber-600"
                      : "",
              },
              {
                k: "Damaged",
                v: assessment.totals.damagedUnits.toLocaleString(),
                tone: assessment.totals.damagedUnits > 0 ? "text-destructive" : "",
              },
              {
                k: "Pallets put away",
                v: `${assessment.totals.palletsPutAway} / ${assessment.totals.palletsTotal}`,
                tone: assessment.totals.palletsStaged > 0 ? "text-destructive" : "",
              },
            ].map((t) => (
              <div key={t.k} className="rounded-md border border-border px-2.5 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t.k}
                </div>
                <div className={`text-sm font-bold tabular-nums ${t.tone}`}>{t.v}</div>
              </div>
            ))}
          </div>

          {/* Outstanding items */}
          <div className="space-y-1.5">
            {assessment.issues.map((issue, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] ${
                  issue.severity === "error"
                    ? "border-destructive/40 bg-destructive/10"
                    : issue.severity === "warning"
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-emerald-500/40 bg-emerald-500/10"
                }`}
              >
                {issue.severity === "error" ? (
                  <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : issue.severity === "warning" ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={`font-medium ${
                      issue.severity === "error"
                        ? "text-destructive"
                        : issue.severity === "warning"
                          ? "text-amber-700"
                          : "text-emerald-700"
                    }`}
                  >
                    {issue.title}
                  </div>
                  <div className="text-muted-foreground">{issue.detail}</div>
                </div>
                {issue.action && (
                  <Button variant="outline" size="sm" className="h-6 shrink-0 text-[10px]" asChild>
                    <Link to={issue.action.to}>{issue.action.label}</Link>
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Depart date */}
          {mode === "depart" && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Departure date
              </Label>
              <Input
                type="date"
                value={departDate}
                onChange={(e) => setDepartDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Acknowledgement */}
          {assessment.blocking.length > 0 && (
            <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
              />
              <span>
                <span className="font-medium text-destructive">
                  I understand this container is not complete
                </span>
                <span className="block text-muted-foreground">
                  {assessment.blocking.length} outstanding item(s) remain. Closing now records the
                  receipt with these discrepancies.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={!canConfirm || busy}
            onClick={() => onConfirm({ departDate, acknowledged })}
          >
            {mode === "close" ? (
              <PackageCheck className="h-3.5 w-3.5" />
            ) : (
              <Truck className="h-3.5 w-3.5" />
            )}
            {busy
              ? "Working…"
              : mode === "close"
                ? "Confirm & close container"
                : "Confirm & mark departed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
