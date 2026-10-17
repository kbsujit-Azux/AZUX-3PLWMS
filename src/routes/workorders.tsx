import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Container, Truck, Ship, Hash, Calendar, Check, Edit, X, AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { type WorkOrder, type WorkOrderStatus, closeInboundShipment } from "@/lib/inbound-data";
import { useWmsData } from "@/components/db-context";
import { deleteWorkOrder, updateWorkOrder, updateInboundShipmentRecord } from "@/lib/firestore-data";
import { type InboundShipment } from "@/lib/inbound-data";
import { inventoryItems } from "@/lib/mock-data";

export const Route = createFileRoute("/workorders")({
  head: () => ({
    meta: [
      { title: "Work Orders — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content: "Container management dashboard - track work orders from arrival to departure.",
      },
    ],
  }),
  component: WorkOrdersPage,
});

const statusColors: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  at_dock: "bg-primary/15 text-primary border-primary/30",
  unloading: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  departed: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  closed: "bg-green-500/15 text-green-600 border-green-500/30",
};

function WorkOrdersPage() {
  const [query, setQuery] = useState("");
  const [workOrderToDelete, setWorkOrderToDelete] = useState<WorkOrder | null>(null);
  const [workOrderToEdit, setWorkOrderToEdit] = useState<WorkOrder | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<WorkOrder>>({});

  const { workOrders, inboundShipments } = useWmsData();

  const filtered = useMemo(() => {
    if (!workOrders) return [];
    return workOrders.filter((w) => {
      if (query) {
        const q = query.toLowerCase();
        const blob = `${w.woNumber} ${w.clientName} ${w.containerNumber} ${w.carrier}`.toLowerCase();
        return blob.includes(q);
      }
      return true;
    });
  }, [workOrders, query]);

  const stats = useMemo(() => {
    if (!workOrders) return { scheduled: 0, atDock: 0, unloading: 0, received: 0, departed: 0 };
    return {
      scheduled: workOrders.filter((w) => w.status === "scheduled").length,
      atDock: workOrders.filter((w) => w.status === "at_dock").length,
      unloading: workOrders.filter((w) => w.status === "unloading").length,
      received: workOrders.filter((w) => w.status === "received").length,
      departed: workOrders.filter((w) => w.status === "departed").length,
    };
  }, [workOrders]);

  const hasPalletsBuilt = (wo: WorkOrder) => {
    if (!inboundShipments) return false;
    const relatedInbounds = inboundShipments.filter((s) => s.workOrderId === wo.id);
    return relatedInbounds.some((s) => s.lines && s.lines.some((l) => l.palletIds && l.palletIds.length > 0));
  };

  const getCasePackForSku = (sku: string, tenantId: string): number => {
    if (!sku) return 1;
    const item = inventoryItems?.find?.((i) => i.sku === sku && i.tenantId === tenantId);
    return item?.caseQty || 1;
  };

  const displayCartons = (wo: WorkOrder): number => {
    if (!wo) return 0;
    if (wo.totalCartons > 0) return wo.totalCartons;
    
    if (wo.lines?.length > 0) {
      let sum = 0;
      for (const line of wo.lines) {
        if (line.cartons > 0) {
          sum += line.cartons;
        } else if (line.sku && line.qtyExpected > 0) {
          const cp = getCasePackForSku(line.sku, wo.tenantId);
          sum += Math.ceil(line.qtyExpected / cp);
        }
      }
      if (sum > 0) return sum;
    }
    
    return Math.max(1, Math.ceil((wo.totalUnits ?? 0) / 1));
  };

  const canEdit = (wo: WorkOrder) => ["scheduled", "at_dock", "unloading"].includes(wo.status);
  const canDelete = (wo: WorkOrder) => wo.status === "scheduled";

  const statusTransitions: Record<WorkOrderStatus, WorkOrderStatus | null> = {
    scheduled: "at_dock",
    at_dock: "unloading",
    unloading: "received",
    received: "departed",
    departed: "closed",
    closed: null,
  };

  const getInboundIdForWO = (woId: string): string | undefined => {
    return inboundShipments?.find((s) => s.workOrderId === woId)?.id;
  };

  const canTransitionTo = (wo: WorkOrder, target: WorkOrderStatus): boolean => {
    if (statusTransitions[wo.status as WorkOrderStatus] !== target) return false;
    if (target === "unloading" || target === "received") {
      return hasPalletsBuilt(wo);
    }
    if (target === "closed") {
      const inboundId = getInboundIdForWO(wo.id);
      if (!inboundId) return false;
      const inbound = inboundShipments?.find((s) => s.id === inboundId);
      if (!inbound) return false;
      return inbound.lines && inbound.lines.every((l) => l.palletIds && l.palletIds.length > 0);
    }
    return true;
  };

  const handleStatusTransition = async (wo: WorkOrder, newStatus: WorkOrderStatus) => {
    try {
      await updateWorkOrder(wo.id, { status: newStatus });
      toast.success(`Work order status: ${newStatus.replace("_", " ")}`);

      const inboundId = getInboundIdForWO(wo.id);
      if (inboundId) {
        const inbound = inboundShipments?.find((s) => s.id === inboundId);
        if (inbound && newStatus !== inbound.status) {
          await updateInboundShipmentRecord(inboundId, {
            ...inbound,
            status: newStatus as any,
          });
        }
      }
    } catch (e: unknown) {
      toast.error(`Failed to update status: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCloseContainer = async (wo: WorkOrder) => {
    const inboundId = getInboundIdForWO(wo.id);
    if (!inboundId) {
      toast.error("No linked inbound shipment found");
      return;
    }
    const inbound = inboundShipments?.find((s) => s.id === inboundId);
    if (!inbound) {
      toast.error("Linked inbound shipment not found");
      return;
    }

    try {
      const receipt = closeInboundShipment(inbound, [], []);
      await updateWorkOrder(wo.id, { status: "closed" });
      await updateInboundShipmentRecord(inboundId, {
        ...inbound,
        status: "received",
        receivedAt: receipt.closedAt,
      });
      toast.success(`Container closed - EDI 944 queued for transmission`);
    } catch (e: unknown) {
      toast.error(`Failed to close: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const openEditDialog = (wo: WorkOrder) => {
    setWorkOrderToEdit(wo);
    setEditFormData({
      clientName: wo.clientName,
      containerNumber: wo.containerNumber,
      trailerNumber: wo.trailerNumber,
      carrier: wo.carrier,
      poNumber: wo.poNumber,
    });
  };

  const handleEdit = async () => {
    if (!workOrderToEdit) return;
    try {
      const cleanUpdates = Object.fromEntries(
        Object.entries(editFormData).filter(([_, v]) => v !== undefined && v !== "")
      );
      if (Object.keys(cleanUpdates).length === 0) {
        toast.warning("No changes to save");
        return;
      }
      await updateWorkOrder(workOrderToEdit.id, cleanUpdates);
      toast.success("Work order updated");
      setWorkOrderToEdit(null);
      setEditFormData({});
    } catch (e: unknown) {
      toast.error(`Failed to update: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!workOrderToDelete) return;
    try {
      await deleteWorkOrder(workOrderToDelete.id);
      toast.success("Work order deleted");
      setWorkOrderToDelete(null);
    } catch (e: unknown) {
      toast.error(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Work Orders · Container Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track containers from inbound entry through departure
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/inbound">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              Inbound Shipments
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={Container} label="Scheduled" value={stats.scheduled} />
        <StatCell icon={Truck} label="At Dock" value={stats.atDock} />
        <StatCell icon={Calendar} label="Unloading" value={stats.unloading} />
        <StatCell icon={Check} label="Received" value={stats.received} />
        <StatCell icon={Ship} label="Departed" value={stats.departed} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search WO#, client, container, carrier..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-md border border-border bg-card py-10 text-center text-xs text-muted-foreground">
            No work orders match the current filter.
          </div>
        )}
        {filtered.map((w) => {
          const hasActions = canEdit(w) || canDelete(w) || (statusTransitions[w.status] && hasPalletsBuilt(w));
          return (
            <div key={w.id} className="rounded-md border border-border bg-card overflow-hidden">
              <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border bg-muted/20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold">{w.woNumber}</span>
                    <span
                      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColors[w.status]}`}
                    >
                      {w.status.replace("_", " ")}
                    </span>
                    {hasActions && (
                      <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-[11px]">
                    <KeyVal label="Client" value={w.clientName} />
                    <KeyVal icon={Container} label="Container" value={w.containerNumber} />
                    <KeyVal icon={Truck} label="Trailer" value={w.trailerNumber} />
                    <KeyVal icon={Ship} label="Carrier" value={w.carrier} />
                    <KeyVal icon={Ship} label="Vessel" value={w.vessel} />
                    <KeyVal icon={Hash} label="Voyage" value={w.voyageNumber} />
                    <KeyVal icon={Calendar} label="Arrival" value={w.arrivalDate ? new Date(w.arrivalDate).toLocaleDateString() : "—"} />
                    <KeyVal label="PO" value={w.poNumber} />
                  </div>
                </div>
                <div className="w-48 shrink-0 flex flex-col gap-2">
                  <div className="text-right text-[10px] text-muted-foreground">
                    <span className="tabular-nums text-foreground">{w.totalUnits}</span>
                    <div className="text-xs">units</div>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <span className="tabular-nums text-foreground">{displayCartons(w)}</span>
                    <div className="text-xs">cartons</div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    {canEdit(w) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => openEditDialog(w)}
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                    )}
                    {canDelete(w) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => setWorkOrderToDelete(w)}
                      >
                        <X className="h-3 w-3" />
                        Delete
                      </Button>
                    )}
                    {statusTransitions[w.status as WorkOrderStatus] && hasPalletsBuilt(w) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => handleStatusTransition(w, statusTransitions[w.status as WorkOrderStatus]!)}
                      >
                        <ChevronRight className="h-3 w-3" />
                        {w.status === "at_dock" ? "Mark Arrived" : w.status === "unloading" ? "Start Unload" : w.status === "received" ? "Mark Departed" : "Close"}
                      </Button>
                    )}
                    {w.status === "received" && hasPalletsBuilt(w) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => handleCloseContainer(w)}
                      >
                        <Check className="h-3 w-3" />
                        Close
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {workOrderToDelete && (
        <AlertDialog open={!!workOrderToDelete} onOpenChange={(o) => !o && setWorkOrderToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Work Order?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the work order &quot;
                {workOrderToDelete.woNumber} &quot;. This action cannot be undone.
                <br />
                <br />
                Only scheduled work orders with no pallet builds can be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setWorkOrderToDelete(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete Work Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {workOrderToEdit && (
        <EditWorkOrderDialog
          open={!!workOrderToEdit}
          onOpenChange={(o) => !o && setWorkOrderToEdit(null)}
          workOrder={workOrderToEdit}
          editFormData={editFormData}
          setEditFormData={setEditFormData}
          onEdited={handleEdit}
        />
      )}
    </div>
  );
}

function StatCell({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function KeyVal({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground shrink-0" />}
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  );
}

function EditWorkOrderDialog({
  open,
  onOpenChange,
  workOrder,
  editFormData,
  setEditFormData,
  onEdited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: WorkOrder | null;
  editFormData: Partial<WorkOrder>;
  setEditFormData: (data: Partial<WorkOrder>) => void;
  onEdited: () => void;
}) {
  if (!workOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Work Order</DialogTitle>
          <DialogDescription>
            Edit details for {workOrder.woNumber}. Changes will sync to related inbound shipment.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Header Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px]">Client</Label>
                <Input
                  value={editFormData.clientName || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, clientName: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Container Number</Label>
                <Input
                  value={editFormData.containerNumber || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, containerNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Trailer Number</Label>
                <Input
                  value={editFormData.trailerNumber || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, trailerNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Carrier</Label>
                <Input
                  value={editFormData.carrier || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, carrier: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">PO Number</Label>
                <Input
                  value={editFormData.poNumber || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, poNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Seal Number</Label>
                <Input
                  value={editFormData.sealNumber || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, sealNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">BOL Number</Label>
                <Input
                  value={editFormData.bolNumber || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, bolNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Vessel</Label>
                <Input
                  value={editFormData.vessel || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, vessel: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Voyage</Label>
                <Input
                  value={editFormData.voyageNumber || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, voyageNumber: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Yard In Date</Label>
                <Input
                  type="datetime-local"
                  value={editFormData.yardInDate || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, yardInDate: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Yard Leave Date</Label>
                <Input
                  type="datetime-local"
                  value={editFormData.departureDate || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, departureDate: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Totals
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px]">Total Units</Label>
                <Input
                  type="number"
                  value={editFormData.totalUnits ?? workOrder.totalUnits}
                  onChange={(e) => setEditFormData({ ...editFormData, totalUnits: parseInt(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Total Cartons (auto)</Label>
                <Input
                  type="number"
                  value={displayCartons(workOrder)}
                  readOnly
                  className="h-8 text-xs bg-muted/50"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => {
            onEdited();
            onOpenChange(false);
          }}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WorkOrdersPage;