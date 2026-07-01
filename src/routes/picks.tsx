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
  Package,
  Printer,
  Barcode,
  CheckCircle2,
  ClipboardList,
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
  createOutboundPallets,
  updateOutboundPallet,
  createShipmentRecord,
} from "@/lib/firestore-data";
import {
  createOutboundPalletFromInput,
  buildUcc128Label,
  type OutboundPallet,
  type OutboundPalletLine,
  type OutboundPalletCreateInput,
} from "@/lib/outbound-pallet-data";
import type { PickTicket } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";
import type { Order } from "@/lib/edi-data";
import { orders } from "@/lib/edi-data";
import { tenants, warehouses } from "@/lib/mock-data";

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

  // Palletize state
  const [palletizeOrderOpen, setPalletizeOrderOpen] = useState<Order | null>(null);
  const [palletizePalletsCount, setPalletizePalletsCount] = useState(1);
  const [palletizeConfirmOpen, setPalletizeConfirmOpen] = useState(false);
  const [pendingOutboundPallets, setPendingOutboundPallets] = useState<OutboundPallet[]>([]);
  const [isPalletizing, setIsPalletizing] = useState(false);

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

  const fullyPickedOrders = useMemo(() => {
    const orderPickMap = new Map<string, PickTicket[]>();
    for (const pt of pickTickets) {
      const existing = orderPickMap.get(pt.orderId) || [];
      existing.push(pt);
      orderPickMap.set(pt.orderId, existing);
    }

    const result: { order: Order; pickTickets: PickTicket[] }[] = [];
    for (const [orderId, pts] of orderPickMap) {
      const order = ordersMap.get(orderId);
      if (!order) continue;
      if (order.status === "OUTBOUND_PALLETIZED" || order.status === "shipped") continue;
      const allPicked = pts.every(
        (pt) => pt.status === "PICKED" || pt.status === "CLOSED",
      );
      if (allPicked && pts.length > 0) {
        result.push({ order, pickTickets: pts });
      }
    }
    return result;
  }, [pickTickets, ordersMap]);

  const openPalletizeDialog = (order: Order) => {
    setPalletizeOrderOpen(order);
    setPalletizePalletsCount(1);
    setPalletizeConfirmOpen(false);
    setPendingOutboundPallets([]);
  };

  const prepareOutboundPallets = () => {
    if (!palletizeOrderOpen) return;
    const order = palletizeOrderOpen;
    const orderPicks = pickTickets.filter((pt) => pt.orderId === order.id);
    const lines: OutboundPalletLine[] = orderPicks.map((pt) => {
      const item = inventory.get(pt.sku);
      return {
        sku: pt.sku,
        description: item?.description || pt.sku,
        unitsPicked: pt.qtyPicked || pt.quantityToPick,
        caseQty: item?.caseQty || 1,
        weightLbs: ((pt.qtyPicked || pt.quantityToPick) * (item?.weightLbs || 1)),
        pickTicketNum: pt.pickTicketNum,
      };
    });

    const totalUnits = lines.reduce((sum, l) => sum + l.unitsPicked, 0);
    const preferredPallets = Math.max(1, Math.ceil(totalUnits / 480));
    const palletsCount = Math.max(1, Math.min(preferredPallets, palletizePalletsCount));

    const input: OutboundPalletCreateInput = {
      orderId: order.id,
      tenantId: order.tenantId,
      warehouseId: order.warehouseId,
      totalPallets: palletsCount,
      lines,
    };

    const pallets: OutboundPallet[] = [];
    for (let i = 1; i <= palletsCount; i++) {
      pallets.push(createOutboundPalletFromInput(input, i));
    }
    setPendingOutboundPallets(pallets);
    setPalletizeConfirmOpen(true);
  };

  const confirmPalletization = async () => {
    if (!palletizeOrderOpen || pendingOutboundPallets.length === 0) return;
    setIsPalletizing(true);
    try {
      await createOutboundPallets(pendingOutboundPallets);

      for (const pallet of pendingOutboundPallets) {
        const pickTicketsForPallet = pickTickets.filter(
          (pt) => pt.orderId === palletizeOrderOpen!.id,
        );
        for (const pt of pickTicketsForPallet) {
          await updatePickTicket(pt.pickTicketNum, {
            status: "CLOSED",
            closedAt: new Date().toISOString(),
          });
        }
      }

      const firstPallet = pendingOutboundPallets[0];
      const shipmentId = `SHP-${firstPallet.sscc18.slice(-8)}`;
      const totalPallets = pendingOutboundPallets.length;
      const totalUnits = pendingOutboundPallets.reduce(
        (s, p) => s + p.lines.reduce((ls, l) => ls + l.unitsPicked, 0),
        0,
      );
      const totalWeightLbs = pendingOutboundPallets.reduce(
        (s, p) => s + p.lines.reduce((ls, l) => ls + l.weightLbs, 0),
        0,
      );
      const totalCartons = pendingOutboundPallets.reduce(
        (s, p) => s + p.lines.reduce((ls, l) => ls + Math.ceil(l.unitsPicked / Math.max(1, l.caseQty)), 0),
        0,
      );

      await createShipmentRecord({
        id: shipmentId,
        bolId: "",
        orderIds: [palletizeOrderOpen.id],
        tenantId: firstPallet.tenantId,
        warehouseId: firstPallet.warehouseId,
        carrier: palletizeOrderOpen.carrier,
        scac: "",
        serviceLevel: palletizeOrderOpen.serviceLevel,
        mode: "LTL",
        status: "staged",
        dockDoor: "D-00",
        appointmentAt: new Date().toISOString(),
        trailerNumber: "",
        sealNumber: "",
        proNumber: "",
        shipTo: palletizeOrderOpen.shipToName,
        pallets: totalPallets,
        cartons: totalCartons,
        weightLbs: Math.round(totalWeightLbs * 10) / 10,
        declaredValue: palletizeOrderOpen.lines.reduce(
          (s, l) => s + l.qtyOrdered * l.unitPrice,
          0,
        ),
      });

      for (const pallet of pendingOutboundPallets) {
        await updateOutboundPallet(pallet.id, {
          status: "staged",
          shipmentId,
        });
      }

      await updateOrder(palletizeOrderOpen.id, { status: "OUTBOUND_PALLETIZED" });

      toast.success(
        `${pendingOutboundPallets.length} outbound pallet(s) created for ${palletizeOrderOpen.id}`,
        {
          description: `Shipment ${shipmentId} staged · UCC128 labels ready`,
        },
      );

      setPalletizeOrderOpen(null);
      setPalletizeConfirmOpen(false);
      setPendingOutboundPallets([]);
    } catch (e: any) {
      toast.error(`Palletization failed: ${e.message}`);
    } finally {
      setIsPalletizing(false);
    }
  };

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pick Tickets</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Directed picking · enter quantities · reallocate on shortage · palletize when fully picked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => location.reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <Stat label="Generated" value={stats.generated} tone="text-foreground" />
        <Stat label="Picked" value={stats.picked} tone="text-chart-1" />
        <Stat label="Closed" value={stats.closed} tone="text-chart-3" />
        <Stat label="Total" value={stats.total} />
        <Stat label="Fully Picked Orders" value={fullyPickedOrders.length} tone="text-chart-4" />
      </div>

      {/* Fully Picked Orders - Palletize Section */}
      {fullyPickedOrders.length > 0 && (
        <div className="rounded-md border border-chart-4/30 bg-chart-4/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-chart-4" />
              <span className="text-xs font-semibold uppercase tracking-wider text-chart-4">
                Ready for Palletization
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {fullyPickedOrders.length} order(s) fully picked
            </span>
          </div>
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[10px] uppercase tracking-wider">Order #</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">PO #</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Ship-to</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Carrier</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Units</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">SKUs</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fullyPickedOrders.map(({ order }) => {
                  const tenant = ordersMap.get(order.id);
                  const totalUnits = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
                  return (
                    <TableRow key={order.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="py-2 font-mono font-medium">{order.id}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">{order.poNumber}</TableCell>
                      <TableCell className="py-2">{order.shipToName}</TableCell>
                      <TableCell className="py-2">{order.carrier}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{totalUnits}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{order.lines.length}</TableCell>
                      <TableCell className="py-2 text-right">
                        <Button
                          size="sm"
                          className="h-7 text-[11px] gap-1.5 bg-chart-4 hover:bg-chart-4/90"
                          onClick={() => openPalletizeDialog(order)}
                        >
                          <Package className="h-3 w-3" /> Palletize
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

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

      {/* Palletize Order Dialog */}
      <Dialog open={!!palletizeOrderOpen && !palletizeConfirmOpen} onOpenChange={(o) => !o && setPalletizeOrderOpen(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-mono flex items-center gap-2">
              <Package className="h-4 w-4 text-chart-4" />
              Palletize Order
            </DialogTitle>
            <DialogDescription className="text-xs">
              Create outbound pallets with UCC128 labels for shipment
            </DialogDescription>
          </DialogHeader>
          {palletizeOrderOpen && (
            <div className="space-y-4">
              {/* Order Header */}
              <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Order #</div>
                  <div className="font-mono font-medium">{palletizeOrderOpen.id}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">PO #</div>
                  <div className="font-mono">{palletizeOrderOpen.poNumber}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ship-to</div>
                  <div>{palletizeOrderOpen.shipToName}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Carrier</div>
                  <div>{palletizeOrderOpen.carrier} · {palletizeOrderOpen.serviceLevel}</div>
                </div>
              </div>

              {/* SKU Lines */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Picked Items</div>
                <div className="rounded-md border border-border bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">Description</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-right">Units Picked</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-right">Case Pack</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider text-right">Weight (lb)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const orderPicks = pickTickets.filter((pt) => pt.orderId === palletizeOrderOpen!.id);
                        return orderPicks.map((pt) => {
                          const item = inventory.get(pt.sku);
                          const units = pt.qtyPicked || pt.quantityToPick;
                          return (
                            <TableRow key={pt.pickTicketNum} className="text-xs">
                              <TableCell className="py-2 font-mono font-medium">{pt.sku}</TableCell>
                              <TableCell className="py-2 text-[11px]">{item?.description || pt.sku}</TableCell>
                              <TableCell className="py-2 text-right tabular-nums">{units}</TableCell>
                              <TableCell className="py-2 text-right tabular-nums">{item?.caseQty || 1}</TableCell>
                              <TableCell className="py-2 text-right tabular-nums">
                                {(units * (item?.weightLbs || 1)).toFixed(1)}
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Pallet Count Input */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Number of Outbound Pallets
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={palletizePalletsCount}
                    onChange={(e) => setPalletizePalletsCount(parseInt(e.target.value) || 1)}
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <div className="text-[10px] text-muted-foreground">
                    Recommended: {Math.max(1, Math.ceil(pickTickets.filter(pt => pt.orderId === palletizeOrderOpen!.id).reduce((s, pt) => s + (pt.qtyPicked || pt.quantityToPick), 0) / 480))} pallets based on 480 units/pallet capacity
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPalletizeOrderOpen(null)}>Cancel</Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => prepareOutboundPallets()}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Palletize Confirmation Dialog */}
      <Dialog open={palletizeConfirmOpen} onOpenChange={setPalletizeConfirmOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-mono flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-chart-3" />
              Confirm Outbound Pallet Creation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Review the outbound pallets that will be created with UCC128 labels
            </DialogDescription>
          </DialogHeader>
          {pendingOutboundPallets.length > 0 && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Order</div>
                  <div className="font-mono font-medium">{pendingOutboundPallets[0].orderId}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Pallets</div>
                  <div className="font-mono font-medium">{pendingOutboundPallets.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total SKU Lines</div>
                  <div className="font-mono font-medium">{pendingOutboundPallets.reduce((s, p) => s + p.lines.length, 0)}</div>
                </div>
              </div>

              {/* Pallet List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pendingOutboundPallets.map((pallet) => (
                  <div key={pallet.id} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-mono font-medium text-xs">{pallet.id}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">UCC128: {pallet.ucc128Data}</div>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-[10px]">
                      {pallet.lines.map((line, idx) => (
                        <div key={idx} className="truncate">
                          <span className="font-mono text-muted-foreground">{line.sku}</span>
                          <span className="text-foreground ml-1">{line.unitsPicked} units</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">SSCC-18</span>
                        <span className="font-mono">{pallet.sscc18}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPalletizeConfirmOpen(false)} disabled={isPalletizing}>
              Back
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={confirmPalletization}
              disabled={isPalletizing || pendingOutboundPallets.length === 0}
            >
              {isPalletizing ? (
                <>Processing...</>
              ) : (
                <>
                  <Printer className="h-3.5 w-3.5" /> Approve & Create Pallets
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UCC128 Label Preview Dialog */}
      <Ucc128LabelDialog pallets={pendingOutboundPallets} onClose={() => setPendingOutboundPallets([])} />
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

function Ucc128LabelDialog({
  pallets,
  onClose,
}: {
  pallets: OutboundPallet[];
  onClose: () => void;
}) {
  const [printQueue, setPrintQueue] = useState<OutboundPallet[]>([]);

  useEffect(() => {
    if (pallets.length > 0) {
      setPrintQueue(pallets);
    }
  }, [pallets]);

  if (!printQueue.length) return null;

  return (
    <Dialog open={!!printQueue.length} onOpenChange={(o) => !o && (onClose(), setPrintQueue([]))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Barcode className="h-4 w-4 text-primary" />
            UCC128 Pallet Labels
          </DialogTitle>
          <DialogDescription className="text-xs">
            Print UCC128 GS1-128 standard pallet labels to attach to outbound pallets
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {printQueue.map((pallet) => (
            <div key={pallet.id} className="rounded-md border-2 border-foreground/80 bg-white p-4 font-mono text-xs text-black">
              <div className="flex items-center justify-between border-b-2 border-black/80 pb-2">
                <span className="text-[10px] uppercase tracking-wider">AZUX 3PL WMS · Outbound Pallet</span>
                <span className="text-[10px] uppercase tracking-wider">UCC128</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[8px] uppercase tracking-wider text-black/60">Pallet ID</div>
                  <div className="text-sm font-bold">{pallet.id}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-wider text-black/60">Order</div>
                  <div className="text-sm font-bold">{pallet.orderId}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-wider text-black/60">PO #</div>
                  <div className="text-xs">
                    {(() => {
                      const order = orders.find(o => o.id === pallet.orderId);
                      return order?.poNumber || "—";
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-wider text-black/60">SSCC-18</div>
                  <div className="text-xs">{pallet.sscc18}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[8px] uppercase tracking-wider text-black/60">UCC128 Barcode</div>
                  <div className="text-xs font-mono break-all bg-black/5 p-1 rounded">{pallet.ucc128Data}</div>
                </div>
              </div>
              {/* Mock barcode */}
              <div className="mt-3 flex h-16 items-end gap-px overflow-hidden rounded-sm bg-foreground/95 p-1.5">
                {Array.from({ length: 60 }).map((_, i) => (
                  <span
                    key={i}
                    className="bg-background"
                    style={{
                      width: ((i * 17 + pallet.id.charCodeAt(i % pallet.id.length)) % 4) + 1,
                      height: "100%",
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 text-center text-[10px] tracking-[0.2em]">
                {pallet.sscc18}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { onClose(); setPrintQueue([]); }}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => {
              toast.success("Labels queued", { description: `Sent to ZT411-DOCK-B · ${printQueue.length} labels` });
              setPrintQueue([]);
              onClose();
            }}
          >
            <Printer className="h-3.5 w-3.5" /> Print All Labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}