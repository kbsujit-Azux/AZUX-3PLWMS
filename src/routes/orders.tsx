import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import Papa from "papaparse";
import {
  Search,
  Upload,
  Filter,
  Plus,
  Download,
  Truck,
  PackageCheck,
  PackageSearch,
  AlertTriangle,
  Clock,
  Trash2,
  Save,
  X,
  Pencil,
  Database,
  Calendar,
  MapPin,
  User,
  Package,
  DollarSign,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  CreditCard,
  Warehouse,
  Building2,
  Mail,
  Phone,
  MoreHorizontal,
  Eye,
  Edit2,
  Copy,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkspace } from "@/components/workspace-context";
import { orders, type Order, type OrderLine } from "@/lib/edi-data";
import { tenants, warehouses } from "@/lib/mock-data";
import { CsvUploader } from "@/components/csv-uploader";
import { validateLineAgainstItemMaster, masterReasonLabel } from "@/lib/master-data";
import { itemMaster, findItem } from "@/lib/master-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content: "Outbound order pool driven by EDI 940 with CSV fallback ingestion.",
      },
    ],
  }),
  component: OrdersPage,
});

const statusStyles: Record<Order["status"], string> = {
  new: "bg-muted text-muted-foreground border-border",
  released: "bg-primary/15 text-primary border-primary/30",
  ALLOCATED: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  PICKED: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  picking: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  packed: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  shipped: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  exception: "bg-destructive/15 text-destructive border-destructive/30",
};

function OrdersPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [lineOverrides, setLineOverrides] = useState<Record<string, OrderLine[]>>({});
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteOrder = (orderId: string) => {
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      orders.splice(idx, 1);
      setTick((t) => t + 1);
      if (detailOrderId === orderId) setDetailOrderId(null);
      toast.success(`Order ${orderId} deleted`);
    }
    setDeleteConfirmId(null);
  };

  const linesFor = (o: Order): OrderLine[] => lineOverrides[o.id] ?? o.lines;
  const isLocked = (s: Order["status"]) => s === "shipped" || s === "picking";

  const handleNewOrderSave = (newOrder: Order) => {
    orders.push(newOrder);
    setTick((t) => t + 1);
    setNewOrderOpen(false);
    setDetailOrderId(newOrder.id);
    toast.success(`Order ${newOrder.id} created`);
  };

  // Generate next sequence ID
  const generateNextSeq = () => {
    let maxSeq = 0;
    for (const o of orders) {
      const m = o.id.match(/^SO[#-]?(\d+)$/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    maxSeq++;
    return `SO#-${maxSeq.toString().padStart(8, "0")}`;
  };

  const exceptionsFor = (o: Order): OrderLine[] =>
    linesFor(o).filter(
      (l) => !!validateLineAgainstItemMaster({ sku: l.sku, tenantId: o.tenantId }),
    );

  const updateLines = (orderId: string, next: OrderLine[]) => {
    setLineOverrides((prev) => ({ ...prev, [orderId]: next }));
  };

  const detailOrder = detailOrderId ? (orders.find((o) => o.id === detailOrderId) ?? null) : null;

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (tenantId !== "all" && o.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && o.warehouseId !== warehouseId) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${o.id} ${o.poNumber} ${o.ediRef} ${o.shipToName} ${o.carrier}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [tenantId, warehouseId, query, tick]);

  const stats = useMemo(() => {
    const t = {
      new: 0,
      allocated: 0,
      picked: 0,
      picking: 0,
      exception: 0,
      shipped: 0,
      totalLines: 0,
    };
    for (const o of filtered) {
      if (o.status === "new" || o.status === "released") t.new++;
      else if (o.status === "ALLOCATED") t.allocated++;
      else if (o.status === "PICKED") t.picked++;
      else if (o.status === "picking" || o.status === "packed") t.picking++;
      else if (o.status === "exception") t.exception++;
      else if (o.status === "shipped") t.shipped++;
      t.totalLines += linesFor(o).length;
    }
    return t;
  }, [filtered, lineOverrides, tick]);

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Outbound Orders</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            EDI 940 pool · CSV fallback ingestion · 945 confirmations on ship
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setCsvOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" /> Upload CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setNewOrderOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New order
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={Clock} label="New / released" value={stats.new} tone="text-foreground" />
        <StatCell
          icon={PackageSearch}
          label="In progress"
          value={stats.picking}
          tone="text-chart-4"
        />
        <StatCell
          icon={AlertTriangle}
          label="Exceptions"
          value={stats.exception}
          tone="text-destructive"
        />
        <StatCell
          icon={PackageCheck}
          label="Shipped today"
          value={stats.shipped}
          tone="text-chart-3"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order #, PO, EDI ref, ship-to…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Filter className="h-3.5 w-3.5" /> Filter
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-[10px] uppercase tracking-wider">Order #</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">PO / EDI 940</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Client</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">WH</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Ship-to</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Carrier</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">
                Lines
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">
                Units
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Source</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Master</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Required by</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right w-24">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-10">
                  No orders match the current tenant / warehouse filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((o) => {
              const tenant = tenants.find((t) => t.id === o.tenantId);
              const wh = warehouses.find((w) => w.id === o.warehouseId);
              const lines = linesFor(o);
              const units = lines.reduce((s, l) => s + l.qtyOrdered, 0);
              const excCount = exceptionsFor(o).length;
              return (
                <TableRow key={o.id} className="text-xs hover:bg-muted/30">
                  <TableCell className="py-2 font-mono font-medium">
                    <button
                      type="button"
                      onClick={() => setDetailOrderId(o.id)}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      {o.id}
                    </button>
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">
                    <div>{o.poNumber}</div>
                    <div className="text-[10px] text-muted-foreground">{o.ediRef}</div>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="font-mono text-[10px] text-muted-foreground mr-1">
                      {tenant?.code}
                    </span>
                    {tenant?.name.split(" ")[0]}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">{wh?.code}</TableCell>
                  <TableCell className="py-2">{o.shipToName}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1">
                      <Truck className="h-3 w-3 text-muted-foreground" />
                      <span>{o.carrier}</span>
                      <span className="text-[10px] text-muted-foreground">· {o.serviceLevel}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums">{lines.length}</TableCell>
                  <TableCell className="py-2 text-right tabular-nums font-medium">
                    {units.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="inline-flex items-center rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono">
                      {o.source}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <span
                      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[o.status]}`}
                    >
                      {o.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    {excCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDetailOrderId(o.id)}
                        className="inline-flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/15"
                        title="One or more lines reference SKUs missing from Item Master"
                      >
                        <AlertTriangle className="h-3 w-3" /> {excCount} unknown SKU
                        {excCount === 1 ? "" : "s"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">OK</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-[11px] text-muted-foreground tabular-nums">
                    {new Date(o.mustShipDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailOrderId(o.id);
                        }}
                        title="Edit order"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={o.status !== "new"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(o.id);
                        }}
                        title={
                          o.status !== "new" ? "Only new orders can be deleted" : "Delete order"
                        }
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

      <CsvUploader
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="Upload outbound orders CSV"
        description="Fallback ingestion when an EDI 940 feed is not active. Map your headers to the order schema."
        ediHint="EDI 940"
        targetFields={[
          { key: "poNumber", label: "PO#", required: true },
          { key: "customerOrderNumber", label: "Order_number", required: true },
          { key: "sku", label: "SKU", required: true },
          { key: "upc", label: "UPC", required: true },
          { key: "style", label: "Style" },
          { key: "color", label: "Color" },
          { key: "size", label: "Size" },
          { key: "dim", label: "Dim" },
          { key: "qtyOrdered", label: "Units", required: true },
          { key: "cartons", label: "Cartons", required: true },
          { key: "shipToCode", label: "Shipto Code", required: true },
          { key: "shipToName", label: "Shipto name", required: true },
          { key: "shipToAddress1", label: "Shipto address1", required: true },
          { key: "shipToAddress2", label: "Shipto Address2" },
          { key: "shipToCity", label: "shipto City", required: true },
          { key: "shipToState", label: "shipto State", required: true },
          { key: "shipToZip", label: "shipto Zip", required: true },
          { key: "billToCode", label: "billto Code" },
          { key: "billToName", label: "billto name" },
          { key: "billToAddress1", label: "billto address1" },
          { key: "billToAddress2", label: "billto Address2" },
          { key: "billToCity", label: "billto City" },
          { key: "billToState", label: "bill toState" },
          { key: "billToZip", label: "bill to Zip" },
          { key: "carrier", label: "Carrier", required: true },
          { key: "cancelDate", label: "Cancel Date", required: true },
          { key: "mustShipDate", label: "Must Ship date", required: true },
          { key: "tenantId", label: "Client", required: true },
          { key: "warehouseId", label: "WH-Warehouse", required: true },
        ]}
        exampleHeaders={[
          "PO#",
          "Order_number",
          "SKU",
          "UPC",
          "Style",
          "Color",
          "Size",
          "Dim",
          "Units",
          "Cartons",
          "Shipto Code",
          "Shipto name",
          "Shipto address1",
          "Shipto Address2",
          "shipto City",
          "shipto State",
          "shipto Zip",
          "billto Code",
          "billto name",
          "billto address1",
          "billto Address2",
          "billto City",
          "bill toState",
          "bill to Zip",
          "Carrier",
          "Cancel Date",
          "Must Ship date",
          "Client",
          "WH-Warehouse",
        ]}
        onConfirm={(file) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              const parsed = results.data as Record<string, string>[];
              let maxSeq = 0;
              for (const o of orders) {
                // Match both SO-XXXXXX and SO#-XXXXXXXX formats
                const m = o.id.match(/^SO[#-]?(\d+)$/);
                if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
              }
              const nextSeq = () => {
                maxSeq++;
                return `SO#-${maxSeq.toString().padStart(8, "0")}`;
              };

              const grouped = new Map<string, Order>();
              for (const row of parsed) {
                const po = row["poNumber"] || row["PO#"] || "";
                if (!po) continue;
                if (!grouped.has(po)) {
                  grouped.set(po, {
                    id: nextSeq(),
                    poNumber: po,
                    customerOrderNumber: row["customerOrderNumber"] || "",
                    ediRef: "—",
                    tenantId: row["tenantId"] || tenantId || "acme",
                    warehouseId: row["warehouseId"] || warehouseId || "atl1",
                    shipToCode: row["shipToCode"] || "",
                    shipToName: row["shipToName"] || "",
                    shipToAddress1: row["shipToAddress1"] || "",
                    shipToAddress2: row["shipToAddress2"] || "",
                    shipToCity: row["shipToCity"] || "",
                    shipToState: row["shipToState"] || "",
                    shipToZip: row["shipToZip"] || "",
                    billToCode: row["billToCode"] || "",
                    billToName: row["billToName"] || "",
                    billToAddress1: row["billToAddress1"] || "",
                    billToAddress2: row["billToAddress2"] || "",
                    billToCity: row["billToCity"] || "",
                    billToState: row["billToState"] || "",
                    billToZip: row["billToZip"] || "",
                    carrier: row["carrier"] || "",
                    serviceLevel: "Standard",
                    status: "new",
                    source: "CSV",
                    receivedAt: new Date().toISOString(),
                    entryDate: new Date().toISOString(),
                    cancelDate: row["cancelDate"] || new Date().toISOString(),
                    mustShipDate: row["mustShipDate"] || new Date().toISOString(),
                    lines: [],
                  });
                }
                const order = grouped.get(po)!;
                order.lines.push({
                  sku: row["sku"] || "",
                  description: "CSV Uploaded Item",
                  upc: row["upc"] || "",
                  style: row["style"] || "",
                  color: row["color"] || "",
                  size: row["size"] || "",
                  dim: row["dim"] || "",
                  qtyOrdered: parseInt(row["qtyOrdered"] || row["Units"] || "0", 10),
                  qtyAllocated: 0,
                  cartons: parseInt(row["cartons"] || row["Cartons"] || "0", 10),
                  unitPrice: 0,
                });
              }
              const newOrders = Array.from(grouped.values());
              orders.push(...newOrders);
              setTick((t) => t + 1);
            },
          });
        }}
      />

      <NewOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        onSave={handleNewOrderSave}
        defaultTenantId={tenantId}
        defaultWarehouseId={warehouseId}
      />

      <OrderDetailDialog
        order={detailOrder}
        lines={detailOrder ? linesFor(detailOrder) : []}
        locked={detailOrder ? isLocked(detailOrder.status) : false}
        tenantId={detailOrder?.tenantId ?? ""}
        onClose={() => setDetailOrderId(null)}
        onSave={(next) => {
          if (!detailOrder) return;
          updateLines(detailOrder.id, next);
          toast.success(`Order ${detailOrder.id} updated`);
        }}
      />

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete order {deleteConfirmId}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This permanently removes the order and all its lines. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setDeleteConfirmId(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId) handleDeleteOrder(deleteConfirmId);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Truck;
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

