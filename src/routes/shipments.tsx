import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Filter,
  Truck,
  PackageCheck,
  AlertTriangle,
  Send,
  Printer,
  FileText,
  ClipboardCheck,
  DoorOpen,
  PlayCircle,
  CircleDot,
  Download,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { tenants, warehouses } from "@/lib/mock-data";
import {
  shipments as initialShipments,
  getBolForShipment,
  transitionShipment,
  recordPod,
  SHIPMENT_STATUSES,
  type Shipment,
  type ShipmentStatus,
} from "@/lib/shipment-data";
import { BolDocument } from "@/components/bol/bol-document";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/shipments")({
  head: () => ({
    meta: [
      { title: "Shipments — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Outbound shipments — dock door scheduling, driver check-in, 945 tender, POD capture. Each shipment ties to a systemic VICS BOL.",
      },
    ],
  }),
  component: ShipmentsPage,
});

const statusStyles: Record<ShipmentStatus, string> = {
  pending:     "bg-muted text-muted-foreground border-border",
  staged:      "bg-chart-4/15 text-chart-4 border-chart-4/30",
  loading:     "bg-chart-2/15 text-chart-2 border-chart-2/30",
  tendered:    "bg-primary/15 text-primary border-primary/30",
  "in-transit":"bg-chart-2/15 text-chart-2 border-chart-2/30",
  delivered:   "bg-chart-3/15 text-chart-3 border-chart-3/30",
  exception:   "bg-destructive/15 text-destructive border-destructive/30",
};

const modeStyles: Record<Shipment["mode"], string> = {
  TL:         "bg-primary/10 text-primary border-primary/30",
  LTL:        "bg-chart-4/10 text-chart-4 border-chart-4/30",
  Parcel:     "bg-chart-3/10 text-chart-3 border-chart-3/30",
  Intermodal: "bg-chart-2/10 text-chart-2 border-chart-2/30",
};

function ShipmentsPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { refreshData } = useWmsData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | ShipmentStatus>("all");
  const [tick, setTick] = useState(0);          // force refresh after mutations
  const [openId, setOpenId] = useState<string | null>(null);
  const [podOpen, setPodOpen] = useState(false);
  const [podSigner, setPodSigner] = useState("");

  // Re-read from the mock store on every tick so transitions are reflected.
  const all = useMemo(() => [...initialShipments], [tick]);

  const filtered = useMemo(() => {
    return all.filter((s) => {
      if (tenantId !== "all" && s.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && s.warehouseId !== warehouseId) return false;
      if (tab !== "all" && s.status !== tab) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${s.id} ${s.bolId} ${s.proNumber} ${s.trailerNumber} ${s.sealNumber} ${s.carrier} ${s.scac} ${s.shipTo} ${s.orderIds.join(" ")} ${s.driverName ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [all, tenantId, warehouseId, tab, query]);

  const stats = useMemo(() => {
    const s = { staged: 0, loading: 0, transit: 0, exception: 0, deliveredToday: 0 };
    const today = new Date().toISOString().slice(0, 10);
    for (const x of all) {
      if (tenantId !== "all" && x.tenantId !== tenantId) continue;
      if (warehouseId !== "all" && x.warehouseId !== warehouseId) continue;
      if (x.status === "staged" || x.status === "pending") s.staged++;
      else if (x.status === "loading" || x.status === "tendered") s.loading++;
      else if (x.status === "in-transit") s.transit++;
      else if (x.status === "exception") s.exception++;
      if (x.status === "delivered" && x.deliveredAt?.slice(0, 10) === today) s.deliveredToday++;
    }
    return s;
  }, [all, tenantId, warehouseId]);

  const openShipment = openId ? all.find((s) => s.id === openId) : null;
  const openBol = openShipment ? getBolForShipment(openShipment.id) : undefined;

  const doTransition = (id: string, next: ShipmentStatus, label: string) => {
    const updated = transitionShipment(id, next);
    if (!updated) return;
    setTick((t) => t + 1);
    toast.success(`${id} — ${label}`, {
      description: next === "tendered" ? "EDI 945 auto-fired to trading partner" : undefined,
    });
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Shipments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dock-door scheduling · driver check-in · EDI 945 tender · POD capture · every shipment ties to a systemic VICS BOL
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={refreshData}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={DoorOpen}       label="Staged / pending"  value={stats.staged}        tone="text-foreground" />
        <StatCell icon={PlayCircle}     label="Loading / tendered" value={stats.loading}      tone="text-chart-4" />
        <StatCell icon={Truck}          label="In transit"        value={stats.transit}       tone="text-chart-2" />
        <StatCell icon={AlertTriangle}  label="Exceptions"        value={stats.exception}     tone="text-destructive" />
        <StatCell icon={PackageCheck}   label="Delivered today"   value={stats.deliveredToday} tone="text-chart-3" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-2.5">All</TabsTrigger>
            {SHIPMENT_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="text-xs px-2.5 capitalize">{s.replace("-", " ")}</TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shipment, BOL, PRO, trailer, driver, ship-to…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Filter
            </Button>
          </div>
        </div>

        <TabsContent value={tab} className="mt-3">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[10px] uppercase tracking-wider">Shipment</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">BOL · PRO</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">WH · Door</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Carrier · Mode</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Ship-to</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Appt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Plt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Ctn</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Wt (lb)</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-10">
                      No shipments match the current filter.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((s) => {
                  const tenant = tenants.find((t) => t.id === s.tenantId);
                  const wh = warehouses.find((w) => w.id === s.warehouseId);
                  return (
                    <TableRow
                      key={s.id}
                      className="text-xs hover:bg-muted/30 cursor-pointer"
                      onClick={() => setOpenId(s.id)}
                    >
                      <TableCell className="py-2 font-mono font-medium">
                        <button
                          type="button"
                          className="text-primary hover:underline cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setOpenId(s.id); }}
                        >
                          {s.id}
                        </button>
                        <div className="text-[10px] text-muted-foreground font-sans">
                          {s.orderIds.length === 1 ? s.orderIds[0] : `${s.orderIds.length} orders`}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">
                        <div>{s.bolId}</div>
                        <div className="text-[10px] text-muted-foreground">{s.proNumber}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="font-mono text-[10px] text-muted-foreground mr-1">{tenant?.code}</span>
                        {tenant?.name.split(" ")[0]}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">
                        <div>{wh?.code}</div>
                        <div className="text-[10px] text-muted-foreground">{s.dockDoor}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Truck className="h-3 w-3 text-muted-foreground" />
                          <span>{s.carrier}</span>
                        </div>
                        <span className={`inline-flex items-center rounded-sm border px-1 py-0 text-[9px] font-mono mt-0.5 ${modeStyles[s.mode]}`}>
                          {s.mode}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">{s.shipTo}</TableCell>
                      <TableCell className="py-2 text-[11px] tabular-nums text-muted-foreground">
                        {fmtDateTime(s.appointmentAt)}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.pallets}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.cartons}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.weightLbs.toLocaleString()}</TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[s.status]}`}>
                          <CircleDot className="h-2.5 w-2.5 mr-1" />
                          {s.status.replace("-", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!openShipment} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {openShipment && openBol && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-mono">
                  {openShipment.id}
                  <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[openShipment.status]}`}>
                    {openShipment.status.replace("-", " ")}
                  </span>
                  <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-mono ${modeStyles[openShipment.mode]}`}>
                    {openShipment.mode}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Tied to BOL <span className="font-mono">{openBol.bolNumber}</span> · PRO{" "}
                  <span className="font-mono">{openBol.proNumber}</span> · {openShipment.carrier} ({openShipment.scac})
                </DialogDescription>
              </DialogHeader>

              {/* Ops snapshot */}
              <div className="grid grid-cols-4 gap-3">
                <OpsCell label="Dock door"     value={openShipment.dockDoor} mono />
                <OpsCell label="Appointment"   value={fmtDateTime(openShipment.appointmentAt)} />
                <OpsCell label="Trailer"       value={openShipment.trailerNumber} mono />
                <OpsCell label="Seal"          value={openShipment.sealNumber} mono />
                <OpsCell label="Driver"        value={openShipment.driverName ?? "—"} />
                <OpsCell label="Driver phone"  value={openShipment.driverPhone ?? "—"} mono />
                <OpsCell label="Check-in"      value={openShipment.checkInAt ? fmtDateTime(openShipment.checkInAt) : "—"} />
                <OpsCell label="Departed"      value={openShipment.departedAt ? fmtDateTime(openShipment.departedAt) : "—"} />
                <OpsCell label="Delivered"     value={openShipment.deliveredAt ? fmtDateTime(openShipment.deliveredAt) : "—"} />
                <OpsCell label="POD signed by" value={openShipment.podSignedBy ?? "—"} />
                <OpsCell label="Pallets / Cartons" value={`${openShipment.pallets} PLT · ${openShipment.cartons} CTN`} />
                <OpsCell label="Weight · Value" value={`${openShipment.weightLbs.toLocaleString()} lb · $${openShipment.declaredValue.toLocaleString()}`} />
              </div>

              {/* Lifecycle actions */}
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Lifecycle</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <LifecycleBtn
                    icon={DoorOpen} label="Mark staged"
                    disabled={openShipment.status !== "pending"}
                    onClick={() => doTransition(openShipment.id, "staged", "marked staged at dock")}
                  />
                  <LifecycleBtn
                    icon={PlayCircle} label="Driver check-in"
                    disabled={openShipment.status !== "staged"}
                    onClick={() => doTransition(openShipment.id, "loading", "driver checked in — loading")}
                  />
                  <LifecycleBtn
                    icon={Send} label="Tender & fire 945"
                    primary
                    disabled={openShipment.status !== "loading"}
                    onClick={() => doTransition(openShipment.id, "tendered", "BOL tendered — 945 sent")}
                  />
                  <LifecycleBtn
                    icon={Truck} label="Depart yard"
                    disabled={openShipment.status !== "tendered"}
                    onClick={() => doTransition(openShipment.id, "in-transit", "trailer departed yard")}
                  />
                  <LifecycleBtn
                    icon={ClipboardCheck} label="Capture POD"
                    disabled={openShipment.status !== "in-transit"}
                    onClick={() => { setPodSigner(openBol.consignee.contact ?? ""); setPodOpen(true); }}
                  />
                  <div className="flex-1" />
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    onClick={() => window.print()}
                  >
                    <Printer className="h-3.5 w-3.5" /> Print BOL
                  </Button>
                </div>
              </div>

              {/* Linked BOL */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Systemic VICS Bill of Lading
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {openBol.lines.length} freight line{openBol.lines.length === 1 ? "" : "s"} ·{" "}
                    {openBol.childOrderIds.length} order{openBol.childOrderIds.length === 1 ? "" : "s"}
                  </div>
                </div>
                <BolDocument bol={openBol} />
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpenId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* POD capture */}
      <Dialog open={podOpen} onOpenChange={setPodOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Capture Proof of Delivery</DialogTitle>
            <DialogDescription className="text-xs">
              Records consignee acknowledgement and closes the shipment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Signed by</label>
            <Input
              value={podSigner}
              onChange={(e) => setPodSigner(e.target.value)}
              placeholder="Receiving contact name"
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPodOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm" className="h-8 text-xs gap-1.5"
              disabled={!podSigner.trim() || !openShipment}
              onClick={() => {
                if (!openShipment) return;
                recordPod(openShipment.id, podSigner.trim());
                setPodOpen(false);
                setTick((t) => t + 1);
                toast.success(`POD captured · ${openShipment.id}`, {
                  description: `Signed by ${podSigner.trim()}`,
                });
              }}
            >
              <ClipboardCheck className="h-3.5 w-3.5" /> Save POD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCell({
  icon: Icon, label, value, tone,
}: { icon: typeof Truck; label: string; value: number; tone: string }) {
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

function OpsCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function LifecycleBtn({
  icon: Icon, label, onClick, disabled, primary,
}: {
  icon: typeof Truck; label: string; onClick: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      className="h-7 text-xs gap-1.5"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
