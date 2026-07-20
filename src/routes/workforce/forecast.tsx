import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Filter,
  TrendingUp,
  Users,
  Clock,
  Calendar,
  ChevronRight,
  Hash,
  BarChart3,
  Trash2,
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
import {
  inboundShipments,
} from "@/lib/inbound-data";
import {
  orders,
} from "@/lib/edi-data";
import {
  LABOR_STANDARDS,
} from "@/lib/labor-data";
import {
  forecastLaborFromEdi,
  computeShiftSchedule,
  type LaborForecast,
} from "@/lib/labor-forecast";
import {
  createLaborForecast,
  subscribeLaborForecasts,
  updateLaborForecast,
  deleteLaborForecast,
  createShiftSchedule,
} from "@/lib/firestore-data";
import { tenants, warehouses } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/workforce/forecast")({
  head: () => ({
    meta: [
      { title: "Labor Forecast — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Predictive labor forecasting based on incoming EDI 943 and EDI 940 volumes.",
      },
    ],
  }),
  component: LaborForecastPage,
});

function LaborForecastPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [forecasts, setForecasts] = useState<LaborForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [horizon, setHorizon] = useState(7);
  const [newForecastOpen, setNewForecastOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forecastToDelete, setForecastToDelete] = useState<LaborForecast | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const unsub = subscribeLaborForecasts(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (f) => f.tenantId === tenantId && f.warehouseId === warehouseId,
          );
          setForecasts(filtered);
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

  const liveInbound = useMemo(() => {
    if (tenantId === "all" && warehouseId === "all") return inboundShipments;
    return inboundShipments.filter((s) => s.tenantId === tenantId && s.warehouseId === warehouseId);
  }, [tenantId, warehouseId]);

  const liveOrders = useMemo(() => {
    if (tenantId === "all" && warehouseId === "all") return orders;
    return orders.filter((o) => o.tenantId === tenantId && o.warehouseId === warehouseId);
  }, [tenantId, warehouseId]);

  const handleGenerate = async () => {
    try {
      const generated = forecastLaborFromEdi(liveInbound, liveOrders, LABOR_STANDARDS, horizon);
      for (const forecast of generated) {
        forecast.tenantId = tenantId;
        forecast.warehouseId = warehouseId;
        await createLaborForecast(forecast);
      }
      toast.success(`Generated ${generated.length} day(s) of forecasts`);
      setNewForecastOpen(false);
    } catch (e) {
      toast.error("Failed to generate forecast");
      console.error(e);
    }
  };

  const handleDeleteClick = (forecast: LaborForecast) => {
    setForecastToDelete(forecast);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!forecastToDelete) return;
    try {
      await deleteLaborForecast(forecastToDelete.id);
      setForecasts((prev) => prev.filter((f) => f.id !== forecastToDelete.id));
      toast.success("Forecast deleted");
      setDeleteOpen(false);
      setForecastToDelete(null);
    } catch (e) {
      toast.error("Failed to delete forecast");
      console.error(e);
    }
  };

  const filteredForecasts = useMemo(() => {
    return forecasts.filter((f) =>
      f.id.toLowerCase().includes(query.toLowerCase()),
    );
  }, [forecasts, query]);

  const totalHours = forecasts.reduce((sum, f) => sum + f.totalHours, 0);
  const avgConfidence = forecasts.length > 0
    ? forecasts.reduce((sum, f) => sum + (f.confidence === "high" ? 3 : f.confidence === "medium" ? 2 : 1), 0) / forecasts.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Labor Forecast</h1>
          <p className="text-sm text-muted-foreground">
            Predictive labor forecasting based on incoming EDI 943 and EDI 940 volumes.
          </p>
        </div>
        <Button size="sm" onClick={() => setNewForecastOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate Forecast
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Forecast Days</p>
          <p className="text-lg font-semibold">{forecasts.length}</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Hours</p>
          <p className="text-lg font-semibold">{totalHours.toFixed(1)}</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Confidence</p>
          <p className="text-lg font-semibold">
            {avgConfidence >= 2.5 ? "High" : avgConfidence >= 1.5 ? "Medium" : "Low"}
          </p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Headcount Gap</p>
          <p className="text-lg font-semibold">
            {forecasts.reduce((sum, f) => sum + f.headcountGap, 0)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search forecasts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Inbound</TableHead>
              <TableHead className="text-xs text-right">Outbound</TableHead>
              <TableHead className="text-xs text-right">Total Hrs</TableHead>
              <TableHead className="text-xs text-right">Headcount</TableHead>
              <TableHead className="text-xs text-right">Gap</TableHead>
              <TableHead className="text-xs">Confidence</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredForecasts.map((forecast) => (
              <TableRow key={forecast.id}>
                <TableCell className="font-mono text-xs">
                  {new Date(forecast.forecastDate).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right text-xs">
                  {forecast.inboundPallets} pallets
                </TableCell>
                <TableCell className="text-right text-xs">
                  {forecast.outboundOrders} orders
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{forecast.totalHours.toFixed(1)}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {forecast.availableHeadcount}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {forecast.headcountGap > 0 ? (
                    <span className="text-destructive">+{forecast.headcountGap}</span>
                  ) : (
                    <span className="text-green-600">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      forecast.confidence === "high"
                        ? "default"
                        : forecast.confidence === "medium"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-[10px] h-5"
                  >
                    {forecast.confidence}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDeleteClick(forecast)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredForecasts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No forecasts generated. Click "Generate Forecast" to create one.
        </div>
      )}

      <Dialog open={newForecastOpen} onOpenChange={setNewForecastOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Labor Forecast</DialogTitle>
            <DialogDescription>
              Generate a labor forecast based on current inbound and outbound volumes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Horizon (days)</Label>
              <Input
                type="number"
                value={horizon}
                onChange={(e) => setHorizon(parseInt(e.target.value) || 7)}
                className="h-8 text-xs"
                min={1}
                max={30}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setNewForecastOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleGenerate}>
                Generate
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Forecast</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete forecast {forecastToDelete?.id}.
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