function NewOrderDialog({
  open,
  onOpenChange,
  onSave,
  defaultTenantId,
  defaultWarehouseId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (order: Order) => void;
  defaultTenantId: string;
  defaultWarehouseId: string;
}) {
  const now = new Date().toISOString();
  const nextSeq = (() => {
    let maxSeq = 0;
    for (const o of orders) {
      const m = o.id.match(/^SO[#-]?(\d+)$/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    return () => {
      maxSeq++;
      return `SO#-${maxSeq.toString().padStart(8, "0")}`;
    };
  })();

  const [form, setForm] = useState<{
    poNumber: string;
    customerOrderNumber: string;
    ediRef: string;
    tenantId: string;
    warehouseId: string;
    shipToCode: string;
    shipToName: string;
    shipToAddress1: string;
    shipToAddress2: string;
    shipToCity: string;
    shipToState: string;
    shipToZip: string;
    billToCode: string;
    billToName: string;
    billToAddress1: string;
    billToAddress2: string;
    billToCity: string;
    billToState: string;
    billToZip: string;
    carrier: string;
    serviceLevel: string;
    status: Order["status"];
    source: Order["source"];
    cancelDate: string;
    mustShipDate: string;
    lines: OrderLine[];
  }>({
    poNumber: "",
    customerOrderNumber: "",
    ediRef: "—",
    tenantId: defaultTenantId === "all" ? "acme" : defaultTenantId,
    warehouseId: defaultWarehouseId === "all" ? "atl1" : defaultWarehouseId,
    shipToCode: "",
    shipToName: "",
    shipToAddress1: "",
    shipToAddress2: "",
    shipToCity: "",
    shipToState: "",
    shipToZip: "",
    billToCode: "",
    billToName: "",
    billToAddress1: "",
    billToAddress2: "",
    billToCity: "",
    billToState: "",
    billToZip: "",
    carrier: "",
    serviceLevel: "Standard",
    status: "new",
    source: "MANUAL",
    cancelDate: "",
    mustShipDate: "",
    lines: [{ sku: "", description: "", qtyOrdered: 1, qtyAllocated: 0, unitPrice: 0 }],
  });
  const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null);
  const [lineDeleteIdx, setLineDeleteIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      poNumber: "",
      customerOrderNumber: "",
      ediRef: "—",
      tenantId: defaultTenantId === "all" ? "acme" : defaultTenantId,
      warehouseId: defaultWarehouseId === "all" ? "atl1" : defaultWarehouseId,
      shipToCode: "",
      shipToName: "",
      shipToAddress1: "",
      shipToAddress2: "",
      shipToCity: "",
      shipToState: "",
      shipToZip: "",
      billToCode: "",
      billToName: "",
      billToAddress1: "",
      billToAddress2: "",
      billToCity: "",
      billToState: "",
      billToZip: "",
      carrier: "",
      serviceLevel: "Standard",
      status: "new",
      source: "MANUAL",
      cancelDate: "",
      mustShipDate: "",
      lines: [{ sku: "", description: "", qtyOrdered: 1, qtyAllocated: 0, unitPrice: 0 }],
    });
    setEditingLineIdx(null);
    setLineDeleteIdx(null);
  }, [open, defaultTenantId, defaultWarehouseId]);

  const updateLine = (idx: number, patch: Partial<OrderLine>) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const handleSkuChange = (idx: number, sku: string) => {
    const item = findItem(sku);
    if (item) {
      updateLine(idx, {
        sku,
        description: item.description,
        upc: item.upc,
        style: item.itemStyle,
        unitPrice: item.unitPrice,
      });
    } else {
      updateLine(idx, { sku });
    }
  };

  // Filter item master by tenant and warehouse
  const filteredItemMaster = useMemo(() => {
    return itemMaster.filter((item) => {
      if (item.tenantId !== form.tenantId) return false;
      // Optionally filter by warehouse if needed (itemMaster doesn't have warehouseId directly)
      return item.active;
    });
  }, [form.tenantId]);

  const addLine = () => {
    setForm((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        { sku: "", description: "", qtyOrdered: 1, qtyAllocated: 0, unitPrice: 0 },
      ],
    }));
    setEditingLineIdx(form.lines.length);
  };

  const requestDeleteLine = (idx: number) => {
    setLineDeleteIdx(idx);
  };

  const confirmDeleteLine = () => {
    if (lineDeleteIdx === null) return;
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== lineDeleteIdx),
    }));
    setEditingLineIdx(null);
    setLineDeleteIdx(null);
  };

  const handleSave = () => {
    const lines = form.lines.filter((l) => l.sku.trim() !== "" || l.description.trim() !== "");
    const newOrder: Order = {
      id: nextSeq(),
      poNumber: form.poNumber,
      customerOrderNumber: form.customerOrderNumber,
      ediRef: form.ediRef,
      tenantId: form.tenantId,
      warehouseId: form.warehouseId,
      shipToCode: form.shipToCode,
      shipToName: form.shipToName,
      shipToAddress1: form.shipToAddress1,
      shipToAddress2: form.shipToAddress2,
      shipToCity: form.shipToCity,
      shipToState: form.shipToState,
      shipToZip: form.shipToZip,
      billToCode: form.billToCode,
      billToName: form.billToName,
      billToAddress1: form.billToAddress1,
      billToAddress2: form.billToAddress2,
      billToCity: form.billToCity,
      billToState: form.billToState,
      billToZip: form.billToZip,
      carrier: form.carrier,
      serviceLevel: form.serviceLevel,
      status: form.status,
      source: form.source,
      receivedAt: now,
      entryDate: now,
      cancelDate: form.cancelDate || now,
      mustShipDate: form.mustShipDate || now,
      lines,
    };
    onSave(newOrder);
    onOpenChange(false);
  };

  const tenant = tenants.find((t) => t.id === form.tenantId);
  const warehouse = warehouses.find((w) => w.id === form.warehouseId);
  const totalUnits = form.lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalValue = form.lines.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle className="font-mono">New Order — Manual Entry</DialogTitle>
            <DialogDescription className="text-xs">
              Create an order manually. ID auto-generated on save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            <Tabs defaultValue="header" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="header" className="text-xs">
                  Header
                </TabsTrigger>
                <TabsTrigger value="shipTo" className="text-xs">
                  Ship To
                </TabsTrigger>
                <TabsTrigger value="billTo" className="text-xs">
                  Bill To
                </TabsTrigger>
                <TabsTrigger value="carrier" className="text-xs">
                  Carrier
                </TabsTrigger>
                <TabsTrigger value="lines" className="text-xs">
                  Lines
                </TabsTrigger>
              </TabsList>

              <TabsContent value="header" className="space-y-4 pt-4">
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Order Header
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Order ID
                      </Label>
                      <Input
                        value={nextSeq()}
                        disabled
                        className="h-8 text-xs font-mono bg-muted"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        PO Number *
                      </Label>
                      <Input
                        value={form.poNumber}
                        onChange={(e) => setForm((p) => ({ ...p, poNumber: e.target.value }))}
                        placeholder="PO-XXXXXX"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Customer Order #
                      </Label>
                      <Input
                        value={form.customerOrderNumber}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, customerOrderNumber: e.target.value }))
                        }
                        placeholder="ORD-XXXXXX"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">EDI Ref</Label>
                      <Input
                        value={form.ediRef}
                        onChange={(e) => setForm((p) => ({ ...p, ediRef: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Tenant</Label>
                      <Select
                        value={form.tenantId}
                        onValueChange={(v) => setForm((p) => ({ ...p, tenantId: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select tenant" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenants
                            .filter((t) => t.id !== "all")
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">
                                {t.code} — {t.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Warehouse
                      </Label>
                      <Select
                        value={form.warehouseId}
                        onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses
                            .filter((w) => w.id !== "all")
                            .map((w) => (
                              <SelectItem key={w.id} value={w.id} className="text-xs">
                                {w.code} — {w.city}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(v) =>
                          setForm((p) => ({ ...p, status: v as Order["status"] }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="released">Released</SelectItem>
                          <SelectItem value="picking">Picking</SelectItem>
                          <SelectItem value="packed">Packed</SelectItem>
                          <SelectItem value="shipped">Shipped</SelectItem>
                          <SelectItem value="exception">Exception</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Source</Label>
                      <Select
                        value={form.source}
                        onValueChange={(v) =>
                          setForm((p) => ({ ...p, source: v as Order["source"] }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                          <SelectItem value="EDI-940">EDI 940</SelectItem>
                          <SelectItem value="CSV">CSV</SelectItem>
                          <SelectItem value="API">API</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="shipTo" className="space-y-4 pt-4">
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Ship To
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Code</Label>
                      <Input
                        value={form.shipToCode}
                        onChange={(e) => setForm((p) => ({ ...p, shipToCode: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Name</Label>
                      <Input
                        value={form.shipToName}
                        onChange={(e) => setForm((p) => ({ ...p, shipToName: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Address 1
                      </Label>
                      <Input
                        value={form.shipToAddress1}
                        onChange={(e) => setForm((p) => ({ ...p, shipToAddress1: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Address 2
                      </Label>
                      <Input
                        value={form.shipToAddress2}
                        onChange={(e) => setForm((p) => ({ ...p, shipToAddress2: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">City</Label>
                      <Input
                        value={form.shipToCity}
                        onChange={(e) => setForm((p) => ({ ...p, shipToCity: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">State</Label>
                      <Input
                        value={form.shipToState}
                        onChange={(e) => setForm((p) => ({ ...p, shipToState: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Zip</Label>
                      <Input
                        value={form.shipToZip}
                        onChange={(e) => setForm((p) => ({ ...p, shipToZip: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="billTo" className="space-y-4 pt-4">
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Bill To
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Code</Label>
                      <Input
                        value={form.billToCode}
                        onChange={(e) => setForm((p) => ({ ...p, billToCode: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Name</Label>
                      <Input
                        value={form.billToName}
                        onChange={(e) => setForm((p) => ({ ...p, billToName: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Address 1
                      </Label>
                      <Input
                        value={form.billToAddress1}
                        onChange={(e) => setForm((p) => ({ ...p, billToAddress1: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Address 2
                      </Label>
                      <Input
                        value={form.billToAddress2}
                        onChange={(e) => setForm((p) => ({ ...p, billToAddress2: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">City</Label>
                      <Input
                        value={form.billToCity}
                        onChange={(e) => setForm((p) => ({ ...p, billToCity: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">State</Label>
                      <Input
                        value={form.billToState}
                        onChange={(e) => setForm((p) => ({ ...p, billToState: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Zip</Label>
                      <Input
                        value={form.billToZip}
                        onChange={(e) => setForm((p) => ({ ...p, billToZip: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="carrier" className="space-y-4 pt-4">
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Carrier & Dates
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Carrier</Label>
                      <Input
                        value={form.carrier}
                        onChange={(e) => setForm((p) => ({ ...p, carrier: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Service Level
                      </Label>
                      <Input
                        value={form.serviceLevel}
                        onChange={(e) => setForm((p) => ({ ...p, serviceLevel: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Entry Date
                      </Label>
                      <Input
                        type="date"
                        value={now.slice(0, 10)}
                        disabled
                        className="h-8 text-xs bg-muted"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Cancel Date
                      </Label>
                      <Input
                        type="date"
                        value={form.cancelDate}
                        onChange={(e) => setForm((p) => ({ ...p, cancelDate: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1 col-span-2 md:col-span-4">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Must Ship Date
                      </Label>
                      <Input
                        type="date"
                        value={form.mustShipDate}
                        onChange={(e) => setForm((p) => ({ ...p, mustShipDate: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="lines" className="space-y-4 pt-4">
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="bg-muted/40 px-3 py-2 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Lines
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      onClick={addLine}
                    >
                      <Plus className="h-3 w-3" /> Add line
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">
                          Description
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">UPC</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">
                          Style
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">
                          Color
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">Size</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">Dim</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-right">
                          Qty
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-right">
                          Unit $
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-right">
                          Ext $
                        </TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider w-24 text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.lines.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={11}
                            className="text-center text-xs text-muted-foreground py-6"
                          >
                            No lines added. Click "Add line" to begin.
                          </TableCell>
                        </TableRow>
                      )}
                      {form.lines.map((l, idx) => {
                        const editing = editingLineIdx === idx;
                        return (
                          <TableRow key={idx} className="text-xs">
                            <TableCell className="py-1.5 font-mono">
                              <Select value={l.sku} onValueChange={(v) => handleSkuChange(idx, v)}>
                                <SelectTrigger className="h-7 text-xs font-mono w-40">
                                  <SelectValue placeholder="Select SKU" />
                                </SelectTrigger>
                                <SelectContent>
                                  {filteredItemMaster.map((it) => (
                                    <SelectItem key={it.sku} value={it.sku} className="text-xs">
                                      {it.sku} — {it.description}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                value={l.description}
                                onChange={(e) => updateLine(idx, { description: e.target.value })}
                                className="h-7 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-[10px] text-muted-foreground">
                              <Input
                                value={l.upc || ""}
                                onChange={(e) => updateLine(idx, { upc: e.target.value })}
                                className="h-7 text-xs font-mono"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-[10px]">
                              <Input
                                value={l.style || ""}
                                onChange={(e) => updateLine(idx, { style: e.target.value })}
                                className="h-7 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-[10px]">
                              <Input
                                value={l.color || ""}
                                onChange={(e) => updateLine(idx, { color: e.target.value })}
                                className="h-7 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-[10px]">
                              <Input
                                value={l.size || ""}
                                onChange={(e) => updateLine(idx, { size: e.target.value })}
                                className="h-7 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-[10px]">
                              <Input
                                value={l.dim || ""}
                                onChange={(e) => updateLine(idx, { dim: e.target.value })}
                                className="h-7 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">
                              <Input
                                type="number"
                                min={0}
                                value={l.qtyOrdered}
                                onChange={(e) =>
                                  updateLine(idx, { qtyOrdered: Number(e.target.value) || 0 })
                                }
                                className="h-7 text-xs text-right w-20 ml-auto"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={l.unitPrice}
                                onChange={(e) =>
                                  updateLine(idx, { unitPrice: Number(e.target.value) || 0 })
                                }
                                className="h-7 text-xs text-right w-24 ml-auto"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums font-medium">
                              ${(l.qtyOrdered * l.unitPrice).toFixed(2)}
                            </TableCell>
                            <TableCell className="py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => setEditingLineIdx(editing ? null : idx)}
                                >
                                  {editing ? (
                                    <Save className="h-3.5 w-3.5" />
                                  ) : (
                                    <Pencil className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => requestDeleteLine(idx)}
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

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {form.lines.length} line{form.lines.length === 1 ? "" : "s"} ·{" "}
                    {totalUnits.toLocaleString()} units · ${totalValue.toFixed(2)}
                  </span>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!form.poNumber || form.lines.length === 0}
              onClick={handleSave}
            >
              <Save className="h-3.5 w-3.5" /> Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={lineDeleteIdx !== null} onOpenChange={(o) => !o && setLineDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this line?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will remove the selected line from the new order. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setLineDeleteIdx(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteLine}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OrderDetailDialog({
  order,
  lines,
  locked,
  tenantId,
  onClose,
  onSave,
}: {
  order: Order | null;
  lines: OrderLine[];
  locked: boolean;
  tenantId: string;
  onClose: () => void;
  onSave: (next: OrderLine[]) => void;
}) {
  const [draft, setDraft] = useState<OrderLine[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [lineDeleteIdx, setLineDeleteIdx] = useState<number | null>(null);

  // Filter item master by tenant for this order (must be before early return)
  const filteredItemMaster = useMemo(() => {
    return itemMaster.filter((item) => item.tenantId === tenantId && item.active);
  }, [tenantId]);

  // Re-seed draft whenever a new order is opened
  const orderKey = order?.id ?? null;
  useEffect(() => {
    setDraft(lines.map((l) => ({ ...l })));
    setEditingIdx(null);
    setLineDeleteIdx(null);
  }, [orderKey, lines]);

  if (!order) return null;

  const totalUnits = draft.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalValue = draft.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0);
  const exceptionReasons = draft.map((l) =>
    l.sku ? validateLineAgainstItemMaster({ sku: l.sku, tenantId }) : null,
  );
  const hasExceptions = exceptionReasons.some(Boolean);

  const handleSkuChange = (idx: number, sku: string) => {
    const item = findItem(sku);
    if (item) {
      updateLine(idx, {
        sku,
        description: item.description,
        upc: item.upc,
        style: item.itemStyle,
        unitPrice: item.unitPrice,
      });
    } else {
      updateLine(idx, { sku });
    }
  };

  const updateLine = (idx: number, patch: Partial<OrderLine>) => {
    setDraft((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const deleteLine = (idx: number) => {
    if (locked) {
      toast.error("Cannot edit lines on picking or shipped orders");
      return;
    }
    setLineDeleteIdx(idx);
  };

  const confirmDeleteLine = () => {
    if (lineDeleteIdx === null) return;
    setDraft((prev) => prev.filter((_, i) => i !== lineDeleteIdx));
    setEditingIdx(null);
    setLineDeleteIdx(null);
  };

  const addLine = () => {
    if (locked) return;
    setDraft((prev) => [
      ...prev,
      { sku: "", description: "", qtyOrdered: 0, qtyAllocated: 0, unitPrice: 0 },
    ]);
    setEditingIdx(draft.length);
  };

  return (
    <>
      <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              {order.id}
              <span
                className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[order.status]}`}
              >
                {order.status}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              PO {order.poNumber} · EDI {order.ediRef} · Ship to {order.shipToName} ·{" "}
              {order.carrier} {order.serviceLevel}
            </DialogDescription>
          </DialogHeader>

          {locked && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              This order is in <strong>{order.status}</strong> status — lines are read-only. Only{" "}
              <em>new</em>, <em>released</em>, <em>packed</em>, or <em>exception</em> orders can be
              edited.
            </div>
          )}

          {hasExceptions && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                One or more lines reference SKUs that are not in the client's Item Master.{" "}
                <strong>Allocation and picking are blocked</strong> until every SKU is added.
              </div>
            </div>
          )}

          {/* Order Details Section */}
          <div className="rounded-md border border-border bg-muted/20 p-3 mb-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Order Details
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Customer Order #:</span>{" "}
                <span className="font-mono ml-1">{order.customerOrderNumber || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Source:</span>{" "}
                <span className="font-mono ml-1">{order.source}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Entry Date:</span>{" "}
                <span className="font-mono ml-1">
                  {new Date(order.entryDate).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Cancel Date:</span>{" "}
                <span className="font-mono ml-1">
                  {new Date(order.cancelDate).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Must Ship By:</span>{" "}
                <span className="font-mono ml-1">
                  {new Date(order.mustShipDate).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Received:</span>{" "}
                <span className="font-mono ml-1">
                  {new Date(order.receivedAt).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Tenant:</span>{" "}
                <span className="font-mono ml-1">{order.tenantId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Warehouse:</span>{" "}
                <span className="font-mono ml-1">{order.warehouseId}</span>
              </div>
            </div>

            <div className="text-[10px] uppercase tracking-wider text-muted-foreground border-t pt-2">
              Ship To
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Code:</span>{" "}
                <span className="font-mono ml-1">{order.shipToCode}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="ml-1">{order.shipToName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Address 1:</span>{" "}
                <span className="ml-1">{order.shipToAddress1}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Address 2:</span>{" "}
                <span className="ml-1">{order.shipToAddress2 || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">City:</span>{" "}
                <span className="ml-1">{order.shipToCity}</span>
              </div>
              <div>
                <span className="text-muted-foreground">State:</span>{" "}
                <span className="font-mono ml-1">{order.shipToState}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Zip:</span>{" "}
                <span className="font-mono ml-1">{order.shipToZip}</span>
              </div>
            </div>

            {(order.billToCode || order.billToName || order.billToAddress1) && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground border-t pt-2">
                  Bill To
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Code:</span>{" "}
                    <span className="font-mono ml-1">{order.billToCode || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="ml-1">{order.billToName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Address 1:</span>{" "}
                    <span className="ml-1">{order.billToAddress1 || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Address 2:</span>{" "}
                    <span className="ml-1">{order.billToAddress2 || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">City:</span>{" "}
                    <span className="ml-1">{order.billToCity || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">State:</span>{" "}
                    <span className="font-mono ml-1">{order.billToState || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Zip:</span>{" "}
                    <span className="font-mono ml-1">{order.billToZip || "—"}</span>
                  </div>
                </div>
              </>
            )}

            <div className="text-[10px] uppercase tracking-wider text-muted-foreground border-t pt-2">
              Carrier
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Carrier:</span>{" "}
                <span className="ml-1">{order.carrier}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Service Level:</span>{" "}
                <span className="ml-1">{order.serviceLevel}</span>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Description
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">UPC</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Style</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Color</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Size</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Dim</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Qty Ord
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Qty Alloc
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Cartons
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Unit $
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Ext $
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      className="text-center text-xs text-muted-foreground py-6"
                    >
                      No lines on this order.
                    </TableCell>
                  </TableRow>
                )}
                {draft.map((l, idx) => {
                  const editing = editingIdx === idx;
                  const excReason = exceptionReasons[idx];
                  return (
                    <TableRow
                      key={idx}
                      className={`text-xs ${excReason ? "bg-destructive/5" : ""}`}
                    >
                      <TableCell className="py-1.5 font-mono">
                        {editing ? (
                          <Select value={l.sku} onValueChange={(v) => handleSkuChange(idx, v)}>
                            <SelectTrigger className="h-7 text-xs font-mono w-40">
                              <SelectValue placeholder="Select SKU" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredItemMaster.map((it) => (
                                <SelectItem key={it.sku} value={it.sku} className="text-xs">
                                  {it.sku} — {it.description}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{l.sku || <span className="text-muted-foreground">—</span>}</span>
                            {excReason && (
                              <a
                                href={`/masters?${new URLSearchParams({
                                  tab: "items",
                                  addSku: l.sku,
                                  tenantId,
                                  desc: l.description ?? "",
                                }).toString()}`}
                                className="inline-flex items-center gap-0.5 rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/15"
                                title={masterReasonLabel(excReason)}
                              >
                                <Database className="h-2.5 w-2.5" /> Add
                              </a>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {editing ? (
                          <Input
                            value={l.description}
                            onChange={(e) => updateLine(idx, { description: e.target.value })}
                            className="h-7 text-xs"
                          />
                        ) : (
                          l.description || <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-[10px]">
                        {editing ? (
                          <Input
                            value={l.upc || ""}
                            onChange={(e) => updateLine(idx, { upc: e.target.value })}
                            className="h-7 text-xs font-mono"
                          />
                        ) : (
                          l.upc || <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px]">
                        {editing ? (
                          <Input
                            value={l.style || ""}
                            onChange={(e) => updateLine(idx, { style: e.target.value })}
                            className="h-7 text-xs"
                          />
                        ) : (
                          l.style || <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px]">
                        {editing ? (
                          <Input
                            value={l.color || ""}
                            onChange={(e) => updateLine(idx, { color: e.target.value })}
                            className="h-7 text-xs"
                          />
                        ) : (
                          l.color || <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px]">
                        {editing ? (
                          <Input
                            value={l.size || ""}
                            onChange={(e) => updateLine(idx, { size: e.target.value })}
                            className="h-7 text-xs"
                          />
                        ) : (
                          l.size || <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px]">
                        {editing ? (
                          <Input
                            value={l.dim || ""}
                            onChange={(e) => updateLine(idx, { dim: e.target.value })}
                            className="h-7 text-xs"
                          />
                        ) : (
                          l.dim || <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">
                        {editing ? (
                          <Input
                            type="number"
                            min={0}
                            value={l.qtyOrdered}
                            onChange={(e) =>
                              updateLine(idx, { qtyOrdered: Number(e.target.value) || 0 })
                            }
                            className="h-7 text-xs text-right w-20 ml-auto"
                          />
                        ) : (
                          l.qtyOrdered.toLocaleString()
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {l.qtyAllocated.toLocaleString()}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">
                        {editing ? (
                          <Input
                            type="number"
                            min={0}
                            value={l.cartons || 0}
                            onChange={(e) =>
                              updateLine(idx, { cartons: Number(e.target.value) || 0 })
                            }
                            className="h-7 text-xs text-right w-20 ml-auto"
                          />
                        ) : (
                          (l.cartons || 0).toLocaleString()
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">
                        {editing ? (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.unitPrice}
                            onChange={(e) =>
                              updateLine(idx, { unitPrice: Number(e.target.value) || 0 })
                            }
                            className="h-7 text-xs text-right w-24 ml-auto"
                          />
                        ) : (
                          `$${l.unitPrice.toFixed(2)}`
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums font-medium">
                        ${(l.qtyOrdered * l.unitPrice).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {editing ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditingIdx(null)}
                              title="Done"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={locked}
                              onClick={() => setEditingIdx(idx)}
                              title={locked ? "Locked" : "Edit"}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            disabled={locked}
                            onClick={() => setLineDeleteIdx(idx)}
                            title={locked ? "Locked" : "Delete line"}
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

          <div className="flex items-center justify-between text-xs">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={locked}
              onClick={addLine}
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
            <div className="flex gap-6 tabular-nums">
              <div>
                <span className="text-muted-foreground">Lines: </span>
                <span className="font-medium">{draft.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Units: </span>
                <span className="font-medium">{totalUnits.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Value: </span>
                <span className="font-medium">${totalValue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={onClose}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={locked || hasExceptions}
              onClick={() => {
                if (hasExceptions) {
                  toast.error("Resolve Item Master exceptions before saving");
                  return;
                }
                onSave(draft);
                onClose();
              }}
            >
              <Save className="h-3.5 w-3.5" /> Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={lineDeleteIdx !== null} onOpenChange={(o) => !o && setLineDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this line?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently remove the selected line from the order. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setLineDeleteIdx(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteLine}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
