import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  MapPin,
  Route as RouteIcon,
  Search,
  Plus,
  Printer,
  ScanLine,
  ArrowRight,
  CheckCircle2,
  Layers,
  Navigation,
  PackageCheck,
  Clock,
  XCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { useWorkspace } from "@/components/workspace-context";
import { tenants, warehouses } from "@/lib/mock-data";
import {
  pallets,
  pickWaves,
  buildPickWave,
  suggestPutawayLocation,
  removePallets,
  type Pallet,
  type PalletStatus,
} from "@/lib/pallet-data";
import { orders } from "@/lib/edi-data";
import { inboundShipments } from "@/lib/inbound-data";
import { fmtDateTime, fmtDateYear, fmtTime } from "@/lib/utils";

export const Route = createFileRoute("/pallets")({
  head: () => ({
    meta: [
      { title: "Pallets — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content: "Pallet building, directed putaway and directed picking with LIFO/FIFO routing.",
      },
    ],
  }),
  component: PalletsPage,
});

const statusStyles: Record<PalletStatus, string> = {
  building: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  staged:   "bg-primary/15 text-primary border-primary/30",
  putaway:  "bg-chart-3/15 text-chart-3 border-chart-3/30",
  picking:  "bg-chart-2/15 text-chart-2 border-chart-2/30",
  shipped:  "bg-muted text-muted-foreground border-border",
};

