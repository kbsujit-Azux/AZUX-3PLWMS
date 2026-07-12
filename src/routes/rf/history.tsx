/**
 * ============================================================
 *  MODULE INDEX — RF Gun: Item History Timeline
 * ============================================================
 *
 *  Purpose: Movement audit timeline — scan any SKU/UPC to see
 *           the last 25 movement records (who, when, from/to).
 *           Reads from the append-only /movementHistory collection.
 *
 *  Firestore reads:
 *    fetchMovementHistory({ itemCode, tenantId, limit: 25 })
 *
 *  Extension points:
 *    - Add date range filter
 *    - Add movement type filter
 *    - Add export to CSV for audit reporting
 * ============================================================
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { History, ScanLine, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRfSession } from "@/lib/rf-session";
import { fetchMovementHistory } from "@/lib/firestore-data";
import type { MovementHistory } from "@/lib/rf-types";

function HistoryInner() {
  const { employee, verified } = useRfSession();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<MovementHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const playChime = useCallback((type: "ok" | "err") => {
    try {
      const AudioCtx =
        window.AudioContext ||
        ((window as unknown as Record<string, unknown>)
          .webkitAudioContext as unknown as typeof AudioContext);
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = type === "ok" ? 880 : 220;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio not available
    }
  }, []);

  const handleLookup = useCallback(async () => {
    if (!employee || !input.trim()) return;
    setLoading(true);
    setEntries([]);
    try {
      const results = await fetchMovementHistory({
        itemCode: input.trim(),
        tenantId: employee.assignedClientId,
        limit: 25,
      });
      setEntries(results);
      playChime("ok");
    } catch {
      playChime("err");
    } finally {
      setLoading(false);
    }
  }, [employee, input, playChime]);

  if (!verified) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-emerald-400" />
        <h1 className="text-lg font-semibold">Item History</h1>
      </div>

      <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
        <Label className="text-xs text-slate-300">Scan SKU / UPC / Item Code</Label>
        <Input
          ref={inputRef}
          autoFocus
          placeholder="SKU or UPC barcode"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLookup();
          }}
          className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
        />
        <Button
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
          onClick={handleLookup}
          disabled={loading}
        >
          {loading ? "Loading…" : "Lookup History"}
        </Button>
      </Card>

      {entries.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Last {entries.length} movements
          </div>
          {entries.map((e) => (
            <Card key={e.movementId} className="border-slate-800 bg-slate-900 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {e.type}
                </Badge>
                <span className="text-[10px] text-slate-500">
                  {(() => {
                    const raw = (e as unknown as Record<string, unknown>).timestamp;
                    if (
                      raw &&
                      typeof raw === "object" &&
                      "toDate" in raw &&
                      typeof (raw as Record<string, unknown>).toDate === "function"
                    ) {
                      const toDateFn = (raw as Record<string, () => Date>).toDate;
                      const date = toDateFn();
                      return (
                        date.toLocaleString?.("en-US", {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        }) ?? "—"
                      );
                    }
                    if (typeof raw === "string") return raw;
                    return "—";
                  })()}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                <div>Item: {e.itemCode}</div>
                <div>
                  {e.fromLocationId || "—"} → {e.toLocationId || "—"}
                </div>
                <div>
                  Qty: {e.movedQty} {e.uom} · Ref: {e.referenceId}
                </div>
                <div className="text-slate-500">By: {e.badgeId}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {entries.length === 0 && !loading && input && (
        <Card className="border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <AlertTriangle className="h-4 w-4" />
            No movement history found for this item
          </div>
        </Card>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rf/history")({
  component: function HistoryRoute() {
    return <HistoryInner />;
  },
});
