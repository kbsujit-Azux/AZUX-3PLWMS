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
  FileText,
  Download,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { tenants, warehouses, inventoryItems } from "@/lib/mock-data";
import {
  inboundShipments,
  inboundProgressPct,
  shipmentProgressPct,
  warehouseCode,
  type InboundLine,
  type InboundShipment,
  inboundReceipts,
  closeInboundShipment,
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
  arrived: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  unloading: "bg-primary/15 text-primary border-primary/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  exception: "bg-destructive/15 text-destructive border-destructive/30",
};

const lineStatusStyles: Record<InboundLine["status"], string> = {
  expected: "bg-muted text-muted-foreground border-border",
  partial: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
};

function InboundPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { refreshData } = useWmsData();
  const [query, setQuery] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [, force] = useState(0);
  const [activeLine, setActiveLine] = useState<{ s: InboundShipment; l: InboundLine } | null>(null);
  const [addContainerOpen, setAddContainerOpen] = useState(false);
  const [closeContainer, setCloseContainer] = useState<InboundShipment | null>(null);
  const [printReceipt, setPrintReceipt] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");

  const filtered = useMemo(() => {
    return inboundShipments.filter((s) => {
      if (tenantId !== "all" && s.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && s.warehouseId !== warehouseId) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob =
          `${s.id} ${s.ediRef} ${s.poNumber} ${s.trailerNumber} ${s.containerNumber} ${s.bolNumber} ${s.carrier}`.toLowerCase();
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setCsvOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" /> Upload CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setReportOpen(true)}
          >
            <FileText className="h-3.5 w-3.5" /> Inbound Report
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setAddContainerOpen(true)}
          >
            <Container className="h-3.5 w-3.5" /> Add Container
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" asChild>
            <Link to="/pallets">
              <Boxes className="h-3.5 w-3.5" /> Pallet floor
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell
          icon={CalendarClock}
          label="Scheduled"
          value={stats.scheduled}
          tone="text-foreground"
        />
        <StatCell icon={DoorOpen} label="At dock" value={stats.atDoor} tone="text-primary" />
        <StatCell
          icon={AlertTriangle}
          label="Exceptions"
          value={stats.exception}
          tone="text-destructive"
        />
        <StatCell
          icon={Layers}
          label="Units expected"
          value={stats.expectedUnits}
          tone="text-chart-3"
        />
        <StatCell
          icon={PackageCheck}
          label="Cartons expected"
          value={stats.expectedCartons}
          tone="text-chart-4"
        />
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
            onCloseContainer={
              s.status !== "received" && s.lines.every((l) => l.palletIds.length > 0)
                ? () => setCloseContainer(s)
                : undefined
            }
            onPrintReceipt={
              inboundReceipts.find((r) => r.inboundShipmentId === s.id)
                ? () => setPrintReceipt(s.id)
                : undefined
            }
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

      <AddContainerDialog
        open={addContainerOpen}
        onOpenChange={setAddContainerOpen}
        onAdded={() => force((n) => n + 1)}
      />

      {closeContainer && (
        <CloseContainerDialog
          open={!!closeContainer}
          onOpenChange={(o) => !o && setCloseContainer(null)}
          shipment={closeContainer}
          onClosed={() => {
            force((n) => n + 1);
            setCloseContainer(null);
          }}
        />
      )}

      {printReceipt && (
        <ReceiptPreviewDialog
          open={!!printReceipt}
          onOpenChange={(o) => !o && setPrintReceipt(null)}
          shipmentId={printReceipt}
        />
      )}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        startDate={reportStart}
        endDate={reportEnd}
        onStartDateChange={setReportStart}
        onEndDateChange={setReportEnd}
      />

      <CsvUploader
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="Upload inbound ASN CSV"
        description="Fallback ingestion when an EDI 943 feed is not active. Map your headers to the inbound schema."
        ediHint="EDI 943"
        targetFields={[
          { key: "asn_ref", label: "ASN / Reference", required: true },
          { key: "po_number", label: "PO number", required: true },
          { key: "trailer_number", label: "Trailer / Container" },
          { key: "carrier", label: "Carrier", required: true },
          { key: "expected_at", label: "Appointment", required: true },
          { key: "sku", label: "Line SKU", required: true },
          { key: "lot", label: "LOT / Batch", required: true },
          { key: "expiration_date", label: "Expiration date" },
          { key: "qty_expected", label: "Units expected", required: true },
          { key: "cartons", label: "Cartons expected" },
        ]}
        exampleHeaders={[
          "ASN",
          "PO",
          "Trailer",
          "Carrier",
          "ETA",
          "Item",
          "Lot",
          "Exp",
          "Units",
          "Cartons",
        ]}
      />
    </div>
  );
}

function ShipmentCard({
  shipment,
  onBuildPallets,
  onCloseContainer,
  onPrintReceipt,
}: {
  shipment: InboundShipment;
  onBuildPallets: (l: InboundLine) => void;
  onCloseContainer?: () => void;
  onPrintReceipt?: () => void;
}) {
  const tenant = tenants.find((t) => t.id === shipment.tenantId);
  const wh = warehouses.find((w) => w.id === shipment.warehouseId);
  const pct = shipmentProgressPct(shipment);
  const totalUnits = shipment.lines.reduce((a, l) => a + l.qtyExpected, 0);
  const totalCartons = shipment.lines.reduce((a, l) => a + l.cartonsExpected, 0);

  const allLinesHavePallets = shipment.lines.every((l) => l.palletIds.length > 0);
  const canClose = onCloseContainer && allLinesHavePallets;
  const hasReceipt = !!onPrintReceipt;

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
            <span className="text-[10px] text-muted-foreground font-mono">
              EDI 943 · {shipment.ediRef}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-[11px]">
            <KV icon={Truck} label="Carrier" value={shipment.carrier} />
            <KV
              icon={Container}
              label="Trailer / Cont."
              value={
                shipment.trailerNumber !== "—" ? shipment.trailerNumber : shipment.containerNumber
              }
            />
            <KV
              icon={Hash}
              label="Seal / BOL"
              value={`${shipment.sealNumber} · ${shipment.bolNumber}`}
            />
            <KV icon={DoorOpen} label="Door" value={shipment.doorAssigned ?? "Unassigned"} />
            <KV
              icon={CalendarClock}
              label="Appointment"
              value={fmtDateTime(shipment.appointmentAt)}
            />
            <KV icon={Hash} label="PO" value={shipment.poNumber} />
            <KV label="Client" value={`${tenant?.code ?? ""} · ${tenant?.name ?? ""}`} />
            <KV label="Warehouse" value={`${wh?.code ?? ""} · ${wh?.city ?? ""}`} />
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

      {hasReceipt && (
        <div className="px-4 py-2 border-b border-border bg-muted/10 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={onPrintReceipt}
          >
            <FileText className="h-3 w-3" /> Print Receipt
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="text-[10px] uppercase tracking-wider w-10">#</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">SKU / Item</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">LOT</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Expiration</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              Units exp.
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              Cartons exp.
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              U/Pallet
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Receipt</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Pallets built</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-right">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipment.lines.map((l) => {
            const lPct = inboundProgressPct(l);
            const remaining = Math.max(0, l.qtyExpected - l.receivedQty);
            const palletsRemaining = Math.max(
              0,
              Math.ceil(remaining / Math.max(1, l.unitsPerPallet)),
            );
            return (
              <TableRow key={l.lineNo} className="text-xs hover:bg-muted/30">
                <TableCell className="py-2 font-mono text-[11px] text-muted-foreground">
                  {l.lineNo.toString().padStart(2, "0")}
                </TableCell>
                <TableCell className="py-2">
                  <div className="font-mono font-medium">{l.sku}</div>
                  <div className="text-[10px] text-muted-foreground">{l.description}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    UPC {l.upc} · Style {l.itemStyle}
                  </div>
                </TableCell>
                <TableCell className="py-2 font-mono text-[11px]">{l.lot}</TableCell>
                <TableCell className="py-2 text-[11px] tabular-nums">
                  {fmtDateYear(l.expirationDate)}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums font-medium">
                  {l.qtyExpected.toLocaleString()}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums">
                  {l.cartonsExpected.toLocaleString()}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                  {l.unitsPerPallet}
                </TableCell>
                <TableCell className="py-2 w-40">
                  <div className="flex items-center gap-2">
                    <Progress value={lPct} className="h-1.5 flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground w-9 text-right">
                      {lPct}%
                    </span>
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

      {!hasReceipt && canClose && (
        <div className="px-4 py-3 border-t border-border bg-muted/20 flex justify-end">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1.5"
            onClick={onCloseContainer}
          >
            <Check className="h-3 w-3" /> Close Container
          </Button>
        </div>
      )}
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

    toast.success(
      `Built ${created.length} pallet${created.length === 1 ? "" : "s"} — staged for putaway`,
      {
        description: `${created.map((p) => p.id).join(", ")}`,
      },
    );
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Build pallets · {line.itemStyle}</DialogTitle>
          <DialogDescription className="text-xs">
            Group {line.sku} by item-style and assign License Plates. Pallets are staged for
            directed putaway.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] grid grid-cols-2 gap-y-1">
          <KV label="ASN" value={ship.ediRef} />
          <KV label="PO" value={ship.poNumber} />
          <KV label="LOT" value={line.lot} />
          <KV label="Expiration" value={fmtDateYear(line.expirationDate)} />
          <KV
            label="Expected"
            value={`${line.qtyExpected.toLocaleString()} units / ${line.cartonsExpected} cartons`}
          />
          <KV label="Remaining" value={`${remaining.toLocaleString()} units`} />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="space-y-1">
            <Label
              htmlFor="pallets"
              className="text-[11px] uppercase tracking-wider text-muted-foreground"
            >
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
            <Label
              htmlFor="upp"
              className="text-[11px] uppercase tracking-wider text-muted-foreground"
            >
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
            {willReceive.toLocaleString()} units across {palletCount} pallet
            {palletCount === 1 ? "" : "s"}
          </span>
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
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

function KV({ icon: Icon, label, value }: { icon?: typeof Truck; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground shrink-0" />}
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
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
      <div className={`text-base font-semibold tabular-nums ${tone}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function AddContainerDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const { tenantId, warehouseId } = useWorkspace();
  const [header, setHeader] = useState({
    ediRef: "",
    poNumber: "",
    carrier: "",
    trailerNumber: "",
    containerNumber: "",
    sealNumber: "",
    bolNumber: "",
    doorAssigned: "",
    appointmentAt: "",
    origin: "",
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const validSkus = useMemo(() => {
    const tenantToUse = selectedTenantId || (tenantId !== "all" ? tenantId : tenants[0].id);
    return inventoryItems.filter((i) => i.tenantId === tenantToUse).map((i) => ({ sku: i.sku, upc: i.upc, itemStyle: i.itemStyle, description: i.description }));
  }, [selectedTenantId, tenantId]);

  const [lines, setLines] = useState<
    Array<{
      sku: string;
      upc: string;
      itemStyle: string;
      description: string;
      lot: string;
      expirationDate: string;
      qtyExpected: number;
      cartonsExpected: number;
      unitsPerPallet: number;
      weightLbsPerUnit: number;
    }>
  >([]);
  const [notes, setNotes] = useState("");

  const addLine = () => {
    setLines([
      ...lines,
      {
        sku: "",
        upc: "",
        itemStyle: "",
        description: "",
        lot: "",
        expirationDate: "",
        qtyExpected: 0,
        cartonsExpected: 0,
        unitsPerPallet: 0,
        weightLbsPerUnit: 0,
      },
    ]);
  };

  const updateLine = (idx: number, field: string, value: string | number) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const onSkuChange = (idx: number, sku: string) => {
    const masterItem = validSkus.find((v) => v.sku === sku);
    setLines(lines.map((l, i) =>
      i === idx
        ? {
            ...l,
            sku,
            upc: masterItem?.upc ?? "",
            itemStyle: masterItem?.itemStyle ?? "",
            description: masterItem?.description ?? "",
          }
        : l,
    ));
  };

  const removeLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    if (!header.ediRef || !header.poNumber) {
      toast.error("EDI Reference and PO Number are required");
      return;
    }
    if (lines.length === 0) {
      toast.error("At least one line item is required");
      return;
    }

    const ts = (d: string) => new Date(d).toISOString();
    const newShipment: InboundShipment = {
      id: `INB-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}${(inboundShipments.length + 1).toString().padStart(3, "0")}`,
      ediRef: header.ediRef,
      isaControl: `0000${Math.floor(Math.random() * 999999)
        .toString()
        .padStart(6, "0")}`,
      tenantId: selectedTenantId || (tenantId !== "all" ? tenantId : tenants[0].id),
      warehouseId: warehouseId === "all" ? warehouses[0].id : warehouseId,
      partner: "MANUAL",
      carrier: header.carrier,
      trailerNumber: header.trailerNumber || "—",
      containerNumber: header.containerNumber || "—",
      sealNumber: header.sealNumber,
      bolNumber: header.bolNumber,
      origin: header.origin,
      poNumber: header.poNumber,
      appointmentAt: header.appointmentAt ? ts(header.appointmentAt) : new Date().toISOString(),
      expectedAt: header.appointmentAt ? ts(header.appointmentAt) : new Date().toISOString(),
      receivedAt: null,
      doorAssigned: header.doorAssigned || null,
      status: "scheduled",
      source: "MANUAL",
      lines: lines.map((l, idx) => ({
        lineNo: idx + 1,
        sku: l.sku,
        upc: l.upc,
        itemStyle: l.itemStyle,
        description: l.description,
        lot: l.lot,
        expirationDate: l.expirationDate ? ts(l.expirationDate) : ts("2030-12-31"),
        qtyExpected: l.qtyExpected,
        cartonsExpected: l.cartonsExpected,
        uom: "EA",
        weightLbsPerUnit: l.weightLbsPerUnit,
        unitsPerPallet: l.unitsPerPallet,
        receivedQty: 0,
        palletIds: [],
        status: "expected",
      })),
    };

    inboundShipments.unshift(newShipment);
    toast.success(`Container ${header.containerNumber || header.trailerNumber} added`);
    onOpenChange(false);
    onAdded();
    setHeader({
      ediRef: "",
      poNumber: "",
      carrier: "",
      trailerNumber: "",
      containerNumber: "",
      sealNumber: "",
      bolNumber: "",
      doorAssigned: "",
      appointmentAt: "",
      origin: "",
    });
    setLines([]);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Add Container / Trailer</DialogTitle>
          <DialogDescription className="text-xs">
            Enter header and detail information for manual inbound container entry.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Header Information
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px]">Client *</Label>
                <select
                  value={selectedTenantId || (tenantId !== "all" ? tenantId : "")}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="h-8 text-xs rounded-md border border-input bg-background px-2 w-full"
                >
                  <option value="">Select client...</option>
                  {tenants.filter((t) => t.id !== "all").map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">EDI Reference *</Label>
                <Input
                  value={header.ediRef}
                  onChange={(e) => setHeader({ ...header, ediRef: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">PO Number *</Label>
                <Input
                  value={header.poNumber}
                  onChange={(e) => setHeader({ ...header, poNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Carrier</Label>
                <Input
                  value={header.carrier}
                  onChange={(e) => setHeader({ ...header, carrier: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Trailer Number</Label>
                <Input
                  value={header.trailerNumber}
                  onChange={(e) => setHeader({ ...header, trailerNumber: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="SNDR-884221"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Container Number</Label>
                <Input
                  value={header.containerNumber}
                  onChange={(e) => setHeader({ ...header, containerNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Seal / BOL</Label>
                <Input
                  value={header.sealNumber}
                  onChange={(e) => setHeader({ ...header, sealNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Door Assigned</Label>
                <Input
                  value={header.doorAssigned}
                  onChange={(e) => setHeader({ ...header, doorAssigned: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Appointment Date</Label>
                <Input
                  type="datetime-local"
                  value={header.appointmentAt}
                  onChange={(e) => setHeader({ ...header, appointmentAt: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Origin</Label>
                <Input
                  value={header.origin}
                  onChange={(e) => setHeader({ ...header, origin: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-3 space-y-1">
                <Label className="text-[10px]">Notes (max 200 chars)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                  className="text-xs"
                  placeholder="Optional notes for this shipment..."
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Line Items
              </h3>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}>
                <span className="text-[10px]">Add Line</span>
              </Button>
            </div>
            <div className="border border-border rounded-md max-h-60 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-[10px] w-8">#</TableHead>
                    <TableHead className="text-[10px]">SKU</TableHead>
                    <TableHead className="text-[10px]">Description</TableHead>
                    <TableHead className="text-[10px]">LOT</TableHead>
                    <TableHead className="text-[10px]">Exp Date</TableHead>
                    <TableHead className="text-[10px] text-right">Units</TableHead>
                    <TableHead className="text-[10px] text-right">Cartons</TableHead>
                    <TableHead className="text-[10px] text-right">U/Pallet</TableHead>
                    <TableHead className="text-[10px] w-8"></TableHead>
                  </TableRow>
                </TableHeader>
<TableBody>
                   {lines.map((l, idx) => (
                     <TableRow key={idx}>
                       <TableCell className="py-2">{idx + 1}</TableCell>
                       <TableCell className="py-2">
                         <select
                           value={l.sku}
                           onChange={(e) => onSkuChange(idx, e.target.value)}
                           className="h-7 text-xs w-24 rounded-md border border-input bg-background px-1"
                         >
                           <option value="">Select SKU...</option>
                           {validSkus.map((v) => (
                             <option key={v.sku} value={v.sku}>{v.sku}</option>
                           ))}
                         </select>
                       </TableCell>
                       <TableCell className="py-2">
                         <Input
                           value={l.description}
                           onChange={(e) => updateLine(idx, "description", e.target.value)}
                           className="h-7 text-xs w-32"
                           readOnly={!!l.sku && !!validSkus.find((v) => v.sku === l.sku)?.description}
                         />
                       </TableCell>
                       <TableCell className="py-2">
                         <Input
                           value={l.lot}
                           onChange={(e) => updateLine(idx, "lot", e.target.value)}
                           className="h-7 text-xs w-20"
                         />
                       </TableCell>
                       <TableCell className="py-2">
                         <Input
                           type="date"
                           value={l.expirationDate}
                           onChange={(e) => updateLine(idx, "expirationDate", e.target.value)}
                           className="h-7 text-xs w-28"
                         />
                       </TableCell>
                       <TableCell className="py-2">
                         <Input
                           type="number"
                           value={l.qtyExpected}
                           onChange={(e) =>
                             updateLine(idx, "qtyExpected", parseInt(e.target.value) || 0)
                           }
                           className="h-7 text-xs w-16 text-right"
                         />
                       </TableCell>
                       <TableCell className="py-2">
                         <Input
                           type="number"
                           value={l.cartonsExpected}
                           onChange={(e) =>
                             updateLine(idx, "cartonsExpected", parseInt(e.target.value) || 0)
                           }
                           className="h-7 text-xs w-16 text-right"
                         />
                       </TableCell>
                       <TableCell className="py-2">
                         <Input
                           type="number"
                           value={l.unitsPerPallet}
                           onChange={(e) =>
                             updateLine(idx, "unitsPerPallet", parseInt(e.target.value) || 0)
                           }
                           className="h-7 text-xs w-14 text-right"
                         />
                       </TableCell>
                       <TableCell className="py-2">
                         <Button
                           size="sm"
                           variant="ghost"
                           className="h-6 w-6 p-0"
                           onClick={() => removeLine(idx)}
                         >
                           <X className="h-3 w-3" />
                         </Button>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleAdd}>
            Add Container
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseContainerDialog({
  open,
  onOpenChange,
  shipment,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: InboundShipment;
  onClosed: () => void;
}) {
  const tenant = tenants.find((t) => t.id === shipment.tenantId);

  const handleClose = () => {
    closeInboundShipment(shipment, [], []);
    toast.success(`Container ${shipment.trailerNumber || shipment.containerNumber} closed`);
    onOpenChange(false);
    onClosed();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close Container?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            This will create an Inbound Receipt for {shipment.id} (
            {shipment.trailerNumber || shipment.containerNumber}). All pallet build operations must
            be complete before closing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] space-y-1">
          <KV
            label="Container"
            value={
              shipment.trailerNumber !== "—" ? shipment.trailerNumber : shipment.containerNumber
            }
          />
          <KV label="Client" value={tenant?.name ?? ""} />
          <KV label="PO" value={shipment.poNumber} />
          <KV label="Total Lines" value={shipment.lines.length.toString()} />
          <KV
            label="Total Pallets"
            value={shipment.lines.reduce((a, l) => a + l.palletIds.length, 0).toString()}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-8 text-xs" onClick={handleClose}>
            Close Container
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReceiptPreviewDialog({
  open,
  onOpenChange,
  shipmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
}) {
  const shipment = inboundShipments.find((s) => s.id === shipmentId);
  const receipt = inboundReceipts.find((r) => r.inboundShipmentId === shipmentId);

  if (!receipt) return null;

  const tenant = tenants.find((t) => t.id === receipt.tenantId);
  const wh = warehouses.find((w) => w.id === receipt.warehouseId);

  const downloadReceipt = () => {
    const content = [
      `INBOUND RECEIPT - ${receipt.receiptRef}`,
      `Generated: ${fmtDateTime(receipt.closedAt)}`,
      "",
      `Container: ${receipt.trailerNumber || receipt.containerNumber || "—"}`,
      `PO: ${receipt.poNumber}`,
      `Client: ${tenant?.code} - ${tenant?.name}`,
      `Warehouse: ${wh?.code} - ${wh?.city}`,
      `Carrier: ${receipt.carrier}`,
      `Seal/BOL: ${receipt.sealNumber} / ${receipt.bolNumber}`,
      "",
      "SKU SUMMARY:",
      ...receipt.lines.map(
        (l) =>
          `  ${l.sku} | Exp: ${l.qtyExpected} | Rec: ${l.qtyReceived} | Pallets: ${l.palletCount} | Putaway: ${l.putawayDate ? fmtDateYear(l.putawayDate) : "—"} | OSD: ${l.osdQty || 0}`,
      ),
      "",
      `Total Units Received: ${receipt.lines.reduce((a, l) => a + l.qtyReceived, 0)}`,
      `Total Pallets: ${receipt.lines.reduce((a, l) => a + l.palletCount, 0)}`,
      `Total OSD Qty: ${receipt.lines.reduce((a, l) => a + l.osdQty, 0)}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${receipt.receiptRef}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Receipt downloaded");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Inbound Receipt - {receipt.receiptRef}</DialogTitle>
          <DialogDescription className="text-xs">
            Container receipt for EDI 944 transmission
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] grid grid-cols-2 gap-y-1">
            <KV label="Receipt" value={receipt.receiptRef} />
            <KV label="Date" value={fmtDateTime(receipt.closedAt)} />
            <KV
              label="Container"
              value={
                receipt.trailerNumber !== "—" ? receipt.trailerNumber : receipt.containerNumber
              }
            />
            <KV label="PO" value={receipt.poNumber} />
            <KV label="Client" value={tenant?.code ?? ""} />
            <KV label="Warehouse" value={wh?.code ?? ""} />
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[10px]">SKU</TableHead>
                <TableHead className="text-[10px]">LOT</TableHead>
                <TableHead className="text-[10px] text-right">Expected</TableHead>
                <TableHead className="text-[10px] text-right">Received</TableHead>
                <TableHead className="text-[10px] text-right">Pallets</TableHead>
                <TableHead className="text-[10px]">Putaway Date</TableHead>
                <TableHead className="text-[10px] text-right">OSD Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.lines.map((l) => (
                <TableRow key={l.lineNo}>
                  <TableCell className="py-2 font-mono text-xs">{l.sku}</TableCell>
                  <TableCell className="py-2 text-xs">{l.lot}</TableCell>
                  <TableCell className="py-2 text-right text-xs">
                    {l.qtyExpected.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right text-xs">
                    {l.qtyReceived.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right text-xs">{l.palletCount}</TableCell>
                  <TableCell className="py-2 text-xs">
                    {l.putawayDate ? fmtDateYear(l.putawayDate) : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-right text-xs">{l.osdQty || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={downloadReceipt}>
            <Download className="h-3.5 w-3.5" /> Download Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
}) {
  const handleGenerateReport = () => {
    const filtered = inboundShipments.filter((s) => {
      const d = new Date(s.appointmentAt);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });

    if (filtered.length === 0) {
      toast.error("No shipments found in the selected date range");
      return;
    }

    const rows = [
      [
        "Container ID",
        "EDI Ref",
        "PO",
        "Trailer/Container",
        "Carrier",
        "Client",
        "Appointment",
        "Status",
        "Units Expected",
        "Units Received",
        "Pallets",
      ],
      ...filtered.map((s) => [
        s.id,
        s.ediRef,
        s.poNumber,
        s.trailerNumber !== "—" ? s.trailerNumber : s.containerNumber,
        s.carrier,
        tenants.find((t) => t.id === s.tenantId)?.code ?? "",
        fmtDateTime(s.appointmentAt),
        s.status,
        s.lines.reduce((a, l) => a + l.qtyExpected, 0).toString(),
        s.lines.reduce((a, l) => a + l.receivedQty, 0).toString(),
        s.lines.reduce((a, l) => a + l.palletIds.length, 0).toString(),
      ]),
    ];

    const csvContent = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inbound-report-${startDate || "all"}-${endDate || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Report generated: ${filtered.length} shipments`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Inbound Report</DialogTitle>
          <DialogDescription className="text-xs">
            Generate summary report for containers within date range
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px]">Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
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
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleGenerateReport}>
            <Download className="h-3.5 w-3.5" /> Download Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
