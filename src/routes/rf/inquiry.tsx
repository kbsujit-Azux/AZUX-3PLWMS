/**
 * ============================================================
 *  MODULE INDEX — RF Gun: Inquiry Terminal
 * ============================================================
 *
 *  Purpose: Polymorphic scan inquiry — scan a pallet, location,
 *           or SKU/UPC and get contextual data. Single unified
 *           input with mode toggle for fast floor lookup.
 *
 *  Modes:
 *    pallet  → full pallet detail (item, qty, location, PO)
 *    location→ all pallets at location + slot info
 *    sku     → global warehouse balance across all batches
 *
 *  Extension points:
 *    - Add batch-level expiration date lookup
 *    - Add hold/quarantine location filtering
 *    - Add cross-warehouse transfer inquiry
 * ============================================================
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { ScanLine, Package, MapPin, Boxes, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRfSession } from "@/lib/rf-session";
import { fetchPallets, fetchInventoryItems, fetchLocations } from "@/lib/firestore-data";

type ScanMode = "pallet" | "location" | "sku";

function InquiryInner() {
  const { employee, verified } = useRfSession();
  const [mode, setMode] = useState<ScanMode>("pallet");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [detail, setDetail] = useState<string[]>([]);
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

  const handleScan = useCallback(async () => {
    if (!employee || !input.trim()) return;
    const token = input.trim().toUpperCase();
    setResult(null);
    setDetail([]);

    if (mode === "pallet") {
      const list = await fetchPallets(employee.assignedClientId, employee.assignedWarehouseId);
      const found = list.find((p) => p.id.toUpperCase() === token);
      if (!found) {
        setResult("NOT FOUND");
        playChime("err");
        return;
      }
      playChime("ok");
      setResult("PALLET");
      setDetail([
        `ID:    ${found.id}`,
        `SKU:   ${found.sku}`,
        `Desc:  ${found.description}`,
        `Units: ${found.units}`,
        `Loc:   ${found.location ?? found.suggestedLocation}`,
        `PO:    ${found.poNumber}`,
        `Src:   ${found.ediSource}`,
      ]);
    } else if (mode === "location") {
      const locs = await fetchLocations();
      const found = locs.find((l) => l.id.toUpperCase() === token);
      if (!found) {
        setResult("NOT FOUND");
        playChime("err");
        return;
      }
      const pallets = await fetchPallets(employee.assignedClientId, employee.assignedWarehouseId);
      const atLoc = pallets.filter(
        (p) =>
          (p.location?.toUpperCase() === token || p.suggestedLocation?.toUpperCase() === token) &&
          p.status !== "shipped",
      );
      playChime("ok");
      setResult("LOCATION");
      setDetail([
        `ID:       ${found.id}`,
        `Type:     ${found.type}`,
        `Zone:     ${found.zone}`,
        `Pickable: ${found.pickable ? "YES" : "NO"}`,
        `Capacity: ${found.capacityPallets}`,
        `Occupied: ${found.occupiedPallets}`,
        `Pallets:  ${atLoc.length}`,
        ...atLoc.slice(0, 5).map((p) => `  · ${p.id} (${p.sku})`),
      ]);
    } else {
      const items = await fetchInventoryItems(
        employee.assignedClientId,
        employee.assignedWarehouseId,
      );
      const found = items.find((i) => i.sku.toUpperCase() === token || i.upc === token);
      if (!found) {
        setResult("NOT FOUND");
        playChime("err");
        return;
      }
      const total = found.batches.reduce((s, b) => s + b.qty, 0);
      const allocated = found.batches.reduce((s, b) => s + (b.qtyAllocated ?? 0), 0);
      playChime("ok");
      setResult("ITEM / SKU");
      setDetail([
        `SKU:       ${found.sku}`,
        `UPC:       ${found.upc}`,
        `Desc:      ${found.description}`,
        `Status:    ${found.status}`,
        `Total OH:  ${total}`,
        `Allocated: ${allocated}`,
        `Available: ${total - allocated}`,
        ...found.batches.slice(0, 6).map((b) => `  · ${b.location} — ${b.qty} units`),
      ]);
    }
  }, [employee, mode, input, playChime]);

  if (!verified) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ScanLine className="h-5 w-5 text-emerald-400" />
        <h1 className="text-lg font-semibold">Inquiry Terminal</h1>
      </div>

      <div className="flex gap-2">
        {(["pallet", "location", "sku"] as ScanMode[]).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? "default" : "outline"}
            className={`flex-1 h-10 text-[11px] font-medium uppercase tracking-wider ${
              mode === m ? "bg-emerald-600 text-white" : "border-slate-700 text-slate-400"
            }`}
            onClick={() => {
              setMode(m);
              setInput("");
              setResult(null);
              setDetail([]);
            }}
          >
            {m === "pallet" ? (
              <Package className="h-3 w-3 mr-1" />
            ) : m === "location" ? (
              <MapPin className="h-3 w-3 mr-1" />
            ) : (
              <Boxes className="h-3 w-3 mr-1" />
            )}
            {m}
          </Button>
        ))}
      </div>

      <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
        <Label className="text-xs text-slate-300">
          Scan {mode === "pallet" ? "Pallet ID" : mode === "location" ? "Location ID" : "SKU / UPC"}
        </Label>
        <Input
          ref={inputRef}
          autoFocus
          placeholder={
            mode === "pallet" ? "PLT-XXXX-XXXXX" : mode === "location" ? "A12-03-B" : "SKU or UPC"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleScan();
          }}
          className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg uppercase"
        />
        <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500" onClick={handleScan}>
          <ScanLine className="h-4 w-4 mr-2" /> Look Up
        </Button>
      </Card>

      {result && (
        <Card
          className={`p-4 space-y-2 ${result === "NOT FOUND" ? "border-amber-500/50 bg-amber-950/20" : "border-emerald-500/50 bg-emerald-950/20"}`}
        >
          <div
            className={`flex items-center gap-2 text-xs font-medium ${result === "NOT FOUND" ? "text-amber-400" : "text-emerald-400"}`}
          >
            {result === "NOT FOUND" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {result}
          </div>
          {detail.map((line, i) => (
            <div key={i} className="text-xs text-slate-300 font-mono">
              {line}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rf/inquiry")({
  component: function InquiryRoute() {
    return <InquiryInner />;
  },
});
