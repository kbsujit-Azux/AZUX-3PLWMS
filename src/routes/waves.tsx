import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
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
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firestore";
import { collection, doc, setDoc, getDocs, updateDoc, query, where } from "firebase/firestore";
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
import { allocate_order, deallocate_order } from "@/lib/allocation-engine";
import { updatePickTicket, createBol } from "@/lib/firestore-data";
import { buildMasterBol } from "@/lib/bol-data";
import type { Order, Wave, WaveStatus } from "@/lib/edi-data";

export const Route = createFileRoute("/waves")({
  head: () => ({
    meta: [{ title: "Wave Allocation — AZUX 3PL WMS" }],
  }),
  component: WavesPage,
});

function WavesPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { orders, pickTickets, tenants, inventoryItems, refreshData } = useWmsData();

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
  const [showPicking, setShowPicking] = useState(false);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [selectedWave, setSelectedWave] = useState<Wave | null>(null);
  const [waveFilter, setWaveFilter] = useState("all");

  // Load waves from Firestore on mount
  useEffect(() => {
    const loadWaves = async () => {
      try {
        const snap = await getDocs(collection(db, "waves"));
        const loaded = snap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) }) as unknown as Wave);
        setWaves(loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } catch (err) {
        console.error("Failed to load waves:", err);
      }
    };
    loadWaves();
  }, []);

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
    const map: Record<string, { allocatable: boolean; reason?: string; units: number; pct: number }> = {};
    for (const o of candidates) {
      const units = o.lines.reduce((s, l) => s + l.qtyOrdered, 0);
      let allocatable = true;
      let reason = "";
      let pct = 100;
      for (const line of o.lines) {
        if (line.qtyOrdered <= 0) {
          allocatable = false;
          reason = "Zero qty";
          pct = 0;
          break;
        }
        const item = (inventoryItems || []).find((i: any) => i.sku === line.sku);
        const avail = (item?.batches || []).reduce((s: number, b: any) => s + (b.qty - (b.qtyAllocated || 0)), 0);
        const linePct = line.qtyOrdered > 0 ? Math.min(100, (avail / line.qtyOrdered) * 100) : 100;
        if (linePct < pct) pct = linePct;
        if (avail < line.qtyOrdered) {
          allocatable = false;
          reason = `Insufficient stock (${avail} avail)`;
        }
      }
      map[o.id] = { allocatable, reason, units, pct: Math.round(pct) };
    }
    return map;
  }, [candidates, inventoryItems]);

  const selectedOrders = useMemo(() => candidates.filter((o) => selectedIds.has(o.id)), [candidates, selectedIds]);
  const selectedUnits = selectedOrders.reduce((s, o) => s + o.lines.reduce((l, line) => l + line.qtyOrdered, 0), 0);
  // Combined allocation feasibility across selected orders
  const combinedAllocPct = useMemo(() => {
    if (selectedOrders.length === 0) return 0;
    const needed: Record<string, number> = {};
    for (const o of selectedOrders) {
      for (const l of o.lines) {
        needed[l.sku] = (needed[l.sku] || 0) + (l.qtyOrdered || 0);
      }
    }
    let minPct = 100;
    for (const sku of Object.keys(needed)) {
      const item = (inventoryItems || []).find((i: any) => i.sku === sku);
      const avail = (item?.batches || []).reduce((s: number, b: any) => s + (b.qty - (b.qtyAllocated || 0)), 0);
      const pct = needed[sku] > 0 ? Math.min(100, (avail / needed[sku]) * 100) : 100;
      if (pct < minPct) minPct = pct;
    }
    return Math.round(minPct);
  }, [selectedOrders, inventoryItems]);

  const allAllocatable = selectedOrders.every((o) => allocatability[o.id]?.allocatable) && combinedAllocPct >= 100;

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

  const handleDeallocateWave = async (w: Wave) => {
    if (!confirm(`Deallocate all orders in wave ${w.name}?`)) return;
    setCreating(true);
    try {
      for (const oid of w.orderIds) {
        await deallocate_order(oid);
        await updateDoc(doc(db, "orders", oid), { waveId: null });
      }
      await updateDoc(doc(db, "waves", w.id), { status: "cancelled" });
      setWaves((prev) => prev.map((x) => (x.id === w.id ? { ...x, status: "cancelled" } : x)));
      toast.success(`Wave ${w.name} deallocated`);
      refreshData();
    } catch (err) {
      toast.error(`Deallocate failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };
  const carriers = [...new Set(orders.map((o) => o.carrier).filter(Boolean))];
  const services = [...new Set(orders.map((o) => o.serviceLevel).filter(Boolean))];
  const states = [...new Set(orders.map((o) => o.shipToState).filter(Boolean))];

  const handleCreateWave = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one order");
      return;
    }
    if (!waveName.trim()) {
      toast.error("Wave name is required");
      return;
    }
    if (!allAllocatable) {
      toast.error("Deselect non-allocatable orders first");
      return;
    }
    setCreating(true);
    try {
     // Allocate each selected order (largest first to ensure combined 100% allocation)
     const orderedForAlloc = [...selectedOrders].sort((a, b) => {
       const ua = a.lines.reduce((s, l) => s + l.qtyOrdered, 0);
       const ub = b.lines.reduce((s, l) => s + l.qtyOrdered, 0);
       return ub - ua;
     });
     let successCount = 0;
     let failCount = 0;
     for (const o of orderedForAlloc) {
        const result = await allocate_order(o.id);
        if (result.success) successCount++;
        else failCount++;
      }
      // Create wave record
      const waveId = `WAVE-${Date.now()}`;
      const wave: Wave = {
        id: waveId,
        waveNumber: waveId,
         name: waveName,
        tenantId: tenantId !== "all" ? tenantId : "acme",
        warehouseId: warehouseId !== "all" ? warehouseId : "atl1",
        status: "released",
        type: "wave",
        pickMethod: "batch",
        carrierFilter: carrierFilter !== "all" ? carrierFilter : undefined,
        serviceLevelFilter: serviceFilter !== "all" ? serviceFilter : undefined,
        shipToStateFilter: shipToState !== "all" ? shipToState : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        orderIds: selectedOrders.map((o) => o.id),
        pickTicketIds: [],
        createdAt: new Date().toISOString(),
        releasedAt: new Date().toISOString(),
        totalOrders: selectedOrders.length,
        totalLines: selectedOrders.reduce((s, o) => s + o.lines.length, 0),
        totalUnits: selectedUnits,
        allocatablePct: 100,
      };
      // Save wave to Firestore
      await setDoc(doc(db, "waves", waveId), wave);
      // Set waveId on orders
      for (const o of selectedOrders) {
        await updateDoc(doc(db, "orders", o.id), { waveId });
      }
      setWaves((prev) => [wave, ...prev]);
      if (failCount > 0) {
        toast.warning(`Wave partially allocated: ${successCount} succeeded, ${failCount} failed`);
      } else {
        toast.success(`Wave "${wave.name}" created: ${successCount} orders allocated`);
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
          <span>Combined Alloc: {combinedAllocPct}%</span>
          <span className={allAllocatable ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
            {allAllocatable ? "✅ All allocatable" : "❌ Some not allocatable"}
          </span>
          <Button size="sm" className="h-7 text-xs ml-auto" onClick={() => setPreviewOpen(true)} disabled={!allAllocatable}>
            Create Wave
          </Button>
        </div>
      )}

      {/* Wave List */}
      {waves.length > 0 && (
        <div className="border rounded-md">
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Wave List ({waves.length})</h2>
            <select value={waveFilter} onChange={(e) => setWaveFilter(e.target.value)} className="h-7 text-xs border rounded px-2">
              <option value="all">All Statuses</option>
              <option value="released">Released</option>
              <option value="picking">Picking</option>
              <option value="picked">Picked</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="p-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Wave #</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Orders</TableHead>
                  <TableHead className="text-xs text-right">Lines</TableHead>
                  <TableHead className="text-xs text-right">Units</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waves.filter((w) => waveFilter === "all" || w.status === waveFilter).map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs font-mono">{w.waveNumber}</TableCell>
                    <TableCell className="text-xs">{w.name}</TableCell>
                    <TableCell className="text-xs">
                      <Badge className={
                        w.status === "released" ? "bg-blue-100 text-blue-800 text-[10px]" :
                        w.status === "picking" ? "bg-yellow-100 text-yellow-800 text-[10px]" :
                        w.status === "picked" ? "bg-green-100 text-green-800 text-[10px]" :
                        "bg-gray-100 text-gray-800 text-[10px]"
                      }>{w.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right">{w.totalOrders}</TableCell>
                    <TableCell className="text-xs text-right">{w.totalLines}</TableCell>
                    <TableCell className="text-xs text-right">{w.totalUnits}</TableCell>
                    <TableCell className="text-xs">{new Date(w.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">
                      {w.status === "released" && (
                        <Button size="sm" className="h-6 text-[10px]" onClick={async () => {
                          await updateDoc(doc(db, "waves", w.id), { status: "picking" });
                          setWaves((prev) => prev.map((wave) => wave.id === w.id ? { ...wave, status: "picking" } : wave));
                          toast.success(`Wave ${w.waveNumber} started picking`);
                        }}>Start Picking</Button>
                      )}
                      {w.status === "picking" && (
                        <Button size="sm" className="h-6 text-[10px]" onClick={async () => {
                          const unpicked = (pickTickets ?? []).filter((pt: any) => pt.status !== "PICKED" && pt.status !== "picked");
                          if (unpicked.length > 0) {
                            toast.error(`Cannot complete: ${unpicked.length} pick tickets still unpicked`);
                            return;
                          }
                          await updateDoc(doc(db, "waves", w.id), { status: "picked", completedAt: new Date().toISOString() });
                          setWaves((prev) => prev.map((wave) => wave.id === w.id ? { ...wave, status: "picked", completedAt: new Date().toISOString() } : wave));
                          toast.success(`Wave ${w.waveNumber} marked as picked`);
                        }}>Complete Pick</Button>
                      )}
                      {w.status === "picked" && (
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-[10px]" onClick={async () => {
                            try {
                              const masterBol = buildMasterBol(w.orderIds);
                              await createBol(masterBol);
                              toast.success(`Master BOL ${masterBol.bolNumber} created for ${w.orderIds.length} orders`);
                            } catch (err) {
                              toast.error(`Master BOL failed: ${err instanceof Error ? err.message : String(err)}`);
                            }
                          }}>Master BOL</Button>
                          <Button size="sm" className="h-6 text-[10px]" onClick={async () => {
                            await updateDoc(doc(db, "waves", w.id), { status: "closed" });
                            setWaves((prev) => prev.map((wave) => wave.id === w.id ? { ...wave, status: "closed" } : wave));
                            toast.success(`Wave ${w.waveNumber} closed`);
                           }}>Close Wave</Button>
                           <Button size="sm" variant="destructive" className="h-6 text-[10px]" onClick={() => handleDeallocateWave(w)}>Deallocate</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Wave Picking Section */}
      <div className="border rounded-md">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <h2 className="text-sm font-semibold">Wave Picking — Consolidated Pick List</h2>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowPicking(!showPicking)}>
            {showPicking ? "Hide" : "Show"} Pick List
          </Button>
        </div>
        {showPicking && (
          <div className="p-3 space-y-3">
            {(() => {
              // Get all allocated pick tickets, sorted by location
              const allocatedTickets = (pickTickets ?? []).filter((pt: any) => pt.status === "GENERATED" || pt.status === "allocated");
              const sorted = [...allocatedTickets].sort((a: any, b: any) => {
                const locA = (a.fromLocation || "").toUpperCase();
                const locB = (b.fromLocation || "").toUpperCase();
                return locA.localeCompare(locB);
              });
              if (sorted.length === 0) {
                return <p className="text-xs text-muted-foreground py-4 text-center">No allocated pick tickets to pick. Allocate orders first.</p>;
              }
              // Group by location
              const byLocation: Record<string, any[]> = {};
              for (const pt of sorted) {
                const loc = pt.fromLocation || "UNKNOWN";
                if (!byLocation[loc]) byLocation[loc] = [];
                byLocation[loc].push(pt);
              }
              return (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {sorted.length} pick tickets · {allocatedTickets.reduce((s: number, pt: any) => s + (pt.quantityToPick || 0), 0)} units · {Object.keys(byLocation).length} locations
                  </div>
                  {Object.entries(byLocation).map(([loc, tickets]) => (
                    <div key={loc} className="border rounded">
                      <div className="px-3 py-1.5 bg-muted/50 text-xs font-semibold flex items-center gap-2">
                        <MapPin className="h-3 w-3" /> {loc}
                        <span className="text-muted-foreground ml-auto">{tickets.reduce((s: number, t: any) => s + (t.quantityToPick || 0), 0)} units</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Order #</TableHead>
                            <TableHead className="text-[10px]">SKU</TableHead>
                            <TableHead className="text-[10px] text-right">Qty</TableHead>
                            <TableHead className="text-[10px]">Status</TableHead>
                            <TableHead className="text-[10px]">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tickets.map((pt: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-[10px] font-mono">{pt.orderId}</TableCell>
                              <TableCell className="text-[10px]">{pt.sku}</TableCell>
                              <TableCell className="text-[10px] text-right">{pt.quantityToPick}</TableCell>
                              <TableCell className="text-[10px]">{pt.status}</TableCell>
                              <TableCell className="text-[10px]">
                                {pt.status === "GENERATED" || pt.status === "allocated" ? (
                                  <Button size="sm" className="h-5 text-[9px] px-2" onClick={async () => {
                                    try {
                                      await updatePickTicket(pt.id, { status: "PICKED", pickedAt: new Date().toISOString(), qtyPicked: pt.quantityToPick });
                                      toast.success(`Picked ${pt.quantityToPick} units of ${pt.sku} for ${pt.orderId}`);
                                      refreshData();
                                    } catch (err) {
                                      toast.error(`Pick failed: ${err instanceof Error ? err.message : String(err)}`);
                                    }
                                  }}>Pick</Button>
                                ) : (
                                  <span className="text-green-600 text-[9px]">✓ Picked</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Wave Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Wave</DialogTitle>
            <DialogDescription>Review selected orders before allocating as a batch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Wave name (required)" value={waveName} onChange={(e) => setWaveName(e.target.value)} className="h-8 text-xs" />
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
                           <Badge className="bg-green-100 text-green-800 text-[10px]">✅ {allocatability[o.id]?.pct}%</Badge>
                         ) : (
                           <Badge className="bg-red-100 text-red-800 text-[10px]">❌ {allocatability[o.id]?.pct}%</Badge>
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
            <Button size="sm" className="h-8 text-xs" onClick={handleCreateWave} disabled={creating || !allAllocatable || !waveName.trim()}>
              {creating ? "Allocating..." : `Allocate ${selectedIds.size} Orders`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



