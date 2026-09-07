import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Filter,
  Package,
  Boxes,
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
  Hash,
  Printer,
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
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { cartonSizes, recommendCartonSize } from "@/lib/carton-catalog";
import { cartonizeOrder } from "@/lib/cubing-engine";
import type { Cartonization, Carton } from "@/lib/cubing-engine";
import type { Order, OrderLine } from "@/lib/edi-data";
import type { ItemMasterRecord } from "@/lib/master-data";
import { fmtDateTime } from "@/lib/utils";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firestore";

export const Route = createFileRoute("/packing")({
  head: () => ({
    meta: [
      { title: "Packing & Cartonization — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Advanced containerization and cubing logic: automated volumetric calculation to dictate carton sizes.",
      },
    ],
  }),
  component: PackingPage,
});

function PackingPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const {
    orders: liveOrders,
    cartonizations: liveCartonizations,
    loading,
    refreshData,
  } = useWmsData();

  const [cartonizations, setCartonizations] = useState<Cartonization[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCartonization, setSelectedCartonization] = useState<Cartonization | null>(null);
  const [newCartonizationOpen, setNewCartonizationOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Cartonization | null>(null);

  const filteredOrders = useMemo(() => {
    if (tenantId === "all" && warehouseId === "all") return liveOrders;
    return liveOrders.filter((o) => o.tenantId === tenantId && o.warehouseId === warehouseId);
  }, [liveOrders, tenantId, warehouseId]);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    const loadCartonizations = async () => {
      setDbLoading(true);
      try {
        const q = query(collection(db, "cartonizations"), orderBy("createdAt", "desc"));
        unsub = onSnapshot(q, (snap) => {
          const list = snap.docs.map((d) => d.data() as Cartonization);
          setCartonizations(list);
          setDbLoading(false);
        });
      } catch (err) {
        console.error("Failed to load cartonizations:", err);
        setDbLoading(false);
      }
    };

    loadCartonizations();

    return () => {
      if (unsub) unsub();
    };
  }, [query]);

  useEffect(() => {
    if (!dbLoading && cartonizations.length === 0 && filteredOrders.length > 0) {
      const results: Cartonization[] = [];
      for (const order of filteredOrders) {
        const c = cartonizeOrder(order, []);
        results.push(c);
      }
      (async () => {
        try {
          const batch = results.map((c) => addDoc(collection(db, "cartonizations"), c));
          await Promise.all(batch);
          toast.success(`Synced ${results.length} cartonization(s) to Firestore`);
        } catch (err) {
          console.error("Failed to sync cartonizations:", err);
          toast.error("Failed to sync cartonizations");
        }
      })();
    }
  }, [dbLoading, cartonizations.length, filteredOrders]);

  const filtered = useMemo(() => {
    return cartonizations.filter((c) => {
      const matchesQuery =
        c.id.toLowerCase().includes(query.toLowerCase()) ||
        c.orderId.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [cartonizations, query, statusFilter]);

  const handleCartonize = async (orderId: string) => {
    const order = filteredOrders.find((o) => o.id === orderId);
    if (!order) return;
    const c = cartonizeOrder(order, []);
    try {
      await addDoc(collection(db, "cartonizations"), c);
      toast.success(`Cartonization created for ${orderId}`);
      setNewCartonizationOpen(false);
    } catch (err) {
      console.error("Failed to create cartonization:", err);
      toast.error("Failed to create cartonization");
    }
  };

  const handleDeleteClick = (c: Cartonization) => {
    setToDelete(c);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!toDelete) return;
    try {
      await deleteDoc(doc(db, "cartonizations", toDelete.id));
      if (selectedCartonization?.id === toDelete.id) setSelectedCartonization(null);
      toast.success("Cartonization deleted");
      setDeleteOpen(false);
      setToDelete(null);
    } catch (err) {
      console.error("Failed to delete cartonization:", err);
      toast.error("Failed to delete cartonization");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Packing & Cartonization</h1>
          <p className="text-sm text-muted-foreground">
            Automated volumetric calculation to determine optimal carton sizes before picking
            starts.
          </p>
        </div>
        <Button size="sm" onClick={() => setNewCartonizationOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Cartonize Order
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search cartonizations..."
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
            <SelectItem value="optimized">Optimized</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="printed">Printed</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={refreshData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {dbLoading || loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Loading cartonizations...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedCartonization(c)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs font-semibold">{c.id}</span>
                </div>
                <Badge variant="outline" className="text-[10px] h-5">
                  {c.status}
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Order</span>
                  <span className="font-medium">{c.orderId}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Cartons</span>
                  <span className="font-medium">{c.cartonCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Cube</span>
                  <span className="font-medium">{c.totalCubicFt.toFixed(2)} cu ft</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Weight</span>
                  <span className="font-medium">{c.totalWeightLbs.toFixed(1)} lbs</span>
                </div>
                {c.recommendedCartonId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Recommended</span>
                    <span className="font-medium">{c.recommendedCartonId}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCartonization(c);
                    }}
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    View
                  </Button>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(c);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!dbLoading && !loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No cartonizations found. Cartonize an order to get started.
        </div>
      )}

      <Dialog
        open={!!selectedCartonization}
        onOpenChange={(open) => !open && setSelectedCartonization(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              {selectedCartonization?.id}
            </DialogTitle>
            <DialogDescription>
              Order {selectedCartonization?.orderId} — {selectedCartonization?.cartons.length}{" "}
              carton(s)
            </DialogDescription>
          </DialogHeader>

          {selectedCartonization && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total Cube
                  </p>
                  <p className="text-lg font-semibold">
                    {selectedCartonization.totalCubicFt.toFixed(2)} cu ft
                  </p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total Weight
                  </p>
                  <p className="text-lg font-semibold">
                    {selectedCartonization.totalWeightLbs.toFixed(1)} lbs
                  </p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Cartons
                  </p>
                  <p className="text-lg font-semibold">{selectedCartonization.cartonCount}</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Status
                  </p>
                  <Badge variant="outline">{selectedCartonization.status}</Badge>
                </div>
              </div>

              <h3 className="font-semibold text-sm">Cartons</h3>
              {selectedCartonization.cartons.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No cartons defined.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Seq</TableHead>
                        <TableHead className="text-xs">Carton ID</TableHead>
                        <TableHead className="text-xs">Size</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs text-right">Cube</TableHead>
                        <TableHead className="text-xs text-right">Weight</TableHead>
                        <TableHead className="text-xs">Items</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCartonization.cartons.map((carton) => (
                        <TableRow key={carton.cartonId}>
                          <TableCell className="text-xs">{carton.seq}</TableCell>
                          <TableCell className="font-mono text-xs">{carton.cartonId}</TableCell>
                          <TableCell className="text-xs">{carton.cartonName}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {carton.totalQty}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {carton.cubicFt.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {carton.weightLbs.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {carton.items.map((i) => i.sku).join(", ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={newCartonizationOpen} onOpenChange={setNewCartonizationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cartonize Order</DialogTitle>
            <DialogDescription>Select an order to generate cartonization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Order</Label>
              <Select onValueChange={(v) => handleCartonize(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose an order..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.id} — {o.lines.length} lines
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setNewCartonizationOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cartonization</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete cartonization {toDelete?.id}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
