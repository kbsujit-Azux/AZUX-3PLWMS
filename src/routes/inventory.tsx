import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search,
  Upload,
  Plus,
  ScanLine,
  Filter,
  Download,
  RefreshCw,
  History,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { useAuth } from "@/lib/auth";
import { tenants, warehouses, inventoryItems, type InventoryItem, type InventoryBatch } from "@/lib/mock-data";
import { inboundShipments } from "@/lib/inbound-data";
import { fmtDateTime } from "@/lib/utils";
import {
  fetchTransactionHistory,
  subscribeTransactionHistory,
  InventoryTransaction,
  upsertInventoryItem,
  logInventoryTransaction,
} from "@/lib/firestore-data";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Batch-level inventory: container/trailer, PO, cartons, units, case pack, putaway date, last edit and user.",
      },
    ],
  }),
  component: InventoryPage,
});

/** Build PO → { container, trailer } map from inbound ASNs. */
function buildPoRefs() {
  const m = new Map<string, { container: string; trailer: string }>();
  for (const s of inboundShipments) {
    m.set(s.poNumber, {
      container: s.containerNumber && s.containerNumber !== "—" ? s.containerNumber : "",
      trailer: s.trailerNumber && s.trailerNumber !== "—" ? s.trailerNumber : "",
    });
  }
  return m;
}

/** Deterministic mock user-id stamp per batch (audit trail). */
const USERS = ["u.harper", "j.patel", "m.alvarez", "s.becker", "r.oconnell", "t.brooks"];
function userFor(seed: string) {
  const h = seed.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return USERS[h % USERS.length];
}
function lastEditFor(receivedAt: string, seed: string) {
  const h = seed.split("").reduce((a, c) => (a * 13 + c.charCodeAt(0)) >>> 0, 11);
  // Edited 1h – 72h after receipt, deterministic.
  const delta = ((h % 71) + 1) * 3600 * 1000;
  return new Date(new Date(receivedAt).getTime() + delta).toISOString();
}

type Row = {
  sku: string;
  description: string;
  tenantId: string;
  warehouseId: string;
  palletId: string;
  batchId: string;
  location: string;
  container: string;
  trailer: string;
  poNumber: string;
  units: number;
  allocatedUnits: number;
  availableUnits: number;
  casePack: number;
  cartons: number;
  putawayAt: string;
  lastEditAt: string;
  userId: string;
  status: InventoryItem["status"];
  pickTicketNum?: number;
};

