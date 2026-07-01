import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  PackageCheck,
  PackageSearch,
  AlertTriangle,
  Truck,
  Undo2,
  ClipboardList,
  Layers,
  Eye,
  Package,
  Boxes,
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
import {
  allocate_order,
  deallocate_order,
  unpick_order,
  ship_order,
  validateOrderForAllocation,
  validateOrderForDeallocation,
  validateOrderForPick,
  validateOrderForUnpick,
  validateOrderForShip,
} from "@/lib/allocation-engine";
import {
  executeDirectedPick,
  executeManualPick,
  updateOrder,
  syncOrderStatusFromPickTickets,
  getNextPickTicketSeq,
  reallocatePickTicket,
  createOutboundPallets,
  updateOutboundPallet,
  createShipmentRecord,
  doc,
  setDoc,
  updateDoc,
} from "@/lib/firestore-data";
import { db } from "@/lib/firestore";
import {
  createOutboundPalletFromInput,
  type OutboundPallet,
  type OutboundPalletCreateInput,
} from "@/lib/outbound-pallet-data";
import type { PickTicket } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/allocation")({
  head: () => ({
    meta: [
      { title: "Allocation Lifecycle — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Order allocation, pick ticket generation, picking, unpicking, and shipping lifecycle.",
      },
    ],
  }),
  component: AllocationPage,
});

type Tab = "allocate" | "pick" | "history";

function AllocationPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const {
    orders: liveOrders,
    pickTickets: livePickTickets,
    clientAllocationConfigs: liveConfigs,
    refreshData,
  } = useWmsData();
  const [tab, setTab] = useState<Tab>("allocate");
  const [search, setSearch] = useState("");

  const orders = useMemo(() => (liveOrders.length ? liveOrders : []), [liveOrders]);
  const pickTickets = useMemo(
    () => (livePickTickets.length ? livePickTickets : []),
    [livePickTickets],
  );
  const clientAllocationConfigs = useMemo(
    () => (liveConfigs.length ? liveConfigs : []),
    [liveConfigs],
  );

  const configMap = useMemo(() => {
    const m = new Map<string, (typeof clientAllocationConfigs)[number]>();
    for (const c of clientAllocationConfigs) {
      m.set(c.tenantId, c);
    }
    return m;
  }, [clientAllocationConfigs]);

  const allocatableOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== "new") return false;
      if (tenantId !== "all" && o.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && o.warehouseId !== warehouseId) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${o.id} ${o.poNumber} ${o.shipToName} ${o.carrier}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [orders, tenantId, warehouseId, search]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => {
      if (!["ALLOCATED", "PICKED", "OUTBOUND_PALLETIZED"].includes(o.status)) return false;
      if (tenantId !== "all" && o.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && o.warehouseId !== warehouseId) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${o.id} ${o.poNumber} ${o.shipToName} ${o.carrier}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [orders, tenantId, warehouseId, search]);

  const activeTickets = useMemo(() => {
    const orderIds = new Set(activeOrders.map((o) => o.id));
    return pickTickets.filter((pt) => orderIds.has(pt.orderId));
  }, [activeOrders, pickTickets]);

  const [detailDialog, setDetailDialog] = useState<{ open: boolean; orderId: string | null }>({
    open: false,
    orderId: null,
  });

  const [pickDialog, setPickDialog] = useState<{
    open: boolean;
    pickTicketNum: number;
    sku: string;
    palletId: string;
    fromLocation: string;
    qtyAllocated: number;
    qtyToPick: number;
  }>({
    open: false,
    pickTicketNum: 0,
    sku: "",
    palletId: "",
    fromLocation: "",
    qtyAllocated: 0,
    qtyToPick: 0,
  });

  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; message: string }>(
    {
      open: false,
      title: "",
      message: "",
    },
  );

  const [manualPickDialog, setManualPickDialog] = useState<{
    open: boolean;
    pickTicketNum: number;
    sku: string;
    palletId: string;
    fromLocation: string;
    qtyAllocated: number;
    qtyPicked: number;
    qtyToPick: number;
    orderId: string;
  }>({
    open: false,
    pickTicketNum: 0,
    sku: "",
    palletId: "",
    fromLocation: "",
    qtyAllocated: 0,
    qtyPicked: 0,
    qtyToPick: 0,
    orderId: "",
  });

  // Palletize dialog state
  const [palletizeOpen, setPalletizeOpen] = useState<{ open: boolean; orderId: string | null }>({
    open: false,
    orderId: null,
  });
  const [palletCount, setPalletCount] = useState(1);
  const [isPalletizing, setIsPalletizing] = useState(false);

  const showError = (title: string, message: string) => {
    setErrorDialog({ open: true, title, message });
  };

  const handleAllocate = async (orderId: string) => {
    try {
      const order = validateOrderForAllocation(orderId);
      if (!order) {
        showError("Validation Failed", `Order ${orderId} not found or invalid.`);
        return;
      }
      const result = await allocate_order(orderId);
      if (result.success) {
        toast.success(`Order ${orderId} allocated`, {
          description: `Pick Ticket #${result.pickTicketNum} · ${result.allocatedLines.length} line(s)`,
        });
      } else {
        showError("Allocation Failed", result.error || "Unknown error");
      }
    } catch (e) {
      showError("Allocation Error", (e as Error).message);
    }
  };

  const handleDeallocate = async (orderId: string) => {
    try {
      const order = validateOrderForDeallocation(orderId);
      if (!order) {
        showError("Validation Failed", `Order ${orderId} not found or not in ALLOCATED.`);
        return;
      }
      const result = await deallocate_order(orderId);
      if (result.success) {
        toast.success(`Order ${orderId} deallocated`, {
          description: `${result.deallocatedLines.length} line(s) reverted to NEW`,
        });
      } else {
        showError("Deallocation Failed", result.error || "Unknown error");
      }
    } catch (e) {
      showError("Deallocation Error", (e as Error).message);
    }
  };

  const handlePick = async (orderId: string) => {
    try {
      const order = validateOrderForPick(orderId);
      if (!order) {
        showError("Validation Failed", `Order ${orderId} not found or not in ALLOCATED.`);
        return;
      }
      // Find all GENERATED pick tickets for this order and execute directed pick
      const pts = pickTickets.filter((pt) => pt.orderId === orderId && pt.status === "GENERATED");
      if (pts.length === 0) {
        showError("Validation Failed", `No GENERATED pick tickets found for order ${orderId}.`);
        return;
      }

      // Execute directed pick for each ticket
      const results = await Promise.all(
        pts.map((pt) =>
          executeDirectedPick(
            pt.pickTicketNum,
            pt.quantityToPick,
            pt.palletId,
            pt.fromLocation,
            "allocation-ui",
          ),
        ),
      );

      if (results.every((r) => r.success)) {
        await syncOrderStatusFromPickTickets(orderId);
        toast.success(`Order ${orderId} picked`, {
          description: `${pts.length} ticket(s) moved to DROP001`,
        });
      } else {
        showError("Pick Failed", results.find((r) => !r.success)?.message || "Unknown error");
      }
    } catch (e) {
      showError("Pick Error", e instanceof Error ? e.message : "Unknown error");
    }
  };

  const handlePickSingleTicket = async (
    pickTicketNum: number,
    qty: number,
    palletId: string,
    location: string,
    sku: string,
  ) => {
    setPickDialog({
      open: true,
      pickTicketNum,
      qtyAllocated: qty,
      palletId,
      fromLocation: location,
      qtyToPick: qty,
      sku,
    });
  };

  const handleConfirmPick = async () => {
    const { pickTicketNum, qtyToPick, palletId, fromLocation } = pickDialog;
    if (qtyToPick <= 0 || qtyToPick > pickDialog.qtyAllocated) {
      showError("Invalid Quantity", "Pick quantity must be between 1 and allocated amount.");
      return;
    }
    try {
      const result = await executeDirectedPick(
        pickTicketNum,
        qtyToPick,
        palletId,
        fromLocation,
        "allocation-ui",
      );
      if (result.success) {
        toast.success(`Pick ticket #${pickTicketNum} executed`, {
          description: `${qtyToPick} units moved to DROP001`,
        });
        if (qtyToPick < pickDialog.qtyAllocated) {
          const remaining = pickDialog.qtyAllocated - qtyToPick;
          const newTicketNum = await getNextPickTicketSeq();
          const ptRef = doc(db, "pickTickets", newTicketNum.toString());
          await setDoc(ptRef, {
            pickTicketNum: newTicketNum,
            orderId: pickTickets.find((pt) => pt.pickTicketNum === pickTicketNum)?.orderId,
            sku: pickDialog.sku,
            palletId: "",
            fromLocation: "",
            quantityToPick: remaining,
            status: "GENERATED",
            createdAt: new Date().toISOString(),
          });
          const realloc = await reallocatePickTicket(newTicketNum, "allocation-ui");
          if (realloc) {
            toast.info(`Remaining ${remaining} units reallocated`, {
              description: `PT-${newTicketNum} → ${realloc.palletId}/${realloc.location}`,
            });
          } else {
            toast.error(`No other location found in the warehouse to fulfill order`, {
              description: `Please cycle count and manual pick remaining ${remaining} units for PT-${newTicketNum}`,
            });
          }
        }
        const orderId = pickTickets.find((pt) => pt.pickTicketNum === pickTicketNum)?.orderId;
        if (orderId) {
          await syncOrderStatusFromPickTickets(orderId);
          const refreshedOrder = pickTickets.find((pt) => pt.pickTicketNum === pickTicketNum);
          if (refreshedOrder && refreshedOrder.orderId) {
            const allPickedForOrder = pickTickets.every(
              (pt) => pt.orderId !== refreshedOrder.orderId || pt.status === "PICKED",
            );
            if (allPickedForOrder) {
              toast.success(`Order ${refreshedOrder.orderId} fully picked`, {
                description: "All items moved to staging",
              });
            }
          }
        }
        refreshData();
      } else {
        showError("Pick Failed", result.message || "Unknown error");
      }
    } catch (e) {
      showError("Pick Error", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPickDialog({
        open: false,
        pickTicketNum: 0,
        sku: "",
        palletId: "",
        fromLocation: "",
        qtyAllocated: 0,
        qtyToPick: 0,
      });
    }
  };

  const handleUnpick = async (orderId: string) => {
    try {
      const order = validateOrderForUnpick(orderId);
      if (!order) {
        showError("Validation Failed", `Order ${orderId} not found or not in PICKED.`);
        return;
      }
      const result = await unpick_order(orderId);
      if (result.success) {
        toast.success(`Order ${orderId} unpicked`, {
          description: `Ticket #${result.pickTicketNum} · ${result.unpickedLines.length} line(s) returned`,
        });
        await syncOrderStatusFromPickTickets(orderId);
      } else {
        showError("Unpick Failed", result.error || "Unknown error");
      }
    } catch (e) {
      showError("Unpick Error", e instanceof Error ? e.message : "Unknown error");
    }
  };

  const handleShip = async (orderId: string) => {
    try {
      const order = validateOrderForShip(orderId);
      if (!order) {
        showError("Validation Failed", `Order ${orderId} not found or not in PICKED.`);
        return;
      }
      const result = await ship_order(orderId);
      if (result.success) {
        toast.success(`Order ${orderId} shipped`, {
          description: `BOL ${result.bolNumber} · Ticket #${result.pickTicketNum} closed`,
        });
        await syncOrderStatusFromPickTickets(orderId);
      } else {
        showError("Ship Failed", result.error || "Unknown error");
      }
    } catch (e) {
      showError("Ship Error", e instanceof Error ? e.message : "Unknown error");
    }
  };

  const handlePalletize = async (orderId: string) => {
    setPalletizeOpen({ open: true, orderId });
    setPalletCount(1);
  };

  const confirmPalletize = async () => {
    if (!palletizeOpen.orderId) return;
    setIsPalletizing(true);
    try {
      const order = orders.find((o) => o.id === palletizeOpen.orderId);
      if (!order) {
        showError("Error", "Order not found");
        return;
      }

      const orderTickets = pickTickets.filter((pt) => pt.orderId === order.id);
      const lines: OutboundPalletCreateInput["lines"] = orderTickets.map((pt) => ({
        sku: pt.sku,
        description: pt.sku,
        unitsPicked: pt.qtyPicked || pt.quantityToPick,
        caseQty: 1,
        weightLbs: 0,
        pickTicketNum: pt.pickTicketNum,
      }));

      const totalUnits = lines.reduce((s, l) => s + l.unitsPicked, 0);
      const recommendedPallets = Math.max(1, Math.ceil(totalUnits / 480));
      const finalPalletCount = Math.max(1, Math.min(recommendedPallets, palletCount));

      const input: OutboundPalletCreateInput = {
        orderId: order.id,
        tenantId: order.tenantId,
        warehouseId: order.warehouseId,
        totalPallets: finalPalletCount,
        lines,
      };

      const outboundPallets: OutboundPallet[] = [];
      for (let i = 1; i <= finalPalletCount; i++) {
        outboundPallets.push(createOutboundPalletFromInput(input, i));
      }

      await createOutboundPallets(outboundPallets);

      for (const pt of orderTickets) {
        await updateDoc(doc(db, "pickTickets", pt.pickTicketNum.toString()), {
          status: "CLOSED",
          closedAt: new Date().toISOString(),
        });
      }

      const firstPallet = outboundPallets[0];
      const shipmentId = `SHP-${firstPallet.sscc18.slice(-8)}`;
      const totalWeight = outboundPallets.reduce(
        (s, p) => s + p.lines.reduce((ls, l) => ls + l.weightLbs, 0),
        0,
      );
      const totalCartons = outboundPallets.reduce(
        (s, p) => s + p.lines.reduce((ls, l) => ls + Math.ceil(l.unitsPicked / Math.max(1, l.caseQty)), 0),
        0,
      );

      await createShipmentRecord({
        id: shipmentId,
        bolId: "",
        orderIds: [order.id],
        tenantId: order.tenantId,
        warehouseId: order.warehouseId,
        carrier: order.carrier,
        scac: "",
        serviceLevel: order.serviceLevel,
        mode: "LTL",
        status: "staged",
        dockDoor: "D-00",
        appointmentAt: new Date().toISOString(),
        trailerNumber: "",
        sealNumber: "",
        proNumber: "",
        shipTo: order.shipToName,
        pallets: outboundPallets.length,
        cartons: totalCartons,
        weightLbs: Math.round(totalWeight * 10) / 10,
        declaredValue: order.lines.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0),
      });

      for (const pallet of outboundPallets) {
        await updateOutboundPallet(pallet.id, {
          status: "staged",
          shipmentId,
        });
      }

      await updateOrder(order.id, { status: "OUTBOUND_PALLETIZED" });

      toast.success(`Order ${order.id} palletized`, {
        description: `${outboundPallets.length} O/B pallet(s) · ${shipmentId}`,
      });

      setPalletizeOpen({ open: false, orderId: null });
      refreshData();
    } catch (e) {
      showError("Palletize Error", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsPalletizing(false);
    }
  };

  const handleOpenManualPick = (pt: PickTicket) => {
    const picked = pt.qtyPicked ?? (pt.status === "PICKED" ? pt.quantityToPick : 0);
    setManualPickDialog({
      open: true,
      pickTicketNum: pt.pickTicketNum,
      sku: pt.sku,
      palletId: pt.palletId,
      fromLocation: pt.fromLocation,
      qtyAllocated: pt.quantityToPick,
      qtyPicked: picked,
      qtyToPick: pt.quantityToPick - picked,
      orderId: pt.orderId,
    });
  };

  const handleConfirmManualPick = async () => {
    const { sku, palletId, fromLocation, qtyAllocated, qtyPicked, qtyToPick, orderId } =
      manualPickDialog;
    const remaining = qtyAllocated - qtyPicked;
    if (qtyToPick <= 0 || qtyToPick > remaining) {
      showError("Invalid Quantity", `Pick quantity must be between 1 and ${remaining}.`);
      return;
    }
    try {
      const result = await executeManualPick({
        orderId,
        sku,
        palletId,
        location: fromLocation,
        qtyPicked: qtyToPick,
        user: "allocation-ui",
      });
      if (result.success) {
        toast.success(`Manual pick PT-${result.pickTicketNum} created`, {
          description: `${qtyToPick} units moved to DROP001`,
        });
        await syncOrderStatusFromPickTickets(orderId);
        refreshData();
      }
    } catch (e) {
      showError("Manual Pick Error", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setManualPickDialog({
        open: false,
        pickTicketNum: 0,
        sku: "",
        palletId: "",
        fromLocation: "",
        qtyAllocated: 0,
        qtyPicked: 0,
        qtyToPick: 0,
        orderId: "",
      });
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      new: "bg-muted text-muted-foreground border-border",
      ALLOCATED: "bg-chart-1/15 text-chart-1 border-chart-1/30",
      PICKED: "bg-chart-4/15 text-chart-4 border-chart-4/30",
      OUTBOUND_PALLETIZED: "bg-chart-5/15 text-chart-5 border-chart-5/30",
      released: "bg-primary/15 text-primary border-primary/30",
      picking: "bg-chart-2/15 text-chart-2 border-chart-2/30",
      packed: "bg-chart-4/15 text-chart-4 border-chart-4/30",
      shipped: "bg-chart-3/15 text-chart-3 border-chart-3/30",
      exception: "bg-destructive/15 text-destructive border-destructive/30",
    };
    return (
      <Badge variant="outline" className={`${map[status] || "bg-muted"} text-[11px]`}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Allocation Lifecycle</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Allocate → Pick → Unpick → Ship · DROP001 transitional staging
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={refreshData}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border">
        <Button
          variant={tab === "allocate" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setTab("allocate")}
        >
          <ClipboardList className="h-3.5 w-3.5" /> Allocate
        </Button>
        <Button
          variant={tab === "pick" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setTab("pick")}
        >
          <Layers className="h-3.5 w-3.5" /> Pick / Ship
        </Button>
        <Button
          variant={tab === "history" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setTab("history")}
        >
          <PackageSearch className="h-3.5 w-3.5" /> Pick Tickets
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search orders by ID, PO, ship-to, carrier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {tab === "allocate" && (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Order ID</TableHead>
                <TableHead className="text-[11px]">PO Number</TableHead>
                <TableHead className="text-[11px]">Client</TableHead>
                <TableHead className="text-[11px]">Warehouse</TableHead>
                <TableHead className="text-[11px]">Ship To</TableHead>
                <TableHead className="text-[11px]">Carrier</TableHead>
                <TableHead className="text-[11px] text-right">Lines</TableHead>
                <TableHead className="text-[11px] text-right">Units</TableHead>
                <TableHead className="text-[11px]">Alloc Strategy</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocatableOrders.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-24 text-center text-xs text-muted-foreground"
                  >
                    No NEW orders available for allocation.
                  </TableCell>
                </TableRow>
              )}
              {allocatableOrders.map((o) => {
                const config = configMap.get(o.tenantId);
                const totalUnits = o.lines.reduce((s, l) => s + l.qtyOrdered, 0);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs font-mono">{o.id}</TableCell>
                    <TableCell className="text-xs">{o.poNumber}</TableCell>
                    <TableCell className="text-xs">{o.tenantId.toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{o.warehouseId.toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{o.shipToName}</TableCell>
                    <TableCell className="text-xs">{o.carrier}</TableCell>
                    <TableCell className="text-xs text-right">{o.lines.length}</TableCell>
                    <TableCell className="text-xs text-right">{totalUnits}</TableCell>
                    <TableCell className="text-[11px]">
                      {config
                        ? `${config.strategy}${config.locationPrefix ? ` · prefix ${config.locationPrefix}` : ""}`
                        : "LIFO (default)"}
                    </TableCell>
                    <TableCell>{statusBadge(o.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => handleAllocate(o.id)}
                      >
                        <PackageCheck className="h-3 w-3" /> Allocate
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "pick" && (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Order ID</TableHead>
                <TableHead className="text-[11px]">PO Number</TableHead>
                <TableHead className="text-[11px]">Client</TableHead>
                <TableHead className="text-[11px]">Warehouse</TableHead>
                <TableHead className="text-[11px]">Ship To</TableHead>
                <TableHead className="text-[11px]">Carrier</TableHead>
                <TableHead className="text-[11px]">Tickets</TableHead>
                <TableHead className="text-[11px]">Pick Status</TableHead>
                <TableHead className="text-[11px] text-right">Allocated</TableHead>
                <TableHead className="text-[11px] text-right">Picked</TableHead>
                <TableHead className="text-[11px] text-right">Short</TableHead>
                <TableHead className="text-[11px]">Order Status</TableHead>
                <TableHead className="text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeOrders.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={13}
                    className="h-24 text-center text-xs text-muted-foreground"
                  >
                    No ALLOCATED or PICKED orders.
                  </TableCell>
                </TableRow>
              )}
              {activeOrders.map((o) => {
                const orderTickets = activeTickets.filter((pt) => pt.orderId === o.id);
                const allocatedUnits = orderTickets.reduce((s, pt) => s + pt.quantityToPick, 0);
                const pickedUnits = orderTickets
                  .filter((pt) => pt.status === "PICKED")
                  .reduce((s, pt) => s + pt.quantityToPick, 0);
                const shortUnits = allocatedUnits - pickedUnits;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs font-mono">{o.id}</TableCell>
                    <TableCell className="text-xs">{o.poNumber}</TableCell>
                    <TableCell className="text-xs">{o.tenantId.toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{o.warehouseId.toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{o.shipToName}</TableCell>
                    <TableCell className="text-xs">{o.carrier}</TableCell>
                    <TableCell className="text-xs">{orderTickets.length}</TableCell>
                    <TableCell className="text-[11px]">
                      {shortUnits > 0 ? (
                        <span className="text-destructive font-medium">SHORT</span>
                      ) : allocatedUnits > 0 && shortUnits === 0 ? (
                        <span className="text-green-600 font-medium">FULLY PICKED</span>
                      ) : (
                        <span className="text-yellow-600 font-medium">WIP</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-right tabular-nums">
                      {allocatedUnits}
                    </TableCell>
                    <TableCell className="text-[11px] text-right tabular-nums">
                      {pickedUnits}
                    </TableCell>
                    <TableCell className="text-[11px] text-right tabular-nums">
                      {shortUnits}
                    </TableCell>
                    <TableCell>{statusBadge(o.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px] gap-1"
                              onClick={() => setDetailDialog({ open: true, orderId: o.id })}
                            >
                              <Eye className="h-3 w-3" /> Details
                            </Button>
                            {o.status === "ALLOCATED" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] gap-1"
                                  onClick={() => handleDeallocate(o.id)}
                                >
                                  <Undo2 className="h-3 w-3" /> Deallocate
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] gap-1"
                                  onClick={() => handlePick(o.id)}
                                >
                                  <PackageSearch className="h-3 w-3" /> Pick
                                </Button>
                              </>
                            )}
                            {(o.status === "PICKED" || o.status === "OUTBOUND_PALLETIZED") && (
                              <>
                                {o.status === "PICKED" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px] gap-1"
                                    onClick={() => handleUnpick(o.id)}
                                  >
                                    <Undo2 className="h-3 w-3" /> Unpick
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] gap-1 bg-chart-4 hover:bg-chart-4/90"
                                  onClick={() => handlePalletize(o.id)}
                                >
                                  <Package className="h-3 w-3" />
                                  {o.status === "OUTBOUND_PALLETIZED" ? "Repalletize" : "Palletize O/B"}
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Ticket #</TableHead>
                <TableHead className="text-[11px]">Order ID</TableHead>
                <TableHead className="text-[11px]">SKU</TableHead>
                <TableHead className="text-[11px]">Pallet ID</TableHead>
                <TableHead className="text-[11px]">From Location</TableHead>
                <TableHead className="text-[11px] text-right">Allocated</TableHead>
                <TableHead className="text-[11px] text-right">Picked</TableHead>
                <TableHead className="text-[11px] text-right">Non-picked</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px]">Created</TableHead>
                <TableHead className="text-[11px]">Picked</TableHead>
                <TableHead className="text-[11px]">Closed</TableHead>
                <TableHead className="text-[11px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(livePickTickets.length ? livePickTickets : pickTickets).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={13}
                    className="h-24 text-center text-xs text-muted-foreground"
                  >
                    No pick tickets generated yet.
                  </TableCell>
                </TableRow>
              )}
              {(livePickTickets.length ? livePickTickets : pickTickets)
                .slice()
                .sort((a, b) => b.pickTicketNum - a.pickTicketNum)
                .map((pt) => {
                  const picked = pt.qtyPicked ?? (pt.status === "PICKED" ? pt.quantityToPick : 0);
                  const nonPicked = pt.quantityToPick - picked;
                  return (
                    <TableRow key={`${pt.pickTicketNum}-${pt.sku}`}>
                      <TableCell className="text-xs font-mono">#{pt.pickTicketNum}</TableCell>
                      <TableCell className="text-xs font-mono">{pt.orderId}</TableCell>
                      <TableCell className="text-xs">{pt.sku}</TableCell>
                      <TableCell className="text-xs">{pt.palletId}</TableCell>
                      <TableCell className="text-xs">{pt.fromLocation}</TableCell>
                      <TableCell className="text-xs text-right">{pt.quantityToPick}</TableCell>
                      <TableCell className="text-xs text-right">{picked}</TableCell>
                      <TableCell className="text-xs text-right">{nonPicked}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${
                            pt.status === "GENERATED"
                              ? "bg-muted text-muted-foreground border-border"
                              : pt.status === "PICKED"
                                ? "bg-chart-4/15 text-chart-4 border-chart-4/30"
                                : "bg-chart-3/15 text-chart-3 border-chart-3/30"
                          }`}
                        >
                          {pt.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px]">{fmtDateTime(pt.createdAt)}</TableCell>
                      <TableCell className="text-[11px]">
                        {pt.pickedAt ? fmtDateTime(pt.pickedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {pt.closedAt ? fmtDateTime(pt.closedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {pt.status === "GENERATED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] gap-1"
                            onClick={() =>
                              handlePickSingleTicket(
                                pt.pickTicketNum,
                                pt.quantityToPick,
                                pt.palletId,
                                pt.fromLocation,
                                pt.sku,
                              )
                            }
                          >
                            Pick
                          </Button>
                        )}
                        {pt.status === "GENERATED" && nonPicked > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] gap-1 text-destructive"
                            onClick={() => handleOpenManualPick(pt)}
                          >
                            Manual Pick
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pick Ticket Detail Dialog */}
      <Dialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-mono">
              Pick Tickets for {detailDialog.orderId}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Detailed view of all pick ticket lines for this order
            </DialogDescription>
          </DialogHeader>
          {detailDialog.orderId && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activeTickets
                .filter((pt) => pt.orderId === detailDialog.orderId)
                .sort((a, b) => a.pickTicketNum - b.pickTicketNum)
                .map((pt) => (
                  <div
                    key={`${pt.pickTicketNum}-${pt.sku}`}
                    className="border border-border rounded-md p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-medium">PT-{pt.pickTicketNum}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          pt.status === "GENERATED"
                            ? "bg-muted text-muted-foreground"
                            : pt.status === "PICKED"
                              ? "bg-chart-4/15 text-chart-4"
                              : "bg-chart-3/15 text-chart-3"
                        }`}
                      >
                        {pt.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">SKU:</span> {pt.sku}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pallet:</span> {pt.palletId}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Location:</span> {pt.fromLocation}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span> {pt.status}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Allocated:</span>{" "}
                        {pt.quantityToPick} units
                      </div>
                      <div>
                        <span className="text-muted-foreground">Picked:</span>{" "}
                        {pt.qtyPicked ?? (pt.status === "PICKED" ? pt.quantityToPick : 0)} units
                      </div>
                      <div>
                        <span className="text-muted-foreground">Non-picked:</span>{" "}
                        {pt.quantityToPick -
                          (pt.qtyPicked ?? (pt.status === "PICKED" ? pt.quantityToPick : 0))}{" "}
                        units
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>{" "}
                        {fmtDateTime(pt.createdAt)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Picked at:</span>{" "}
                        {pt.pickedAt ? fmtDateTime(pt.pickedAt) : "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Closed at:</span>{" "}
                        {pt.closedAt ? fmtDateTime(pt.closedAt) : "—"}
                      </div>
                    </div>
                    {pt.status === "GENERATED" && (
                      <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            handlePickSingleTicket(
                              pt.pickTicketNum,
                              pt.quantityToPick,
                              pt.palletId,
                              pt.fromLocation,
                              pt.sku,
                            )
                          }
                        >
                          Pick
                        </Button>
                        {pt.quantityToPick - (pt.qtyPicked ?? 0) > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-destructive"
                            onClick={() => handleOpenManualPick(pt)}
                          >
                            Manual Pick
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailDialog({ open: false, orderId: null })}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pick Confirmation Dialog */}
      <Dialog
        open={pickDialog.open}
        onOpenChange={(open) =>
          !open &&
          setPickDialog({
            open: false,
            pickTicketNum: 0,
            sku: "",
            palletId: "",
            fromLocation: "",
            qtyAllocated: 0,
            qtyToPick: 0,
          })
        }
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Confirm Pick: PT-{pickDialog.pickTicketNum}
            </DialogTitle>
            <DialogDescription className="text-xs">
              SKU: {pickDialog.sku} · From: {pickDialog.fromLocation} · Pallet:{" "}
              {pickDialog.palletId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">
                Qty to Pick (max {pickDialog.qtyAllocated})
              </label>
              <Input
                type="number"
                min={1}
                max={pickDialog.qtyAllocated}
                value={pickDialog.qtyToPick}
                onChange={(e) =>
                  setPickDialog((d) => ({ ...d, qtyToPick: parseInt(e.target.value) || 0 }))
                }
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPickDialog({
                  open: false,
                  pickTicketNum: 0,
                  sku: "",
                  palletId: "",
                  fromLocation: "",
                  qtyAllocated: 0,
                  qtyToPick: 0,
                })
              }
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmPick}>
              Confirm Pick
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog
        open={errorDialog.open}
        onOpenChange={(open) => setErrorDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive" /> {errorDialog.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-destructive whitespace-pre-wrap">
              {errorDialog.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setErrorDialog((d) => ({ ...d, open: false }))}
            >
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Pick Dialog */}
      <Dialog
        open={manualPickDialog.open}
        onOpenChange={(open) =>
          !open &&
          setManualPickDialog({
            open: false,
            pickTicketNum: 0,
            sku: "",
            palletId: "",
            fromLocation: "",
            qtyAllocated: 0,
            qtyPicked: 0,
            qtyToPick: 0,
            orderId: "",
          })
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Manual Pick</DialogTitle>
            <DialogDescription className="text-xs">
              PT-{manualPickDialog.pickTicketNum} · SKU: {manualPickDialog.sku}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Pallet ID</label>
                <Input
                  value={manualPickDialog.palletId}
                  onChange={(e) => setManualPickDialog((d) => ({ ...d, palletId: e.target.value }))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Location</label>
                <Input
                  value={manualPickDialog.fromLocation}
                  onChange={(e) =>
                    setManualPickDialog((d) => ({ ...d, fromLocation: e.target.value }))
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Remaining to pick:{" "}
              <span className="font-medium text-foreground">
                {manualPickDialog.qtyAllocated - manualPickDialog.qtyPicked} units
              </span>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">
                Qty to Pick (max {manualPickDialog.qtyAllocated - manualPickDialog.qtyPicked})
              </label>
              <Input
                type="number"
                min={1}
                max={manualPickDialog.qtyAllocated - manualPickDialog.qtyPicked}
                value={manualPickDialog.qtyToPick}
                onChange={(e) =>
                  setManualPickDialog((d) => ({
                    ...d,
                    qtyToPick: Math.min(
                      parseInt(e.target.value) || 0,
                      d.qtyAllocated - d.qtyPicked,
                    ),
                  }))
                }
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setManualPickDialog({
                  open: false,
                  pickTicketNum: 0,
                  sku: "",
                  palletId: "",
                  fromLocation: "",
                  qtyAllocated: 0,
                  qtyPicked: 0,
                  qtyToPick: 0,
                  orderId: "",
                })
              }
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmManualPick}>
              Confirm Manual Pick
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Palletize Dialog */}
      <Dialog
        open={palletizeOpen.open}
        onOpenChange={(open) => !open && setPalletizeOpen({ open: false, orderId: null })}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-mono flex items-center gap-2">
              <Package className="h-4 w-4 text-chart-4" />
              Palletize Order {palletizeOpen.orderId}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Create outbound pallets with UCC128 labels and mark order as O/B Pallet
            </DialogDescription>
          </DialogHeader>
          {palletizeOpen.orderId && (() => {
            const order = orders.find((o) => o.id === palletizeOpen.orderId);
            if (!order) return null;
            const orderTickets = pickTickets.filter((pt) => pt.orderId === order.id);
            const totalUnits = orderTickets.reduce((s, pt) => s + (pt.qtyPicked || pt.quantityToPick), 0);
            const recommendedPallets = Math.max(1, Math.ceil(totalUnits / 480));
            return (
              <div className="space-y-4">
                {/* Order Header */}
                <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Order #</div>
                    <div className="font-mono font-medium">{order.id}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">PO #</div>
                    <div className="font-mono">{order.poNumber}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Carrier</div>
                    <div>{order.carrier}</div>
                  </div>
                </div>

                {/* SKU Summary */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Picked Items</div>
                  <div className="rounded-md border border-border bg-card p-2 space-y-1 max-h-40 overflow-y-auto">
                    {orderTickets.map((pt) => (
                      <div key={pt.pickTicketNum} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                        <span className="font-mono text-[11px]">{pt.sku}</span>
                        <span className="tabular-nums">{pt.qtyPicked || pt.quantityToPick} units</span>
                        <span className="text-muted-foreground text-[10px]">PT-{pt.pickTicketNum}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pallet Count */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Number of Outbound Pallets
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={palletCount}
                      onChange={(e) => setPalletCount(parseInt(e.target.value) || 1)}
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="text-[10px] text-muted-foreground">
                      Recommended: {recommendedPallets} pallets (480 units/pallet max)<br/>
                      Total: {totalUnits} units across {orderTickets.length} SKU lines
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-dashed border-border bg-card p-3 text-[11px] text-muted-foreground">
                  This will:
                  <ul className="mt-1 space-y-1 ml-4 list-disc">
                    <li>Generate outbound pallet IDs with UCC128 SSCC-18 barcodes</li>
                    <li>Close all pick ticket(s) for this order</li>
                    <li>Create shipment record in "Staged" status</li>
                    <li>Change order status to O/B Pallet</li>
                  </ul>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPalletizeOpen({ open: false, orderId: null })}
              disabled={isPalletizing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={confirmPalletize}
              disabled={isPalletizing}
            >
              {isPalletizing ? "Creating..." : (
                <>
                  <Boxes className="h-3 w-3" /> Create O/B Pallets
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
