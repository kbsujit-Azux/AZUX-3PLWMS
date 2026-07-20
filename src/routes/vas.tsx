import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Filter,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
  Eye,
  Trash2,
  PackageSearch,
  BarChart3,
  ClipboardList,
  ChevronRight,
  PlayCircle,
  PauseCircle,
  Package,
  DollarSign,
  Hash,
  Timer,
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useWorkspace } from "@/components/workspace-context";
import {
  vasWorkOrders,
  vasWorkOrderLines,
  vasProgressPct,
  vasPriorityColor,
  vasTypeLabel,
  vasStatusLabel,
  type VasWorkOrder,
  type VasWorkOrderLine,
  type VasWorkOrderType,
  type VasWorkOrderStatus,
} from "@/lib/vas-data";
import {
  fetchVasWorkOrders,
  subscribeVasWorkOrders,
  createVasWorkOrder,
  updateVasWorkOrder,
  deleteVasWorkOrder,
  fetchVasWorkOrderLines,
  subscribeVasWorkOrderLines,
} from "@/lib/firestore-data";
import { tenants, warehouses } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/vas")({
  head: () => ({
    meta: [
      { title: "VAS Work Orders — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Kitting, labeling, assembly, and value-added services work order management.",
      },
    ],
  }),
  component: VasPage,
});

function VasPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [workOrders, setWorkOrders] = useState<VasWorkOrder[]>([]);
  const [lines, setLines] = useState<VasWorkOrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<VasWorkOrder | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<VasWorkOrder | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const unsub = subscribeVasWorkOrders(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (o) => o.tenantId === tenantId && o.warehouseId === warehouseId,
          );
          setWorkOrders(filtered);
          setLoading(false);
        }
      },
      tenantId,
      warehouseId,
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (!selectedOrder) {
      setLines([]);
      return;
    }

    let cancelled = false;
    const unsub = subscribeVasWorkOrderLines((data) => {
      if (!cancelled) {
        setLines(data);
      }
    }, selectedOrder.id);

    return () => unsub();
  }, [selectedOrder]);

  const filteredOrders = useMemo(() => {
    return workOrders.filter((o) => {
      const matchesQuery =
        o.id.toLowerCase().includes(query.toLowerCase()) ||
        o.clientRef.toLowerCase().includes(query.toLowerCase()) ||
        o.assignedEmployee?.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesType = typeFilter === "all" || o.type === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [workOrders, query, statusFilter, typeFilter]);

  const handleCreateOrder = async (formData: {
    clientRef: string;
    type: VasWorkOrderType;
    priority: "standard" | "rush" | "same_day";
    scheduledStartAt: string;
    scheduledEndAt: string;
    assignedStation?: string;
    assignedEmployee?: string;
    outputSku?: string;
    outputQty?: number;
    billable: boolean;
    notes?: string;
  }) => {
    try {
      const id = await createVasWorkOrder({
        tenantId,
        warehouseId,
        clientRef: formData.clientRef,
        type: formData.type,
        status: "draft",
        priority: formData.priority,
        scheduledStartAt: formData.scheduledStartAt,
        scheduledEndAt: formData.scheduledEndAt,
        assignedStation: formData.assignedStation,
        assignedEmployee: formData.assignedEmployee,
        outputSku: formData.outputSku,
        outputQty: formData.outputQty,
        outputUom: "EA",
        billable: formData.billable,
        createdAt: new Date().toISOString(),
        createdBy: "current-user",
      });
      toast.success(`VAS work order ${id} created`);
      setNewOrderOpen(false);
    } catch (e) {
      toast.error("Failed to create work order");
      console.error(e);
    }
  };

  const handleUpdateStatus = async (order: VasWorkOrder, status: VasWorkOrderStatus) => {
    try {
      const updates: Partial<VasWorkOrder> = { status };
      if (status === "in_progress" && !order.startedAt) {
        updates.startedAt = new Date().toISOString();
      }
      if (status === "completed") {
        updates.completedAt = new Date().toISOString();
      }
      await updateVasWorkOrder(order.id, updates);
      toast.success(`Work order updated to ${vasStatusLabel(status)}`);
    } catch (e) {
      toast.error("Failed to update work order");
      console.error(e);
    }
  };

  const handleDeleteClick = (order: VasWorkOrder) => {
    setOrderToDelete(order);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return;
    try {
      await deleteVasWorkOrder(orderToDelete.id);
      if (selectedOrder?.id === orderToDelete.id) {
        setSelectedOrder(null);
        setLines([]);
      }
      toast.success("Work order deleted");
      setDeleteOpen(false);
      setOrderToDelete(null);
    } catch (e) {
      toast.error("Failed to delete work order");
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">VAS Work Orders</h1>
          <p className="text-sm text-muted-foreground">
            Kitting, labeling, assembly, and value-added services work order management.
          </p>
        </div>
        <Button size="sm" onClick={() => setNewOrderOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Work Order
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search work orders..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="exception">Exception</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="KITTING">Kitting</SelectItem>
            <SelectItem value="DEKITTING">De-Kitting</SelectItem>
            <SelectItem value="LABELING">Labeling</SelectItem>
            <SelectItem value="ASSEMBLY">Assembly</SelectItem>
            <SelectItem value="REPACK">Re-Pack</SelectItem>
            <SelectItem value="CUSTOM">Custom</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.map((order) => {
          const progress = vasProgressPct(order);
          return (
            <div
              key={order.id}
              className="rounded-lg border p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedOrder(order)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs font-semibold">{order.id}</span>
                </div>
                <div className="flex gap-1">
                  <Badge variant={vasPriorityColor(order.priority)}>{order.priority}</Badge>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {vasTypeLabel(order.type)}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Client Ref</span>
                  <span className="font-medium">{order.clientRef}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {vasStatusLabel(order.status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Assigned</span>
                  <span className="font-medium">{order.assignedEmployee || "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Station</span>
                  <span className="font-medium">{order.assignedStation || "—"}</span>
                </div>
                {order.estimatedCost && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Est. Cost</span>
                    <span className="font-medium">${order.estimatedCost.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-1">
                  {order.status === "draft" && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(order, "released");
                      }}
                    >
                      <PlayCircle className="mr-1 h-3 w-3" />
                      Release
                    </Button>
                  )}
                  {order.status === "released" && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(order, "in_progress");
                      }}
                    >
                      <PlayCircle className="mr-1 h-3 w-3" />
                      Start
                    </Button>
                  )}
                  {order.status === "in_progress" && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(order, "completed");
                      }}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Complete
                    </Button>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(order);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No VAS work orders found. Create one to get started.
        </div>
      )}

      {/* Detail Drawer */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  {selectedOrder?.id}
                </DialogTitle>
                <DialogDescription>
                  {vasTypeLabel(selectedOrder?.type || "KITTING")} —{" "}
                  {vasStatusLabel(selectedOrder?.status || "draft")}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                {selectedOrder?.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => selectedOrder && handleUpdateStatus(selectedOrder, "released")}
                  >
                    Release
                  </Button>
                )}
                {selectedOrder?.status === "released" && (
                  <Button
                    size="sm"
                    onClick={() => selectedOrder && handleUpdateStatus(selectedOrder, "in_progress")}
                  >
                    Start
                  </Button>
                )}
                {selectedOrder?.status === "in_progress" && (
                  <Button
                    size="sm"
                    onClick={() => selectedOrder && handleUpdateStatus(selectedOrder, "completed")}
                  >
                    Complete
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Client Ref</p>
              <p className="text-sm font-semibold">{selectedOrder?.clientRef}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</p>
              <Badge variant={vasPriorityColor(selectedOrder?.priority || "standard")}>
                {selectedOrder?.priority}
              </Badge>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned</p>
              <p className="text-sm font-semibold">{selectedOrder?.assignedEmployee || "—"}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. Cost</p>
              <p className="text-sm font-semibold">
                ${selectedOrder?.estimatedCost?.toFixed(2) || "—"}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Work Order Lines</h3>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No lines defined for this work order.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Line</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Required</TableHead>
                      <TableHead className="text-xs text-right">Issued</TableHead>
                      <TableHead className="text-xs text-right">Consumed</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs text-right">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const issuePct = line.qtyRequired > 0 ? (line.qtyIssued / line.qtyRequired) * 100 : 0;
                      const consumePct = line.qtyRequired > 0 ? (line.qtyConsumed / line.qtyRequired) * 100 : 0;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="text-xs">{line.lineNo}</TableCell>
                          <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                          <TableCell className="text-xs">{line.description}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {line.qtyRequired} {line.uom}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {line.qtyIssued} {line.uom}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {line.qtyConsumed} {line.uom}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {line.sourceLocation || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Progress value={consumePct} className="h-1 w-16" />
                              <span className="text-[10px] font-mono w-10 text-right">
                                {consumePct.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Work Order Dialog */}
      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New VAS Work Order</DialogTitle>
            <DialogDescription>Create a new kitting, labeling, or assembly work order.</DialogDescription>
          </DialogHeader>
          <VasOrderForm onSubmit={handleCreateOrder} onCancel={() => setNewOrderOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Work Order</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete work order {orderToDelete?.id}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VasOrderForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    clientRef: string;
    type: VasWorkOrderType;
    priority: "standard" | "rush" | "same_day";
    scheduledStartAt: string;
    scheduledEndAt: string;
    assignedStation?: string;
    assignedEmployee?: string;
    outputSku?: string;
    outputQty?: number;
    billable: boolean;
    notes?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [clientRef, setClientRef] = useState("");
  const [type, setType] = useState<VasWorkOrderType>("KITTING");
  const [priority, setPriority] = useState<"standard" | "rush" | "same_day">("standard");
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [scheduledEndAt, setScheduledEndAt] = useState("");
  const [assignedStation, setAssignedStation] = useState("");
  const [assignedEmployee, setAssignedEmployee] = useState("");
  const [outputSku, setOutputSku] = useState("");
  const [outputQty, setOutputQty] = useState(0);
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      clientRef: clientRef || `VAS-${Date.now()}`,
      type,
      priority,
      scheduledStartAt: scheduledStartAt || new Date().toISOString(),
      scheduledEndAt: scheduledEndAt || new Date().toISOString(),
      assignedStation: assignedStation || undefined,
      assignedEmployee: assignedEmployee || undefined,
      outputSku: outputSku || undefined,
      outputQty: outputQty || undefined,
      billable,
      notes: notes || undefined,
    });
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Client Reference</Label>
        <Input
          value={clientRef}
          onChange={(e) => setClientRef(e.target.value)}
          placeholder="e.g. ACM-VAS-2201"
          className="h-8 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Service Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as VasWorkOrderType)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="KITTING">Kitting</SelectItem>
              <SelectItem value="DEKITTING">De-Kitting</SelectItem>
              <SelectItem value="LABELING">Labeling</SelectItem>
              <SelectItem value="ASSEMBLY">Assembly</SelectItem>
              <SelectItem value="REPACK">Re-Pack</SelectItem>
              <SelectItem value="CUSTOM">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as "standard" | "rush" | "same_day")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="rush">Rush</SelectItem>
              <SelectItem value="same_day">Same Day</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Time</Label>
          <Input
            type="datetime-local"
            value={scheduledStartAt.slice(0, 16)}
            onChange={(e) => setScheduledStartAt(new Date(e.target.value).toISOString())}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label>End Time</Label>
          <Input
            type="datetime-local"
            value={scheduledEndAt.slice(0, 16)}
            onChange={(e) => setScheduledEndAt(new Date(e.target.value).toISOString())}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Station</Label>
          <Input
            value={assignedStation}
            onChange={(e) => setAssignedStation(e.target.value)}
            placeholder="e.g. KIT-01"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label>Assigned Employee</Label>
          <Input
            value={assignedEmployee}
            onChange={(e) => setAssignedEmployee(e.target.value)}
            placeholder="e.g. j.patel"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Output SKU</Label>
          <Input
            value={outputSku}
            onChange={(e) => setOutputSku(e.target.value)}
            placeholder="Finished good SKU"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label>Output Qty</Label>
          <Input
            type="number"
            value={outputQty}
            onChange={(e) => setOutputQty(parseInt(e.target.value) || 0)}
            className="h-8 text-xs"
            min={0}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="billable"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="billable" className="text-xs cursor-pointer">
          Billable service
        </Label>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          className="text-xs"
          rows={3}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Creating..." : "Create Work Order"}
        </Button>
      </DialogFooter>
    </form>
  );
}
