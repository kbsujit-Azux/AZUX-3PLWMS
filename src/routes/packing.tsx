import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useWmsData } from "@/components/db-context";
import { useWorkspace } from "@/components/workspace-context";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Printer, RefreshCw, Search, ChevronDown, ChevronRight, Package } from "lucide-react";
import { generateNextUCC128 } from "@/lib/ucc128";

export const Route = createFileRoute("/packing")({
  head: () => ({
    meta: [
      { title: "Packing & UCC128 — AZUX 3PL WMS Systems" },
      { name: "description", content: "UCC128 outbound pallet management" },
    ],
  }),
  component: PackingPage,
});

interface UCCRecord {
  id: string;
  orderId: string;
  tenantId: string;
  warehouseId: string;
  sku: string;
  itemStyle: string;
  itemDescription: string;
  upc: string;
  units: number;
  cartonNumber: number;
  totalCartons: number;
  weightLbs: number;
  fromAddress: string;
  toAddress: string;
  billToAddress: string;
  carrier: string;
  scac: string;
  serviceLevel: string;
  poNumber: string;
  palletId: string;
  bolNumber: string;
  masterBolNumber: string;
  shipDate: string;
  ediDate: string;
  cancelDate: string;
  mustShipDate: string;
  createdAt: string;
  status: string;
}

function PackingPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { orders: liveOrders, loading, refreshData } = useWmsData();
  const [uccRecords, setUccRecords] = useState<UCCRecord[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<UCCRecord | null>(null);
  const [massDeleteOrder, setMassDeleteOrder] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "ucc128Records"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as UCCRecord);
      setUccRecords(list);
      setDbLoading(false);
    });
    return () => unsub();
  }, []);

  // Group by orderId, most recent first
  const grouped = useMemo(() => {
    const map = new Map<string, UCCRecord[]>();
    for (const r of uccRecords) {
      if (!map.has(r.orderId)) map.set(r.orderId, []);
      map.get(r.orderId)!.push(r);
    }
    // Sort orders by most recent createdAt
    const entries = Array.from(map.entries()).sort((a, b) => {
      const aDate = a[1][0]?.createdAt ?? "";
      const bDate = b[1][0]?.createdAt ?? "";
      return bDate.localeCompare(aDate);
    });
    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return entries.filter(([orderId]) => orderId.toLowerCase().includes(q));
    }
    return entries;
  }, [uccRecords, searchQuery]);

  const toggleExpand = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleDelete = async (record: UCCRecord) => {
    try {
      await deleteDoc(doc(db, "ucc128Records", record.id));
      toast.success(`UCC ${record.id} deleted`);
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      toast.error("Failed to delete UCC");
    }
  };

  const handleMassDelete = async (orderId: string) => {
    try {
      const records = uccRecords.filter((r) => r.orderId === orderId);
      for (const r of records) {
        await deleteDoc(doc(db, "ucc128Records", r.id));
      }
      toast.success(`Deleted ${records.length} UCC records for ${orderId}`);
      setMassDeleteOpen(false);
      setMassDeleteOrder(null);
    } catch (err) {
      toast.error("Failed to delete UCC records");
    }
  };

  const handlePrintAll = (orderId: string) => {
    const records = uccRecords.filter((r) => r.orderId === orderId);
    const win = window.open("", "_blank");
    if (!win) return;
    const labels = records.map((r) => {
      const bars = Array.from({ length: 48 }).map((_, i) => `<span style="display:inline-block;background:#000;width:${((i * 31 + r.id.charCodeAt(i % r.id.length)) % 3) + 1}px;height:100%;"></span>`).join("");
      return `<div style="border:2px solid #000;padding:12px;margin:8px;font-family:monospace;page-break-after:always;">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:4px;">
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;">AZUX 3PL WMS Systems</span>
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;">UCC128 SSCC</span>
        </div>
        <div style="margin-top:8px;font-size:16px;font-weight:bold;letter-spacing:0.1em;">${r.id}</div>
        <div class="barcode" style="margin-top:4px;text-align:center;font-size:48px;line-height:1;">${r.id}</div>
        <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:11px;">
          <span style="color:#666;">ORDER</span><span style="text-align:right;">${r.orderId}</span>
          <span style="color:#666;">SKU</span><span style="text-align:right;">${r.sku}</span>
          <span style="color:#666;">STYLE</span><span style="text-align:right;">${r.itemStyle}</span>
          <span style="color:#666;">QTY</span><span style="text-align:right;">${r.units}</span>
          <span style="color:#666;">CARTON</span><span style="text-align:right;">${r.cartonNumber}/${r.totalCartons}</span>
          <span style="color:#666;">PO</span><span style="text-align:right;">${r.poNumber}</span>
          <span style="color:#666;">SHIP TO</span><span style="text-align:right;">${r.toAddress}</span>
        </div>
        <div style="margin-top:8px;display:flex;align-items:flex-end;gap:1px;overflow:hidden;height:40px;background:#111;padding:4px;">${bars}</div>
        <div style="margin-top:2px;text-align:center;font-size:10px;letter-spacing:0.3em;">${r.id}</div>
      </div>`;
    }).join("");
    win.document.write(`<html><head><link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap" rel="stylesheet"><style>@media print { body { margin: 0; } } .barcode { font-family: "Libre Barcode 128", cursive; }</style></head><body>${labels}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  if (dbLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Packing & UCC128</h1>
          <p className="text-sm text-muted-foreground">UCC128 outbound pallet management — grouped by order</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search by order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 h-8 text-xs"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={refreshData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {grouped.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No UCC128 records found. Build UCC128 from the Orders page for picked orders.
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(([orderId, records]) => {
          const totalUnits = records.reduce((s, r) => s + (r.units ?? 0), 0);
           const order = liveOrders.find((o: any) => o.id === orderId) as any;
          const shipTo = records[0]?.toAddress ?? order?.shipToName ?? "—";
          const uccBuildDate = records[0]?.createdAt ?? "";
          const pickDate = order?.pickedAt ?? "—";
          return (
            <div key={orderId} className="rounded-md border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-muted/30">
                <div className="flex items-center gap-4">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleExpand(orderId)}>
                    {expandedOrders.has(orderId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                  <div>
                    <div className="font-mono font-semibold text-sm">{orderId}</div>
                    <div className="text-xs text-muted-foreground">{shipTo}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div><span className="text-muted-foreground">Units:</span> <span className="font-medium">{totalUnits}</span></div>
                  <div><span className="text-muted-foreground">UCCs:</span> <span className="font-medium">{records.length}</span></div>
                  <div><span className="text-muted-foreground">Pick:</span> <span className="font-medium">{typeof pickDate === "string" ? pickDate.slice(0, 10) : "—"}</span></div>
                  <div><span className="text-muted-foreground">UCC Built:</span> <span className="font-medium">{uccBuildDate ? new Date(uccBuildDate).toLocaleDateString() : "—"}</span></div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handlePrintAll(orderId)}>
                    <Printer className="h-3 w-3" /> Print All
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => { setMassDeleteOrder(orderId); setMassDeleteOpen(true); }}>
                    <Trash2 className="h-3 w-3" /> Delete All
                  </Button>
                </div>
              </div>
              {expandedOrders.has(orderId) && (
                <div className="border-t border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20">
                      <tr>
                        <th className="text-left p-2">UCC (SSCC)</th>
                        <th className="text-left p-2">SKU</th>
                        <th className="text-left p-2">Style</th>
                        <th className="text-right p-2">Units</th>
                        <th className="text-right p-2">Carton</th>
                        <th className="text-left p-2">Pallet</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-right p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id} className="border-t border-border/50">
                          <td className="p-2 font-mono text-[10px]">{r.id}</td>
                          <td className="p-2">{r.sku}</td>
                          <td className="p-2">{r.itemStyle}</td>
                          <td className="p-2 text-right">{r.units}</td>
                          <td className="p-2 text-right">{r.cartonNumber}/{r.totalCartons}</td>
                          <td className="p-2">{r.palletId || "—"}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px] h-5">{r.status}</Badge></td>
                          <td className="p-2 text-right">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setDeleteTarget(r); setDeleteOpen(true); }}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete single UCC dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete UCC Record</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete UCC {deleteTarget?.id}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteTarget) handleDelete(deleteTarget); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mass delete dialog */}
      <AlertDialog open={massDeleteOpen} onOpenChange={setMassDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All UCCs for {massDeleteOrder}</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all UCC records for this order. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMassDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (massDeleteOrder) handleMassDelete(massDeleteOrder); }}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
