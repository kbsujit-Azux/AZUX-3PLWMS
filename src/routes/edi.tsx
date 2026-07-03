import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  PlugZap,
  FileCode2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/components/workspace-context";
import { ediLogs, EDI_TXNS, type EdiLog, type EdiStatus, type EdiTxnType } from "@/lib/edi-data";
import { tenants, warehouses } from "@/lib/mock-data";

export const Route = createFileRoute("/edi")({
  head: () => ({
    meta: [
      { title: "EDI Hub — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content: "Monitor EDI 832, 940, 943, 944, 945 transactions across trading partners.",
      },
    ],
  }),
  component: EdiPage,
});

const statusStyles: Record<EdiStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  processed: {
    label: "Processed",
    cls: "bg-chart-3/15 text-chart-3 border-chart-3/30",
    Icon: CheckCircle2,
  },
  accepted: {
    label: "Accepted",
    cls: "bg-primary/15 text-primary border-primary/30",
    Icon: CheckCircle2,
  },
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground border-border", Icon: Clock },
  warning: {
    label: "Warning",
    cls: "bg-chart-4/15 text-chart-4 border-chart-4/30",
    Icon: AlertTriangle,
  },
  rejected: {
    label: "Rejected",
    cls: "bg-destructive/15 text-destructive border-destructive/30",
    Icon: XCircle,
  },
};

const ALL: "ALL" = "ALL";

function EdiPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [txnFilter, setTxnFilter] = useState<EdiTxnType | typeof ALL>(ALL);
  const [statusFilter, setStatusFilter] = useState<EdiStatus | typeof ALL>(ALL);
  const [detail, setDetail] = useState<EdiLog | null>(null);

  const filtered = useMemo(() => {
    return ediLogs.filter((l) => {
      if (tenantId !== "all" && l.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && l.warehouseId !== warehouseId) return false;
      if (txnFilter !== ALL && l.txn !== txnFilter) return false;
      if (statusFilter !== ALL && l.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob =
          `${l.id} ${l.partner} ${l.documentRef} ${l.isaControl} ${l.message}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [tenantId, warehouseId, txnFilter, statusFilter, query]);

  const counts = useMemo(() => {
    const byTxn: Record<
      EdiTxnType,
      { total: number; ok: number; warn: number; err: number; pending: number }
    > = {
      "832": { total: 0, ok: 0, warn: 0, err: 0, pending: 0 },
      "940": { total: 0, ok: 0, warn: 0, err: 0, pending: 0 },
      "943": { total: 0, ok: 0, warn: 0, err: 0, pending: 0 },
      "944": { total: 0, ok: 0, warn: 0, err: 0, pending: 0 },
      "945": { total: 0, ok: 0, warn: 0, err: 0, pending: 0 },
    };
    for (const l of ediLogs) {
      const b = byTxn[l.txn];
      b.total++;
      if (l.status === "processed" || l.status === "accepted") b.ok++;
      else if (l.status === "warning") b.warn++;
      else if (l.status === "rejected") b.err++;
      else b.pending++;
    }
    return byTxn;
  }, []);

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">EDI Integration Hub</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            X12 transactions across trading partners · 832 / 940 / 943 / 944 / 945
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Sync VAN
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5">
            <PlugZap className="h-3.5 w-3.5" /> New connection
          </Button>
        </div>
      </div>

      {/* Transaction type cards */}
      <div className="grid grid-cols-5 gap-3">
        {EDI_TXNS.map((t) => {
          const c = counts[t.type];
          const isInbound = t.direction === "inbound";
          return (
            <button
              key={t.type}
              onClick={() => setTxnFilter((f) => (f === t.type ? ALL : t.type))}
              className={`text-left rounded-md border bg-card p-3 transition-colors ${
                txnFilter === t.type
                  ? "border-primary ring-1 ring-primary/30"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold">EDI {t.type}</span>
                  {isInbound ? (
                    <ArrowDownToLine className="h-3 w-3 text-primary" />
                  ) : (
                    <ArrowUpFromLine className="h-3 w-3 text-chart-3" />
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isInbound ? "IN" : "OUT"}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-medium leading-tight">{t.name}</div>
              <div className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                {t.description}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
                <span className="tabular-nums">{c.total}</span>
                <span className="text-chart-3">{c.ok}✓</span>
                {c.warn > 0 && <span className="text-chart-4">{c.warn}!</span>}
                {c.err > 0 && <span className="text-destructive">{c.err}✕</span>}
                {c.pending > 0 && <span className="text-muted-foreground">{c.pending}⌛</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by control #, partner, PO, document ref…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EdiStatus | typeof ALL)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value={ALL}>All statuses</option>
          {(Object.keys(statusStyles) as EdiStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusStyles[s].label}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Filter className="h-3.5 w-3.5" /> Partner
        </Button>
        {(txnFilter !== ALL || statusFilter !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setTxnFilter(ALL);
              setStatusFilter(ALL);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Log table */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3 w-3" />
            Transaction log
            <span className="font-mono normal-case tracking-normal text-foreground">
              · {filtered.length} of {ediLogs.length}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            VAN: sps-commerce-prod · last poll 14s ago
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-[10px] uppercase tracking-wider w-24">Control #</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-16">Txn</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-14">Dir</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Partner</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Document Ref</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Client / WH</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Message</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Ack</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-10">
                  No EDI transactions match the current filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((l) => {
              const s = statusStyles[l.status];
              const tenant = tenants.find((t) => t.id === l.tenantId);
              const wh = warehouses.find((w) => w.id === l.warehouseId);
              return (
                <TableRow
                  key={l.id}
                  className="text-xs cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetail(l)}
                >
                  <TableCell className="py-2 font-mono">{l.id}</TableCell>
                  <TableCell className="py-2 font-mono font-medium">{l.txn}</TableCell>
                  <TableCell className="py-2">
                    {l.direction === "inbound" ? (
                      <ArrowDownToLine className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <ArrowUpFromLine className="h-3.5 w-3.5 text-chart-3" />
                    )}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">{l.partner}</TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">{l.documentRef}</TableCell>
                  <TableCell className="py-2">
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {tenant?.code} · {wh?.code}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 max-w-md truncate text-muted-foreground">
                    {l.message}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[10px] text-muted-foreground">
                    {l.ackStatus}
                  </TableCell>
                  <TableCell className="py-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${s.cls}`}
                    >
                      <s.Icon className="h-3 w-3" />
                      {s.label}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-[11px] text-muted-foreground tabular-nums">
                    {new Date(l.receivedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-primary" />
              EDI {detail?.txn} · <span className="font-mono">{detail?.id}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {detail && EDI_TXNS.find((t) => t.type === detail.txn)?.name} · trading partner{" "}
              <span className="font-mono">{detail?.partner}</span>
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono rounded-md border border-border bg-muted/20 p-3">
                <span className="text-muted-foreground">ISA13 control</span>
                <span className="text-right">{detail.isaControl}</span>
                <span className="text-muted-foreground">GS06 control</span>
                <span className="text-right">{detail.gsControl}</span>
                <span className="text-muted-foreground">Document reference</span>
                <span className="text-right">{detail.documentRef}</span>
                <span className="text-muted-foreground">Segments / bytes</span>
                <span className="text-right">
                  {detail.segments.toLocaleString()} · {detail.bytes.toLocaleString()}b
                </span>
                <span className="text-muted-foreground">Acknowledgment</span>
                <span className="text-right">{detail.ackStatus}</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Segment preview
                </div>
                <pre className="text-[10px] leading-relaxed bg-muted/30 border border-border rounded-md p-3 overflow-auto font-mono">
                  {`ISA*00*          *00*          *ZZ*${detail.partner.padEnd(15).slice(0, 15)}*ZZ*AZUX3PLWMS     *260519*0614*U*00501*${detail.isaControl}*0*P*>~
GS*${detail.txn === "832" ? "SC" : detail.txn === "940" ? "OW" : detail.txn === "943" ? "AR" : detail.txn === "944" ? "RE" : "SW"}*${detail.partner.split("-")[0]}*AZUX3PL*20260519*0614*${detail.gsControl}*X*005010~
ST*${detail.txn}*0001~
${detail.txn === "940" ? `W05*N*${detail.documentRef}~` : ""}${detail.txn === "945" ? `W06*N*${detail.documentRef}~` : ""}${detail.txn === "832" ? `BCT*PA*${detail.documentRef}*${detail.partner.split("-")[0]}~` : ""}${detail.txn === "943" ? `W06*N*${detail.documentRef}~` : ""}${detail.txn === "944" ? `W17*F*20260519*${detail.documentRef}~` : ""}
… ${detail.segments - 5} more segments …
SE*${detail.segments}*0001~
GE*1*${detail.gsControl}~
IEA*1*${detail.isaControl}~`}
                </pre>
              </div>
              <div className="text-[11px] rounded-md border border-border bg-card p-3">
                <span className="text-muted-foreground">Processor note:</span> {detail.message}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
