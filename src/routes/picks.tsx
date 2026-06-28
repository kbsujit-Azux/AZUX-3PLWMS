import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Search,
  RefreshCw,
  PackageCheck,
  MapPin,
  History,
  Save,
  X,
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
import { useWorkspace } from "@/components/workspace-context";
import {
  fetchPickTickets,
  subscribePickTickets,
  updateOrder,
  upsertInventoryItem,
  updatePickTicket,
  deletePickTicket,
  executeDirectedPick,
  reallocatePickTicket,
  logInventoryTransaction,
  fetchTransactionHistory,
  fetchInventoryItems,
  subscribeInventoryItems,
  fetchOrders,
  subscribeOrders,
  InventoryTransaction,
} from "@/lib/firestore-data";
import type { PickTicket } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";
import type { Order } from "@/lib/edi-data";

export const Route = createFileRoute("/picks")({
  head: () => ({
    meta: [
      { title: "Pick Tickets — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content: "Directed picking: view pick tickets, enter quantities, reallocate on shortage.",
      },
    ],
  }),
  component: PicksPage,
});

type PickRow = {
  pickTicketNum: number;
  orderId: string;
  sku: string;
  description: string;
  palletId: string;
  fromLocation: string;
  quantityToPick: number;
  cartonsToPick: number;
  status: PickTicket["status"];
  tenantId: string;
  warehouseId: string;
  createdAt: string;
  caseQty: number;
  reallocated?: boolean;
};

function PicksPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selectedPick, setSelectedPick] = useState<PickRow | null>(null);
  const [pickQty, setPickQty] = useState(0);
  const [pickCartons, setPickCartons] = useState(0);
  const [pickHistoryOpen, setPickHistoryOpen] = useState(false);
  const [activePickTicket, setActivePickTicket] = useState<number | null>(null);
  const [pickTickets, setPickTickets] = useState<PickTicket[]>([]);
  const [inventory, setInventory] = useState<Map<string, any>>(new Map());
  const [ordersMap, setOrdersMap] = useState<Map<string, Order>>(new Map());
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  // Load initial data and subscribe to updates
  useEffect(() => {
    const unsubPick = subscribePickTickets(
      (pts) => {
        setPickTickets(pts);
      },
    );
    const unsubInv = subscribeInventoryItems((items) => {
      const map = new Map();
      items.forEach((item) => {
        map.set(item.sku, item);
      });
      setInventory(map);
    });
    const unsubOrders = subscribeOrders(
      (ords) => {
        const map = new Map();
        ords.forEach((o) => map.set(o.id, o));
        setOrdersMap(map);
      },
      tenantId !== "all" ? tenantId : undefined,
      warehouseId !== "all" ? warehouseId : undefined,
    );

    return () => {
      unsubPick();
      unsubInv();
      unsubOrders();
    };
  }, [tenantId, warehouseId]);

  const rows: PickRow[] = useMemo(() => {
    return pickTickets.map((pt) => {
      const order = ordersMap.get(pt.orderId);
      const item = inventory.get(pt.sku);
      const casePack = item?.caseQty || 1;
      return {
        pickTicketNum: pt.pickTicketNum,
        orderId: pt.orderId,
        sku: pt.sku,
        description: item?.description || pt.sku,
        palletId: pt.palletId,
        fromLocation: pt.fromLocation,
        quantityToPick: pt.quantityToPick,
        cartonsToPick: Math.ceil(pt.quantityToPick / casePack),
        status: pt.status,
        tenantId: order?.tenantId ?? "unknown",
        warehouseId: order?.warehouseId ?? "unknown",
        createdAt: pt.createdAt,
        caseQty: casePack,
        reallocated: pt.reallocated,
      };
    });
  }, [pickTickets, inventory, ordersMap]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tenantId !== "all" && r.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && r.warehouseId !== warehouseId) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${r.pickTicketNum} ${r.orderId} ${r.sku} ${r.palletId} ${r.fromLocation}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tenantId, warehouseId, query]);

  const stats = useMemo(() => {
    const generated = filtered.filter((r) => r.status === "GENERATED").length;
    const picked = filtered.filter((r) => r.status === "PICKED").length;
    const closed = filtered.filter((r) => r.status === "CLOSED").length;
    return { generated, picked, closed, total: filtered.length };
  }, [filtered]);

  const handlePickAction = (row: PickRow) => {
    setSelectedPick(row);
    setPickQty(row.quantityToPick);
    setPickCartons(row.cartonsToPick);
  };

  const confirmPick = async () => {
    if (!selectedPick) return;

    if (pickQty === 0) {
      // User entered 0 - trigger reallocation
      try {
        const result = await reallocatePickTicket(selectedPick.pickTicketNum, "picker");
        if (result) {
          // Update the selected pick with new location
          setSelectedPick({
            ...selectedPick,
            palletId: result.palletId,
            fromLocation: result.location,
            reallocated: true,
          });
          setPickQty(selectedPick.quantityToPick);
          setPickCartons(Math.ceil(selectedPick.quantityToPick / selectedPick.caseQty));
          toast.success(`Reallocated to pallet ${result.palletId} at ${result.location}`);
        } else {
          toast.error("No available inventory for reallocation");
        }
        return;
      } catch (e: any) {
        toast.error(`Reallocation failed: ${e.message}`);
        return;
      }
    }

    try {
      const result = await executeDirectedPick(
        selectedPick.pickTicketNum,
        pickQty,
        selectedPick.palletId,
        selectedPick.fromLocation,
        "picker",
      );

      if (result.success) {
        // Check if all picks for this order are complete
        const order = ordersMap.get(selectedPick.orderId);
        if (order) {
          const remainingPts = rows.filter(
            (r) => r.orderId === selectedPick.orderId && r.status === "GENERATED",
          );
          if (remainingPts.length === 0) {
            await updateOrder(order.id, { status: "PICKED" });
          }
        }
        toast.success(`Pick confirmed: ${pickQty} units`);
      } else {
        toast.error(result.message || "Pick failed");
      }
    } catch (e: any) {
      toast.error(`Pick failed: ${e.message}`);
    }

    setSelectedPick(null);
    setPickQty(0);
    setPickCartons(0);
  };

  const closePick = async (pickTicketNum: number) => {
    try {
      const pt = rows.find((r) => r.pickTicketNum === pickTicketNum);
      if (pt) {
        await updatePickTicket(pickTicketNum, {
          status: "CLOSED",
          closedAt: new Date().toISOString(),
        });
        toast.success(`Pick ticket ${pickTicketNum} closed`);
      }
    } catch (e: any) {
      toast.error(`Close failed: ${e.message}`);
    }
  };

  const pickHistory = async (pickTicketNum: number) => {
    setActivePickTicket(pickTicketNum);
    setPickHistoryOpen(true);
    try {
      const txns = await fetchTransactionHistory(undefined, undefined);
      setTransactions(txns.filter((t) => t.pickTicketNum === pickTicketNum));
    } catch (e: any) {
      toast.error(`Failed to load history: ${e.message}`);
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pick Tickets</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Directed picking · enter quantities · reallocate on shortage · view history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => location.reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border rounded-md border border-border bg-card">
        <Stat label="Generated" value={stats.generated} tone="text-foreground" />
        <Stat label="Picked" value={stats.picked} tone="text-chart-1" />
        <Stat label="Closed" value={stats.closed} tone="text-chart-3" />
        <Stat label="Total" value={stats.total} />
      </div>

      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pick ticket, order, SKU, pallet…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-[10px] uppercase tracking-wider">Pick Ticket</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Order</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Pallet · Location</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Units</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-right">Cartons</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-10">
                  No pick tickets match the current filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.pickTicketNum} className="text-xs hover:bg-muted/30">
                <TableCell className="py-2 font-mono font-medium">
                  {r.reallocated && (
                    <span className="text-chart-5 mr-1" title="Reallocated">★</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePickAction(r)}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    PT-{r.pickTicketNum}
                  </button>
                </TableCell>
                <TableCell className="py-2 font-mono text-[11px]">{r.orderId}</TableCell>
                <TableCell className="py-2 font-mono">
                  <div className="font-medium">{r.sku}</div>
                  <div className="text-[10px] text-muted-foreground font-sans">{r.description}</div>
                </TableCell>
                <TableCell className="py-2 font-mono text-[11px]">
                  <div>{r.palletId}</div>
                  <div className="text-[10px] text-muted-foreground">{r.fromLocation}</div>
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums">{r.quantityToPick.toLocaleString()}</TableCell>
                <TableCell className="py-2 text-right tabular-nums">{r.cartonsToPick.toLocaleString()}</TableCell>
                <TableCell className="py-2">
                  <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    r.status === "GENERATED" ? "bg-muted text-muted-foreground border-border" :
                    r.status === "PICKED" ? "bg-chart-1/15 text-chart-1 border-chart-1/30" :
                    "bg-chart-3/15 text-chart-3 border-chart-3/30"
                  }`}>
                    {r.status}
                  </span>
                </TableCell>
                <TableCell className="py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => pickHistory(r.pickTicketNum)}
                      title="View history"
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    {r.status !== "CLOSED" && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => closePick(r.pickTicketNum)}
                        title="Close pick ticket"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pick dialog */}
      <Dialog open={!!selectedPick} onOpenChange={(o) => !o && setSelectedPick(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-mono">Pick Ticket PT-{selectedPick?.pickTicketNum}</DialogTitle>
            <DialogDescription className="text-xs">
              Enter picked quantity. Enter 0 to reallocate if location/pallet not found.
            </DialogDescription>
          </DialogHeader>
          {selectedPick && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</label>
                  <div className="font-mono font-medium">{selectedPick.sku}</div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Order</label>
                  <div className="font-mono">{selectedPick.orderId}</div>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Location</label>
                <div className="flex items-center gap-2 mt-1">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{selectedPick.fromLocation}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-mono">{selectedPick.palletId}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Units to Pick</label>
                  <Input
                    type="number"
                    value={pickQty}
                    onChange={(e) => setPickQty(parseInt(e.target.value) || 0)}
                    className="h-8 text-xs font-mono"
                    min={0}
                    max={selectedPick.quantityToPick}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cartons</label>
                  <Input
                    type="number"
                    value={pickCartons}
                    onChange={(e) => setPickCartons(parseInt(e.target.value) || 0)}
                    className="h-8 text-xs font-mono"
                    min={0}
                  />
                </div>
              </div>
              <div className="bg-muted/30 rounded-md p-3 text-xs">
                <div className="font-medium mb-1">Directed Pick Instructions</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Go to location <strong>{selectedPick.fromLocation}</strong></li>
                  <li>• Scan pallet <strong>{selectedPick.palletId}</strong></li>
                  <li>• Pick <strong>{selectedPick.quantityToPick} units</strong> (<strong>{selectedPick.cartonsToPick} cartons</strong>)</li>
                  <li>• Enter picked quantity and confirm</li>
                  <li>• If location/pallet not found, enter 0 to reallocate</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedPick(null)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={confirmPick}>
              <Save className="h-3.5 w-3.5" /> Confirm Pick
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pick History dialog */}
      <Dialog open={pickHistoryOpen} onOpenChange={setPickHistoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-mono">Pick Ticket History PT-{activePickTicket}</DialogTitle>
            <DialogDescription className="text-xs">
              Transaction history for this pick ticket
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {transactions.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-4">
                No transactions found.
              </div>
            )}
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs border-b border-border pb-2">
                <span className="text-muted-foreground">{fmtDateTime(t.timestamp)}</span>
                <span className="font-mono">{t.type}</span>
                <span className="text-right">{t.qtyChange} units</span>
                <span className="text-right text-[10px]">{t.palletId}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPickHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone ?? ""}`}>{value.toLocaleString()}</div>
    </div>
  );
}