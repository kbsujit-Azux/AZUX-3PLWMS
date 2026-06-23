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
  ShippingFast,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Label
} from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Separator
} from "@/components/ui/separator";
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
  new:       "bg-muted text-muted-foreground border-border",
  released:  "bg-primary/15 text-primary border-primary/30",
  picking:   "bg-chart-2/15 text-chart-2 border-chart-2/30",
  packed:    "bg-chart-4/15 text-chart-4 border-chart-4/30",
  shipped:   "bg-chart-3/15 text-chart-3 border-chart-3/30",
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

  const detailOrder = detailOrderId ? orders.find((o) => o.id === detailOrderId) ?? null : null;

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
    const t = { new: 0, picking: 0, exception: 0, shipped: 0, totalLines: 0 };
    for (const o of filtered) {
      if (o.status === "new" || o.status === "released") t.new++;
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
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCsvOpen(true)}>
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
        <StatCell icon={Clock}          label="New / released" value={stats.new}       tone="text-foreground" />
        <StatCell icon={PackageSearch}  label="In progress"    value={stats.picking}   tone="text-chart-4" />
        <StatCell icon={AlertTriangle}  label="Exceptions"     value={stats.exception} tone="text-destructive" />
        <StatCell icon={PackageCheck}   label="Shipped today"  value={stats.shipped}   tone="text-chart-3" />
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
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Lines</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Units</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Source</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Master</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Required by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-10">
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
                    <span className="font-mono text-[10px] text-muted-foreground mr-1">{tenant?.code}</span>
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
                        <AlertTriangle className="h-3 w-3" /> {excCount} unknown SKU{excCount === 1 ? "" : "s"}
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
        exampleHeaders={["PO#", "Order_number", "SKU", "UPC", "Style", "Color", "Size", "Dim", "Units", "Cartons", "Shipto Code", "Shipto name", "Shipto address1", "Shipto Address2", "shipto City", "shipto State", "shipto Zip", "billto Code", "billto name", "billto address1", "billto Address2", "billto City", "bill toState", "bill to Zip", "Carrier", "Cancel Date", "Must Ship date", "Client", "WH-Warehouse"]}
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
      <div className={`text-base font-semibold tabular-nums ${tone}`}>
        {value.toLocaleString()}
      </div>
    </div>
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

  // Re-seed draft whenever a new order is opened
  const orderKey = order?.id ?? null;
  useMemo(() => {
    setDraft(lines.map((l) => ({ ...l })));
    setEditingIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  if (!order) return null;

  const totalUnits = draft.reduce((s, l) => s + l.qtyOrdered, 0);
  const totalValue = draft.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0);
  const exceptionReasons = draft.map((l) =>
    l.sku ? validateLineAgainstItemMaster({ sku: l.sku, tenantId }) : null,
  );
  const hasExceptions = exceptionReasons.some(Boolean);

  const updateLine = (idx: number, patch: Partial<OrderLine>) => {
    setDraft((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const deleteLine = (idx: number) => {
    if (locked) {
      toast.error("Cannot edit lines on picking or shipped orders");
      return;
    }
    setDraft((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
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
            This order is in <strong>{order.status}</strong> status — lines are
            read-only. Only <em>new</em>, <em>released</em>, <em>packed</em>, or{" "}
            <em>exception</em> orders can be edited.
          </div>
        )}

        {hasExceptions && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              One or more lines reference SKUs that are not in the client's
              Item Master. <strong>Allocation and picking are blocked</strong> until
              every SKU is added.
            </div>
          </div>
        )}

        {/* Order Details Section */}
        <div className="rounded-md border border-border bg-muted/20 p-3 mb-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Order Details</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div><span className="text-muted-foreground">Customer Order #:</span> <span className="font-mono ml-1">{order.customerOrderNumber || "—"}</span></div>
            <div><span className="text-muted-foreground">Source:</span> <span className="font-mono ml-1">{order.source}</span></div>
            <div><span className="text-muted-foreground">Entry Date:</span> <span className="font-mono ml-1">{new Date(order.entryDate).toLocaleDateString()}</span></div>
            <div><span className="text-muted-foreground">Cancel Date:</span> <span className="font-mono ml-1">{new Date(order.cancelDate).toLocaleDateString()}</span></div>
            <div><span className="text-muted-foreground">Must Ship By:</span> <span className="font-mono ml-1">{new Date(order.mustShipDate).toLocaleDateString()}</span></div>
            <div><span className="text-muted-foreground">Received:</span> <span className="font-mono ml-1">{new Date(order.receivedAt).toLocaleDateString()}</span></div>
            <div><span className="text-muted-foreground">Tenant:</span> <span className="font-mono ml-1">{order.tenantId}</span></div>
            <div><span className="text-muted-foreground">Warehouse:</span> <span className="font-mono ml-1">{order.warehouseId}</span></div>
          </div>
          
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground border-t pt-2">Ship To</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div><span className="text-muted-foreground">Code:</span> <span className="font-mono ml-1">{order.shipToCode}</span></div>
            <div><span className="text-muted-foreground">Name:</span> <span className="ml-1">{order.shipToName}</span></div>
            <div><span className="text-muted-foreground">Address 1:</span> <span className="ml-1">{order.shipToAddress1}</span></div>
            <div><span className="text-muted-foreground">Address 2:</span> <span className="ml-1">{order.shipToAddress2 || "—"}</span></div>
            <div><span className="text-muted-foreground">City:</span> <span className="ml-1">{order.shipToCity}</span></div>
            <div><span className="text-muted-foreground">State:</span> <span className="font-mono ml-1">{order.shipToState}</span></div>
            <div><span className="text-muted-foreground">Zip:</span> <span className="font-mono ml-1">{order.shipToZip}</span></div>
          </div>

          {(order.billToCode || order.billToName || order.billToAddress1) && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground border-t pt-2">Bill To</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">Code:</span> <span className="font-mono ml-1">{order.billToCode || "—"}</span></div>
                <div><span className="text-muted-foreground">Name:</span> <span className="ml-1">{order.billToName || "—"}</span></div>
                <div><span className="text-muted-foreground">Address 1:</span> <span className="ml-1">{order.billToAddress1 || "—"}</span></div>
                <div><span className="text-muted-foreground">Address 2:</span> <span className="ml-1">{order.billToAddress2 || "—"}</span></div>
                <div><span className="text-muted-foreground">City:</span> <span className="ml-1">{order.billToCity || "—"}</span></div>
                <div><span className="text-muted-foreground">State:</span> <span className="font-mono ml-1">{order.billToState || "—"}</span></div>
                <div><span className="text-muted-foreground">Zip:</span> <span className="font-mono ml-1">{order.billToZip || "—"}</span></div>
              </div>
            </>
          )}

          <div className="text-[10px] uppercase tracking-wider text-muted-foreground border-t pt-2">Carrier</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div><span className="text-muted-foreground">Carrier:</span> <span className="ml-1">{order.carrier}</span></div>
            <div><span className="text-muted-foreground">Service Level:</span> <span className="ml-1">{order.serviceLevel}</span></div>
          </div>
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Description</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">UPC</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Style</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Color</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Size</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Dim</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Qty Ord</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Qty Alloc</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Cartons</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Unit $</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Ext $</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-6">
                    No lines on this order.
                  </TableCell>
                </TableRow>
              )}
              {draft.map((l, idx) => {
                const editing = editingIdx === idx;
                const excReason = exceptionReasons[idx];
                return (
                  <TableRow key={idx} className={`text-xs ${excReason ? "bg-destructive/5" : ""}`}>
                    <TableCell className="py-1.5 font-mono">
                      {editing ? (
                        <Input
                          value={l.sku}
                          onChange={(e) => updateLine(idx, { sku: e.target.value })}
                          className="h-7 text-xs font-mono"
                        />
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
                          onClick={() => deleteLine(idx)}
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
  );
}