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
  pick_pick_ticket,
  unpick_order,
  ship_order,
  validateOrderForAllocation,
  validateOrderForDeallocation,
  validateOrderForPick,
  validateOrderForUnpick,
  validateOrderForShip,
} from "@/lib/allocation-engine";
import { fmtDateTime } from "@/lib/utils";
import { orders, type Order } from "@/lib/edi-data";
import {
  inventoryItems,
  clientAllocationConfigs,
  pickTickets,
  getClientAllocationConfig,
  DROP001_LOCATION,
  type PickTicket,
} from "@/lib/mock-data";

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
      if (!["ALLOCATED", "PICKED"].includes(o.status)) return false;
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

  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; message: string }>(
    {
      open: false,
      title: "",
      message: "",
    },
  );

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
      const result = await pick_pick_ticket(orderId);
      if (result.success) {
        toast.success(`Order ${orderId} picked`, {
          description: `Ticket #${result.pickTicketNum} · ${result.pickedLines.length} line(s) moved to DROP001`,
        });
      } else {
        showError("Pick Failed", result.error || "Unknown error");
      }
    } catch (e) {
      showError("Pick Error", (e as Error).message);
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
      } else {
        showError("Unpick Failed", result.error || "Unknown error");
      }
    } catch (e) {
      showError("Unpick Error", (e as Error).message);
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
      } else {
        showError("Ship Failed", result.error || "Unknown error");
      }
    } catch (e) {
      showError("Ship Error", (e as Error).message);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      new: "bg-muted text-muted-foreground border-border",
      ALLOCATED: "bg-chart-1/15 text-chart-1 border-chart-1/30",
      PICKED: "bg-chart-4/15 text-chart-4 border-chart-4/30",
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
                        : "—"}
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
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-xs text-muted-foreground">
                    No ALLOCATED or PICKED orders.
                  </TableCell>
                </TableRow>
              )}
              {activeOrders.map((o) => {
                const orderTickets = activeTickets.filter((pt) => pt.orderId === o.id);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs font-mono">{o.id}</TableCell>
                    <TableCell className="text-xs">{o.poNumber}</TableCell>
                    <TableCell className="text-xs">{o.tenantId.toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{o.warehouseId.toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{o.shipToName}</TableCell>
                    <TableCell className="text-xs">{o.carrier}</TableCell>
                    <TableCell className="text-xs">{orderTickets.length}</TableCell>
                    <TableCell>{statusBadge(o.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
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
                        {o.status === "PICKED" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1"
                              onClick={() => handleUnpick(o.id)}
                            >
                              <Undo2 className="h-3 w-3" /> Unpick
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-[11px] gap-1"
                              onClick={() => handleShip(o.id)}
                            >
                              <Truck className="h-3 w-3" /> Ship
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
                <TableHead className="text-[11px] text-right">Qty</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px]">Created</TableHead>
                <TableHead className="text-[11px]">Picked</TableHead>
                <TableHead className="text-[11px]">Closed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(livePickTickets.length ? livePickTickets : pickTickets).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="h-24 text-center text-xs text-muted-foreground"
                  >
                    No pick tickets generated yet.
                  </TableCell>
                </TableRow>
              )}
              {(livePickTickets.length ? livePickTickets : pickTickets)
                .slice()
                .sort((a, b) => b.pickTicketNum - a.pickTicketNum)
                .map((pt) => (
                  <TableRow key={`${pt.pickTicketNum}-${pt.sku}`}>
                    <TableCell className="text-xs font-mono">#{pt.pickTicketNum}</TableCell>
                    <TableCell className="text-xs font-mono">{pt.orderId}</TableCell>
                    <TableCell className="text-xs">{pt.sku}</TableCell>
                    <TableCell className="text-xs">{pt.palletId}</TableCell>
                    <TableCell className="text-xs">{pt.fromLocation}</TableCell>
                    <TableCell className="text-xs text-right">{pt.quantityToPick}</TableCell>
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
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

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
    </div>
  );
}
