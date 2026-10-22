import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Container, Truck, Ship, Hash, Calendar, Check, Edit, X, AlertTriangle, ChevronRight, RefreshCw, MapPin, DoorOpen, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { type WorkOrder, type WorkOrderStatus, closeInboundShipment } from "@/lib/inbound-data";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { useWmsData } from "@/components/db-context";
import { autoBillContainer, resolveBillingClientId, findAutoInvoiceForContainer } from "@/lib/auto-billing";
import { deleteWorkOrder, updateWorkOrder, updateInboundShipmentRecord, mapWoStatusToInboundStatus } from "@/lib/firestore-data";
import { ContainerConfirmDialog } from "@/components/container-confirm-dialog";
import { inventoryItems } from "@/lib/mock-data";
import { useWorkspace } from "@/components/workspace-context";

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

const getCasePackForSku = (sku: string, tenantId: string): number => {
  if (!sku) return 1;
  const item = inventoryItems?.find?.((i) => i.sku === sku && i.tenantId === tenantId);
  return item?.caseQty || 1;
};

const displayCartons = (wo: WorkOrder): number => {
  if (!wo) return 0;
  if (wo.totalCartons > 0) return wo.totalCartons;

  if (Array.isArray(wo.lines) && wo.lines.length > 0) {
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

function WorkOrdersPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [workOrderToDelete, setWorkOrderToDelete] = useState<WorkOrder | null>(null);
  const [workOrderToEdit, setWorkOrderToEdit] = useState<WorkOrder | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<WorkOrder>>({});

  const { workOrders, inboundShipments, locationMaster, warehouses, pallets } = useWmsData();

  /**
   * The physical warehouses (EWR, ORD, ATL, LAX …) the container is booked
   * into. This is the site, not a rack slot.
   */
  const warehouseOptions = useMemo(() => {
    const all = (warehouses ?? []) as any[];
    return all.map((w) => ({
      id: w.id as string,
      code: (w.code ?? w.id) as string,
      city: (w.city ?? "") as string,
    }));
  }, [warehouses]);

  /**
   * The storage slots a work order can be assigned to — the live Location
   * Master, narrowed to the SELECTED warehouse.
   *
   * Staging/drop locations come first because a container that has not been
   * put away yet belongs in staging, not in a storage slot.
   */
  const warehouseLocationOptions = useMemo(() => {
    const all = (locationMaster ?? []) as any[];
    const wh = editFormData.warehouseId || workOrderToEdit?.warehouseId;
    const forWarehouse = wh ? all.filter((l) => l.warehouseId === wh) : all;
    const list = forWarehouse.length ? forWarehouse : all;
    const typeOrder: Record<string, number> = { DROP: 0, RACK: 1, FLR: 2 };
    return [...list]
      .sort(
        (a, b) =>
          (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) ||
          a.zone.localeCompare(b.zone) ||
          a.id.localeCompare(b.id),
      )
      .map((l) => ({
        id: l.id as string,
        zone: (l.zone ?? "") as string,
        warehouseId: l.warehouseId as string | undefined,
      }));
  }, [locationMaster, editFormData.warehouseId, workOrderToEdit?.warehouseId]);

  const filtered = useMemo(() => {
    if (!workOrders) return [];
    return workOrders
      .filter((w) => {
        if (tenantId !== "all" && w.tenantId !== tenantId) return false;
        if (warehouseId !== "all" && w.warehouseId !== warehouseId) return false;
        if (query) {
          const q = query.toLowerCase();
          const blob = `${w.woNumber} ${w.clientName} ${w.containerNumber} ${w.carrier}`.toLowerCase();
          return blob.includes(q);
        }
        return true;
      })
      .sort((a, b) => b.woNumber.localeCompare(a.woNumber));
  }, [workOrders, tenantId, warehouseId, query]);

  const stats = useMemo(() => {
    if (!filtered) return { scheduled: 0, atDock: 0, unloading: 0, received: 0, departed: 0 };
    return {
      scheduled: filtered.filter((w) => w.status === "scheduled").length,
      atDock: filtered.filter((w) => w.status === "at_dock").length,
      unloading: filtered.filter((w) => w.status === "unloading").length,
      received: filtered.filter((w) => w.status === "received").length,
      departed: filtered.filter((w) => w.status === "departed").length,
    };
  }, [filtered]);

  const hasPalletsBuilt = (wo: WorkOrder) => {
    if (!inboundShipments) return false;
    const relatedInbounds = inboundShipments.filter((s) => s.workOrderId === wo.id);
    return relatedInbounds.some((s) => Array.isArray(s.lines) && s.lines.some((l) => l.palletIds && l.palletIds.length > 0));
  };

  const canEdit = (wo: WorkOrder) => wo.status !== "closed";
  const canDelete = (wo: WorkOrder) => !hasPalletsBuilt(wo);

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
      return Array.isArray(inbound.lines) && inbound.lines.every((l) => l.palletIds && l.palletIds.length > 0);
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
        if (inbound) {
          // The work order and the container use different status
          // vocabularies, so translate before writing.
          const inboundStatus = mapWoStatusToInboundStatus(
            newStatus,
            inbound.status,
          );
          if (inboundStatus !== inbound.status) {
            await updateInboundShipmentRecord(inboundId, {
              ...inbound,
              status: inboundStatus,
            });
          }
        }
      }
    } catch (e: unknown) {
      toast.error(`Failed to update status: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** The container awaiting a close / depart confirmation. */
  const [confirmTarget, setConfirmTarget] = useState<{
    workOrder: WorkOrder;
    inbound: any;
    mode: "close" | "depart";
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  /** Open the confirmation for a close or a depart. */
  const openConfirm = (wo: WorkOrder, mode: "close" | "depart") => {
    const inboundId = getInboundIdForWO(wo.id);
    const inbound = inboundShipments?.find((s) => s.id === inboundId);
    if (!inbound) {
      toast.error("No linked inbound shipment found");
      return;
    }
    setConfirmTarget({ workOrder: wo, inbound, mode });
  };

  /** Perform the action the operator confirmed. */
  const runConfirmed = async (opts: {
    departDate?: string;
    acknowledged: boolean;
  }) => {
    if (!confirmTarget) return;
    const { workOrder, inbound, mode } = confirmTarget;
    setConfirmBusy(true);
    try {
      if (mode === "close") {
        const receipt = closeInboundShipment(inbound, [], []);
        await updateWorkOrder(workOrder.id, { status: "closed" });
        await updateInboundShipmentRecord(inbound.id, {
          ...inbound,
          status: "received",
          receivedAt: receipt.closedAt,
        });
        // Queue EDI 944
        const clientId = await resolveBillingClientId(inbound.tenantId);
        await addDoc(collection(db, "ediLogs"), {
          id: `EDI-944-${Date.now()}`,
          txn: "944",
          direction: "outbound",
          partner: inbound.partner ?? "SBX-PARTNER",
          documentRef: inbound.ediRef,
          tenantId: inbound.tenantId,
          warehouseId: inbound.warehouseId,
          isaControl: inbound.isaControl,
          gsControl: "944",
          segments: 10,
          bytes: 300,
          ackStatus: "AK",
          status: "processed",
          message: "EDI 944 generated on container close.",
          receivedAt: new Date().toISOString(),
        });
        // Auto-billing
        await autoBillContainer({
          clientId,
          tenantId: inbound.tenantId,
          warehouseId: inbound.warehouseId,
          shipmentId: inbound.id,
          poNumber: inbound.poNumber,
          containerNumber: inbound.containerNumber,
          trailerNumber: inbound.trailerNumber,
          units: (inbound.lines ?? []).reduce((a: number, l: any) => a + (l.qtyExpected || 0), 0),
          cartons: (inbound.lines ?? []).reduce((a: number, l: any) => a + (l.cartonsExpected || 0), 0),
          pallets: 0,
          closedAt: receipt.closedAt,
        });
        toast.success(`Container closed - EDI 944 queued and billed`);
      } else {
        const departedAt = opts.departDate
          ? new Date(`${opts.departDate}T12:00:00`).toISOString()
          : new Date().toISOString();
        await updateWorkOrder(workOrder.id, {
          status: "departed",
          departureDate: departedAt,
        });
        await updateInboundShipmentRecord(inbound.id, {
          ...inbound,
          status: "received",
          receivedAt: inbound.receivedAt ?? departedAt,
        });
        toast.success(`Container marked departed on ${opts.departDate}`);
      }
      setConfirmTarget(null);
    } catch (e: unknown) {
      toast.error(
        `Failed to ${mode === "close" ? "close" : "mark departed"}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      setConfirmBusy(false);
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
      sealNumber: wo.sealNumber,
      bolNumber: wo.bolNumber,
      vessel: wo.vessel,
      voyageNumber: wo.voyageNumber,
      yardInDate: wo.yardInDate ?? "",
      departureDate: wo.departureDate ?? "",
      warehouseId: wo.warehouseId,
      warehouseLocation: wo.warehouseLocation ?? "",
      doorAssigned: wo.doorAssigned ?? "",
    });
  };

  const handleEdit = async () => {
    if (!workOrderToEdit) return;
    try {
      // Empty strings are dropped, EXCEPT the warehouse location and door —
      // clearing those is a legitimate action.
      const cleanUpdates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(editFormData)) {
        if (v === undefined) continue;
        if (v === "") {
          if (k === "warehouseLocation" || k === "doorAssigned") cleanUpdates[k] = null;
          continue;
        }
        cleanUpdates[k] = v;
      }
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
          const hasActions = canEdit(w) || canDelete(w) || (statusTransitions[w.status as WorkOrderStatus] && hasPalletsBuilt(w));
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
                    <KeyVal
                      icon={Warehouse}
                      label="Warehouse"
                      value={w.warehouseId ? (warehouses.find((x) => x.id === w.warehouseId)?.code ?? w.warehouseId) : "—"}
                    />
                    <KeyVal
                      icon={MapPin}
                      label="Storage Slot"
                      value={w.warehouseLocation || "Unassigned"}
                    />
                    <KeyVal
                      icon={DoorOpen}
                      label="Door"
                      value={w.doorAssigned || "Unassigned"}
                    />
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
                        onClick={() => {
                          const next = statusTransitions[w.status as WorkOrderStatus]!;
                          // Departing is an irreversible event — confirm first.
                          if (next === "departed") {
                            openConfirm(w, "depart");
                            return;
                          }
                          handleStatusTransition(w, next);
                        }}
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
                        onClick={() => openConfirm(w, "close")}
                      >
                        <Check className="h-3 w-3" />
                        Close
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] gap-1"
                      onClick={async () => {
                        const inbound = inboundShipments?.find((s: any) => s.workOrderId === w.id);
                        const existing = await findAutoInvoiceForContainer(inbound?.id ?? w.id);
                        if (existing) {
                          toast.error("Invoice already exists for this container");
                          return;
                        }
                        const clientId = await resolveBillingClientId(w.tenantId);
                        const res = await autoBillContainer({
                          clientId,
                          tenantId: w.tenantId,
                          warehouseId: w.warehouseId,
                          shipmentId: inbound?.id ?? w.id,
                          poNumber: inbound?.poNumber ?? w.poNumber,
                          containerNumber: inbound?.containerNumber ?? w.containerNumber,
                          trailerNumber: inbound?.trailerNumber ?? w.trailerNumber,
                          units: (inbound?.lines ?? []).reduce((a: number, l: any) => a + (l.qtyExpected || 0), 0),
                          cartons: (inbound?.lines ?? []).reduce((a: number, l: any) => a + (l.cartonsExpected || 0), 0),
                          pallets: 0,
                          closedAt: new Date().toISOString(),
                        });
                        if (res.skipped) toast.error(res.skipped);
                        else toast.success(`Auto-billed: ${res.lines} lines, $${res.subtotal}`);
                      }}
                    >
                      Bill
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] gap-1"
                      onClick={async () => {
                        const inbound = inboundShipments?.find((s: any) => s.workOrderId === w.id);
                        await addDoc(collection(db, "ediLogs"), {
                          id: `EDI-944-${Date.now()}`,
                          txn: "944",
                          direction: "outbound",
                          partner: inbound?.partner ?? "SBX-PARTNER",
                          documentRef: inbound?.ediRef ?? w.woNumber,
                          tenantId: w.tenantId,
                          warehouseId: w.warehouseId,
                          isaControl: inbound?.isaControl ?? "999999998",
                          gsControl: "944",
                          segments: 10,
                          bytes: 300,
                          ackStatus: "AK",
                          status: "processed",
                          message: "Manual EDI 944 triggered from Work Order.",
                          receivedAt: new Date().toISOString(),
                        });
                        toast.success("EDI 944 generated");
                      }}
                    >
                      944
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Close / depart confirmation */}
      {confirmTarget && (
        <ContainerConfirmDialog
          open={!!confirmTarget}
          onOpenChange={(o) => !o && setConfirmTarget(null)}
          mode={confirmTarget.mode}
          workOrder={confirmTarget.workOrder}
          inbound={confirmTarget.inbound}
          pallets={pallets ?? []}
          busy={confirmBusy}
          onConfirm={runConfirmed}
        />
      )}

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
          warehouseOptions={warehouseOptions}
          locationOptions={warehouseLocationOptions}
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
  warehouseOptions,
  locationOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: WorkOrder | null;
  editFormData: Partial<WorkOrder>;
  setEditFormData: (data: Partial<WorkOrder>) => void;
  onEdited: () => void;
  /** The physical warehouses the container can be booked into. */
  warehouseOptions?: { id: string; code: string; city: string }[];
  /** Live Location Master records the storage slot can be set to. */
  locationOptions?: { id: string; zone: string; warehouseId?: string }[];
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
              <div className="space-y-1">
                <Label className="text-[10px]">Warehouse</Label>
                <select
                  value={editFormData.warehouseId || ""}
                  onChange={(e) => {
                    const nextWarehouse = e.target.value;
                    setEditFormData({
                      ...editFormData,
                      warehouseId: nextWarehouse,
                      // The slot belongs to the old warehouse — clear it.
                      warehouseLocation: "",
                    });
                  }}
                  className="h-8 w-full text-xs rounded-md border border-input bg-background px-2"
                >
                  <option value="">Select warehouse…</option>
                  {warehouseOptions?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.city}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Storage Slot</Label>
                <select
                  value={editFormData.warehouseLocation || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, warehouseLocation: e.target.value })
                  }
                  className="h-8 w-full text-xs rounded-md border border-input bg-background px-2"
                  disabled={!editFormData.warehouseId}
                >
                  <option value="">Unassigned</option>
                  {locationOptions?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id} — {l.zone}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Door Assigned</Label>
                <Input
                  value={editFormData.doorAssigned || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, doorAssigned: e.target.value })}
                  className="h-8 text-xs font-mono"
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