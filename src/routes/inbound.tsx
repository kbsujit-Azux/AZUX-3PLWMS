import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
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
  Edit,
  Plus,
  Warehouse,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { tenants, warehouses, inventoryItems } from "@/lib/mock-data";
import {
  inboundProgressPct,
  shipmentProgressPct,
  warehouseCode,
  type InboundLine,
  type InboundShipment,
  type WorkOrder,
  type WorkOrderStatus,
  inboundShipments,
  inboundReceipts,
  closeInboundShipment,
} from "@/lib/inbound-data";
import { createPalletsFromInbound } from "@/lib/pallet-data";
import {
  recommendPalletBuild,
  type PalletBuildRecommendation,
} from "@/lib/pallet-build-engine";
import {
  recommendPutaway,
  type PutawayCandidate,
} from "@/lib/putaway-engine";
import { CsvUploader } from "@/components/csv-uploader";
import { fmtDateTime, fmtDateYear } from "@/lib/utils";
import { validateLineAgainstItemMaster, masterReasonLabel, itemMaster } from "@/lib/master-data";
import { locationMaster } from "@/lib/master-data";
import { createCsvUploadRecord, createInboundShipmentRecord, createPalletsAndLinkToShipment, deleteInboundShipment, recordInboundPalletBuild, updateInboundShipmentRecord, updateInboundLine, upsertInventoryItem, logInventoryTransaction, captureBillableEventForPutaway, captureBillableEventForInboundReceive, deleteWorkOrder as deleteWorkOrderRecord, updateWorkOrder } from "@/lib/firestore-data";

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
  on_dock: "bg-primary/15 text-primary border-primary/30",
  putaway: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  exception: "bg-destructive/15 text-destructive border-destructive/30",
};

const lineStatusStyles: Record<InboundLine["status"], string> = {
  expected: "bg-muted text-muted-foreground border-border",
  partial: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
};

const woStatusColors: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  at_dock: "bg-primary/15 text-primary border-primary/30",
  unloading: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  departed: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  closed: "bg-green-500/15 text-green-600 border-green-500/30",
};

