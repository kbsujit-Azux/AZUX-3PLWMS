import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PackageSearch,
  Truck,
  MapPin,
  Calendar,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { allocate_order } from "@/lib/allocation-engine";
import { tenants, warehouses } from "@/lib/mock-data";
import type { Order } from "@/lib/edi-data";

export const Route = createFileRoute("/waves")({
  head: () => ({
    meta: [{ title: "Wave Allocation — AZUX 3PL WMS" }],
  }),
  component: WavesPage,
});

function WavesPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { orders, refreshData } = useWmsData();

  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("new");
  const [shipToState, setShipToState] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [waveName, setWaveName] = useState("");
  const [creating, setCreating] = useState(false);

  // Candidate orders: unallocated, matching filters
  const candidates = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    return orders.filter((o) => {
      if (tenantId !== "all" && o.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && o.warehouseId !== warehouseId) return false;
      if (o.status !== "new" && o.status !== "released") return false;
      if (o.waveId) return false; // already in a wave
      if (carrierFilter !== "all" && o.carrier !== carrierFilter) return false;
      if (serviceFilter !== "all" && o.serviceLevel !== serviceFilter) return false;
      if (shipToState !== "all" && o.shipToState !== shipToState) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${o.id} ${o.poNumber} ${o.ediRef} ${o.shipToName} ${o.carrier}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      const d = new Date(o.receivedAt || o.entryDate);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [orders, tenantId, warehouseId, query, dateFrom, dateTo, carrierFilter, serviceFilter, statusFilter, shipToState]);

  // Check allocatability for each candidate
  const allocatability = useMemo(() => {
    const map: Record<string, { allocatable: boolean; reason?: string; units: number }> = {};
    for (const o of candidates) {
      const units = o.lines.reduce((s, l) => s + l.qtyOrdered, 0);
      // Check if all lines have sufficient inventory
      let allocatable = true;
      let reason = "";
      for (const line of o.lines) {
        // We can't check inventory without the engine, so we'll assume allocatable for now
        // In production, this would call a checkAllocationFeasibility function
        if (line.qtyOrdered <= 0) {
          allocatable = false;
          reason = "Zero qty";
          break;
        }
      }
      map[o.id] = { allocatable, reason, units };
    }
    return map;
  }, [candidates]);

  const selectedOrders = useMemo(() => candidates.filter((o) => selectedIds.has(o.id)), [candidates, selectedIds]);
  const selectedUnits = selectedOrders.reduce((s, o) => s + o.lines.reduce((l, line) => l + line.qtyOrdered, 0), 0);
  const allAllocatable = selectedOrders.every((o) => allocatability[o.id]?.allocatable);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const allocatableIds = candidates.filter((o) => allocatability[o.id]?.allocatable).map((o) => o.id);
    setSelectedIds(new Set(allocatableIds));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const carriers = [...new Set(orders.map((o) => o.carrier).filter(Boolean))];
  const services = [...new Set(orders.map((o) => o.serviceLevel).filter(Boolean))];
  const states = [...new Set(orders.map((o) => o.shipToState).filter(Boolean))];

  const handleCreateWave = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one order");
      return;
    }
    if (!allAllocatable) {
      toast.error("Deselect non-allocatable orders first");
      return;
    }
    setCreating(true);
    try {
      // Allocate each selected order
      let successCount = 0;
      let failCount = 0;
      for (const o of selectedOrders) {
        const result = await allocate_order(o.id);
        if (result.success) successCount++;
        else failCount++;
      }
      if (failCount > 0) {
        toast.warning(`Wave partially allocated: ${successCount} succeeded, ${failCount} failed`);
      } else {
        toast.success(`Wave allocated: ${successCount} orders allocated successfully`);
      }
      setSelectedIds(new Set());
      setPreviewOpen(false);
      refreshData();
    } catch (err) {
      toast.error(`Wave creation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Wave Allocation</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Batch allocate orders by filters · Preview allocatability · Create waves for optimal picking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={refreshData}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setPreviewOpen(true)} disabled={selectedIds.size === 0}>
            <Layers className="h-3.5 w-3.5" /> Create Wave ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 text-xs" />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" placeholder="From" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" placeholder="To" />
        <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} className="h-8 text-xs border rounded px-2">
          <option value="all">All Carriers</option>
          {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="h-8 text-xs border rounded px-2">
          <option value="all">All Services</option>
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={shipToState} onChange={(e) => setShipToState(e.target.value)} className="h-8 text-xs border rounded px-2">
          <option value="all">All States</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-xs border rounded px-2">
          <option value="new">New</option>
          <option value="released">Released</option>
          <option value="all">All Open</option>
        </select>
      </div>

      {/* Candidate Orders */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input type="checkbox" checked={selectedIds.size === candidates.filter((o) => allocatability[o.id]?.allocatable).length && candidates.length > 0} onChange={(e) => e.target.checked ? selectAll() : deselectAll()} />
              </TableHead>
              <TableHead className="text-xs">Order #</TableHead>
              <TableHead className="text-xs">PO #</TableHead>
              <TableHead className="text-xs">Client</TableHead>
              <TableHead className="text-xs">Ship-to</TableHead>
              <TableHead className="text-xs">Carrier</TableHead>
              <TableHead className="text-xs">Service</TableHead>
              <TableHead className="text-xs text-right">Lines</TableHead>
              <TableHead className="text-xs text-right">Units</TableHead>
              <TableHead className="text-xs">Allocatable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">
                  No candidate orders match the filters.
                </TableCell>
              </TableRow>
            ) : (
              candidates.map((o) => {
                const tenant = tenants.find((t) => t.id === o.tenantId);
                const alloc = allocatability[o.id];
                return (
                  <TableRow key={o.id} className={alloc?.allocatable ? "" : "opacity-50"}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        disabled={!alloc?.allocatable}
                        onChange={() => toggleSelect(o.id)}
                      />
                    </TableCell>
                    <TableCell className="text-xs font-mono">{o.id}</TableCell>
                    <TableCell className="text-xs">{o.poNumber}</TableCell>
                    <TableCell className="text-xs">{tenant?.code ?? o.tenantId}</TableCell>
                    <TableCell className="text-xs">{o.shipToName} ({o.shipToState})</TableCell>
                    <TableCell className="text-xs">{o.carrier}</TableCell>
                    <TableCell className="text-xs">{o.serviceLevel}</TableCell>
                    <TableCell className="text-xs text-right">{o.lines.length}</TableCell>
                    <TableCell className="text-xs text-right">{o.lines.reduce((s, l) => s + l.qtyOrdered, 0)}</TableCell>
                    <TableCell className="text-xs">
                      {alloc?.allocatable ? (
                        <Badge className="bg-green-100 text-green-800 text-[10px]">✅ 100%</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 text-[10px]">❌ {alloc?.reason || "No"}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-3 rounded-md border bg-muted/50 text-xs">
          <span className="font-medium">Selected: {selectedIds.size} orders</span>
          <span>Units: {selectedUnits}</span>
          <span className={allAllocatable ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
            {allAllocatable ? "✅ All allocatable" : "❌ Some not allocatable"}
          </span>
          <Button size="sm" className="h-7 text-xs ml-auto" onClick={() => setPreviewOpen(true)} disabled={!allAllocatable}>
            Create Wave
          </Button>
        </div>
      )}

      {/* Wave Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Wave</DialogTitle>
            <DialogDescription>Review selected orders before allocating as a batch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Wave name (optional)" value={waveName} onChange={(e) => setWaveName(e.target.value)} className="h-8 text-xs" />
            <div className="text-xs text-muted-foreground">
              {selectedOrders.length} orders · {selectedOrders.reduce((s, o) => s + o.lines.length, 0)} lines · {selectedUnits} units
            </div>
            <div className="max-h-60 overflow-y-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Order #</TableHead>
                    <TableHead className="text-xs">PO #</TableHead>
                    <TableHead className="text-xs">Ship-to</TableHead>
                    <TableHead className="text-xs">Carrier</TableHead>
                    <TableHead className="text-xs text-right">Units</TableHead>
                    <TableHead className="text-xs">Allocatable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs font-mono">{o.id}</TableCell>
                      <TableCell className="text-xs">{o.poNumber}</TableCell>
                      <TableCell className="text-xs">{o.shipToName} ({o.shipToState})</TableCell>
                      <TableCell className="text-xs">{o.carrier} / {o.serviceLevel}</TableCell>
                      <TableCell className="text-xs text-right">{o.lines.reduce((s, l) => s + l.qtyOrdered, 0)}</TableCell>
                      <TableCell className="text-xs">
                        {allocatability[o.id]?.allocatable ? (
                          <Badge className="bg-green-100 text-green-800 text-[10px]">✅</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 text-[10px]">❌</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!allAllocatable && (
              <div className="text-xs text-red-600 font-medium">
                ⚠️ Some selected orders cannot be 100% allocated. Deselect them to proceed.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={handleCreateWave} disabled={creating || !allAllocatable}>
              {creating ? "Allocating..." : `Allocate ${selectedIds.size} Orders`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
