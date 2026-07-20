import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Filter,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
  Eye,
  Download,
  Trash2,
  PackageSearch,
  BarChart3,
  CalendarClock,
  Hash,
  Target,
  ChevronRight,
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
  cycleCounts,
  countSchedules,
  classifyAbc,
  generateCycleCountSchedule,
  computeVariance,
  getAbcClassColor,
  getCountTypeLabel,
  getCountStatusLabel,
  type AbcClass,
  type CountType,
  type CountStatus,
  type CountSchedule,
  type CountScheduleFrequency,
  type CycleCount,
  type CycleCountLine,
} from "@/lib/counting-data";
import {
  buildCountLinesFromInventory,
  computeCountSummary,
  getCountEfficiencyPct,
  getVarianceRate,
  buildAbcClassificationReport,
} from "@/lib/counting-engine";
import {
  fetchCycleCounts,
  subscribeCycleCounts,
  createCycleCount,
  updateCycleCount,
  deleteCycleCount,
  fetchCycleCountLines,
  subscribeCycleCountLines,
  createCycleCountLine,
  updateCycleCountLine,
  batchWriteCycleCountLines,
  fetchCountSchedules,
  subscribeCountSchedules,
  createCountSchedule,
} from "@/lib/firestore-data";
import { tenants, warehouses, inventoryItems } from "@/lib/mock-data";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/counting")({
  head: () => ({
    meta: [
      { title: "Cycle Counting — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Blind cycle counting schedules, ABC analysis slotting integration, and discrepancy reconciliation workflows.",
      },
    ],
  }),
  component: CountingPage,
});

function CountingPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [counts, setCounts] = useState<CycleCount[]>([]);
  const [schedules, setSchedules] = useState<CountSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedCount, setSelectedCount] = useState<CycleCount | null>(null);
  const [countLines, setCountLines] = useState<CycleCountLine[]>([]);
  const [newCountOpen, setNewCountOpen] = useState(false);
  const [newScheduleOpen, setNewScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [countToDelete, setCountToDelete] = useState<CycleCount | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const unsubCounts = subscribeCycleCounts(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (c) => c.tenantId === tenantId && c.warehouseId === warehouseId,
          );
          setCounts(filtered);
          setLoading(false);
        }
      },
      tenantId,
      warehouseId,
    );

    const unsubSchedules = subscribeCountSchedules(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (s) => s.tenantId === tenantId && s.warehouseId === warehouseId,
          );
          setSchedules(filtered);
        }
      },
      tenantId,
      warehouseId,
    );

    return () => {
      cancelled = true;
      unsubCounts();
      unsubSchedules();
    };
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (!selectedCount) {
      setCountLines([]);
      return;
    }

    let cancelled = false;
    const unsub = subscribeCycleCountLines((lines) => {
      if (!cancelled) {
        setCountLines(lines);
      }
    }, selectedCount.id);

    return () => unsub();
  }, [selectedCount]);

  const filteredCounts = useMemo(() => {
    return counts.filter((c) => {
      const matchesQuery =
        c.id.toLowerCase().includes(query.toLowerCase()) ||
        c.assignedTo?.toLowerCase().includes(query.toLowerCase()) ||
        c.team?.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesType = typeFilter === "all" || c.countType === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [counts, query, statusFilter, typeFilter]);

  const liveInventory = useMemo(() => {
    if (tenantId === "all" && warehouseId === "all") return inventoryItems;
    return inventoryItems.filter(
      (item) => item.tenantId === tenantId && item.warehouseId === warehouseId,
    );
  }, [tenantId, warehouseId]);

  const handleCreateCount = async (formData: {
    countType: CountType;
    abcClass?: AbcClass;
    assignedTo?: string;
    team?: string;
    notes?: string;
  }) => {
    try {
      const allLocations = liveInventory
        .flatMap((item) => item.batches.map((b) => b.location))
        .filter(Boolean);
      const uniqueLocations = [...new Set(allLocations)];

      let locationIds: string[] = uniqueLocations;
      if (formData.abcClass) {
        const abcMap = classifyAbc(liveInventory, []);
        const skusForClass = [...abcMap.entries()]
          .filter(([, cls]) => cls === formData.abcClass)
          .map(([sku]) => sku);
        const itemsForClass = liveInventory.filter((item) => skusForClass.includes(item.sku));
        locationIds = [
          ...new Set(
            itemsForClass.flatMap((item) =>
              item.batches.filter((b) => skusForClass.includes(item.sku)).map((b) => b.location),
            ),
          ),
        ];
      }

      const id = await createCycleCount({
        tenantId,
        warehouseId,
        countType: formData.countType,
        status: "scheduled",
        priority: "medium",
        scheduledDate: new Date().toISOString(),
        abcClass: formData.abcClass,
        locationIds,
        assignedTo: formData.assignedTo,
        team: formData.team,
        totalLines: 0,
        countedLines: 0,
        varianceLines: 0,
        adjustedLines: 0,
        notes: formData.notes,
        createdAt: new Date().toISOString(),
        createdBy: "current-user",
      });

      toast.success(`Cycle count ${id} created`);
      setNewCountOpen(false);
    } catch (e) {
      toast.error("Failed to create count");
      console.error(e);
    }
  };

  const handleCreateSchedule = async (formData: {
    name: string;
    countType: CountType;
    abcClass?: AbcClass;
    frequency: CountScheduleFrequency;
    varianceTolerancePct: number;
    autoAdjust: boolean;
  }) => {
    try {
      await createCountSchedule({
        tenantId,
        warehouseId,
        name: formData.name,
        countType: formData.countType,
        abcClass: formData.abcClass,
        frequency: formData.frequency,
        nextRunAt: new Date().toISOString(),
        varianceTolerancePct: formData.varianceTolerancePct,
        autoAdjust: formData.autoAdjust,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: "current-user",
      });
      toast.success("Schedule created");
      setNewScheduleOpen(false);
    } catch (e) {
      toast.error("Failed to create schedule");
      console.error(e);
    }
  };

  const handleStartCount = async (count: CycleCount) => {
    try {
      await updateCycleCount(count.id, {
        status: "in_progress",
        startedAt: new Date().toISOString(),
      });
      if (count.locationIds && count.locationIds.length > 0) {
        const lines = buildCountLinesFromInventory(count.id, count.locationIds, liveInventory, count.countType === "BLIND");
        await batchWriteCycleCountLines(lines);
        await updateCycleCount(count.id, { totalLines: lines.length });
      }
      toast.success("Count started");
    } catch (e) {
      toast.error("Failed to start count");
      console.error(e);
    }
  };

  const handleUpdateLine = async (line: CycleCountLine, updates: Partial<CycleCountLine>) => {
    try {
      await updateCycleCountLine(line.id, updates);
      const variance = computeVariance(
        line.expectedQty,
        updates.countedQty ?? line.countedQty,
        line.expectedWeightLbs,
        updates.countedWeightLbs ?? line.countedWeightLbs,
      );

      await updateCycleCountLine(line.id, {
        varianceQty: variance.varianceQty,
        variancePct: variance.variancePct,
        varianceWeightLbs: variance.varianceWeightLbs,
      });

      toast.success("Line updated");
    } catch (e) {
      toast.error("Failed to update line");
      console.error(e);
    }
  };

  const handleDeleteClick = (count: CycleCount) => {
    setCountToDelete(count);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!countToDelete) return;
    try {
      await deleteCycleCount(countToDelete.id);
      if (selectedCount?.id === countToDelete.id) {
        setSelectedCount(null);
        setCountLines([]);
      }
      toast.success("Count deleted");
      setDeleteOpen(false);
      setCountToDelete(null);
    } catch (e) {
      toast.error("Failed to delete count");
      console.error(e);
    }
  };

  const handleExportCsv = () => {
    if (countLines.length === 0) {
      toast.error("No lines to export");
      return;
    }
    const headers = [
      "Location",
      "SKU",
      "Batch",
      "Description",
      "Expected Qty",
      "Counted Qty",
      "Variance Qty",
      "Variance %",
      "Adjusted",
      "Supervisor Approved",
    ];
    const rows = countLines.map((l) => [
      l.locationId,
      l.sku,
      l.batchId || "",
      l.description || "",
      l.expectedQty,
      l.countedQty,
      l.varianceQty || 0,
      (l.variancePct || 0).toFixed(2),
      l.adjusted ? "Yes" : "No",
      l.supervisorApproved ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `count-${selectedCount?.id || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const summary = selectedCount ? computeCountSummary(selectedCount, countLines) : null;
  const efficiency = selectedCount ? getCountEfficiencyPct(selectedCount) : 0;
  const varianceRate = selectedCount ? getVarianceRate(selectedCount) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cycle Counting</h1>
          <p className="text-sm text-muted-foreground">
            Blind cycle counting schedules, ABC analysis, and discrepancy reconciliation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setNewScheduleOpen(true)}>
            <CalendarClock className="mr-2 h-4 w-4" />
            New Schedule
          </Button>
          <Button size="sm" onClick={() => setNewCountOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Count
          </Button>
        </div>
      </div>

      <Tabs defaultValue="counts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="counts">Active Counts</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="abc">ABC Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="counts" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search counts..."
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
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="counted">Counted</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="adjusted">Adjusted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="CYCLE">Cycle Count</SelectItem>
                <SelectItem value="ANNUAL">Annual Physical</SelectItem>
                <SelectItem value="ADHOC">Ad-Hoc</SelectItem>
                <SelectItem value="BLIND">Blind Count</SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCounts.map((count) => (
              <div
                key={count.id}
                className="rounded-lg border p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedCount(count)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs font-semibold">{count.id}</span>
                  </div>
                  <Badge variant={getAbcClassColor(count.abcClass || "D")}>
                    {count.abcClass || "—"}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{getCountTypeLabel(count.countType)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {getCountStatusLabel(count.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Assigned</span>
                    <span className="font-medium">{count.assignedTo || "Unassigned"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Scheduled</span>
                    <span className="font-medium">{fmtDateTime(count.scheduledDate)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{count.countedLines}/{count.totalLines}</span>
                  </div>
                  <Progress value={(count.countedLines / Math.max(1, count.totalLines)) * 100} className="h-1" />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-1">
                    {count.status === "scheduled" && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartCount(count);
                        }}
                      >
                        Start
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCount(count);
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
                      handleDeleteClick(count);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {filteredCounts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No cycle counts found. Create one to get started.
            </div>
          )}
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">{schedule.id}</span>
                  <Badge variant={schedule.active ? "default" : "secondary"}>
                    {schedule.active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-sm">{schedule.name}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Type</span>
                    <span>{getCountTypeLabel(schedule.countType)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">ABC Class</span>
                    <Badge variant={getAbcClassColor(schedule.abcClass || "D")}>
                      {schedule.abcClass || "All"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Frequency</span>
                    <span className="capitalize">{schedule.frequency.replace("_", " ")}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Next Run</span>
                    <span>{fmtDateTime(schedule.nextRunAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tolerance</span>
                    <span>{schedule.varianceTolerancePct}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {schedules.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No count schedules configured.
            </div>
          )}
        </TabsContent>

        <TabsContent value="abc" className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              ABC Classification Report
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Classification based on annual usage value (qty × unit cost).
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Class</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-right">Annual Usage Value</TableHead>
                    <TableHead className="text-xs text-right">Total Qty</TableHead>
                    <TableHead className="text-xs text-right">Unit Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildAbcClassificationReport(liveInventory, []).map((row) => (
                    <TableRow key={row.sku}>
                      <TableCell>
                        <Badge variant={getAbcClassColor(row.abcClass)}>{row.abcClass}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                      <TableCell className="text-xs">{row.description}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ${row.annualUsageValue.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.totalQty}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${row.unitCost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Drawer */}
      <Dialog open={!!selectedCount} onOpenChange={(open) => !open && setSelectedCount(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  {selectedCount?.id}
                </DialogTitle>
                <DialogDescription>
                  {getCountTypeLabel(selectedCount?.countType || "CYCLE")} —{" "}
                  {getCountStatusLabel(selectedCount?.status || "scheduled")}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                {selectedCount?.status === "scheduled" && (
                  <Button
                    size="sm"
                    onClick={() => selectedCount && handleStartCount(selectedCount)}
                  >
                    Start Count
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleExportCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>
          </DialogHeader>

          {summary && (
            <div className="grid grid-cols-4 gap-4 py-4">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Efficiency</p>
                <p className="text-lg font-semibold">{efficiency.toFixed(0)}%</p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Variance Rate</p>
                <p className="text-lg font-semibold">{varianceRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Counted</p>
                <p className="text-lg font-semibold">
                  {summary.countedLines}/{summary.totalLines}
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Adjusted</p>
                <p className="text-lg font-semibold">{summary.adjustedLines}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Count Lines</h3>
            {countLines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No count lines yet. Start the count to generate lines from inventory.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Location</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs">Batch</TableHead>
                      <TableHead className="text-xs text-right">Expected</TableHead>
                      <TableHead className="text-xs text-right">Counted</TableHead>
                      <TableHead className="text-xs text-right">Variance</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countLines.map((line) => {
                      const hasVariance = (line.varianceQty || 0) !== 0;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-xs">{line.locationId}</TableCell>
                          <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {line.batchId || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{line.expectedQty}</TableCell>
                          <TableCell className="text-right">
                            {selectedCount?.status === "in_progress" ||
                            selectedCount?.status === "counted" ? (
                              <Input
                                type="number"
                                value={line.countedQty}
                                onChange={(e) =>
                                  handleUpdateLine(line, { countedQty: parseInt(e.target.value) || 0 })
                                }
                                className="h-7 w-20 text-right text-xs font-mono"
                              />
                            ) : (
                              <span className="font-mono text-xs">{line.countedQty}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {hasVariance && (
                              <span className="font-mono text-xs text-destructive">
                                {line.varianceQty} ({(line.variancePct || 0).toFixed(1)}%)
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {hasVariance && (
                                <Badge variant="destructive" className="h-5 text-[10px]">
                                  Variance
                                </Badge>
                              )}
                              {line.adjusted && (
                                <Badge variant="default" className="h-5 text-[10px]">
                                  Adjusted
                                </Badge>
                              )}
                              {line.supervisorReview && !line.supervisorApproved && (
                                <Badge variant="secondary" className="h-5 text-[10px]">
                                  Pending Review
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {hasVariance && selectedCount && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                onClick={() =>
                                  handleUpdateLine(line, {
                                    supervisorReview: true,
                                  })
                                }
                              >
                                Flag Review
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
          </div>
        </DialogContent>
      </Dialog>

      {/* New Count Dialog */}
      <Dialog open={newCountOpen} onOpenChange={setNewCountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Cycle Count</DialogTitle>
            <DialogDescription>Create a new physical inventory count.</DialogDescription>
          </DialogHeader>
          <CountForm onSubmit={handleCreateCount} onCancel={() => setNewCountOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* New Schedule Dialog */}
      <Dialog open={newScheduleOpen} onOpenChange={setNewScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Count Schedule</DialogTitle>
            <DialogDescription>Configure an automated recurring count schedule.</DialogDescription>
          </DialogHeader>
          <ScheduleForm onSubmit={handleCreateSchedule} onCancel={() => setNewScheduleOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cycle Count</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete count {countToDelete?.id} and all its lines. This action
              cannot be undone.
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

function CountForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    countType: CountType;
    abcClass?: AbcClass;
    assignedTo?: string;
    team?: string;
    notes?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [countType, setCountType] = useState<CountType>("CYCLE");
  const [abcClass, setAbcClass] = useState<AbcClass | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState("");
  const [team, setTeam] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      countType,
      abcClass: abcClass || undefined,
      assignedTo: assignedTo || undefined,
      team: team || undefined,
      notes: notes || undefined,
    });
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Count Type</Label>
        <Select value={countType} onValueChange={(v) => setCountType(v as CountType)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CYCLE">Cycle Count</SelectItem>
            <SelectItem value="ANNUAL">Annual Physical</SelectItem>
            <SelectItem value="ADHOC">Ad-Hoc Count</SelectItem>
            <SelectItem value="BLIND">Blind Count</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>ABC Class (Optional)</Label>
        <Select
          value={abcClass || "all"}
          onValueChange={(v) => setAbcClass(v === "all" ? undefined : (v as AbcClass))}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            <SelectItem value="A">Class A (Top 20%)</SelectItem>
            <SelectItem value="B">Class B (Next 30%)</SelectItem>
            <SelectItem value="C">Class C (Next 50%)</SelectItem>
            <SelectItem value="D">Class D (Slow movers)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Assigned To (Badge ID)</Label>
        <Input
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder="e.g. j.patel"
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label>Team</Label>
        <Input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="e.g. Alpha"
          className="h-8 text-xs"
        />
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
          {submitting ? "Creating..." : "Create Count"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ScheduleForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    name: string;
    countType: CountType;
    abcClass?: AbcClass;
    frequency: CountScheduleFrequency;
    varianceTolerancePct: number;
    autoAdjust: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [countType, setCountType] = useState<CountType>("CYCLE");
  const [abcClass, setAbcClass] = useState<AbcClass | undefined>(undefined);
  const [frequency, setFrequency] = useState<CountScheduleFrequency>("monthly");
  const [tolerance, setTolerance] = useState(2);
  const [autoAdjust, setAutoAdjust] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      name: name || `${countType} Schedule`,
      countType,
      abcClass: abcClass || undefined,
      frequency,
      varianceTolerancePct: tolerance,
      autoAdjust,
    });
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Schedule Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Class A Monthly Cycle"
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label>Count Type</Label>
        <Select value={countType} onValueChange={(v) => setCountType(v as CountType)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CYCLE">Cycle Count</SelectItem>
            <SelectItem value="ANNUAL">Annual Physical</SelectItem>
            <SelectItem value="ADHOC">Ad-Hoc Count</SelectItem>
            <SelectItem value="BLIND">Blind Count</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>ABC Class (Optional)</Label>
        <Select
          value={abcClass || "all"}
          onValueChange={(v) => setAbcClass(v === "all" ? undefined : (v as AbcClass))}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            <SelectItem value="A">Class A</SelectItem>
            <SelectItem value="B">Class B</SelectItem>
            <SelectItem value="C">Class C</SelectItem>
            <SelectItem value="D">Class D</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Frequency</Label>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as CountScheduleFrequency)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="semi_annual">Semi-Annual</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Variance Tolerance (%)</Label>
        <Input
          type="number"
          value={tolerance}
          onChange={(e) => setTolerance(parseInt(e.target.value) || 0)}
          className="h-8 text-xs"
          min={0}
          max={100}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="autoAdjust"
          checked={autoAdjust}
          onChange={(e) => setAutoAdjust(e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="autoAdjust" className="text-xs cursor-pointer">
          Auto-adjust variances within tolerance
        </Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Creating..." : "Create Schedule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