function csvEscape(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function InventoryPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { refreshData, inventoryItems: liveInventory } = useWmsData();
  const [query, setQuery] = useState("");
  const [scanItem, setScanItem] = useState<InventoryItem | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySku, setHistorySku] = useState<string>("");
  const [historyPalletId, setHistoryPalletId] = useState<string>("");
  const [historyLocation, setHistoryLocation] = useState<string>("");
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editBatch, setEditBatch] = useState<InventoryItem["batches"][0] | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemConfirmOpen, setNewItemConfirmOpen] = useState(false);
  const [newItemForm, setNewItemForm] = useState<
    Partial<InventoryItem & { palletId: string; location: string; qty: number; poNumber: string; container?: string }>
  >({});
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const poRefs = useMemo(buildPoRefs, []);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const item of liveInventory) {
      for (const b of item.batches) {
        const ref = poRefs.get(b.poNumber) ?? { container: "", trailer: "" };
        const casePack = item.caseQty || 1;
        const isDropLocation = b.location === "DROP001";
        out.push({
          sku: item.sku,
          description: item.description,
          tenantId: item.tenantId,
          warehouseId: item.warehouseId,
          palletId: b.palletId,
          batchId: b.batchId,
          location: b.location,
          container: ref.container,
          trailer: ref.trailer,
          poNumber: b.poNumber,
          units: b.qty,
          allocatedUnits: isDropLocation ? 0 : b.qtyAllocated || 0,
          availableUnits: isDropLocation ? 0 : b.qty - (b.qtyAllocated || 0),
          casePack,
          cartons: Math.ceil(b.qty / casePack),
          putawayAt: b.receivedAt,
          lastEditAt: lastEditFor(b.receivedAt, b.batchId),
          userId: userFor(b.batchId),
          status: item.status,
          pickTicketNum: b.pickTicketNum,
        });
      }
    }
    return out.sort((a, b) => +new Date(b.putawayAt) - +new Date(a.putawayAt));
  }, [poRefs, liveInventory]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tenantId !== "all" && r.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && r.warehouseId !== warehouseId) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob =
          `${r.sku} ${r.description} ${r.palletId} ${r.batchId} ${r.location} ${r.container} ${r.trailer} ${r.poNumber} ${r.userId}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tenantId, warehouseId, query]);

  const totals = useMemo(() => {
    const skus = new Set(filtered.filter((r) => r.location !== "DROP001").map((r) => r.sku));
    const units = filtered.filter((r) => r.location !== "DROP001").reduce((s, r) => s + r.units, 0);
    const allocatedUnits = filtered.reduce((s, r) => s + r.allocatedUnits, 0);
    const availableUnits = filtered
      .filter((r) => r.location !== "DROP001")
      .reduce((s, r) => s + r.availableUnits, 0);
    const cartons = filtered
      .filter((r) => r.location !== "DROP001")
      .reduce((s, r) => s + r.cartons, 0);
    return {
      skus: skus.size,
      units,
      allocatedUnits,
      availableUnits,
      cartons,
      lines: filtered.length,
    };
  }, [filtered]);

  // Helper to calculate total on hand for scan dialog
  const totalOnHand = (item: InventoryItem) => {
    return item.batches.reduce((sum, b) => sum + b.qty, 0);
  };

  const exportCsv = () => {
    const headers = [
      "SKU",
      "Description",
      "Container",
      "Trailer",
      "PO#",
      "Pallet ID",
      "Batch",
      "Location",
      "Cartons",
      "Units",
      "Case Pack",
      "Putaway Date",
      "Last Edit",
      "User ID",
      "Client Code",
      "Warehouse",
      "Status",
    ];
    const lines = [headers.map(csvEscape).join(",")];
    for (const r of filtered) {
      const tenant = tenants.find((t) => t.id === r.tenantId);
      const wh = warehouses.find((w) => w.id === r.warehouseId);
      lines.push(
        [
          r.sku,
          r.description,
          r.container || "",
          r.trailer || "",
          r.poNumber,
          r.palletId,
          r.batchId,
          r.location,
          r.cartons,
          r.units,
          r.casePack,
          r.putawayAt,
          r.lastEditAt,
          r.userId,
          tenant?.code ?? "",
          wh?.code ?? "",
          r.status,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `azux-inventory-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Inventory CSV downloaded", {
      description: `${filtered.length} rows · ready to share with the client`,
    });
  };

  const onCsvFile = (f?: File) => {
    if (!f) return;
    toast.success("CSV staged for mapping", {
      description: `${f.name} · ${(f.size / 1024).toFixed(1)} KB · awaiting EDI 832 field mapping`,
    });
    setCsvOpen(false);
  };

  const showHistory = async (sku: string, palletId: string, location: string) => {
    setHistorySku(sku);
    setHistoryPalletId(palletId);
    setHistoryLocation(location);
    setHistoryOpen(true);
    try {
      let txns = await fetchTransactionHistory(sku, palletId, location);
      if (txns.length === 0 && location === "DROP001") {
        txns = await fetchTransactionHistory(sku);
      }
      setTransactions(txns);
    } catch (e: any) {
      toast.error(`Failed to load history: ${e.message}`);
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Batch-level view · container / trailer · PO · cartons / units · case pack · putaway
            audit
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
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          {user?.role === "Admin" && (
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
onClick={() => {
                 setNewItemForm({
                   sku: "",
                   upc: "",
                   description: "",
                   tenantId: tenantId !== "all" ? tenantId : "",
                   warehouseId: warehouseId !== "all" ? warehouseId : "",
                   caseQty: 1,
                   palletId: "",
                   location: "",
                   qty: 0,
                   poNumber: "",
                   container: "",
                 });
                 setNewItemOpen(true);
               }}
            >
              <Plus className="h-3.5 w-3.5" /> New item
            </Button>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <Stat label="Lines" value={totals.lines} />
        <Stat label="SKUs" value={totals.skus} />
        <Stat label="Units" value={totals.units} tone="text-foreground" />
        <Stat label="Allocated" value={totals.allocatedUnits} tone="text-chart-1" />
        <Stat label="Available" value={totals.availableUnits} tone="text-chart-3" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, pallet, PO, container, trailer, user…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Filter className="h-3.5 w-3.5" /> Filter
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Container / Trailer
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">PO #</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Pallet · Location
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">
                Cartons
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">
                Units
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">
                Allocated
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">
                Available
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Pick Ticket</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">
                Case Pack
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Putaway</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Last Edit</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">User ID</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-xs text-muted-foreground py-10">
                  No inventory matches the current filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => {
              const item = liveInventory.find((i) => i.sku === r.sku);
              return (
                <TableRow key={`${r.batchId}-${r.palletId}`} className="text-xs hover:bg-muted/30">
                  <TableCell className="py-2 font-mono">
                    <div className="font-medium">{r.sku}</div>
                    <div className="text-[10px] text-muted-foreground font-sans">
                      {r.description}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">
                    {r.container && (
                      <div>
                        <span className="text-muted-foreground mr-1">CNT</span>
                        {r.container}
                      </div>
                    )}
                    {r.trailer && (
                      <div>
                        <span className="text-muted-foreground mr-1">TRL</span>
                        {r.trailer}
                      </div>
                    )}
                    {!r.container && !r.trailer && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">{r.poNumber}</TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">
                    <div>{r.palletId}</div>
                    <div className="text-[10px] text-muted-foreground">{r.location}</div>
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums">
                    {r.cartons.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums font-medium">
                    {r.units.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-chart-1">
                    {r.allocatedUnits.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-chart-3">
                    {r.availableUnits.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums">
                    {r.pickTicketNum ? (
                      `PT-${r.pickTicketNum}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                    {r.casePack}
                  </TableCell>
                  <TableCell className="py-2 text-[11px] tabular-nums">
                    {fmtDateTime(r.putawayAt)}
                  </TableCell>
                  <TableCell className="py-2 text-[11px] tabular-nums text-muted-foreground">
                    {fmtDateTime(r.lastEditAt)}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">{r.userId}</TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setScanItem(item ?? null)}
                        title="Scan barcode / QR"
                      >
                        <ScanLine className="h-4 w-4" />
                      </Button>
                      {item && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditItem(item);
                            setEditBatch(
                              item.batches.find(
                                (b) => b.palletId === r.palletId && b.location === r.location,
                              ) || null,
                            );
                          }}
                          title="Edit batch"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => showHistory(r.sku, r.palletId, r.location)}
                        title="View history"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Scan dialog */}
      <Dialog open={!!scanItem} onOpenChange={(o) => !o && setScanItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Scan barcode / QR</DialogTitle>
            <DialogDescription className="text-xs">
              Simulated handheld scanner capture for SKU verification.
            </DialogDescription>
          </DialogHeader>
          {scanItem && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-center h-28 rounded bg-background border border-dashed border-border">
                  <ScanLine className="h-10 w-10 text-primary animate-pulse" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                  <span className="text-muted-foreground">SKU</span>
                  <span className="text-right">{scanItem.sku}</span>
                  <span className="text-muted-foreground">UPC / GTIN</span>
                  <span className="text-right">{scanItem.upc}</span>
                  <span className="text-muted-foreground">Case pack</span>
                  <span className="text-right">{scanItem.caseQty}</span>
                  <span className="text-muted-foreground">On hand</span>
                  <span className="text-right">{totalOnHand(scanItem).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScanItem(null)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                toast.success("Scan confirmed", { description: scanItem?.sku });
                setScanItem(null);
              }}
            >
              Confirm scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV upload dialog */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Upload inventory CSV</DialogTitle>
            <DialogDescription className="text-xs">
              Fallback for tenants without an active EDI 832 feed.
            </DialogDescription>
          </DialogHeader>
          <div
            className="rounded-md border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onCsvFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
            <div className="mt-2 text-xs font-medium">Drop CSV here or click to browse</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Expected columns: SKU, UPC, Description, ItemStyle, UoM, UnitCost, CaseQty…
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onCsvFile(e.target.files?.[0] ?? undefined)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCsvOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">History: {historySku}</DialogTitle>
            <DialogDescription className="text-xs">
              Pallet ID: {historyPalletId} · Location: {historyLocation}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {transactions.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-4">
                No transactions found.
              </div>
            )}
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between text-xs border-b border-border pb-2"
              >
                <span className="text-muted-foreground">{fmtDateTime(t.timestamp)}</span>
                <span className="font-mono">{t.type}</span>
                <span className="text-right">
                  {t.qtyChange > 0 ? "+" : ""}
                  {t.qtyChange} units
                </span>
                <span className="text-right text-[10px]">
                  {t.qtyBefore} → {t.qtyAfter}
                </span>
                <span className="text-[10px] text-muted-foreground">{t.user}</span>
                {t.orderId && (
                  <span className="text-[10px] font-mono ml-2">Order: {t.orderId}</span>
                )}
                {t.pickTicketNum && (
                  <span className="text-[10px] font-mono ml-2">PT: {t.pickTicketNum}</span>
                )}
                {t.notes && (
                  <span className="text-[10px] text-muted-foreground ml-2 truncate max-w-48">
                    {t.notes}
                  </span>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Batch: {editBatch?.palletId}</DialogTitle>
            <DialogDescription className="text-xs">
              SKU: {editItem?.sku} · Location: {editBatch?.location}
            </DialogDescription>
          </DialogHeader>
          {editItem && editBatch && (
            <EditBatchForm
              item={editItem}
              batch={editBatch}
              onSave={async (updates) => {
                try {
                  const qtyBefore = editBatch.qty;
                  const qtyAfter = updates.qty ?? qtyBefore;
                  const qtyChange = qtyAfter - qtyBefore;

                  await upsertInventoryItem({
                    ...editItem,
                    batches: editItem.batches.map((b) =>
                      b.batchId === editBatch.batchId ? { ...b, ...updates } : b,
                    ),
                  });

                  if (qtyChange !== 0) {
                    await logInventoryTransaction({
                      sku: editItem.sku,
                      palletId: editBatch.palletId,
                      location: updates.location ?? editBatch.location,
                      type: "ADJUST",
                      qtyChange: qtyChange,
                      qtyBefore: qtyBefore,
                      qtyAfter: qtyAfter,
                      user: user?.name || "admin",
                      notes: `Manual adjustment via Edit Batch`,
                    });
                  }

                  toast.success("Batch updated");
                  setEditItem(null);
                } catch (e: any) {
                  toast.error(`Update failed: ${e.message}`);
                }
              }}
              onCancel={() => setEditItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* New Item Dialog (Admin only) */}
      {user?.role === "Admin" && (
        <>
          <Dialog open={newItemOpen} onOpenChange={setNewItemOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base">Add New Inventory Item</DialogTitle>
                <DialogDescription className="text-xs">
                  Manually add inventory to the system. Only Admin users can perform this action.
                </DialogDescription>
              </DialogHeader>
<div className="space-y-4">
                 <div className="grid grid-cols-3 gap-3">
                   <div>
                     <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                       SKU
                     </Label>
                     <select
                       value={newItemForm.sku ?? ""}
                       onChange={(e) => {
                         const selected = inventoryItems.find((i) => i.sku === e.target.value);
                         setNewItemForm({
                           ...newItemForm,
                           sku: e.target.value,
                           description: selected?.description ?? "",
                           upc: selected?.upc ?? "",
                         });
                       }}
                       className="h-8 text-xs font-mono mt-1 rounded-md border border-input bg-background px-2 w-full"
                     >
                       <option value="">Select SKU...</option>
                       {inventoryItems.map((i) => (
                         <option key={i.sku} value={i.sku}>{i.sku}</option>
                       ))}
                     </select>
                   </div>
                   <div>
                     <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                       UPC / GTIN
                     </Label>
                     <Input
                       value={newItemForm.upc ?? ""}
                       onChange={(e) => setNewItemForm({ ...newItemForm, upc: e.target.value })}
                       placeholder="e.g. 081234500017"
                       className="h-8 text-xs font-mono mt-1"
                     />
                   </div>
                   <div>
                     <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                       Container
                     </Label>
                     <Input
                       value={newItemForm.container ?? ""}
                       onChange={(e) => setNewItemForm({ ...newItemForm, container: e.target.value })}
                       placeholder="CNT-12345"
                       className="h-8 text-xs font-mono mt-1"
                     />
                   </div>
                 </div>

                 <div>
                   <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                     Description
                   </Label>
                   <Input
                     value={newItemForm.description ?? ""}
                     onChange={(e) =>
                       setNewItemForm({ ...newItemForm, description: e.target.value })
                     }
                     placeholder="Item description"
                     className="h-8 text-xs mt-1"
                     readOnly={!!(newItemForm.sku && inventoryItems.find((i) => i.sku === newItemForm.sku)?.description)}
                   />
                 </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Client
                    </Label>
                    <select
                      value={newItemForm.tenantId ?? ""}
                      onChange={(e) => setNewItemForm({ ...newItemForm, tenantId: e.target.value })}
                      className="h-8 text-xs rounded-md border border-input bg-background px-2 mt-1 w-full"
                    >
                      <option value="">Select client…</option>
                      {tenants
                        .filter((t) => t.id !== "all")
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} · {t.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Warehouse
                    </Label>
                    <select
                      value={newItemForm.warehouseId ?? ""}
                      onChange={(e) =>
                        setNewItemForm({ ...newItemForm, warehouseId: e.target.value })
                      }
                      className="h-8 text-xs rounded-md border border-input bg-background px-2 mt-1 w-full"
                    >
                      <option value="">Select warehouse…</option>
                      {warehouses
                        .filter((w) => w.id !== "all")
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} · {w.city}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Pallet ID
                    </Label>
                    <Input
                      value={newItemForm.palletId ?? ""}
                      onChange={(e) => setNewItemForm({ ...newItemForm, palletId: e.target.value })}
                      placeholder="PLT-ATL1-00871"
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Location
                    </Label>
                    <Input
                      value={newItemForm.location ?? ""}
                      onChange={(e) => setNewItemForm({ ...newItemForm, location: e.target.value })}
                      placeholder="A12-03-B"
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Qty
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={newItemForm.qty ?? ""}
                      onChange={(e) =>
                        setNewItemForm({ ...newItemForm, qty: parseInt(e.target.value) || 0 })
                      }
                      placeholder="96"
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>
                </div>

<div>
                   <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                     PO Number
                   </Label>
                   <Input
                     value={newItemForm.poNumber ?? ""}
                     onChange={(e) => setNewItemForm({ ...newItemForm, poNumber: e.target.value })}
                     placeholder="PO-554120"
                     className="h-8 text-xs font-mono mt-1"
                   />
                 </div>

                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Case Qty
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={newItemForm.caseQty ?? 1}
                    onChange={(e) =>
                      setNewItemForm({ ...newItemForm, caseQty: parseInt(e.target.value) || 1 })
                    }
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setNewItemOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => {
                    if (
                      !newItemForm.sku ||
                      !newItemForm.tenantId ||
                      !newItemForm.warehouseId ||
                      !newItemForm.palletId ||
                      !newItemForm.location ||
                      (newItemForm.qty ?? 0) <= 0
                    ) {
                      toast.error("All fields are required, qty must be greater than 0");
                      return;
                    }
                    setNewItemConfirmOpen(true);
                  }}
                >
                  Continue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={newItemConfirmOpen} onOpenChange={setNewItemConfirmOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">Confirm Add Inventory</DialogTitle>
                <DialogDescription className="text-xs">
                  Review and confirm adding this inventory batch.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm">
                  Please confirm the following inventory item will be added:
                </p>
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
<div className="grid grid-cols-2 gap-2 text-xs">
                     <span className="text-muted-foreground">SKU</span>
                     <span className="font-mono">{newItemForm.sku}</span>
                     <span className="text-muted-foreground">Description</span>
                     <span className="font-mono">{newItemForm.description}</span>
                     <span className="text-muted-foreground">Client</span>
                     <span className="font-mono">
                       {tenants.find((t) => t.id === newItemForm.tenantId)?.code}
                     </span>
                     <span className="text-muted-foreground">Warehouse</span>
                     <span className="font-mono">
                       {warehouses.find((w) => w.id === newItemForm.warehouseId)?.code}
                     </span>
                     <span className="text-muted-foreground">Container</span>
                     <span className="font-mono">{newItemForm.container || "—"}</span>
                     <span className="text-muted-foreground">Pallet ID</span>
                     <span className="font-mono">{newItemForm.palletId}</span>
                     <span className="text-muted-foreground">Location</span>
                     <span className="font-mono">{newItemForm.location}</span>
                     <span className="text-muted-foreground">Qty</span>
                     <span className="font-mono">{newItemForm.qty?.toLocaleString()}</span>
                     <span className="text-muted-foreground">PO Number</span>
                     <span className="font-mono">{newItemForm.poNumber || "—"}</span>
                   </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  This action will create a new inventory batch and log an audit trail entry.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setNewItemConfirmOpen(false)}>
                  Back
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={async () => {
                    const {
                      sku,
                      upc,
                      description,
                      tenantId,
                      warehouseId,
                      caseQty,
                      palletId,
                      location,
                      poNumber,
                      qty,
                    } = newItemForm;

                    if (
                      !sku ||
                      !tenantId ||
                      !warehouseId ||
                      !palletId ||
                      !location ||
                      qty === undefined ||
                      qty <= 0
                    ) {
                      toast.error("All fields are required, qty must be greater than 0");
                      return;
                    }

                    try {
                      const batchId = `B-MANUAL-${Date.now()}`;
                      const newBatch: InventoryBatch = {
                        batchId,
                        palletId,
                        receivedAt: new Date().toISOString(),
                        qty,
                        location,
                        poNumber: poNumber || "",
                        ediSource: "MANUAL",
                        qtyAllocated: 0,
                      };

                      const existingItem = liveInventory.find((i) => i.sku === sku);
                      let item: InventoryItem;

                      if (existingItem) {
                        item = {
                          ...existingItem,
                          batches: [...existingItem.batches, newBatch],
                        };
                      } else {
                        item = {
                          sku,
                          upc: upc || "",
                          itemStyle: "",
                          description: description || "",
                          category: "",
                          uom: "EA",
                          unitCost: 0,
                          unitPrice: 0,
                          caseQty: caseQty || 1,
                          weightLbs: 0,
                          tenantId,
                          warehouseId,
                          status: "active",
                          batches: [newBatch],
                        };
                      }

                      await upsertInventoryItem(item);

                      await logInventoryTransaction({
                        sku,
                        palletId,
                        location,
                        type: "RECEIVE",
                        qtyChange: qty,
                        qtyBefore: existingItem
                          ? existingItem.batches.reduce((s, b) => s + b.qty, 0)
                          : 0,
                        qtyAfter:
                          (existingItem ? existingItem.batches.reduce((s, b) => s + b.qty, 0) : 0) +
                          qty,
                        user: user?.name || "admin",
                        notes: `Manual inventory add via Admin Tools`,
                      });

                      toast.success("Inventory added successfully");
                      setNewItemOpen(false);
                      setNewItemConfirmOpen(false);
                      refreshData();
                    } catch (e: any) {
                      toast.error(`Failed to add inventory: ${e.message}`);
                    }
                  }}
                >
                  Add Inventory
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function EditBatchForm({
  item,
  batch,
  onSave,
  onCancel,
}: {
  item: InventoryItem;
  batch: InventoryItem["batches"][0];
  onSave: (updates: Partial<InventoryItem["batches"][0]>) => Promise<void>;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    qty: batch.qty,
    qtyAllocated: batch.qtyAllocated || 0,
    location: batch.location,
    poNumber: batch.poNumber,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Qty</label>
          <Input
            type="number"
            value={formData.qty}
            onChange={(e) => setFormData({ ...formData, qty: parseInt(e.target.value) || 0 })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Allocated
          </label>
          <Input
            type="number"
            value={formData.qtyAllocated}
            onChange={(e) =>
              setFormData({ ...formData, qtyAllocated: parseInt(e.target.value) || 0 })
            }
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Location
          </label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            PO Number
          </label>
          <Input
            value={formData.poNumber}
            onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(formData)}>
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone ?? ""}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