function parseFlexibleDate(input: string): Date | null {
  const s = input.trim();
  if (!s) return null;

  // Try ISO format first
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // MM/DD/YYYY, MM-DD-YYYY, M/D/YYYY
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    d = new Date(parseInt(mdy[3]), parseInt(mdy[1]) - 1, parseInt(mdy[2]));
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    d = new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function InboundPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { inboundShipments, workOrders, refreshData } = useWmsData();
  const [query, setQuery] = useState(() => localStorage.getItem("inbound-query") || "");
  const [csvOpen, setCsvOpen] = useState(false);
  const [, force] = useState(0);
  const [activeLine, setActiveLine] = useState<{ s: InboundShipment; l: InboundLine } | null>(null);
  const [addContainerOpen, setAddContainerOpen] = useState(false);
  const [closeContainer, setCloseContainer] = useState<InboundShipment | null>(null);
  const [editContainer, setEditContainer] = useState<InboundShipment | null>(null);
  const [deleteContainer, setDeleteContainer] = useState<InboundShipment | null>(null);
  const [deleteWorkOrder, setDeleteWorkOrder] = useState<WorkOrder | null>(null);
  const [editWorkOrder, setEditWorkOrder] = useState<WorkOrder | null>(null);
  const [printReceipt, setPrintReceipt] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStart, setReportStart] = useState(() => localStorage.getItem("inbound-report-start") || "");
  const [reportEnd, setReportEnd] = useState(() => localStorage.getItem("inbound-report-end") || "");
  const [csvErrors, setCsvErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [csvWarnings, setCsvWarnings] = useState<Array<{ row: number; field: string; message: string }>>([]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    localStorage.setItem("inbound-query", value);
  };

  const handleReportStartChange = (value: string) => {
    setReportStart(value);
    localStorage.setItem("inbound-report-start", value);
  };

  const handleReportEndChange = (value: string) => {
    setReportEnd(value);
    localStorage.setItem("inbound-report-end", value);
  };

  const resetFilters = () => {
    localStorage.removeItem("inbound-query");
    localStorage.removeItem("inbound-report-start");
    localStorage.removeItem("inbound-report-end");
    setQuery("");
    setReportStart("");
    setReportEnd("");
  };

  const filtered = useMemo(() => {
    return inboundShipments
      .filter((s) => {
        if (tenantId !== "all" && s.tenantId !== tenantId) return false;
        if (warehouseId !== "all" && s.warehouseId !== warehouseId) return false;
        if (query) {
          const q = query.toLowerCase();
          const blob =
            `${s.id} ${s.ediRef} ${s.poNumber} ${s.trailerNumber} ${s.containerNumber} ${s.bolNumber} ${s.carrier}`.toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.id.localeCompare(a.id));
  }, [inboundShipments, tenantId, warehouseId, query]);

  const stats = useMemo(() => {
    const t = { scheduled: 0, atDoor: 0, exception: 0, expectedUnits: 0, expectedCartons: 0 };
    for (const s of filtered) {
      if (s.status === "scheduled") t.scheduled++;
      if (s.status === "arrived" || s.status === "on_dock") t.atDoor++;
      if (s.status === "exception") t.exception++;
      if (s.lines && Array.isArray(s.lines)) {
        for (const l of s.lines) {
          t.expectedUnits += l.qtyExpected;
          t.expectedCartons += l.cartonsExpected;
        }
      }
    }
    return t;
  }, [filtered]);

  const inboundStatusTransitions: Record<InboundShipment["status"], InboundShipment["status"] | null> = {
    scheduled: "arrived",
    arrived: "on_dock",
    on_dock: "putaway",
    putaway: "received",
    received: null,
    exception: null,
  };

  const handleInboundStatusTransition = async (s: InboundShipment, newStatus: InboundShipment["status"]) => {
    try {
      // Map inbound status to work order status
      const woStatusMap: Record<InboundShipment["status"], string> = {
        scheduled: "scheduled",
        arrived: "at_dock",
        on_dock: "at_dock",
        putaway: "unloading",
        received: "received",
        exception: "closed",
      };

      await updateInboundShipmentRecord(s.id, {
        ...s,
        status: newStatus,
      } as any);

      // Sync to linked WorkOrder
      if (s.workOrderId) {
        await updateWorkOrder(s.workOrderId, {
          status: woStatusMap[newStatus] as any,
          updatedAt: new Date().toISOString(),
        });
      }

      // Autobilling: putaway charge when moving to putaway status
      if (newStatus === "putaway") {
        for (const line of s.lines || []) {
          for (const palletId of line.palletIds || []) {
            await captureBillableEventForPutaway({
              clientId: s.tenantId,
              tenantId: s.tenantId,
              warehouseId: s.warehouseId,
              palletId,
              qtyPutAway: line.qtyExpected,
            });
          }
        }
      }

      toast.success(`Container status: ${newStatus}`);
      refreshData();
    } catch (e: unknown) {
      toast.error(`Failed to update status: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteWorkOrder = async (wo: WorkOrder) => {
    try {
      await deleteWorkOrderRecord(wo.id);
      toast.success(`Work order ${wo.woNumber} deleted`);
      setDeleteWorkOrder(null);
      refreshData();
    } catch (e: unknown) {
      toast.error(`Failed to delete work order: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleEditWorkOrder = async (wo: WorkOrder, updates: Partial<WorkOrder>) => {
    try {
      await updateWorkOrder(wo.id, updates);
      toast.success(`Work order ${wo.woNumber} updated`);
      setEditWorkOrder(null);
      refreshData();
    } catch (e: unknown) {
      toast.error(`Failed to update work order: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search ASN, PO, trailer, container, BOL, carrier…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        {(query || reportStart || reportEnd) && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={resetFilters}>
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
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
            workOrders={workOrders}
            onBuildPallets={(l) => setActiveLine({ s, l })}
            onEditWorkOrder={setEditWorkOrder}
            onDeleteWorkOrder={setDeleteWorkOrder}
            onCloseContainer={
              s.status === "putaway" && Array.isArray(s.lines) && s.lines.every((l) => l.palletIds && l.palletIds.length > 0)
                ? () => setCloseContainer(s)
                : undefined
            }
            onEdit={
              ["scheduled", "arrived"].includes(s.status)
                ? () => setEditContainer(s)
                : undefined
            }
            onDelete={
              s.status === "scheduled"
                ? () => setDeleteContainer(s)
                : undefined
            }
            onPrintReceipt={
              inboundReceipts.find((r) => r.inboundShipmentId === s.id)
                ? () => setPrintReceipt(s.id)
                : undefined
            }
            onStatusTransition={handleInboundStatusTransition}
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

      {deleteContainer && (
        <AlertDialog
          open={!!deleteContainer}
          onOpenChange={(o) => !o && setDeleteContainer(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Container?</AlertDialogTitle>
<AlertDialogDescription>
                This will permanently delete the inbound shipment "
                {deleteContainer.id} " (ASN: {deleteContainer.ediRef}) and all
                associated lines. This action cannot be undone.
                <br />
                <br />
                Only scheduled containers can be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteContainer(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await deleteInboundShipment(deleteContainer.id, deleteContainer.workOrderId);
                    toast.success("Container deleted", {
                      description: `Inbound shipment ${deleteContainer.id} has been removed.`,
                    });
                    force((n) => n + 1);
                    setDeleteContainer(null);
                  } catch (e: any) {
                    toast.error("Failed to delete container", {
                      description: e.message || "Please check permissions and try again",
                    });
                  }
                }}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete Container
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {deleteWorkOrder && (
        <AlertDialog
          open={!!deleteWorkOrder}
          onOpenChange={(o) => !o && setDeleteWorkOrder(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Work Order?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete work order &quot;{deleteWorkOrder.woNumber}&quot; and its linked inbound shipment.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteWorkOrder(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteWorkOrder(deleteWorkOrder)}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete Work Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {editWorkOrder && (
        <EditWorkOrderInboundDialog
          open={!!editWorkOrder}
          onOpenChange={(o) => !o && setEditWorkOrder(null)}
          workOrder={editWorkOrder}
          onEdited={(updates) => handleEditWorkOrder(editWorkOrder, updates)}
        />
      )}

      {editContainer && (
        <EditContainerDialog
          open={!!editContainer}
          onOpenChange={(o) => !o && setEditContainer(null)}
          shipment={editContainer}
          onEdited={() => force((n) => n + 1)}
        />
      )}

      <CsvUploader
        open={csvOpen}
        onOpenChange={(o) => {
          setCsvOpen(o);
          if (!o) {
            setCsvErrors([]);
            setCsvWarnings([]);
          }
        }}
        title="Upload inbound ASN CSV"
        description="Fallback ingestion when an EDI 943 feed is not active. Map your headers to the inbound schema."
        ediHint="EDI 943"
        errors={csvErrors}
        warnings={csvWarnings}
        onConfirm={async (file) => {
          try {
            const text = await file.text();
            const parsed = Papa.parse(text, {
              header: true,
              skipEmptyLines: true,
            });
            const data = parsed.data as Record<string, string>[];

            const errors: Array<{ row: number; field: string; message: string }> = [];
            const warnings: Array<{ row: number; field: string; message: string }> = [];
            const shipmentMap = new Map<string, any>();

            // Build warehouse location lookup for validation
            const locationByWarehouse = new Map<string, string[]>();
            for (const w of warehouses) {
              if (w.id === "all") continue;
              locationByWarehouse.set(
                w.id,
                locationMaster.filter((l) => l.warehouseId === w.id).map((l) => l.id),
              );
            }

            data.forEach((row, idx) => {
              const rowNum = idx + 2;
              const getField = (key: string) => {
                const lowerKey = key.toLowerCase();
                for (const k of Object.keys(row)) {
                  if (k.toLowerCase() === lowerKey) return (row[k] as string).trim();
                }
                return "";
              };

              // Resolve client/warehouse from CSV columns (required — no fallback)
              const csvClient = getField("client") || getField("tenant") || "";
              const csvWarehouse = getField("warehouse") || getField("wh") || "";
              const csvLocation = getField("location") || getField("rack") || "";

              if (!csvClient) {
                errors.push({ row: rowNum, field: "client", message: "Client/Tenant is required in CSV" });
                return;
              }
              if (!csvWarehouse) {
                errors.push({ row: rowNum, field: "warehouse", message: "Warehouse is required in CSV" });
                return;
              }

              const rowTenantId = csvClient;
              const rowWarehouseId = csvWarehouse;

              const rowTenant = tenants.find((t) => t.id === rowTenantId);
              const rowWarehouse = warehouses.find((w) => w.id === rowWarehouseId);

              if (!rowTenant) {
                errors.push({ row: rowNum, field: "client", message: `Client "${csvClient}" not found` });
                return;
              }
              if (!rowWarehouse) {
                errors.push({ row: rowNum, field: "warehouse", message: `Warehouse "${csvWarehouse}" not found` });
                return;
              }

              // Validate location against warehouse location master
              if (csvLocation) {
                const validLocations = locationByWarehouse.get(rowWarehouseId) || [];
                if (!validLocations.includes(csvLocation)) {
                  warnings.push({ row: rowNum, field: "location", message: `Location "${csvLocation}" not found in warehouse "${rowWarehouse.code}" location master` });
                }
              } else {
                warnings.push({ row: rowNum, field: "location", message: "Location not entered — defaulting to warehouse drop zone" });
              }

              const asnRef = getField("asn_ref") || getField("asn");
              const poNumber = getField("po_number") || getField("po");
              const containerNumber = getField("container_number") || getField("container");

              if (!asnRef) {
                errors.push({ row: rowNum, field: "asn_ref", message: "ASN or Reference is required" });
                return;
              }

              if (!containerNumber) {
                errors.push({ row: rowNum, field: "container_number", message: "Container is required" });
                return;
              }

              const key = asnRef;

              if (shipmentMap.has(key)) {
                const existingPo = shipmentMap.get(key).poNumber;
                if (poNumber && existingPo && existingPo !== poNumber) {
                  warnings.push({ row: rowNum, field: "po_number", message: `Multiple POs (${existingPo}, ${poNumber}) for same ASN - lines will be consolidated` });
                }
              }

              if (!shipmentMap.has(key)) {
                const carrier = getField("carrier");
                if (!carrier) {
                  warnings.push({ row: rowNum, field: "carrier", message: "Carrier is recommended" });
                }

                const expectedAtStr = getField("expected_at") || getField("appointment") || getField("eta") || "";
                if (!expectedAtStr) {
                  errors.push({ row: rowNum, field: "expected_at", message: "Expected/Appointment date is required" });
                  return;
                } else {
                  const expectedAt = parseFlexibleDate(expectedAtStr);
                  if (!expectedAt) {
                    errors.push({ row: rowNum, field: "expected_at", message: `Invalid appointment date format: ${expectedAtStr}` });
                    return;
                  } else if (expectedAt < new Date(new Date().setHours(0, 0, 0, 0))) {
                    warnings.push({ row: rowNum, field: "expected_at", message: "Appointment date is in the past" });
                  }
                }

                shipmentMap.set(key,
                  {
                    ediRef: asnRef,
                    poNumber: poNumber || "",
                    tenantId: rowTenantId,
                    warehouseId: rowWarehouseId,
                    location: csvLocation || "",
                    door: getField("door") || getField("door_assigned") || getField("dock") || "",
                    carrier: carrier,
                    trailerNumber: getField("trailer_number") || getField("trailer"),
                    containerNumber: containerNumber,
                    sealNumber: getField("seal_number") || "",
                    bolNumber: getField("bol_number") || "",
                    origin: getField("origin") || "",
                    vessel: getField("vessel") || "",
                    voyageNumber: getField("voyage_number") || getField("voyage") || "",
                    port: getField("port") || getField("port_of_loading") || "",
                    warehouseLocation: getField("warehouse_location") || getField("wh_location") || getField("location") || "",
                    appointmentAt: expectedAtStr,
                    lines: [],
                  });
              }

              const shipment = shipmentMap.get(key);
              if (!shipment) return;

              const sku = getField("sku") || getField("item");
              if (!sku) {
                errors.push({ row: rowNum, field: "sku", message: "SKU/Item is required (check CSV column header)" });
                return;
              }

              const lot = getField("lot") || "";
              if (lot && !lot) {
                warnings.push({ row: rowNum, field: "lot", message: "LOT is empty, will use blank" });
              }

              const qtyStr = getField("qty_expected") || getField("units");
              if (!qtyStr) {
                errors.push({ row: rowNum, field: "qty_expected", message: "Quantity expected is required" });
                return;
              }

              const qty = parseInt(qtyStr, 10);
              if (isNaN(qty) || qty <= 0) {
                errors.push({ row: rowNum, field: "qty_expected", message: `Invalid quantity: ${qtyStr}` });
                return;
              }

              const itemMasterItem = itemMaster.find((i) => i.sku === sku && i.tenantId === rowTenantId);
              if (!itemMasterItem) {
                errors.push({ row: rowNum, field: "sku", message: `SKU "${sku}" not found in Item Master for tenant "${rowTenantId}"` });
                return;
              }

              // Carton calculation: if not entered or zero, compute as Units / PackSize (caseQty)
              const cartonsEntered = getField("cartons");
              let cartonsExpected: number;
              if (cartonsEntered) {
                const parsedCartons = parseInt(cartonsEntered, 10);
                if (isNaN(parsedCartons) || parsedCartons < 0) {
                  warnings.push({ row: rowNum, field: "cartons", message: `Invalid cartons value: ${cartonsEntered}` });
                  cartonsExpected = 0;
                } else if (parsedCartons === 0) {
                  // Zero entered → auto-calculate
                  cartonsExpected = Math.ceil(qty / Math.max(1, itemMasterItem?.caseQty || 1));
                  if (cartonsExpected === 0) cartonsExpected = 1;
                  warnings.push({ row: rowNum, field: "cartons", message: `Cartons entered as 0 — auto-calculated as ${cartonsExpected} (Units/${itemMasterItem?.caseQty || 1} pack size)` });
                } else {
                  cartonsExpected = parsedCartons;
                }
              } else {
                // Default: Units / caseQty (pack size), rounded up
                cartonsExpected = Math.ceil(qty / Math.max(1, itemMasterItem?.caseQty || 1));
                if (cartonsExpected === 0) cartonsExpected = 1;
                warnings.push({ row: rowNum, field: "cartons", message: `Cartons not entered — auto-calculated as ${cartonsExpected} (Units/${itemMasterItem?.caseQty || 1} pack size)` });
              }

              if (getField("expiration_date") || getField("exp")) {
                const expStr = getField("expiration_date") || getField("exp") || "";
                const expDate = parseFlexibleDate(expStr);
                if (!expDate) {
                  warnings.push({ row: rowNum, field: "expiration_date", message: `Invalid expiration date format: ${expStr}` });
                } else if (expDate < new Date(new Date().setHours(0, 0, 0, 0))) {
                  warnings.push({ row: rowNum, field: "expiration_date", message: "Expiration date is in the past" });
                }
              } else {
                warnings.push({ row: rowNum, field: "expiration_date", message: "Expiration date not entered — defaulting to 12/31/2099" });
              }

              shipment.lines.push({
                lineNo: (shipment.lines.length || 0) + 1,
                sku,
                upc: itemMasterItem?.upc || "",
                itemStyle: itemMasterItem?.itemStyle || "",
                description: itemMasterItem?.description || "",
                lot,
                expirationDate: getField("expiration_date") || "2099-12-31",
                qtyExpected: qty,
                cartonsExpected,
                poNumber: poNumber || undefined,
              });
            });

            for (const [, shipment] of shipmentMap) {
try {
                    await createInboundShipmentRecord({
                      tenantId: shipment.tenantId,
                      warehouseId: shipment.warehouseId,
                      ediRef: shipment.ediRef,
                      poNumber: shipment.poNumber,
                      carrier: shipment.carrier,
                      trailerNumber: shipment.trailerNumber,
                      containerNumber: shipment.containerNumber,
                      sealNumber: shipment.sealNumber,
                      bolNumber: shipment.bolNumber,
                      origin: shipment.origin,
                      vessel: shipment.vessel,
                      voyageNumber: shipment.voyageNumber,
                      port: shipment.port,
                      warehouseLocation: shipment.warehouseLocation,
                      doorAssigned: shipment.door || shipment.location || null,
                      appointmentAt: shipment.appointmentAt,
                      expectedAt: shipment.appointmentAt,
                      status: "scheduled",
                      source: "CSV",
                      lines: shipment.lines,
                    });
              } catch (e: any) {
                errors.push({ row: 0, field: "server", message: `Server error: ${e.message}` });
              }
            }

            setCsvErrors(errors);
            setCsvWarnings(warnings);

            const recordId = await createCsvUploadRecord({
              tenantId: tenantId !== "all" ? tenantId : (tenants.find((t) => t.id !== "all")?.id || "acme"),
              warehouseId: warehouseId !== "all" ? warehouseId : (warehouses.find((w) => w.id !== "all")?.id || "atl1"),
              fileName: file.name,
              fileSize: file.size,
              uploadedBy: "Manual Upload",
              source: "inbound_asn",
              status: errors.length === 0 ? "completed" : "failed",
              recordsProcessed: data.length,
              errors: errors.filter((e) => e.row !== undefined),
              warnings: warnings.filter((w) => w.row !== undefined),
              mapping: {},
              rawHeaders: parsed.meta.fields || [],
            });

            if (errors.length > 0) {
              const errorList = errors.map((e) => `${e.row}:${e.field} - ${e.message}`).join("\n");
              toast.error(`Upload failed with ${errors.length} error(s)`, {
                description: errorList,
              });
            } else if (warnings.length > 0) {
              const warningList = warnings.map((w) => `${w.row}:${w.field} - ${w.message}`).join("\n");
              toast.warning(`Uploaded with ${warnings.length} warning(s)`, {
                description: warningList,
              });
            } else {
              const successCount = shipmentMap.size;
              toast.success(`Successfully imported ${successCount} inbound shipment(s)`);
              refreshData();
              setCsvOpen(false);
              setCsvErrors([]);
              setCsvWarnings([]);
            }
          } catch (e) {
            console.error(e);
            toast.error("Failed to process CSV upload");
          }
        }}
        targetFields={[
          { key: "client", label: "Client / Tenant", required: true },
          { key: "warehouse", label: "Warehouse", required: true },
          { key: "location", label: "Location / Rack" },
          { key: "warehouse_location", label: "Warehouse Location" },
          { key: "door", label: "Door / Dock" },
          { key: "asn_ref", label: "ASN / Reference", required: true },
          { key: "po_number", label: "PO number", required: true },
          { key: "trailer_number", label: "Trailer Number" },
          { key: "container_number", label: "Container Number", required: true },
          { key: "seal_number", label: "Seal Number" },
          { key: "bol_number", label: "BOL Number" },
          { key: "origin", label: "Origin" },
          { key: "carrier", label: "Carrier", required: true },
          { key: "vessel", label: "Vessel Name" },
          { key: "voyage_number", label: "Voyage Number" },
          { key: "port", label: "Port of Loading" },
          { key: "expected_at", label: "Appointment", required: true },
          { key: "sku", label: "Line SKU", required: true },
          { key: "lot", label: "LOT / Batch" },
          { key: "expiration_date", label: "Expiration date" },
          { key: "qty_expected", label: "Units expected", required: true },
          { key: "cartons", label: "Cartons expected" },
        ]}
        exampleHeaders={[
          "Client",
          "Warehouse",
          "Location",
          "Warehouse Location",
          "Door",
          "ASN",
          "PO",
          "Trailer",
          "Container",
          "Seal",
          "BOL",
          "Origin",
          "Carrier",
          "Vessel",
          "Voyage",
          "Port",
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
  workOrders,
  onBuildPallets,
  onCloseContainer,
  onEdit,
  onDelete,
  onEditWorkOrder,
  onDeleteWorkOrder,
  onPrintReceipt,
  onStatusTransition,
}: {
  shipment: InboundShipment;
  workOrders: WorkOrder[];
  onBuildPallets: (l: InboundLine) => void;
  onCloseContainer?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onEditWorkOrder?: (wo: WorkOrder) => void;
  onDeleteWorkOrder?: (wo: WorkOrder) => void;
  onPrintReceipt?: () => void;
  onStatusTransition?: (s: InboundShipment, status: InboundShipment["status"]) => void;
}) {
  const tenant = tenants.find((t) => t.id === shipment.tenantId);
  const wh = warehouses.find((w) => w.id === shipment.warehouseId);
  const pct = shipmentProgressPct(shipment);
  const totalUnits = Array.isArray(shipment.lines) ? shipment.lines.reduce((a, l) => a + (l.qtyExpected || 0), 0) : 0;
  const totalCartons = Array.isArray(shipment.lines) ? shipment.lines.reduce((a, l) => a + (l.cartonsExpected || 0), 0) : 0;

  const allLinesHavePallets = Array.isArray(shipment.lines) && shipment.lines.length > 0 && shipment.lines.every((l) => l.palletIds && l.palletIds.length > 0);
  const canClose = onCloseContainer && allLinesHavePallets;
  const hasReceipt = !!onPrintReceipt;
  const linkedWO = shipment.workOrderId ? workOrders.find((w) => w.id === shipment.workOrderId) : null;

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
            {linkedWO && (
              <span
                className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${woStatusColors[linkedWO.status] || woStatusColors.scheduled}`}
              >
                WO: {linkedWO.status.replace("_", " ")}
              </span>
            )}
            {linkedWO && onEditWorkOrder && (
              <button
                onClick={() => onEditWorkOrder(linkedWO)}
                className="inline-flex items-center rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono hover:bg-muted/60"
              >
                <Edit className="h-2.5 w-2.5 mr-0.5" /> Edit WO
              </button>
            )}
            {linkedWO && onDeleteWorkOrder && (
              <button
                onClick={() => onDeleteWorkOrder(linkedWO)}
                className="inline-flex items-center rounded-sm border border-destructive/30 bg-destructive/5 px-1.5 py-0.5 text-[10px] font-mono hover:bg-destructive/10"
              >
                <X className="h-2.5 w-2.5 mr-0.5" /> Delete WO
              </button>
            )}
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
            <KV icon={Warehouse} label="WH Location" value={shipment.warehouseLocation ?? "Unassigned"} />
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
          {Array.isArray(shipment.lines) && shipment.lines.map((l) => {
            const lPct = inboundProgressPct(l);
            // Variance is shown whenever the received units differ from the
            // expected units — an over-receipt must be visible, not capped away.
            const variance = (l.receivedQty || 0) - (l.qtyExpected || 0);
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
                  {variance !== 0 && (
                    <div
                      className={`text-[10px] font-medium tabular-nums mt-0.5 ${
                        variance > 0 ? "text-amber-600" : "text-destructive"
                      }`}
                    >
                      {variance > 0 ? "Over" : "Short"} by{" "}
                      {Math.abs(variance).toLocaleString()}
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  {l.palletIds && l.palletIds.length === 0 ? (
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
        <div className="px-4 py-3 border-t border-border bg-muted/20 flex justify-end gap-2">
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
      {shipment.status === "scheduled" && !allLinesHavePallets && onStatusTransition && (
        <div className="px-4 py-3 border-t border-border bg-primary/5 flex justify-end gap-2">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1.5"
            onClick={() => onStatusTransition(shipment, "arrived")}
          >
            <Truck className="h-3 w-3" /> Mark Arrived
          </Button>
        </div>
      )}
      {shipment.status === "arrived" && onStatusTransition && (
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => onStatusTransition(shipment, "on_dock")}
          >
            <DoorOpen className="h-3 w-3" /> Move to On-Dock
          </Button>
        </div>
      )}
      {shipment.status === "on_dock" && onStatusTransition && (
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => onStatusTransition(shipment, "putaway")}
          >
            <ScanLine className="h-3 w-3" /> Start Putaway
          </Button>
        </div>
      )}
      {shipment.status === "putaway" && onStatusTransition && (
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex justify-end gap-2">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1.5"
            onClick={() => onStatusTransition(shipment, "received")}
          >
            <Check className="h-3 w-3" /> Mark Received
          </Button>
        </div>
      )}
      {(shipment.status === "scheduled" || shipment.status === "arrived") && !hasReceipt && onEdit && (
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={onEdit}
          >
            <Edit className="h-3 w-3" /> Edit Container
          </Button>
        </div>
      )}
      {shipment.status === "scheduled" && !hasReceipt && onDelete && (
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex justify-end gap-2">
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs gap-1.5"
            onClick={onDelete}
          >
            <X className="h-3 w-3" /> Delete Container
          </Button>
        </div>
      )}
    </div>
  );
}

function EditContainerDialog({
  open,
  onOpenChange,
  shipment,
  onEdited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: InboundShipment;
  onEdited: () => void;
}) {
  const [header, setHeader] = useState({
    ediRef: shipment.ediRef,
    poNumber: shipment.poNumber,
    carrier: shipment.carrier,
    trailerNumber: shipment.trailerNumber,
    containerNumber: shipment.containerNumber,
    sealNumber: shipment.sealNumber,
    bolNumber: shipment.bolNumber,
    origin: shipment.origin,
    vessel: shipment.vessel || "",
    voyageNumber: shipment.voyageNumber || "",
    port: shipment.port || "",
    warehouseLocation: shipment.warehouseLocation || "",
    appointmentAt: shipment.appointmentAt,
  });
  const [lines, setLines] = useState<InboundLine[]>(
    (shipment.lines || []).map(
      (l): InboundLine => ({
        lineNo: l.lineNo,
        sku: l.sku || "",
        upc: l.upc || "",
        itemStyle: l.itemStyle || "",
        description: l.description || "",
        lot: l.lot || "",
        expirationDate: l.expirationDate || "2030-12-31",
        qtyExpected: l.qtyExpected || 0,
        cartonsExpected: l.cartonsExpected || 0,
        uom: l.uom || "EA",
        unitsPerPallet: l.unitsPerPallet || 0,
        weightLbsPerUnit: l.weightLbsPerUnit || 0,
        receivedQty: l.receivedQty || 0,
        palletIds: l.palletIds || [],
        status: l.status || "expected",
        poNumber: l.poNumber || "",
      }),
    ),
  );
  const [notes, setNotes] = useState("");

  const handleDeleteLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        lineNo: lines.length + 1,
        sku: "",
        upc: "",
        itemStyle: "",
        description: "",
        lot: "",
        expirationDate: "2030-12-31",
        qtyExpected: 0,
        cartonsExpected: 0,
        uom: "EA",
        unitsPerPallet: 0,
        weightLbsPerUnit: 0,
        receivedQty: 0,
        palletIds: [],
        status: "expected",
      },
    ]);
  };

  const handleUpdateLine = (idx: number, field: string, value: any) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const handleSave = async () => {
    try {
const ts = (d: string) => {
      const parsed = parseFlexibleDate(d);
      return parsed ? parsed.toISOString() : new Date().toISOString();
    };

      const { updateInboundShipmentRecord } = await import("@/lib/firestore-data");

      const cleanHeader = Object.fromEntries(
        Object.entries(header).filter(([_, v]) => v !== undefined && v !== "")
      );

      // Full shipment header for proper sync to WorkOrder
      const fullHeader = {
        ediRef: shipment.ediRef,
        poNumber: shipment.poNumber,
        carrier: shipment.carrier,
        trailerNumber: shipment.trailerNumber,
        containerNumber: shipment.containerNumber,
        sealNumber: shipment.sealNumber,
        bolNumber: shipment.bolNumber,
        origin: shipment.origin,
        appointmentAt: shipment.appointmentAt,
        ...(Object.keys(cleanHeader).length > 0 && cleanHeader),
      };

      // Use existing workOrderId or fall back to shipment ID
      const woId = shipment.workOrderId || shipment.id;

      await updateInboundShipmentRecord(shipment.id, {
        ...fullHeader,
        workOrderId: woId,
        lines: lines.map((l, idx) => ({
          lineNo: idx + 1,
          sku: l.sku || "",
          upc: l.upc || "",
          itemStyle: l.itemStyle || "",
          description: l.description || "",
          lot: l.lot || "",
      expirationDate: l.expirationDate || "2099-12-31",
          qtyExpected: l.qtyExpected || 0,
          cartonsExpected: l.cartonsExpected || 0,
          unitsPerPallet: l.unitsPerPallet || 0,
          weightLbsPerUnit: l.weightLbsPerUnit || 0,
          poNumber: l.poNumber || "",
          receivedQty: l.receivedQty || 0,
          palletIds: l.palletIds || [],
          status: l.status || "expected",
        })),
      });

      toast.success("Container updated successfully");
      onOpenChange(false);
      onEdited();
    } catch (e: unknown) {
      toast.error(`Failed to update container: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Container</DialogTitle>
          <DialogDescription className="text-xs">
            Edit container header information and line items.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Header Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">EDI Ref</Label>
              <Input
                value={header.ediRef}
                onChange={(e) => setHeader({ ...header, ediRef: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">PO Number</Label>
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
              <Label className="text-[10px]">Container</Label>
              <Input
                value={header.containerNumber}
                onChange={(e) => setHeader({ ...header, containerNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Trailer</Label>
              <Input
                value={header.trailerNumber}
                onChange={(e) => setHeader({ ...header, trailerNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Seal #</Label>
              <Input
                value={header.sealNumber}
                onChange={(e) => setHeader({ ...header, sealNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">BOL #</Label>
              <Input
                value={header.bolNumber}
                onChange={(e) => setHeader({ ...header, bolNumber: e.target.value })}
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
            <div className="space-y-1">
              <Label className="text-[10px]">Warehouse Location</Label>
              <Input
                value={header.warehouseLocation}
                onChange={(e) => setHeader({ ...header, warehouseLocation: e.target.value })}
                className="h-8 text-xs"
                placeholder="e.g., DOCK-D07, A12-03-B"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Vessel Name</Label>
              <Input
                value={header.vessel}
                onChange={(e) => setHeader({ ...header, vessel: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Voyage Number</Label>
              <Input
                value={header.voyageNumber}
                onChange={(e) => setHeader({ ...header, voyageNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Port of Loading</Label>
              <Input
                value={header.port}
                onChange={(e) => setHeader({ ...header, port: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Appointment</Label>
              <Input
                type="datetime-local"
                value={header.appointmentAt}
                onChange={(e) => setHeader({ ...header, appointmentAt: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Line Items ({lines.length})
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-6 gap-2 p-2 border border-border rounded-md bg-background">
                <Input
                  placeholder="SKU"
                  value={l.sku}
                  onChange={(e) => handleUpdateLine(idx, "sku", e.target.value)}
                  className="h-7 text-xs col-span-1"
                />
                <Input
                  placeholder="Lot"
                  value={l.lot}
                  onChange={(e) => handleUpdateLine(idx, "lot", e.target.value)}
                  className="h-7 text-xs col-span-1"
                />
                <Input
                  type="number"
                  placeholder="Qty"
                  value={l.qtyExpected}
                  onChange={(e) => handleUpdateLine(idx, "qtyExpected", parseInt(e.target.value || "0", 10))}
                  className="h-7 text-xs col-span-1"
                />
                <Input
                  type="number"
                  placeholder="Cartons"
                  value={l.cartonsExpected}
                  onChange={(e) => handleUpdateLine(idx, "cartonsExpected", parseInt(e.target.value || "0", 10))}
                  className="h-7 text-xs col-span-1"
                />
                <Input
                  placeholder="PO #"
                  value={l.poNumber || ""}
                  onChange={(e) => handleUpdateLine(idx, "poNumber", e.target.value)}
                  className="h-7 text-xs col-span-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleDeleteLine(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-xs">
                No line items. Container requires at least one line item to ship.
              </div>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAddLine}>
              <Plus className="h-3 w-3" /> Add Line
            </Button>
          </div>

          <Textarea
            placeholder="Notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-20"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [recommendation, setRecommendation] = useState<PalletBuildRecommendation | null>(null);
  const [appliedRec, setAppliedRec] = useState(false);

  // Live Item Master so the recommendation uses real dimensions / constraints
  const { itemMaster: liveItemMaster, locationMaster: liveLocations, pallets: livePallets } =
    useWmsData();

  const masterItem = useMemo(
    () => (line ? liveItemMaster.find((i) => i.sku === line.sku) : undefined),
    [liveItemMaster, line?.sku],
  );

  /** Ask the engine for the optimal pallet configuration */
  const runRecommendation = useCallback(() => {
    if (!masterItem || remaining <= 0) {
      setRecommendation(null);
      return;
    }
    const rec = recommendPalletBuild({ item: masterItem, quantity: remaining });
    setRecommendation(rec);
    if (rec.valid) {
      setPalletCount(rec.palletCount);
      setUnitsPerPallet(rec.unitsPerPallet);
      setAppliedRec(true);
    }
  }, [masterItem, remaining]);

  /**
   * Directed putaway suggestions for the pallet we are about to build.
   * Uses the real Location Master (slotting rules, velocity, adjacency)
   * and the live pallet list for zone affinity.
   */
  const putawaySuggestions = useMemo<PutawayCandidate[]>(() => {
    if (!ship || !line || !masterItem || remaining <= 0) return [];
    const casePack = masterItem.caseQty || 1;
    const casesPerPallet = Math.max(1, Math.round(unitsPerPallet / casePack));
    const layers = recommendation?.layersPerPallet ?? 1;
    const caseH = masterItem.caseHeightIn ?? masterItem.heightIn;
    const caseL = masterItem.caseLengthIn ?? masterItem.lengthIn;
    const caseW = masterItem.caseWidthIn ?? masterItem.widthIn;

    return recommendPutaway({
      input: {
        sku: line.sku,
        itemStyle: line.itemStyle,
        tenantId: ship.tenantId,
        warehouseId: ship.warehouseId,
        weightLbs: +(unitsPerPallet * line.weightLbsPerUnit).toFixed(1),
        lengthIn: caseL,
        widthIn: caseW,
        heightIn: +(layers * caseH).toFixed(1),
        existingPallets: (livePallets ?? []).map((p) => ({
          sku: p.sku,
          location: p.location,
        })),
      },
      locations: liveLocations ?? [],
      item: masterItem,
      limit: 5,
    });
  }, [
    ship,
    line,
    masterItem,
    remaining,
    unitsPerPallet,
    recommendation,
    liveLocations,
    livePallets,
  ]);

  // Auto-recommend when the dialog opens for a new line
  useEffect(() => {
    setAppliedRec(false);
    setRecommendation(null);
    if (masterItem && remaining > 0) {
      const rec = recommendPalletBuild({ item: masterItem, quantity: remaining });
      setRecommendation(rec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.l.lineNo, context?.s.id, masterItem?.sku]);

  // Sync defaults when context changes
  useEffect(() => {
    setPalletCount(defaultPallets);
    setUnitsPerPallet(defaultUpp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.l.lineNo, context?.s.id]);

  if (!line || !ship) return null;

  const willReceive = Math.min(remaining, palletCount * unitsPerPallet);

  const handleBuild = async () => {
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
      locationSuggestions: putawaySuggestions.map((c) => c.locationId),
    });

    // Mutate the mock line so the UI reflects receipt progress
    line.receivedQty = Math.min(line.qtyExpected, line.receivedQty + willReceive);
    line.palletIds = [...line.palletIds, ...created.map((p) => p.id)];
    line.status = line.receivedQty >= line.qtyExpected ? "received" : "partial";

    // Persist the built pallets to Firestore FIRST so the pallet documents
    // exist before the inbound line references them.
    try {
      await createPalletsAndLinkToShipment(ship.id, created);
    } catch (e) {
      console.error("Failed to persist built pallets:", e);
      toast.error("Could not save the built pallets", {
        description: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    // Update the inbound line + shipment status in a single transaction.
    // Field-level paths keep the rest of the line intact.
    try {
      const { shipmentStatus } = await recordInboundPalletBuild(
        ship.id,
        line.lineNo - 1,
        willReceive,
        created.map((p) => p.id),
        line.status,
      );
      ship.status = shipmentStatus;
      if (shipmentStatus === "received") {
        ship.receivedAt = new Date().toISOString();
      }
    } catch (e) {
      console.error("Failed to persist pallet build:", e);
      toast.error("Pallets saved, but the inbound line could not be updated", {
        description: e instanceof Error ? e.message : String(e),
      });
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

        {recommendation && (
          <div
            className={`rounded-md border px-3 py-2 text-[11px] space-y-2 ${
              recommendation.valid
                ? "border-primary/30 bg-primary/5"
                : "border-destructive/40 bg-destructive/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold uppercase tracking-wider">
                {recommendation.valid ? "Recommended build" : "Cannot satisfy constraints"}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={runRecommendation}
                disabled={!masterItem}
              >
                <RefreshCw className="h-3 w-3" /> Recalculate
              </Button>
            </div>

            {recommendation.valid ? (
              <>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <KV label="Pallets" value={String(recommendation.palletCount)} />
                  <KV label="Units / pallet" value={String(recommendation.unitsPerPallet)} />
                  <KV label="Cases / layer" value={String(recommendation.casesPerLayer)} />
                  <KV label="Layers" value={String(recommendation.layersPerPallet)} />
                  <KV label="Pattern" value={recommendation.pattern} />
                  <KV
                    label="Stack height"
                    value={`${recommendation.stackedHeightIn}"`}
                  />
                  <KV
                    label="Pallet weight"
                    value={`${recommendation.weightPerPalletLbs} lb`}
                  />
                  <KV label="Footprint" value={recommendation.footprint.label} />
                </div>
                {recommendation.notes.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    {recommendation.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
                <div className="text-muted-foreground">
                  {appliedRec
                    ? "Applied to the build — adjust the fields below if you need to override."
                    : "Click Recalculate to apply these values."}
                </div>
              </>
            ) : (
              <ul className="list-disc pl-4 space-y-0.5">
                {recommendation.violations.map((v, i) => (
                  <li key={i} className="font-mono text-[10px]">
                    {v}
                  </li>
                ))}
                {recommendation.notes.map((n, i) => (
                  <li key={`n${i}`}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!masterItem && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px]">
            No Item Master record for <span className="font-mono">{line.sku}</span> —
            recommendations are unavailable. Add it under Master Data → Item Master.
          </div>
        )}

        {putawaySuggestions.length > 0 && (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] space-y-1.5">
            <div className="font-semibold uppercase tracking-wider text-muted-foreground">
              Directed putaway — top locations
            </div>
            <div className="space-y-1">
              {putawaySuggestions.map((c, idx) => (
                <div
                  key={c.locationId}
                  className="flex items-start gap-2 rounded-sm border border-border/60 bg-background/60 px-2 py-1"
                >
                  <span className="font-mono text-[10px] text-muted-foreground w-4 shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{c.locationId}</span>
                      <span className="text-muted-foreground truncate">{c.zone}</span>
                      <span className="ml-auto font-mono font-semibold text-primary">
                        {c.score}
                      </span>
                    </div>
                    {c.reasons.slice(0, 2).map((r, i) => (
                      <div key={i} className="text-muted-foreground truncate">
                        • {r}
                      </div>
                    ))}
                    {c.warnings.slice(0, 1).map((w, i) => (
                      <div key={`w${i}`} className="text-amber-600 truncate">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              onChange={(e) => {
                setAppliedRec(false);
                setPalletCount(Math.max(0, parseInt(e.target.value || "0", 10)));
              }}
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
              onChange={(e) => {
                setAppliedRec(false);
                setUnitsPerPallet(Math.max(0, parseInt(e.target.value || "0", 10)));
              }}
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
  const { warehouses: liveWarehouses } = useWmsData();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [header, setHeader] = useState({
    ediRef: "",
    poNumber: "",
    carrier: "",
    trailerNumber: "",
    containerNumber: "",
    sealNumber: "",
    bolNumber: "",
    doorAssigned: "",
    warehouseLocation: "",
    appointmentAt: "",
    origin: "",
    vessel: "",
    voyageNumber: "",
    port: "",
  });
  const validSkus = useMemo(() => {
    const tenantToUse =
      selectedTenantId || (tenantId !== "all" ? tenantId : (tenants[0]?.id ?? ""));
    return itemMaster
      .filter((i) => i.tenantId === tenantToUse)
      .map((i) => ({ sku: i.sku, upc: i.upc, itemStyle: i.itemStyle, description: i.description }));
  }, [selectedTenantId, tenantId]);

  useEffect(() => {
    if (!open) {
      setSelectedTenantId(tenantId !== "all" ? tenantId : (tenants[0]?.id ?? ""));
      setSelectedWarehouseId(warehouseId !== "all" ? warehouseId : warehouses[0]?.id || "atl1");
    }
  }, [open]);

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
    setLines(
      lines.map((l, i) =>
        i === idx
          ? {
              ...l,
              sku,
              upc: masterItem?.upc ?? "",
              itemStyle: masterItem?.itemStyle ?? "",
              description: masterItem?.description ?? "",
            }
          : l,
      ),
    );
  };

  const removeLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleAdd = async () => {
    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];

    if (!header.ediRef || header.ediRef.length < 3) {
      validationErrors.push("EDI Reference is required (min 3 characters)");
    }
    if (!header.poNumber || header.poNumber.length < 3) {
      validationErrors.push("PO Number is required (min 3 characters)");
    }
    if (!header.carrier || header.carrier.trim() === "") {
      validationErrors.push("Carrier is required");
    }
    if (!selectedTenantId) {
      validationErrors.push("Client is required");
    }
    if (!selectedWarehouseId) {
      validationErrors.push("Warehouse is required");
    }
    if (!header.containerNumber || header.containerNumber.trim() === "") {
      validationErrors.push("Container is required");
    }
    if (lines.length === 0) {
      validationErrors.push("At least one line item is required");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.sku || l.sku.trim() === "") {
        validationErrors.push(`Line ${i + 1}: SKU is required`);
      } else if (!validSkus.find((v) => v.sku === l.sku)) {
        validationWarnings.push(`Line ${i + 1}: SKU "${l.sku}" not found in Item Master`);
      }
      if (!l.qtyExpected || l.qtyExpected <= 0) {
        validationErrors.push(`Line ${i + 1}: Valid quantity is required`);
      }
      if (l.expirationDate) {
        const exp = parseFlexibleDate(l.expirationDate);
        if (!exp) {
          validationWarnings.push(`Line ${i + 1}: Invalid expiration date`);
        } else if (exp < new Date(new Date().setHours(0, 0, 0, 0))) {
          validationWarnings.push(`Line ${i + 1}: Expiration date is in the past`);
        }
      }
    }

    if (header.appointmentAt) {
      const appt = parseFlexibleDate(header.appointmentAt);
      if (!appt) {
        validationWarnings.push("Invalid appointment date format");
      } else if (appt < new Date(new Date().setHours(0, 0, 0, 0))) {
        validationWarnings.push("Appointment date is in the past");
      }
    }

    if (validationErrors.length > 0) {
      toast.error(`Validation failed (${validationErrors.length} error(s))`, {
        description: validationErrors.join("\n"),
      });
      return;
    }

    if (validationWarnings.length > 0) {
      toast.warning(`Validation warnings (${validationWarnings.length})`, {
        description: validationWarnings.join("\n"),
      });
    }

    const ts = (d: string) => new Date(d).toISOString();
    const wsToSelect =
      selectedWarehouseId || (warehouseId !== "all" ? warehouseId : warehouses[0]?.id || "atl1");

    try {
      const shipmentId = await createInboundShipmentRecord({
        tenantId:
          selectedTenantId || (tenantId !== "all" ? tenantId : (tenants[0]?.id ?? "")),
        warehouseId: wsToSelect,
        ediRef: header.ediRef,
        poNumber: header.poNumber,
        carrier: header.carrier,
        trailerNumber: header.trailerNumber || "",
        containerNumber: header.containerNumber || "",
        sealNumber: header.sealNumber || "",
        bolNumber: header.bolNumber || "",
        origin: header.origin || "",
        vessel: header.vessel || "",
        voyageNumber: header.voyageNumber || "",
        port: header.port || "",
        warehouseLocation: header.warehouseLocation || null,
        appointmentAt: header.appointmentAt ? ts(header.appointmentAt) : new Date().toISOString(),
        expectedAt: header.appointmentAt ? ts(header.appointmentAt) : new Date().toISOString(),
        status: "scheduled",
        doorAssigned: header.doorAssigned || null,
        source: "CSV",
        lines: lines.map((l, idx) => ({
          lineNo: idx + 1,
          sku: l.sku,
          upc: l.upc,
          itemStyle: l.itemStyle,
          description: l.description,
          lot: l.lot,
          expirationDate: l.expirationDate ? ts(l.expirationDate) : "2099-12-31",
          qtyExpected: l.qtyExpected,
          cartonsExpected: l.cartonsExpected,
          unitsPerPallet: l.unitsPerPallet,
          weightLbsPerUnit: l.weightLbsPerUnit,
        })),
      });

      toast.success(`Container added successfully [${shipmentId}]`);
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
        warehouseLocation: "",
        appointmentAt: "",
        origin: "",
        vessel: "",
        voyageNumber: "",
        port: "",
      });
      setSelectedWarehouseId(wsToSelect);
      setLines([]);
      setNotes("");
    } catch (e: any) {
      console.error(e);
      toast.error(`Failed to add container: ${e.message}`);
    }
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
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="h-8 text-xs rounded-md border border-input bg-background px-2 w-full"
                >
                  <option value="">Select client...</option>
                  {tenants
                    .filter((t) => t.id !== "all")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Warehouse *</Label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="h-8 text-xs rounded-md border border-input bg-background px-2 w-full"
                >
                  <option value="">Select warehouse...</option>
                  {liveWarehouses
                    .filter((w) => w.id !== "all")
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} · {w.name}
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
                <Label className="text-[10px]">Seal Number</Label>
                <Input
                  value={header.sealNumber}
                  onChange={(e) => setHeader({ ...header, sealNumber: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="SL-77104"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">BOL Number</Label>
                <Input
                  value={header.bolNumber}
                  onChange={(e) => setHeader({ ...header, bolNumber: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="BOL-554301"
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
                <Label className="text-[10px]">Warehouse Location</Label>
                <Input
                  value={header.warehouseLocation}
                  onChange={(e) => setHeader({ ...header, warehouseLocation: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="e.g., DOCK-D07, A12-03-B"
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
              <div className="space-y-1">
                <Label className="text-[10px]">Vessel Name</Label>
                <Input
                  value={header.vessel}
                  onChange={(e) => setHeader({ ...header, vessel: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="Maersk Edinburgh"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Voyage Number</Label>
                <Input
                  value={header.voyageNumber}
                  onChange={(e) => setHeader({ ...header, voyageNumber: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="2415N"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Port of Loading</Label>
                <Input
                  value={header.port}
                  onChange={(e) => setHeader({ ...header, port: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="Long Beach, CA"
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
                            <option key={v.sku} value={v.sku}>
                              {v.sku}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          value={l.description}
                          onChange={(e) => updateLine(idx, "description", e.target.value)}
                          className="h-7 text-xs w-32"
                          readOnly={
                            !!l.sku && !!validSkus.find((v) => v.sku === l.sku)?.description
                          }
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

  const handleClose = async () => {
    closeInboundShipment(shipment, [], []);

    // Create inventory batches for each received line
    for (const line of shipment.lines || []) {
      if (!line.palletIds || line.palletIds.length === 0) continue;

      const skuItem = inventoryItems.find((i) => i.sku === line.sku && i.tenantId === shipment.tenantId);
      const batches: Array<{
        batchId: string;
        palletId: string;
        receivedAt: string;
        qty: number;
        location: string;
        poNumber: string;
        ediSource: "EDI_943" | "EDI_944" | "CSV" | "MANUAL";
        qtyAllocated: number;
      }> = line.palletIds.map((palletId, idx) => ({
        batchId: `${line.sku}-${palletId}`,
        palletId,
        receivedAt: new Date().toISOString(),
        qty: Math.ceil(line.receivedQty / line.palletIds.length),
        location: shipment.doorAssigned || `DOCK-${shipment.trailerNumber}`,
        poNumber: shipment.poNumber,
        ediSource: shipment.source,
        qtyAllocated: 0,
      }));

      if (skuItem) {
        await upsertInventoryItem({
          ...skuItem,
          batches: [
            ...skuItem.batches.filter((b) => !line.palletIds.includes(b.palletId)),
            ...batches,
          ],
        });
      } else {
        await upsertInventoryItem({
          sku: line.sku,
          upc: line.upc,
          itemStyle: line.itemStyle,
          description: line.description,
          category: "",
          uom: line.uom,
          unitCost: 0,
          unitPrice: 0,
          caseQty: 1,
          weightLbs: line.weightLbsPerUnit,
          tenantId: shipment.tenantId,
          warehouseId: shipment.warehouseId,
          status: "active",
          batches,
        });
      }

      // Log PUTAWAY transaction per pallet
      for (const b of batches) {
        await logInventoryTransaction({
          sku: line.sku,
          palletId: b.palletId,
          location: b.location,
          type: "PUTAWAY",
          qtyChange: b.qty,
          qtyBefore: 0,
          qtyAfter: b.qty,
          cartons: Math.ceil(b.qty / (line.cartonsExpected || 1)),
          user: "wms-user",
          notes: `Putaway from container ${shipment.id}`,
        });

        // Autobilling: putaway charge per pallet
        await captureBillableEventForPutaway({
          clientId: shipment.tenantId,
          tenantId: shipment.tenantId,
          warehouseId: shipment.warehouseId,
          palletId: b.palletId,
          qtyPutAway: b.qty,
        });
      }

      // Autobilling: inbound receive charge per line
      await captureBillableEventForInboundReceive({
        clientId: shipment.tenantId,
        tenantId: shipment.tenantId,
        warehouseId: shipment.warehouseId,
        shipmentId: shipment.id,
        lineNo: line.lineNo,
        receivedQty: line.receivedQty,
      });
    }

    // Persist inbound shipment to Firestore
    await updateInboundShipmentRecord(shipment.id, {
      ...shipment,
      status: "received",
      receivedAt: new Date().toISOString(),
    });

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
          <KV label="Total Lines" value={shipment.lines?.length.toString() ?? "0"} />
          <KV
            label="Total Pallets"
            value={shipment.lines?.reduce((a, l) => a + (l.palletIds?.length || 0), 0).toString() ?? "0"}
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
      ...(Array.isArray(receipt.lines)
        ? receipt.lines.map(
            (l) =>
              `  ${l.sku} | Exp: ${l.qtyExpected} | Rec: ${l.qtyReceived} | Pallets: ${l.palletCount} | Putaway: ${l.putawayDate ? fmtDateYear(l.putawayDate) : "—"} | OSD: ${l.osdQty || 0}`,
          )
        : []),
      "",
      `Total Units Received: ${Array.isArray(receipt.lines) ? receipt.lines.reduce((a, l) => a + l.qtyReceived, 0) : 0}`,
      `Total Pallets: ${Array.isArray(receipt.lines) ? receipt.lines.reduce((a, l) => a + l.palletCount, 0) : 0}`,
      `Total OSD Qty: ${Array.isArray(receipt.lines) ? receipt.lines.reduce((a, l) => a + l.osdQty, 0) : 0}`,
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
              {Array.isArray(receipt.lines) && receipt.lines.map((l) => (
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
      const d = parseFlexibleDate(s.appointmentAt);
      const start = startDate ? parseFlexibleDate(startDate) : null;
      const end = endDate ? parseFlexibleDate(endDate) : null;
      if (!d) return true;
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
        (s.lines?.reduce((a, l) => a + (l.qtyExpected || 0), 0) ?? 0).toString(),
        (s.lines?.reduce((a, l) => a + (l.receivedQty || 0), 0) ?? 0).toString(),
        (s.lines?.reduce((a, l) => a + (l.palletIds?.length || 0), 0) ?? 0).toString(),
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

function EditWorkOrderInboundDialog({
  open,
  onOpenChange,
  workOrder,
  onEdited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: WorkOrder | null;
  onEdited: (updates: Partial<WorkOrder>) => void;
}) {
  if (!workOrder) return null;

  const [formData, setFormData] = useState({
    clientName: workOrder.clientName || "",
    containerNumber: workOrder.containerNumber || "",
    trailerNumber: workOrder.trailerNumber || "",
    sealNumber: workOrder.sealNumber || "",
    bolNumber: workOrder.bolNumber || "",
    carrier: workOrder.carrier || "",
    poNumber: workOrder.poNumber || "",
    ediRef: workOrder.ediRef || "",
    vessel: workOrder.vessel || "",
    voyageNumber: workOrder.voyageNumber || "",
    port: workOrder.port || "",
    origin: workOrder.origin || "",
    arrivalDate: workOrder.arrivalDate || "",
    departureDate: workOrder.departureDate || "",
    yardInDate: workOrder.yardInDate || "",
    yardLeaveDate: workOrder.yardLeaveDate || "",
    inboundEntryDate: workOrder.inboundEntryDate || "",
    receivedDate: workOrder.receivedDate || "",
    status: workOrder.status || "scheduled",
    doorAssigned: workOrder.doorAssigned || "",
    warehouseLocation: workOrder.warehouseLocation || "",
    notes: workOrder.notes || "",
  });

  const handleSubmit = () => {
    onEdited(formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Work Order {workOrder.woNumber}</DialogTitle>
          <DialogDescription>
            Edit work order details. Changes will sync to related inbound shipment.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Client</Label>
              <Input
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Container Number</Label>
              <Input
                value={formData.containerNumber}
                onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Trailer Number</Label>
              <Input
                value={formData.trailerNumber}
                onChange={(e) => setFormData({ ...formData, trailerNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Seal Number</Label>
              <Input
                value={formData.sealNumber}
                onChange={(e) => setFormData({ ...formData, sealNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">BOL Number</Label>
              <Input
                value={formData.bolNumber}
                onChange={(e) => setFormData({ ...formData, bolNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Carrier</Label>
              <Input
                value={formData.carrier}
                onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">PO Number</Label>
              <Input
                value={formData.poNumber}
                onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">EDI Reference</Label>
              <Input
                value={formData.ediRef}
                onChange={(e) => setFormData({ ...formData, ediRef: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Vessel</Label>
              <Input
                value={formData.vessel}
                onChange={(e) => setFormData({ ...formData, vessel: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Voyage Number</Label>
              <Input
                value={formData.voyageNumber}
                onChange={(e) => setFormData({ ...formData, voyageNumber: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Port</Label>
              <Input
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Origin</Label>
              <Input
                value={formData.origin}
                onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Arrival Date</Label>
              <Input
                value={formData.arrivalDate}
                onChange={(e) => setFormData({ ...formData, arrivalDate: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Departure Date</Label>
              <Input
                value={formData.departureDate}
                onChange={(e) => setFormData({ ...formData, departureDate: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Yard In Date</Label>
              <Input
                value={formData.yardInDate}
                onChange={(e) => setFormData({ ...formData, yardInDate: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Yard Leave Date</Label>
              <Input
                value={formData.yardLeaveDate}
                onChange={(e) => setFormData({ ...formData, yardLeaveDate: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Inbound Entry Date</Label>
              <Input
                value={formData.inboundEntryDate}
                onChange={(e) => setFormData({ ...formData, inboundEntryDate: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Received Date</Label>
              <Input
                value={formData.receivedDate}
                onChange={(e) => setFormData({ ...formData, receivedDate: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v as WorkOrderStatus })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="at_dock">At Dock</SelectItem>
                  <SelectItem value="unloading">Unloading</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="departed">Departed</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Door Assigned</Label>
              <Input
                value={formData.doorAssigned}
                onChange={(e) => setFormData({ ...formData, doorAssigned: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Warehouse Location</Label>
              <Input
                value={formData.warehouseLocation}
                onChange={(e) => setFormData({ ...formData, warehouseLocation: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="h-20 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
