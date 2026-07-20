import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Filter,
  Scale,
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
  TrendingUp,
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
  catchWeightItems,
  catchWeightLogs,
  validateCatchWeight,
  computeCatchWeightStats,
  type CatchWeightItem,
  type CatchWeightLog,
} from "@/lib/catch-weight-data";
import {
  fetchCatchWeightItems,
  subscribeCatchWeightItems,
  fetchCatchWeightLogs,
  subscribeCatchWeightLogs,
} from "@/lib/firestore-data";
import { tenants, warehouses } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/catch-weight")({
  head: () => ({
    meta: [
      { title: "Catch Weight — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Variable weight tracking for food/beverage 3PLs. Track items by actual weight rather than strict units.",
      },
    ],
  }),
  component: CatchWeightPage,
});

function CatchWeightPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [items, setItems] = useState<CatchWeightItem[]>([]);
  const [logs, setLogs] = useState<CatchWeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("items");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const unsubItems = subscribeCatchWeightItems(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (i) => i.tenantId === tenantId && i.warehouseId === warehouseId,
          );
          setItems(filtered);
          setLoading(false);
        }
      },
      tenantId,
      warehouseId,
    );

    const unsubLogs = subscribeCatchWeightLogs(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (l) => l.tenantId === tenantId && l.warehouseId === warehouseId,
          );
          setLogs(filtered);
        }
      },
      tenantId,
      warehouseId,
    );

    return () => {
      cancelled = true;
      unsubItems();
      unsubLogs();
    };
  }, [tenantId, warehouseId]);

  const filteredItems = useMemo(() => {
    return items.filter((i) =>
      i.sku.toLowerCase().includes(query.toLowerCase()),
    );
  }, [items, query]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) =>
      l.sku.toLowerCase().includes(query.toLowerCase()) ||
      l.id.toLowerCase().includes(query.toLowerCase()),
    );
  }, [logs, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catch Weight</h1>
          <p className="text-sm text-muted-foreground">
            Variable weight tracking for food/beverage 3PLs.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="items">Catch Weight Items</TabsTrigger>
          <TabsTrigger value="logs">Weight Logs</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search items..."
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
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Unit Type</TableHead>
                  <TableHead className="text-xs text-right">Target (lbs)</TableHead>
                  <TableHead className="text-xs text-right">Tolerance</TableHead>
                  <TableHead className="text-xs text-right">Tare (lbs)</TableHead>
                  <TableHead className="text-xs text-right">Min</TableHead>
                  <TableHead className="text-xs text-right">Max</TableHead>
                  <TableHead className="text-xs">Bill By Weight</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="text-xs">{item.unitType}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{item.targetWeightLbs}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{item.weightTolerancePct}%</TableCell>
                    <TableCell className="text-right font-mono text-xs">{item.tareWeightLbs}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{item.minWeightLbs}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{item.maxWeightLbs}</TableCell>
                    <TableCell>
                      <Badge variant={item.billByWeight ? "default" : "secondary"} className="text-[10px] h-5">
                        {item.billByWeight ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Log ID</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Gross</TableHead>
                  <TableHead className="text-xs text-right">Tare</TableHead>
                  <TableHead className="text-xs text-right">Net</TableHead>
                  <TableHead className="text-xs">Captured</TableHead>
                  <TableHead className="text-xs">By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const item = catchWeightItems.find((i) => i.sku === log.sku);
                  const validation = item ? validateCatchWeight(log, item) : { valid: true };
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">{log.id}</TableCell>
                      <TableCell className="font-mono text-xs">{log.sku}</TableCell>
                      <TableCell className="text-xs">{log.transactionType}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{log.grossWeightLbs}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{log.tareWeightLbs}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{log.netWeightLbs}</TableCell>
                      <TableCell className="text-xs">{fmtDateTime(log.capturedAt)}</TableCell>
                      <TableCell className="text-xs">{log.capturedBy}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {catchWeightItems.map((item) => {
              const stats = computeCatchWeightStats(catchWeightLogs, item.sku);
              return (
                <div key={item.sku} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">{item.sku}</span>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {stats.count} captures
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Avg Weight</span>
                      <p className="font-mono font-semibold">{stats.avgWeight} lbs</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Std Dev</span>
                      <p className="font-mono font-semibold">{stats.stdDev} lbs</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Min</span>
                      <p className="font-mono font-semibold">{stats.min} lbs</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max</span>
                      <p className="font-mono font-semibold">{stats.max} lbs</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
