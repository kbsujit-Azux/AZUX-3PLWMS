import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  FileText,
  Printer,
  Layers,
  Filter,
  Search,
  Truck,
  PackagePlus,
  CheckCircle2,
  Eye,
  Download,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/components/workspace-context";
import { tenants, warehouses } from "@/lib/mock-data";
import { orders } from "@/lib/edi-data";
import {
  seedBols,
  buildBolFromOrder,
  buildConsolidationGroups,
  buildMasterBol,
  emit945ForBol,
  type BillOfLading,
} from "@/lib/bol-data";
import {
  fetchBillsOfLading,
  subscribeBillsOfLading,
  createBol,
} from "@/lib/firestore-data";
import { BolDocument } from "@/components/bol/bol-document";
import { PackingSlip } from "@/components/bol/packing-slip";
import { fmtDateTime } from "@/lib/utils";
import { useEffect } from "react";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents · BOL — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "VICS Bill of Lading engine — generate single and master BOLs consolidated by destination & carrier.",
      },
    ],
  }),
  component: DocumentsPage,
});

const statusStyles: Record<BillOfLading["status"], string> = {
  draft:      "bg-muted text-muted-foreground border-border",
  issued:     "bg-chart-4/15 text-chart-4 border-chart-4/30",
  tendered:   "bg-primary/15 text-primary border-primary/30",
  "in-transit":"bg-chart-2/15 text-chart-2 border-chart-2/30",
  delivered:  "bg-chart-3/15 text-chart-3 border-chart-3/30",
  void:       "bg-destructive/15 text-destructive border-destructive/30",
};

function DocumentsPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [bols, setBols] = useState<BillOfLading[]>([]);
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<BillOfLading | null>(null);
  const [consolidateOpen, setConsolidateOpen] = useState(false);

  // Load BOLs from Firestore
  useEffect(() => {
    const unsub = subscribeBillsOfLading((items) => {
      setBols(items);
    }, tenantId !== "all" ? tenantId : undefined, warehouseId !== "all" ? warehouseId : undefined);
    return () => unsub();
  }, [tenantId, warehouseId]);

  const filtered = useMemo(() => {
    return bols.filter((b) => {
      if (tenantId !== "all" && b.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && b.warehouseId !== warehouseId) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${b.id} ${b.bolNumber} ${b.proNumber} ${b.carrier} ${b.consignee.name} ${b.consignee.city} ${b.childOrderIds.join(" ")}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [bols, tenantId, warehouseId, query]);

  const groups = useMemo(() => {
    const pool = orders.filter((o) => {
      if (tenantId !== "all" && o.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && o.warehouseId !== warehouseId) return false;
      return true;
    });
    return buildConsolidationGroups(pool).filter((g) => g.orderIds.length >= 2);
  }, [tenantId, warehouseId]);

  const stats = useMemo(() => {
    const t = { total: filtered.length, master: 0, transit: 0, units: 0 };
    for (const b of filtered) {
      if (b.type === "master") t.master++;
      if (b.status === "in-transit" || b.status === "issued" || b.status === "tendered") t.transit++;
      t.units += b.totals.units;
    }
    return t;
  }, [filtered]);

  const handleGenerateForOrder = async (orderId: string) => {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    if (bols.some((b) => b.childOrderIds.length === 1 && b.childOrderIds[0] === orderId && b.type === "single")) {
      toast.error(`BOL already exists for ${orderId}`);
      return;
    }
    const bol = buildBolFromOrder(o);
    await createBol(bol);
    setBols((prev) => [bol, ...prev]);
    setPreviewing(bol);
    toast.success(`BOL ${bol.bolNumber} generated`, { description: `PRO ${bol.proNumber}` });
  };

  const handleCreateMaster = async (orderIds: string[]) => {
    if (orderIds.length < 2) {
      toast.error("Select at least 2 orders to consolidate");
      return;
    }
    const mbol = buildMasterBol(orderIds);
    await createBol(mbol);
    setBols((prev) => [mbol, ...prev]);
    setConsolidateOpen(false);
    setPreviewing(mbol);
    toast.success(`Master BOL ${mbol.bolNumber} created`, {
      description: `${orderIds.length} orders consolidated → ${mbol.consignee.city}, ${mbol.consignee.state}`,
    });
  };

  /** Transition a BOL forward in its lifecycle. Firing the in-transit
   *  transition auto-emits an EDI 945 Warehouse Shipping Advice. */
  const transitionBol = (id: string, next: BillOfLading["status"]) => {
    let emitted: ReturnType<typeof emit945ForBol> | null = null;
    setBols((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        if (b.status === next) return b;
        const updated = { ...b, status: next };
        if (next === "in-transit" && b.status !== "in-transit") {
          emitted = emit945ForBol(updated) as ReturnType<typeof emit945ForBol>;
        }
        return updated;
      }),
    );
    const fired = emitted as ReturnType<typeof emit945ForBol> | null;
    if (next === "in-transit" && fired) {
      toast.success(`EDI 945 transmitted · ${fired.id}`, {
        description: `${fired.partner} · ISA ${fired.isaControl} · ack ${fired.ackStatus}`,
      });
    } else {
      toast.success(`BOL status → ${next}`);
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents · Bill of Lading</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            VICS BOL v3.1 engine — generate single & master BOLs consolidating multiple orders by destination
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setConsolidateOpen(true)}>
            <Layers className="h-3.5 w-3.5" /> Build Master BOL
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={FileText}      label="Total BOLs"        value={stats.total}   tone="text-foreground" />
        <StatCell icon={Layers}        label="Master BOLs"       value={stats.master}  tone="text-primary" />
        <StatCell icon={Truck}         label="Tendered / Transit" value={stats.transit} tone="text-chart-2" />
        <StatCell icon={PackagePlus}   label="Handling units"    value={stats.units}   tone="text-chart-3" />
      </div>

      <Tabs defaultValue="issued" className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="issued" className="text-xs">Issued BOLs</TabsTrigger>
          <TabsTrigger value="generate" className="text-xs">Generate from Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="issued" className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search BOL #, PRO, consignee, order…"
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
                  <TableHead className="text-[10px] uppercase tracking-wider">BOL #</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">PRO #</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Carrier</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Consignee</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Orders</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">HU</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Weight (lb)</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Created</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-10">
                      No BOLs match the current filter. Generate one from the Orders tab.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((b) => {
                  const tenant = tenants.find((t) => t.id === b.tenantId);
                  const wh = warehouses.find((w) => w.id === b.warehouseId);
                  return (
                    <TableRow key={b.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="py-2 font-mono font-medium">{b.bolNumber}</TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${b.type === "master" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40"}`}>
                          {b.type === "master" ? "Master" : "Single"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">{b.proNumber}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Truck className="h-3 w-3 text-muted-foreground" />
                          {b.carrier}
                          <span className="text-[10px] text-muted-foreground font-mono">· {b.scac}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="text-foreground">{b.consignee.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {b.consignee.city}, {b.consignee.state} {b.consignee.zip}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {b.childOrderIds.slice(0, 3).map((id) => (
                            <span key={id} className="font-mono text-[10px] rounded-sm bg-muted px-1 py-0.5">{id}</span>
                          ))}
                          {b.childOrderIds.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{b.childOrderIds.length - 3}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          {tenant?.code} · {wh?.code}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{b.totals.pallets + b.totals.cartons}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{b.totals.weightLbs.toLocaleString()}</TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[b.status]}`}>
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-[11px] text-muted-foreground tabular-nums">
                        {fmtDateTime(b.createdAt)}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(b.status === "draft" || b.status === "issued" || b.status === "tendered") && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-[11px] gap-1.5"
                              onClick={() => transitionBol(b.id, "in-transit")}
                            >
                              <Send className="h-3 w-3" /> Ship & EDI 945
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5" onClick={() => setPreviewing(b)}>
                            <Eye className="h-3 w-3" /> Preview
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

        <TabsContent value="generate" className="mt-3">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[10px] uppercase tracking-wider">Order #</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">PO</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client / WH</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Ship-to</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Carrier</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Lines</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">BOL Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders
                  .filter((o) => (tenantId === "all" || o.tenantId === tenantId) && (warehouseId === "all" || o.warehouseId === warehouseId))
                  .map((o) => {
                    const tenant = tenants.find((t) => t.id === o.tenantId);
                    const wh = warehouses.find((w) => w.id === o.warehouseId);
                    const existing = bols.find((b) => b.childOrderIds.includes(o.id));
                    return (
                      <TableRow key={o.id} className="text-xs hover:bg-muted/30">
                        <TableCell className="py-2 font-mono font-medium">{o.id}</TableCell>
                        <TableCell className="py-2 font-mono text-[11px]">{o.poNumber}</TableCell>
                        <TableCell className="py-2 text-[11px]">
                          <span className="font-mono text-muted-foreground mr-1">{tenant?.code}</span>
                          {tenant?.name.split(" ")[0]}
                          <span className="text-muted-foreground"> · {wh?.code}</span>
                        </TableCell>
                        <TableCell className="py-2">{o.shipToName}</TableCell>
                        <TableCell className="py-2">{o.carrier} <span className="text-[10px] text-muted-foreground">· {o.serviceLevel}</span></TableCell>
                        <TableCell className="py-2 text-right tabular-nums">{o.lines.length}</TableCell>
                        <TableCell className="py-2">
                          {existing ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-chart-3">
                              <CheckCircle2 className="h-3 w-3" /> {existing.bolNumber}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No BOL</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <Button
                            size="sm"
                            variant={existing ? "outline" : "default"}
                            className="h-7 text-[11px] gap-1.5"
                            onClick={() => existing ? setPreviewing(existing) : handleGenerateForOrder(o.id)}
                          >
                            {existing ? <><Eye className="h-3 w-3" /> Preview</> : <><FileText className="h-3 w-3" /> Generate BOL</>}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <ConsolidateDialog
        open={consolidateOpen}
        onOpenChange={setConsolidateOpen}
        groups={groups}
        onCreate={handleCreateMaster}
      />

      <BolPreviewDialog
        bol={previewing}
        onOpenChange={(o) => !o && setPreviewing(null)}
        onShip={(b) => {
          transitionBol(b.id, "in-transit");
          setPreviewing({ ...b, status: "in-transit" });
        }}
      />
    </div>
  );
}

function ConsolidateDialog({
  open,
  onOpenChange,
  groups,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: ReturnType<typeof buildConsolidationGroups>;
  onCreate: (orderIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const toggle = (gKey: string, orderId: string) => {
    setSelected((prev) => {
      const set = new Set(prev[gKey] ?? []);
      if (set.has(orderId)) set.delete(orderId);
      else set.add(orderId);
      return { ...prev, [gKey]: set };
    });
  };

  const selectAll = (gKey: string, orderIds: string[]) => {
    setSelected((prev) => ({ ...prev, [gKey]: new Set(orderIds) }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Build Master BOL</DialogTitle>
          <DialogDescription className="text-xs">
            Orders grouped by destination & carrier. Select 2 or more orders within a group to consolidate them
            onto a single Master BOL with underlying sub-BOL references.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
          {groups.length === 0 && (
            <div className="rounded-md border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
              No multi-order destinations available in the current filter.
            </div>
          )}
          {groups.map((g) => {
            const sel = selected[g.key] ?? new Set<string>();
            return (
              <div key={g.key} className="rounded-md border border-border overflow-hidden">
                <div className="flex items-center justify-between bg-muted/30 px-3 py-2 border-b border-border">
                  <div className="text-xs">
                    <span className="font-semibold">{g.shipToName}</span>
                    <span className="text-muted-foreground"> · {g.carrier}</span>
                    <span className="text-[10px] text-muted-foreground font-mono ml-2">
                      {g.orderIds.length} orders · {g.totalUnits.toLocaleString()} units · {g.totalWeightLbs.toLocaleString()} lb
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => selectAll(g.key, g.orderIds)}>
                      Select all
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1.5"
                      disabled={sel.size < 2}
                      onClick={() => onCreate(Array.from(sel))}
                    >
                      <Layers className="h-3 w-3" /> Consolidate ({sel.size})
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {g.orderIds.map((id) => {
                    const o = orders.find((x) => x.id === id)!;
                    return (
                      <label key={id} className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-muted/30">
                        <Checkbox checked={sel.has(id)} onCheckedChange={() => toggle(g.key, id)} />
                        <span className="font-mono font-medium w-24">{id}</span>
                        <span className="font-mono text-[11px] text-muted-foreground w-28">{o.poNumber}</span>
                        <span className="flex-1 truncate text-muted-foreground">
                          {o.lines.map((l) => `${l.qtyOrdered}× ${l.sku}`).join(" · ")}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{o.status}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BolPreviewDialog({
  bol,
  onOpenChange,
  onShip,
}: {
  bol: BillOfLading | null;
  onOpenChange: (o: boolean) => void;
  onShip?: (b: BillOfLading) => void;
}) {
  if (!bol) return null;
  return (
    <Dialog open={!!bol} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-2.5 border-b border-border">
          <DialogTitle className="text-sm font-semibold">
            {bol.type === "master" ? "Master BOL" : "Bill of Lading"} · {bol.bolNumber}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            VICS v3.1 · PRO {bol.proNumber} · {bol.carrier} {bol.scac}
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <Tabs defaultValue="vics" className="w-full">
            <TabsList className="h-7">
              <TabsTrigger value="vics" className="text-[10px]">VICS BOL</TabsTrigger>
              <TabsTrigger value="packing" className="text-[10px]">Packing Slip</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3 w-3" /> Print
            </Button>
            {onShip && (bol.status === "draft" || bol.status === "issued" || bol.status === "tendered") && (
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={() => onShip(bol)}
              >
                <Send className="h-3 w-3" /> Ship & EDI 945
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1.5"
              onClick={() => {
                const blob = new Blob([JSON.stringify(bol, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${bol.bolNumber}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3 w-3" /> JSON
            </Button>
          </div>
        </div>
        <Tabs defaultValue="vics" className="w-full">
          <TabsContent value="vics" className="m-0">
            <div className="max-h-[80vh] overflow-y-auto bg-muted/40 p-6">
              <div className="mx-auto max-w-[8.5in] shadow-lg">
                <BolDocument bol={bol} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="packing" className="m-0">
            <div className="max-h-[80vh] overflow-y-auto bg-muted/40 p-6">
              <div className="mx-auto max-w-[8.5in] shadow-lg">
                <PackingSlip bol={bol} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof FileText;
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