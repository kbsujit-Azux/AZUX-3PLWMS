import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { PackageSearch, TrendingUp, TrendingDown, ArrowUpRight, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  analyzeSlottingEfficiency,
  computeSkuVelocity,
  type SlottingRecommendation,
  type VelocityProfile,
  getVelocityColor,
  getPriorityBadge,
} from "@/lib/slotting-engine";
import { pallets, type Pallet, appendPallets } from "@/lib/pallet-data";
import { locationMaster, updateLocationInMaster } from "@/lib/master-data";
import { fetchMovementHistory, type MovementHistory } from "@/lib/firestore-data";
import { itemMaster } from "@/lib/master-data";
import { warehouses } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/slotting")({
  head: () => ({
    meta: [
      { title: "Dynamic Slotting — AZUX 3PL WMS Systems" },
      { name: "description", content: "AI-driven slotting recommendations based on velocity analysis." },
    ],
  }),
  component: SlottingPage,
});

function SlottingPage() {
  const [warehouseId, setWarehouseId] = useState("atl1");
  const [recommendations, setRecommendations] = useState<SlottingRecommendation[]>([]);
  const [velocityBySku, setVelocityBySku] = useState<Map<string, VelocityProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [selectedRec, setSelectedRec] = useState<SlottingRecommendation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    fetchMovementHistory().then((allMovements) => {
      if (cancelled) return;
      const recs = analyzeSlottingEfficiency(pallets, locationMaster, allMovements, itemMaster, warehouseId);
      setRecommendations(recs);

      const velMap = new Map<string, VelocityProfile>();
      for (const sku of new Set(pallets.map((p) => p.sku))) {
        velMap.set(sku, computeSkuVelocity(allMovements, sku));
      }
      setVelocityBySku(velMap);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [warehouseId]);

  const highPriority = useMemo(() => recommendations.filter((r) => r.priority === "high"), [recommendations]);
  const mediumPriority = useMemo(() => recommendations.filter((r) => r.priority === "medium"), [recommendations]);

  const handleReslotClick = (rec: SlottingRecommendation) => {
    setSelectedRec(rec);
    setConfirmOpen(true);
  };

  const handleReslotConfirm = async () => {
    if (!selectedRec || !selectedRec.suggestedLocationId) return;
    setExecuting(true);
    setConfirmOpen(false);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const pallet = pallets.find((p) => p.sku === selectedRec.sku && p.location === selectedRec.currentLocationId);
      if (pallet) {
        appendPallets([{ ...pallet, location: selectedRec.suggestedLocationId, suggestedLocation: selectedRec.suggestedLocationId }]);
      }
      updateLocationInMaster(selectedRec.currentLocationId, { occupiedPallets: Math.max(0, (locationMaster.find((l) => l.id === selectedRec.currentLocationId)?.occupiedPallets ?? 0) - 1) });
      const newLoc = locationMaster.find((l) => l.id === selectedRec.suggestedLocationId);
      if (newLoc) {
        updateLocationInMaster(selectedRec.suggestedLocationId, { occupiedPallets: (newLoc.occupiedPallets ?? 0) + 1 });
      }
      setRecommendations((prev) => prev.filter((r) => !(r.sku === selectedRec.sku && r.currentLocationId === selectedRec.currentLocationId)));
      toast.success(`Reslotted ${selectedRec.sku} to ${selectedRec.suggestedLocationId}`);
    } catch (e: unknown) {
      toast.error("Reslot failed: " + (e instanceof Error ? e.message : "unknown error"));
    } finally {
      setExecuting(false);
      setSelectedRec(null);
    }
  };

  return (
    <div className="px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dynamic Slotting Engine</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI-driven recommendations based on 30-day velocity analysis
          </p>
        </div>
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {warehouses.filter((w) => w.id !== "all").map((w) => (
            <option key={w.id} value={w.id}>{w.code} — {w.city}</option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">High Priority</span>
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-red-400">{highPriority.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Fast movers in wrong zones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Medium Priority</span>
              <TrendingDown className="h-4 w-4 text-orange-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-orange-400">{mediumPriority.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Slow movers in forward pick</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Recommendations</span>
              <PackageSearch className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{recommendations.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Across all zones</p>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Slotting Recommendations</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Sorted by priority. Execute moves to optimize forward pick and reserve storage.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              No slotting recommendations. Warehouse is optimally configured.
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Priority</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Current Location</th>
                    <th className="px-3 py-2 font-medium">Suggested Location</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((rec, i) => {
                    const velocity = velocityBySku.get(rec.sku);
                    return (
                      <tr key={`${rec.sku}-${rec.currentLocationId}-${i}`} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${getPriorityBadge(rec.priority)}`}>
                            {rec.priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{rec.sku}</div>
                          {velocity && (
                            <div className={`text-[10px] ${getVelocityColor(Math.round(velocity.totalVelocity * 100))}`}>
                              {velocity.picksPerDay.toFixed(1)} picks/day
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{rec.currentLocationId}</td>
                        <td className="px-3 py-2 font-mono">{rec.suggestedLocationId || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[240px]">{rec.impact}</td>
                        <td className="px-3 py-2 text-right">
                          {rec.suggestedLocationId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px]"
                              onClick={() => handleReslotClick(rec)}
                              disabled={executing}
                            >
                              {executing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reslot"}
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No slot available</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmOpen && selectedRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Confirm Reslot</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>SKU: <span className="font-mono text-foreground">{selectedRec.sku}</span></div>
              <div>From: <span className="font-mono text-foreground">{selectedRec.currentLocationId}</span></div>
              <div>To: <span className="font-mono text-foreground">{selectedRec.suggestedLocationId}</span></div>
              <div>Reason: <span className="text-foreground">{selectedRec.impact}</span></div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setConfirmOpen(false); setSelectedRec(null); }} disabled={executing}>Cancel</Button>
              <Button onClick={handleReslotConfirm} disabled={executing}>
                {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Reslot"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