function PalletsPage() {
  const { tenantId, warehouseId, strategy } = useWorkspace();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"build" | "putaway" | "pick">("build");
  const [labelPallet, setLabelPallet] = useState<Pallet | null>(null);
  const [selectedWave, setSelectedWave] = useState<string>(pickWaves[0].id);
  const [scanTarget, setScanTarget] = useState<Pallet | null>(null);
  /** Pallets that have been scan-confirmed in this session (id → location). */
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  /** Pallet IDs deleted in this session (non-putaway only). */
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  /** PO# → { container, trailer } lookup sourced from inbound ASNs. */
  const poRefs = useMemo(() => {
    const m = new Map<string, { container: string; trailer: string }>();
    for (const s of inboundShipments) {
      m.set(s.poNumber, { container: s.containerNumber, trailer: s.trailerNumber });
    }
    return m;
  }, []);
  const refFor = (po: string) => poRefs.get(po) ?? { container: "—", trailer: "—" };

  const visiblePallets = useMemo(
    () =>
      pallets
      .filter((p) => !deleted.has(p.id))
      .map((p) =>
        confirmed[p.id]
          ? { ...p, status: "putaway" as PalletStatus, location: confirmed[p.id] }
          : p,
      )
      .filter((p) => {
        if (tenantId !== "all" && p.tenantId !== tenantId) return false;
        if (warehouseId !== "all" && p.warehouseId !== warehouseId) return false;
        if (query) {
          const q = query.toLowerCase();
          const r = refFor(p.poNumber);
          const blob = `${p.id} ${p.sku} ${p.itemStyle} ${p.description} ${p.poNumber} ${r.container} ${r.trailer}`.toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      }),
    [tenantId, warehouseId, query, confirmed, poRefs, deleted],
  );

  const handleDeleteConfirm = () => {
    if (!deleteConfirmId) return;
    const p = pallets.find((p) => p.id === deleteConfirmId);
    if (!p) return;
    if (p.status === "putaway" || p.status === "picking" || p.status === "shipped") {
      toast.error("Cannot delete", {
        description: `Pallet ${p.id} is ${p.status}. Only building/staged pallets can be removed.`,
      });
      setDeleteConfirmId(null);
      return;
    }
    removePallets([p.id]);
    setDeleted((prev) => {
      const next = new Set(prev);
      next.add(p.id);
      return next;
    });
    toast.success("Pallet removed", {
      description: `${p.id} · ${p.units} units (${Math.ceil(p.units / Math.max(1, p.casePack))} cases @ ${p.casePack}/case) returned to inbound pool.`,
    });
    setDeleteConfirmId(null);
  };

  const handleDeleteRequest = (p: Pallet) => {
    if (p.status === "putaway" || p.status === "picking" || p.status === "shipped") {
      toast.error("Cannot delete", {
        description: `Pallet ${p.id} is ${p.status}. Only building/staged pallets can be removed.`,
      });
      return;
    }
    setDeleteConfirmId(p.id);
  };

  const stats = useMemo(() => {
    const t = { active: 0, building: 0, awaitingPutaway: 0, units: 0 };
    for (const p of visiblePallets) {
      t.units += p.units;
      if (p.status === "building") t.building++;
      else if (p.status === "staged") t.awaitingPutaway++;
      if (p.status !== "shipped") t.active++;
    }
    return t;
  }, [visiblePallets]);

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Palletization</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Build pallets by item style · directed putaway & picking · {strategy} routing active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <ScanLine className="h-3.5 w-3.5" /> Scan pallet
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Build pallet
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-4 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={Boxes}        label="Active pallets"    value={stats.active}          tone="text-foreground" />
        <StatCell icon={Layers}       label="Currently building" value={stats.building}        tone="text-chart-4" />
        <StatCell icon={MapPin}       label="Awaiting putaway"  value={stats.awaitingPutaway} tone="text-primary" />
        <StatCell icon={PackageCheck} label="Units on pallets"  value={stats.units}           tone="text-chart-3" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-8">
          <TabsTrigger value="build" className="text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Pallet builder
          </TabsTrigger>
          <TabsTrigger value="putaway" className="text-xs gap-1.5">
            <Navigation className="h-3.5 w-3.5" /> Directed putaway
          </TabsTrigger>
          <TabsTrigger value="pick" className="text-xs gap-1.5">
            <RouteIcon className="h-3.5 w-3.5" /> Directed picking
          </TabsTrigger>
        </TabsList>

        {/* ─── Pallet Builder ───────────────────────────────────────── */}
        <TabsContent value="build" className="mt-3 space-y-3">
          <Toolbar query={query} setQuery={setQuery} placeholder="Search pallet ID, SKU, style, PO, container/trailer…" />
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[10px] uppercase tracking-wider">Pallet ID</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Item style</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">SKU / description</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client / WH</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">PO</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Container / Trailer</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Qty / Case pack</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider w-40">Fill</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Weight</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Built</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePallets.slice(0, 25).map((p) => {
                  const tenant = tenants.find((t) => t.id === p.tenantId);
                  const wh = warehouses.find((w) => w.id === p.warehouseId);
                  const fill = Math.round((p.units / p.capacityUnits) * 100);
                  const r = refFor(p.poNumber);
                  const container = r.container && r.container !== "—" ? r.container : null;
                  const trailer = r.trailer && r.trailer !== "—" ? r.trailer : null;
                  return (
                    <TableRow key={p.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="py-2 font-mono font-medium">{p.id}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">{p.itemStyle}</TableCell>
                      <TableCell className="py-2">
                        <div className="font-mono text-[11px]">{p.sku}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[18rem]">
                          {p.description}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {tenant?.code} · {wh?.code}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">{p.poNumber}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">
                        {container && (
                          <div className="text-foreground">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-1">CNT</span>
                            {container}
                          </div>
                        )}
                        {trailer && (
                          <div className="text-foreground">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-1">TRL</span>
                            {trailer}
                          </div>
                        )}
                        {!container && !trailer && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="font-mono text-[11px] tabular-nums">
                          {p.units.toLocaleString()} <span className="text-muted-foreground">{`${p.units === 1 ? "unit" : "units"}`}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {Math.ceil(p.units / Math.max(1, p.casePack)).toLocaleString()} cases @ {p.casePack}/case
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <Progress value={fill} className="h-1.5 flex-1" />
                          <span className="tabular-nums text-[10px] text-muted-foreground w-8 text-right">
                            {fill}%
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {p.units}/{p.capacityUnits} units
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">
                        {p.weightLbs.toLocaleString()} lb
                      </TableCell>
                      <TableCell className="py-2 text-[11px] text-muted-foreground tabular-nums">
                        {fmtDateTime(p.builtAt)}
                      </TableCell>
                      <TableCell className="py-2">
                        <span
                          className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[p.status]}`}
                        >
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Print pallet label"
                            onClick={() => setLabelPallet(p)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive disabled:opacity-30"
                            title={
                              p.status === "putaway" || p.status === "picking" || p.status === "shipped"
                                ? `Cannot delete — pallet is ${p.status}`
                                : "Delete pallet"
                            }
                            disabled={p.status === "putaway" || p.status === "picking" || p.status === "shipped"}
                            onClick={() => handleDeleteRequest(p)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ─── Directed Putaway ─────────────────────────────────────── */}
        <TabsContent value="putaway" className="mt-3 space-y-3">
          <div className="rounded-md border border-border bg-card p-3 text-xs flex items-start gap-3">
            <Navigation className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Slotting engine</div>
              <div className="text-muted-foreground text-[11px] mt-0.5">
                Locations are suggested from the warehouse map using item style
                affinity, velocity zone, weight class and cube utilization. Operators
                confirm or override before posting the putaway.
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Inbound pallets awaiting directed putaway
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                slotting · velocity-zoned
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[10px] uppercase tracking-wider">Pallet</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Style</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Units</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Weight</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Current</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Suggested location</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Zone</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePallets
                  .filter((p) => p.status === "building" || p.status === "staged" || !p.location)
                  .concat(
                    // also surface a couple "freshly built" ones with re-suggested slots
                    visiblePallets
                      .filter((p) => p.status === "putaway")
                      .slice(0, 3)
                      .map((p) => ({
                        ...p,
                        status: "staged" as PalletStatus,
                        location: null,
                        suggestedLocation: suggestPutawayLocation(p.itemStyle, p.warehouseId),
                      })),
                  )
                  .map((p) => (
                    <TableRow key={`pa-${p.id}`} className="text-xs hover:bg-muted/30">
                      <TableCell className="py-2 font-mono font-medium">{p.id}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">{p.itemStyle}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{p.units}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                        {p.weightLbs.toLocaleString()} lb
                      </TableCell>
                      <TableCell className="py-2 text-[11px] text-muted-foreground">
                        {p.status === "building" ? "On dock" : "Staging"}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">
                        <div className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 text-primary px-1.5 py-0.5">
                          <MapPin className="h-3 w-3" />
                          {p.suggestedLocation}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="inline-flex items-center justify-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {p.zone}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] gap-1"
                          onClick={() => setScanTarget(p)}
                        >
                          <ScanLine className="h-3 w-3" /> Scan to confirm
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ─── Directed Picking ─────────────────────────────────────── */}
        <TabsContent value="pick" className="mt-3 grid grid-cols-12 gap-3">
          {/* Wave list */}
          <div className="col-span-4 rounded-md border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Open pick waves
            </div>
            <div className="divide-y divide-border">
              {pickWaves.map((w) => {
                const order = orders.find((o) => o.id === w.orderId);
                const tenant = tenants.find((t) => t.id === w.tenantId);
                const wh = warehouses.find((wh) => wh.id === w.warehouseId);
                const active = w.id === selectedWave;
                return (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWave(w.id)}
                    className={`w-full text-left px-3 py-2 transition-colors ${active ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent hover:bg-muted/30"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium">{w.id}</span>
                      <span
                        className={`text-[9px] uppercase tracking-wider rounded-sm border px-1 py-0.5 ${
                          w.status === "complete"
                            ? "border-chart-3/30 bg-chart-3/10 text-chart-3"
                            : w.status === "in-progress"
                              ? "border-chart-4/30 bg-chart-4/10 text-chart-4"
                              : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      <span className="font-mono">{w.orderId}</span> · {order?.shipToName ?? "—"}
                    </div>
                    <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">
                      {tenant?.code} · {wh?.code} · {w.carrier} · {w.assignee}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pick route */}
          <div className="col-span-8 rounded-md border border-border bg-card overflow-hidden">
            <PickRoutePanel waveId={selectedWave} strategy={strategy} />
          </div>
        </TabsContent>
      </Tabs>

      <ScanConfirmDialog
        pallet={scanTarget}
        onClose={() => setScanTarget(null)}
        onConfirmed={(palletId, location) => {
          setConfirmed((c) => ({ ...c, [palletId]: location }));
          toast.success("Putaway posted", {
            description: `${palletId} → ${location} · status → putaway`,
          });
          setScanTarget(null);
        }}
      />

      {/* Pallet label dialog */}
      <Dialog open={!!labelPallet} onOpenChange={(o) => !o && setLabelPallet(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Pallet license plate label</DialogTitle>
            <DialogDescription className="text-xs">
              Print to the dock-side Zebra ZT411 for application before staging.
            </DialogDescription>
          </DialogHeader>
          {labelPallet && (
            <div className="rounded-md border-2 border-foreground/80 bg-background p-4 font-mono text-xs">
              <div className="flex items-center justify-between border-b-2 border-foreground/80 pb-2">
                <span className="text-[10px] uppercase tracking-wider">AZUX 3PL WMS Systems</span>
                <span className="text-[10px] uppercase tracking-wider">PALLET LP</span>
              </div>
              <div className="mt-3 text-xl font-bold tracking-wider">{labelPallet.id}</div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-muted-foreground">STYLE</span>
                <span className="text-right">{labelPallet.itemStyle}</span>
                <span className="text-muted-foreground">SKU</span>
                <span className="text-right">{labelPallet.sku}</span>
                <span className="text-muted-foreground">QTY</span>
                <span className="text-right">{labelPallet.units}</span>
                <span className="text-muted-foreground">PO</span>
                <span className="text-right">{labelPallet.poNumber}</span>
                <span className="text-muted-foreground">SLOT</span>
                <span className="text-right">{labelPallet.suggestedLocation}</span>
              </div>
              <div className="mt-3 flex h-12 items-end gap-px overflow-hidden rounded-sm bg-foreground/95 p-1.5">
                {Array.from({ length: 64 }).map((_, i) => (
                  <span
                    key={i}
                    className="bg-background"
                    style={{
                      width: ((i * 31 + labelPallet.id.charCodeAt(i % labelPallet.id.length)) % 3) + 1,
                      height: "100%",
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 text-center text-[10px] tracking-[0.3em]">
                {labelPallet.id}
              </div>
            </div>
          )}
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => setLabelPallet(null)}>
          Close
        </Button>
        <Button
          size="sm"
          onClick={() => {
            toast.success("Label queued", { description: `Sent to ZT411-DOCK-A` });
            setLabelPallet(null);
          }}
        >
          <Printer className="h-3.5 w-3.5" /> Print label
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete pallet {deleteConfirmId}?</AlertDialogTitle>
        <AlertDialogDescription className="text-xs">
          This permanently removes the pallet and returns its units to the inbound pool. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDeleteConfirmId(null)}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={handleDeleteConfirm}
        >
          Delete
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
  );
}

function Toolbar({
  query,
  setQuery,
  placeholder,
}: {
  query: string;
  setQuery: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-8 pl-8 text-xs"
        />
      </div>
    </div>
  );
}

function PickRoutePanel({
  waveId,
  strategy,
}: {
  waveId: string;
  strategy: "LIFO" | "FIFO";
}) {
  const wave = pickWaves.find((w) => w.id === waveId)!;
  const order = orders.find((o) => o.id === wave.orderId);

  const route = useMemo(() => {
    if (!order) return [];
    return order.lines.flatMap((line) =>
      buildPickWave(order.id, line.sku, line.qtyOrdered, order.warehouseId, strategy),
    );
  }, [order, strategy]);

  return (
    <div>
      <div className="border-b border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Directed pick route ·
          </span>
          <span className="font-mono text-[11px]">{wave.id}</span>
          <span className="text-[10px] uppercase tracking-wider rounded-sm border border-primary/30 bg-primary/10 text-primary px-1.5 py-0.5">
            {strategy}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          released {fmtTime(wave.releasedAt)}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="text-[10px] uppercase tracking-wider w-10">Seq</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Location</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Pallet ID</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Received</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">Pick qty</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {route.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-10">
                No on-hand pallets at this warehouse satisfy the order.
              </TableCell>
            </TableRow>
          )}
          {route.map((step) => (
            <TableRow key={`${step.seq}-${step.palletId}`} className="text-xs hover:bg-muted/30">
              <TableCell className="py-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold tabular-nums">
                  {step.seq}
                </span>
              </TableCell>
              <TableCell className="py-2 font-mono text-[11px]">
                <div className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-primary" />
                  {step.location}
                </div>
              </TableCell>
              <TableCell className="py-2 font-mono text-[11px]">{step.palletId}</TableCell>
              <TableCell className="py-2">
                <div className="font-mono text-[11px]">{step.sku}</div>
                <div className="text-[10px] text-muted-foreground">{step.itemStyle}</div>
              </TableCell>
              <TableCell className="py-2 text-[11px] text-muted-foreground tabular-nums">
                {fmtDateYear(step.receivedAt)}
              </TableCell>
              <TableCell className="py-2 text-right tabular-nums font-medium">
                {step.qty}
              </TableCell>
              <TableCell className="py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    toast.success(`Pick ${step.seq} confirmed`, {
                      description: `${step.qty} units · ${step.palletId}`,
                    })
                  }
                  title="Confirm pick"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3 w-3 ${tone}`} />
        {label}
      </div>
      <div className={`text-base font-semibold tabular-nums ${tone}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/* ───── Scan-to-confirm Putaway ──────────────────────────────────────── */

type ScanField = "pallet" | "location";

function ScanConfirmDialog({
  pallet,
  onClose,
  onConfirmed,
}: {
  pallet: Pallet | null;
  onClose: () => void;
  onConfirmed: (palletId: string, location: string) => void;
}) {
  const [palletScan, setPalletScan] = useState("");
  const [locationScan, setLocationScan] = useState("");
  const [active, setActive] = useState<ScanField>("pallet");
  const [shake, setShake] = useState<ScanField | null>(null);

  // Reset state whenever a new pallet is targeted
  useEffect(() => {
    setPalletScan("");
    setLocationScan("");
    setActive("pallet");
    setShake(null);
  }, [pallet?.id]);

  if (!pallet) return null;

  const palletOk = palletScan.trim().toUpperCase() === pallet.id.toUpperCase();
  const locationOk =
    locationScan.trim().toUpperCase() === pallet.suggestedLocation.toUpperCase();
  const palletEntered = palletScan.length > 0;
  const locationEntered = locationScan.length > 0;

  const validate = (field: ScanField, value: string) => {
    const expected = field === "pallet" ? pallet.id : pallet.suggestedLocation;
    if (value.trim().toUpperCase() !== expected.toUpperCase()) {
      setShake(field);
      setTimeout(() => setShake(null), 350);
      toast.error(`${field === "pallet" ? "Pallet" : "Location"} mismatch`, {
        description: `Scanned does not match expected ${expected}`,
      });
      if (field === "pallet") setPalletScan("");
      else setLocationScan("");
      return false;
    }
    return true;
  };

  const handleSubmit = (field: ScanField, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (field === "pallet") {
      if (validate("pallet", value)) setActive("location");
    } else {
      if (validate("location", value)) {
        if (!palletOk) {
          // race-protect: pallet must already be valid
          setActive("pallet");
          return;
        }
        onConfirmed(pallet.id, pallet.suggestedLocation);
      }
    }
  };

  return (
    <Dialog open={!!pallet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            Scan-to-confirm putaway
          </DialogTitle>
          <DialogDescription className="text-xs">
            Validate both the pallet license plate and the bin barcode before
            posting the movement.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/20 p-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Expected pallet
            </div>
            <div className="mt-0.5 font-mono">{pallet.id}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {pallet.itemStyle} · {pallet.units} units · {pallet.weightLbs.toLocaleString()} lb
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Suggested location
            </div>
            <div className="mt-0.5 font-mono inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 text-primary px-1.5 py-0.5">
              <MapPin className="h-3 w-3" />
              {pallet.suggestedLocation}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              zone {pallet.zone} · velocity-slotted
            </div>
          </div>
        </div>

        {/* Step 1 — pallet scan */}
        <ScanRow
          label="1 · Scan pallet license plate"
          autoFocus={active === "pallet"}
          value={palletScan}
          placeholder={`e.g. ${pallet.id}`}
          state={
            !palletEntered ? "idle" : palletOk ? "ok" : "error"
          }
          locked={palletOk}
          shake={shake === "pallet"}
          onChange={setPalletScan}
          onSubmit={(v) => handleSubmit("pallet", v)}
        />

        {/* Step 2 — location scan */}
        <ScanRow
          label="2 · Scan bin barcode"
          autoFocus={active === "location"}
          value={locationScan}
          placeholder={`e.g. ${pallet.suggestedLocation}`}
          state={
            !palletOk
              ? "disabled"
              : !locationEntered
                ? "idle"
                : locationOk
                  ? "ok"
                  : "error"
          }
          locked={!palletOk}
          shake={shake === "location"}
          onChange={setLocationScan}
          onSubmit={(v) => handleSubmit("location", v)}
        />

        <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-card px-3 py-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Both scans must validate before status flips to{" "}
            <span className="font-mono">putaway</span>.
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={palletOk ? "text-chart-3" : "text-muted-foreground"}>
              {palletOk ? "✓" : "○"} pallet
            </span>
            <span className={locationOk ? "text-chart-3" : "text-muted-foreground"}>
              {locationOk ? "✓" : "○"} location
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!palletOk || !locationOk}
            onClick={() => onConfirmed(pallet.id, pallet.suggestedLocation)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Post putaway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScanRow({
  label,
  value,
  placeholder,
  state,
  locked,
  shake,
  autoFocus,
  onChange,
  onSubmit,
}: {
  label: string;
  value: string;
  placeholder: string;
  state: "idle" | "ok" | "error" | "disabled";
  locked: boolean;
  shake: boolean;
  autoFocus: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const border =
    state === "ok"
      ? "border-chart-3 ring-1 ring-chart-3/30"
      : state === "error"
        ? "border-destructive ring-1 ring-destructive/30"
        : state === "disabled"
          ? "border-border opacity-60"
          : "border-input";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {state === "ok" && (
          <span className="inline-flex items-center gap-1 text-[10px] text-chart-3">
            <CheckCircle2 className="h-3 w-3" /> match
          </span>
        )}
        {state === "error" && (
          <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
            <XCircle className="h-3 w-3" /> mismatch
          </span>
        )}
      </div>
      <div className={`flex items-center gap-2 rounded-md border bg-background px-2 transition ${border} ${shake ? "animate-pulse" : ""}`}>
        <ScanLine
          className={`h-4 w-4 ${state === "ok" ? "text-chart-3" : state === "error" ? "text-destructive" : "text-primary"} ${state === "idle" ? "animate-pulse" : ""}`}
        />
        <Input
          autoFocus={autoFocus}
          disabled={locked && state !== "ok"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit(value);
            }
          }}
          className="h-9 border-0 shadow-none focus-visible:ring-0 font-mono text-xs px-0"
        />
      </div>
    </div>
  );
}