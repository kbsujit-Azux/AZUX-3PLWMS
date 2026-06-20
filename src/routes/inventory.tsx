import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef } from "react";
import {
  Search,
  Upload,
  Plus,
  ScanLine,
  Filter,
  Download,
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
import { useWorkspace } from "@/components/workspace-context";
import {
  inventoryItems,
  tenants,
  warehouses,
  totalOnHand,
  type InventoryItem,
} from "@/lib/mock-data";
import { inboundShipments } from "@/lib/inbound-data";
import { fmtDateTime } from "@/lib/utils";

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
      trailer:   s.trailerNumber   && s.trailerNumber   !== "—" ? s.trailerNumber   : "",
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
  casePack: number;
  cartons: number;
  putawayAt: string;
  lastEditAt: string;
  userId: string;
  status: InventoryItem["status"];
};

function csvEscape(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function InventoryPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [scanItem, setScanItem] = useState<InventoryItem | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const poRefs = useMemo(buildPoRefs, []);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const item of inventoryItems) {
      for (const b of item.batches) {
        const ref = poRefs.get(b.poNumber) ?? { container: "", trailer: "" };
        const casePack = item.caseQty || 1;
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
          casePack,
          cartons: Math.ceil(b.qty / casePack),
          putawayAt: b.receivedAt,
          lastEditAt: lastEditFor(b.receivedAt, b.batchId),
          userId: userFor(b.batchId),
          status: item.status,
        });
      }
    }
    return out.sort((a, b) => +new Date(b.putawayAt) - +new Date(a.putawayAt));
  }, [poRefs]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tenantId !== "all" && r.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && r.warehouseId !== warehouseId) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${r.sku} ${r.description} ${r.palletId} ${r.batchId} ${r.location} ${r.container} ${r.trailer} ${r.poNumber} ${r.userId}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tenantId, warehouseId, query]);

  const totals = useMemo(() => {
    const skus = new Set(filtered.map((r) => r.sku));
    const units = filtered.reduce((s, r) => s + r.units, 0);
    const cartons = filtered.reduce((s, r) => s + r.cartons, 0);
    return { skus: skus.size, units, cartons, lines: filtered.length };
  }, [filtered]);

  const exportCsv = () => {
    const headers = [
      "SKU", "Description", "Container", "Trailer", "PO#",
      "Pallet ID", "Batch", "Location",
      "Cartons", "Units", "Case Pack",
      "Putaway Date", "Last Edit", "User ID",
      "Client Code", "Warehouse", "Status",
    ];
    const lines = [headers.map(csvEscape).join(",")];
    for (const r of filtered) {
      const tenant = tenants.find((t) => t.id === r.tenantId);
      const wh = warehouses.find((w) => w.id === r.warehouseId);
      lines.push([
        r.sku, r.description, r.container || "", r.trailer || "", r.poNumber,
        r.palletId, r.batchId, r.location,
        r.cartons, r.units, r.casePack,
        r.putawayAt, r.lastEditAt, r.userId,
        tenant?.code ?? "", wh?.code ?? "", r.status,
      ].map(csvEscape).join(","));
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

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Batch-level view · container / trailer · PO · cartons / units · case pack · putaway audit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCsvOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Upload CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New item
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-4 divide-x divide-border rounded-md border border-border bg-card">
        <Stat label="Lines"   value={totals.lines} />
        <Stat label="SKUs"    value={totals.skus} />
        <Stat label="Cartons" value={totals.cartons} />
        <Stat label="Units"   value={totals.units} />
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
              <TableHead className="text-[10px] uppercase tracking-wider">Container / Trailer</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">PO #</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Pallet · Location</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Cartons</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Units</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Case Pack</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Putaway</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Last Edit</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">User ID</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-10">
                  No inventory matches the current filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => {
              const item = inventoryItems.find((i) => i.sku === r.sku)!;
              return (
                <TableRow key={`${r.batchId}-${r.palletId}`} className="text-xs hover:bg-muted/30">
                  <TableCell className="py-2 font-mono">
                    <div className="font-medium">{r.sku}</div>
                    <div className="text-[10px] text-muted-foreground font-sans">{r.description}</div>
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">
                    {r.container && <div><span className="text-muted-foreground mr-1">CNT</span>{r.container}</div>}
                    {r.trailer   && <div><span className="text-muted-foreground mr-1">TRL</span>{r.trailer}</div>}
                    {!r.container && !r.trailer && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">{r.poNumber}</TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">
                    <div>{r.palletId}</div>
                    <div className="text-[10px] text-muted-foreground">{r.location}</div>
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums">{r.cartons.toLocaleString()}</TableCell>
                  <TableCell className="py-2 text-right tabular-nums font-medium">
                    {r.units.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                    {r.casePack}
                  </TableCell>
                  <TableCell className="py-2 text-[11px] tabular-nums">{fmtDateTime(r.putawayAt)}</TableCell>
                  <TableCell className="py-2 text-[11px] tabular-nums text-muted-foreground">
                    {fmtDateTime(r.lastEditAt)}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-[11px]">{r.userId}</TableCell>
                  <TableCell className="py-2 text-right">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setScanItem(item)}
                      title="Scan barcode / QR"
                    >
                      <ScanLine className="h-4 w-4" />
                    </Button>
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
            <Button variant="outline" size="sm" onClick={() => setScanItem(null)}>Close</Button>
            <Button size="sm" onClick={() => { toast.success("Scan confirmed", { description: scanItem?.sku }); setScanItem(null); }}>
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
            onDrop={(e) => { e.preventDefault(); onCsvFile(e.dataTransfer.files?.[0]); }}
          >
            <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
            <div className="mt-2 text-xs font-medium">Drop CSV here or click to browse</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Expected columns: SKU, UPC, Description, ItemStyle, UoM, UnitCost, CaseQty…
            </div>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => onCsvFile(e.target.files?.[0] ?? undefined)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCsvOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
