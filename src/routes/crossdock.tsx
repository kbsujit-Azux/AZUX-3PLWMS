import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Filter,
  Zap,
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
  Container,
  MapPin,
  Hash,
  Truck,
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/workspace-context";
import {
  crossdockMatches,
  crossdockPriorityColor,
  crossdockStatusLabel,
  crossdockProgressPct,
  type CrossDockMatch,
  type CrossDockMatchStatus,
  type CrossDockMatchPriority,
} from "@/lib/crossdock-data";
import {
  fetchCrossDockMatches,
  subscribeCrossDockMatches,
  createCrossDockMatch,
  updateCrossDockMatch,
  deleteCrossDockMatch,
} from "@/lib/firestore-data";
import { tenants, warehouses } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/crossdock")({
  head: () => ({
    meta: [
      { title: "Cross-Docking — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Cross-dock matching engine: route incoming inventory directly to outbound staging lanes.",
      },
    ],
  }),
  component: CrossDockPage,
});

function CrossDockPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [matches, setMatches] = useState<CrossDockMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedMatch, setSelectedMatch] = useState<CrossDockMatch | null>(null);
  const [newMatchOpen, setNewMatchOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [matchToDelete, setMatchToDelete] = useState<CrossDockMatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const unsub = subscribeCrossDockMatches(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (m) => m.tenantId === tenantId && m.warehouseId === warehouseId,
          );
          setMatches(filtered);
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

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const matchesQuery =
        m.id.toLowerCase().includes(query.toLowerCase()) ||
        m.sku.toLowerCase().includes(query.toLowerCase()) ||
        m.inboundShipmentId.toLowerCase().includes(query.toLowerCase()) ||
        m.orderId.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || m.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || m.priority === priorityFilter;
      return matchesQuery && matchesStatus && matchesPriority;
    });
  }, [matches, query, statusFilter, priorityFilter]);

  const handleCreateMatch = async (formData: {
    inboundShipmentId: string;
    inboundLineNo: number;
    sku: string;
    qtyExpected: number;
    orderId: string;
    priority: CrossDockMatchPriority;
    stagingLocation: string;
  }) => {
    try {
      await createCrossDockMatch({
        tenantId,
        warehouseId,
        inboundShipmentId: formData.inboundShipmentId,
        inboundLineNo: formData.inboundLineNo,
        sku: formData.sku,
        qtyExpected: formData.qtyExpected,
        qtyMatched: 0,
        orderId: formData.orderId,
        stagingLocation: formData.stagingLocation || "STG-01",
        status: "pending",
        priority: formData.priority,
        matchedAt: new Date().toISOString(),
      });
      toast.success("Cross-dock match created");
      setNewMatchOpen(false);
    } catch (e) {
      toast.error("Failed to create match");
      console.error(e);
    }
  };

  const handleUpdateStatus = async (match: CrossDockMatch, status: CrossDockMatchStatus) => {
    try {
      const updates: Partial<CrossDockMatch> = { status };
      if (status === "dispatched") {
        updates.dispatchedAt = new Date().toISOString();
      }
      await updateCrossDockMatch(match.id, updates);
      toast.success(`Match updated to ${crossdockStatusLabel(status)}`);
    } catch (e) {
      toast.error("Failed to update match");
      console.error(e);
    }
  };

  const handleDeleteClick = (match: CrossDockMatch) => {
    setMatchToDelete(match);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!matchToDelete) return;
    try {
      await deleteCrossDockMatch(matchToDelete.id);
      if (selectedMatch?.id === matchToDelete.id) {
        setSelectedMatch(null);
      }
      toast.success("Match deleted");
      setDeleteOpen(false);
      setMatchToDelete(null);
    } catch (e) {
      toast.error("Failed to delete match");
      console.error(e);
    }
  };

  const summary = useMemo(() => {
    const total = matches.length;
    const matched = matches.filter((m) => m.status === "matched").length;
    const dispatched = matches.filter((m) => m.status === "dispatched").length;
    const pending = matches.filter((m) => m.status === "pending").length;
    const totalQty = matches.reduce((sum, m) => sum + m.qtyMatched, 0);
    return { total, matched, dispatched, pending, totalQty };
  }, [matches]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cross-Docking</h1>
          <p className="text-sm text-muted-foreground">
            Route incoming inventory directly to outbound staging lanes to bypass putaway.
          </p>
        </div>
        <Button size="sm" onClick={() => setNewMatchOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Match
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Matches</p>
          <p className="text-lg font-semibold">{summary.total}</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</p>
          <p className="text-lg font-semibold">{summary.pending}</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Matched</p>
          <p className="text-lg font-semibold">{summary.matched}</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Dispatched</p>
          <p className="text-lg font-semibold">{summary.dispatched}</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Matched Qty</p>
          <p className="text-lg font-semibold">{summary.totalQty.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search matches..."
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
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="exception">Exception</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMatches.map((match) => {
          const progress = crossdockProgressPct(match);
          return (
            <div
              key={match.id}
              className="rounded-lg border p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedMatch(match)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs font-semibold">{match.id}</span>
                </div>
                <div className="flex gap-1">
                  <Badge variant={crossdockPriorityColor(match.priority)}>{match.priority}</Badge>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {crossdockStatusLabel(match.status)}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">SKU</span>
                  <span className="font-mono font-medium">{match.sku}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Order</span>
                  <span className="font-medium">{match.orderId}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Staging</span>
                  <span className="font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {match.stagingLocation}
                  </span>
                </div>
                {match.dockDoor && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Dock Door</span>
                    <span className="font-medium">{match.dockDoor}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {match.qtyMatched}/{match.qtyExpected}
                  </span>
                </div>
                <Progress value={progress} className="h-1" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-1">
                  {match.status === "matched" && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(match, "dispatched");
                      }}
                    >
                      <PlayCircle className="mr-1 h-3 w-3" />
                      Dispatch
                    </Button>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(match);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredMatches.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No cross-dock matches found. Create one to get started.
        </div>
      )}

      {/* Detail Drawer */}
      <Dialog open={!!selectedMatch} onOpenChange={(open) => !open && setSelectedMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              {selectedMatch?.id}
            </DialogTitle>
            <DialogDescription>
              Cross-Dock Match — {crossdockStatusLabel(selectedMatch?.status || "pending")}
            </DialogDescription>
          </DialogHeader>

          {selectedMatch && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</p>
                  <p className="text-sm font-mono font-semibold">{selectedMatch.sku}</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</p>
                  <Badge variant={crossdockPriorityColor(selectedMatch.priority)}>
                    {selectedMatch.priority}
                  </Badge>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Order</p>
                  <p className="text-sm font-semibold">{selectedMatch.orderId}</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Staging</p>
                  <p className="text-sm font-semibold">{selectedMatch.stagingLocation}</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Dock Door</p>
                  <p className="text-sm font-semibold">{selectedMatch.dockDoor || "—"}</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Matched At</p>
                  <p className="text-sm font-semibold">{fmtDateTime(selectedMatch.matchedAt)}</p>
                </div>
              </div>

              {selectedMatch.status === "matched" && (
                <Button
                  className="w-full"
                  onClick={() => handleUpdateStatus(selectedMatch, "dispatched")}
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Dispatch to Staging
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Match Dialog */}
      <Dialog open={newMatchOpen} onOpenChange={setNewMatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Cross-Dock Match</DialogTitle>
            <DialogDescription>Manually create a cross-dock match between inbound and outbound.</DialogDescription>
          </DialogHeader>
          <CrossDockForm onSubmit={handleCreateMatch} onCancel={() => setNewMatchOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Match</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete cross-dock match {matchToDelete?.id}. This action cannot be undone.
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

function CrossDockForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    inboundShipmentId: string;
    inboundLineNo: number;
    sku: string;
    qtyExpected: number;
    orderId: string;
    priority: CrossDockMatchPriority;
    stagingLocation: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [inboundShipmentId, setInboundShipmentId] = useState("");
  const [inboundLineNo, setInboundLineNo] = useState(1);
  const [sku, setSku] = useState("");
  const [qtyExpected, setQtyExpected] = useState(0);
  const [orderId, setOrderId] = useState("");
  const [priority, setPriority] = useState<CrossDockMatchPriority>("medium");
  const [stagingLocation, setStagingLocation] = useState("STG-01");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      inboundShipmentId: inboundShipmentId || `INB-${Date.now()}`,
      inboundLineNo,
      sku: sku || "UNKNOWN",
      qtyExpected: qtyExpected || 0,
      orderId: orderId || `SO-${Date.now()}`,
      priority,
      stagingLocation,
    });
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Inbound Shipment ID</Label>
        <Input
          value={inboundShipmentId}
          onChange={(e) => setInboundShipmentId(e.target.value)}
          placeholder="e.g. INB-2026-0519-001"
          className="h-8 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Inbound Line #</Label>
          <Input
            type="number"
            value={inboundLineNo}
            onChange={(e) => setInboundLineNo(parseInt(e.target.value) || 1)}
            className="h-8 text-xs"
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label>SKU</Label>
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. ACM-TENT-2P-OLV"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Qty Expected</Label>
          <Input
            type="number"
            value={qtyExpected}
            onChange={(e) => setQtyExpected(parseInt(e.target.value) || 0)}
            className="h-8 text-xs"
            min={0}
          />
        </div>
        <div className="space-y-2">
          <Label>Outbound Order ID</Label>
          <Input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="e.g. SO-2026-4401"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as CrossDockMatchPriority)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Staging Location</Label>
          <Input
            value={stagingLocation}
            onChange={(e) => setStagingLocation(e.target.value)}
            placeholder="e.g. STG-01"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Creating..." : "Create Match"}
        </Button>
      </DialogFooter>
    </form>
  );
}
