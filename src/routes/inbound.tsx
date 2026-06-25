import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Upload,
  Filter,
  Container,
  Truck,
  DoorOpen,
  PackageCheck,
  AlertTriangle,
  Clock,
  Boxes,
  ChevronRight,
  CalendarClock,
  Hash,
  ScanLine,
  Layers,
  Database,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { tenants, warehouses } from "@/lib/mock-data";
import {
  inboundShipments,
  inboundProgressPct,
  shipmentProgressPct,
  warehouseCode,
  type InboundLine,
  type InboundShipment,
} from "@/lib/inbound-data";
import { createPalletsFromInbound } from "@/lib/pallet-data";
import { CsvUploader } from "@/components/csv-uploader";
import { fmtDateTime, fmtDateYear } from "@/lib/utils";
import { validateLineAgainstItemMaster, masterReasonLabel } from "@/lib/master-data";

export const Route = createFileRoute("/inbound")({
  head: () => ({
    meta: [
      { title: "Inbound — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "EDI 943 Stock Transfer Shipment Advice — expected containers, trailers, SKU/LOT/expiration and pallet build linkage.",
      },
    ],
  }),
  component: InboundPage,
});

const statusStyles: Record<InboundShipment["status"], string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  arrived:   "bg-chart-4/15 text-chart-4 border-chart-4/30",
  unloading: "bg-primary/15 text-primary border-primary/30",
  received:  "bg-chart-3/15 text-chart-3 border-chart-3/30",
  exception: "bg-destructive/15 text-destructive border-destructive/30",
};

const lineStatusStyles: Record<InboundLine["status"], string> = {
  expected: "bg-muted text-muted-foreground border-border",
  partial:  "bg-chart-4/15 text-chart-4 border-chart-4/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
};

function InboundPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { refreshData } = useWmsData();
  const [query, setQuery] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [, force] = useState(0);
  const [activeLine, setActiveLine] = useState<{ s: InboundShipment; l: InboundLine } | null>(null);

  const filtered = useMemo(() => {
    return inboundShipments.filter((s) => {
      if (tenantId !== "all" && s.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && s.warehouseId !== warehouseId) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${s.id} ${s.ediRef} ${s.poNumber} ${s.trailerNumber} ${s.containerNumber} ${s.bolNumber} ${s.carrier}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
    // re-render on force
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, warehouseId, query]);

  const stats = useMemo(() => {
    const t = { scheduled: 0, atDoor: 0, exception: 0, expectedUnits: 0, expectedCartons: 0 };
    for (const s of filtered) {
      if (s.status === "scheduled") t.scheduled++;
      if (s.status === "arrived" || s.status === "unloading") t.atDoor++;
      if (s.status === "exception") t.exception++;
      for (const l of s.lines) {
        t.expectedUnits += l.qtyExpected;
        t.expectedCartons += l.cartonsExpected;
      }
    }
    return t;
  }, [filtered]);

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbound · EDI 943</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stock Transfer Shipment Advice — expected trailers / containers and pallet build linkage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={refreshData}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCsvOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Upload CSV
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" asChild>
            <Link to="/pallets">
              <Boxes className="h-3.5 w-3.5" /> Pallet floor
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={CalendarClock} label="Scheduled"        value={stats.scheduled}       tone="text-foreground" />
        <StatCell icon={DoorOpen}      label="At dock"          value={stats.atDoor}          tone="text-primary" />
        <StatCell icon={AlertTriangle} label="Exceptions"       value={stats.exception}       tone="text-destructive" />
        <StatCell icon={Layers}        label="Units expected"   value={stats.expectedUnits}   tone="text-chart-3" />
        <StatCell icon={PackageCheck}  label="Cartons expected" value={stats.expectedCartons} tone="text-chart-4" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ASN, PO, trailer, container, BOL, carrier…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Filter className="h-3.5 w-3.5" /> Filter
        </Button>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-md border border-border bg-card py-10 text-center text-xs text-muted-foreground">
            No inbound shipments match the current tenant / warehouse filter.
          </div>
        )}
        {filtered.map((s) => (
          <ShipmentCard
            key={s.id}
            shipment={s}
            onBuildPallets={(l) => setActiveLine({ s, l })}
          />
        ))}
      </div>

      <BuildPalletsDialog
        open={!!activeLine}
        onOpenChange={(o) => !o && setActiveLine(null)}
        context={activeLine}
        onCreated={() => {
          force((n) => n + 1);
          setActiveLine(null);
        }}
      />

      <CsvUploader
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="Upload inbound ASN CSV"
        description="Fallback ingestion when an EDI 943 feed is not active. Map your headers to the inbound schema."
        ediHint="EDI 943"
        targetFields={[
          { key: "asn_ref",         label: "ASN / Reference",   required: true },
          { key: "po_number",       label: "PO number",         required: true },
          { key: "trailer_number",  label: "Trailer / Container" },
          { key: "carrier",         label: "Carrier",           required: true },
          { key: "expected_at",     label: "Appointment",       required: true },
          { key: "sku",             label: "Line SKU",          required: true },
          { key: "lot",             label: "LOT / Batch",       required: true },
          { key: "expiration_date", label: "Expiration date" },
          { key: "qty_expected",    label: "Units expected",    required: true },
          { key: "cartons",         label: "Cartons expected" },
        ]}
        exampleHeaders={["ASN", "PO", "Trailer", "Carrier", "ETA", "Item", "Lot", "Exp", "Units", "Cartons"]}
      />
    </div>
  );
}

function ShipmentCard({
  shipment,
  onBuildPallets,
}: {
  shipment: InboundShipment;
  onBuildPallets: (l: InboundLine) => void;
}) {
  const tenant = tenants.find((t) => t.id === shipment.tenantId);
  const wh = warehouses.find((w) => w.id === shipment.warehouseId);
  const pct = shipmentProgressPct(shipment);
  const totalUnits = shipment.lines.reduce((a, l) => a + l.qtyExpected, 0);
  const totalCartons = shipment.lines.reduce((a, l) => a + l.cartonsExpected, 0);
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border bg-muted/20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold">{shipment.id}</span>
            <span
              className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[shipment.status]}`}
            >
              {shipment.status}
            </span>
            <span className="inline-flex items-center rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono">
              {shipment.source}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">EDI 943 · {shipment.ediRef}</span>
          </div>
          <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-[11px]">
            <KV icon={Truck}      label="Carrier"    value={shipment.carrier} />
            <KV icon={Container}  label="Trailer / Cont." value={shipment.trailerNumber !== "—" ? shipment.trailerNumber : shipment.containerNumber} />
            <KV icon={Hash}       label="Seal / BOL" value={`${shipment.sealNumber} · ${shipment.bolNumber}`} />
            <KV icon={DoorOpen}   label="Door"       value={shipment.doorAssigned ?? "Unassigned"} />
            <KV icon={CalendarClock} label="Appointment" value={fmtDateTime(shipment.appointmentAt)} />
            <KV icon={Hash}       label="PO"          value={shipment.poNumber} />
            <KV label="Client"     value={`${tenant?.code ?? ""} · ${tenant?.name ?? ""}`} />
            <KV label="Warehouse"  value={`${wh?.code ?? ""} · ${wh?.city ?? ""}`} />
          </div>
        </div>
        <div className="w-48 shrink-0">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Receipt progress</span>
            <span className="tabular-nums text-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5 mt-1" />
          <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
            <div>{totalUnits.toLocaleString()} units</div>
            <div className="text-right">{totalCartons.toLocaleString()} cartons</div>
          </div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="text-[10px] uppercase tracking-wider w-10">#</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">SKU / Item</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">LOT</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Expiration</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">Units exp.</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">Cartons exp.</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">U/Pallet</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Receipt</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Pallets built</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipment.lines.map((l) => {
            const lPct = inboundProgressPct(l);
            const remaining = Math.max(0, l.qtyExpected - l.receivedQty);
            const palletsRemaining = Math.max(0, Math.ceil(remaining / Math.max(1, l.unitsPerPallet)));
            return (
              <TableRow key={l.lineNo} className="text-xs hover:bg-muted/30">
                <TableCell className="py-2 font-mono text-[11px] text-muted-foreground">
                  {l.lineNo.toString().padStart(2, "0")}
                </TableCell>
                <TableCell className="py-2">
                  <div className="font-mono font-medium">{l.sku}</div>
                  <div className="text-[10px] text-muted-foreground">{l.description}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">UPC {l.upc} · Style {l.itemStyle}</div>
                </TableCell>
                <TableCell className="py-2 font-mono text-[11px]">{l.lot}</TableCell>
                <TableCell className="py-2 text-[11px] tabular-nums">{fmtDateYear(l.expirationDate)}</TableCell>
                <TableCell className="py-2 text-right tabular-nums font-medium">{l.qtyExpected.toLocaleString()}</TableCell>
                <TableCell className="py-2 text-right tabular-nums">{l.cartonsExpected.toLocaleString()}</TableCell>
                <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{l.unitsPerPallet}</TableCell>
                <TableCell className="py-2 w-40">
                  <div className="flex items-center gap-2">
                    <Progress value={lPct} className="h-1.5 flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground w-9 text-right">{lPct}%</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                    {l.receivedQty.toLocaleString()} / {l.qtyExpected.toLocaleString()}
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  {l.palletIds.length === 0 ? (
                    <span
                      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${lineStatusStyles[l.status]}`}
                    >
                      {l.status}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {l.palletIds.map((id) => (
                        <Link
                          key={id}
                          to="/pallets"
                          className="inline-flex items-center gap-0.5 rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/20"
                        >
                          {id} <ChevronRight className="h-2.5 w-2.5" />
                        </Link>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right">
                  {(() => {
                    const masterReason = validateLineAgainstItemMaster({
                      sku: l.sku,
                      upc: l.upc,
                      tenantId: shipment.tenantId,
                    });
                    if (masterReason) {
                      const qs = new URLSearchParams({
                        tab: "items",
                        addSku: l.sku,
                        tenantId: shipment.tenantId,
                        upc: l.upc ?? "",
                        desc: l.description ?? "",
                        style: l.itemStyle ?? "",
                      }).toString();
                      return (
                        <Link
                          to={`/masters?${qs}`}
                          className="inline-flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/15"
                          title={masterReasonLabel(masterReason)}
                        >
                          <Database className="h-3 w-3" />
                          Add to Item Master
                        </Link>
                      );
                    }
                    return (
                      <Button
                        size="sm"
                        variant={l.status === "received" ? "outline" : "default"}
                        className="h-7 text-[11px] gap-1.5"
                        disabled={l.status === "received" || shipment.status === "scheduled"}
                        onClick={() => onBuildPallets(l)}
                      >
                        <ScanLine className="h-3 w-3" />
                        {l.status === "received"
                          ? "Complete"
                          : shipment.status === "scheduled"
                          ? "Awaiting arrival"
                          : `Build ${palletsRemaining} pallet${palletsRemaining === 1 ? "" : "s"}`}
                      </Button>
                    );
                  })()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function BuildPalletsDialog({
  open,
  onOpenChange,
  context,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  context: { s: InboundShipment; l: InboundLine } | null;
  onCreated: () => void;
}) {
  const line = context?.l;
  const ship = context?.s;
  const remaining = line ? Math.max(0, line.qtyExpected - line.receivedQty) : 0;
  const defaultUpp = line?.unitsPerPallet ?? 0;
  const defaultPallets = line ? Math.max(1, Math.ceil(remaining / Math.max(1, defaultUpp))) : 0;

  const [palletCount, setPalletCount] = useState(defaultPallets);
  const [unitsPerPallet, setUnitsPerPallet] = useState(defaultUpp);

  // Sync defaults when context changes
  useEffect(() => {
    setPalletCount(defaultPallets);
    setUnitsPerPallet(defaultUpp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.l.lineNo, context?.s.id]);

  if (!line || !ship) return null;

  const willReceive = Math.min(remaining, palletCount * unitsPerPallet);

  const handleBuild = () => {
    if (palletCount <= 0 || unitsPerPallet <= 0) {
      toast.error("Pallet count and units per pallet must be > 0");
      return;
    }
    const reason = validateLineAgainstItemMaster({
      sku: line.sku,
      upc: line.upc,
      tenantId: ship.tenantId,
    });
    if (reason) {
      toast.error("Blocked by Item Master (832) check", {
        description: `${line.sku} — ${masterReasonLabel(reason)}. Resolve in Master Data → Item Master.`,
      });
      return;
    }
    const created = createPalletsFromInbound({
      sku: line.sku,
      description: line.description,
      itemStyle: line.itemStyle,
      tenantId: ship.tenantId,
      warehouseId: ship.warehouseId,
      poNumber: ship.poNumber,
      ediSource: ship.source === "EDI_943" || ship.source === "EDI_944" ? ship.source : "MANUAL",
      palletCount,
      unitsPerPallet,
      weightLbsPerUnit: line.weightLbsPerUnit,
      builtBy: "Live receiver",
      prefix: `PLT-${warehouseCode(ship.warehouseId)}`,
    });

    // Mutate the mock line so the UI reflects receipt progress
    line.receivedQty = Math.min(line.qtyExpected, line.receivedQty + willReceive);
    line.palletIds = [...line.palletIds, ...created.map((p) => p.id)];
    line.status = line.receivedQty >= line.qtyExpected ? "received" : "partial";

    // Flip shipment status to unloading or received as appropriate
    const allReceived = ship.lines.every((l) => l.status === "received");
    if (allReceived) {
      ship.status = "received";
      ship.receivedAt = new Date().toISOString();
    } else if (ship.status === "arrived" || ship.status === "scheduled") {
      ship.status = "unloading";
    }

    toast.success(`Built ${created.length} pallet${created.length === 1 ? "" : "s"} — staged for putaway`, {
      description: `${created.map((p) => p.id).join(", ")}`,
    });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Build pallets · {line.itemStyle}</DialogTitle>
          <DialogDescription className="text-xs">
            Group {line.sku} by item-style and assign License Plates. Pallets are staged for directed putaway.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] grid grid-cols-2 gap-y-1">
          <KV label="ASN"        value={ship.ediRef} />
          <KV label="PO"         value={ship.poNumber} />
          <KV label="LOT"        value={line.lot} />
          <KV label="Expiration" value={fmtDateYear(line.expirationDate)} />
          <KV label="Expected"   value={`${line.qtyExpected.toLocaleString()} units / ${line.cartonsExpected} cartons`} />
          <KV label="Remaining"  value={`${remaining.toLocaleString()} units`} />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="space-y-1">
            <Label htmlFor="pallets" className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Pallets to build
            </Label>
            <Input
              id="pallets"
              type="number"
              min={1}
              value={palletCount}
              onChange={(e) => setPalletCount(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="upp" className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Units / pallet
            </Label>
            <Input
              id="upp"
              type="number"
              min={1}
              value={unitsPerPallet}
              onChange={(e) => setUnitsPerPallet(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] flex items-center justify-between">
          <span className="text-muted-foreground">Will receive</span>
          <span className="font-mono font-semibold">
            {willReceive.toLocaleString()} units across {palletCount} pallet{palletCount === 1 ? "" : "s"}
          </span>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleBuild}>
            <Boxes className="h-3.5 w-3.5" /> Build &amp; stage pallets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KV({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground shrink-0" />}
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
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