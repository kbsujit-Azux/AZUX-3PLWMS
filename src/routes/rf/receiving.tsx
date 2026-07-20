/**
 * ============================================================
 *  MODULE INDEX — RF Gun: Dock Receiving & Palletization
 * ============================================================
 *
 *  Purpose: Step-by-step inbound receiving — scan container,
 *           verify SKU manifest counts, then split received
 *           quantity across N new pallets with NEW status.
 *
 *  Flow:
 *    scan-container → manifest (per-line count) → pallet-split → complete
 *
 *  Firestore writes:
 *    /pallets/{id}: new pallets with status "NEW"
 *    /movementHistory/{id}: append DOCK_RECEIVING audit
 *    /inboundShipments/{id}: receiveInboundShipment (qty update)
 *
 *  Extension points:
 *    - Add ASN line-level discrepancy tracking
 *    - Add OSD (out-of-spec / damage) recording per line
 *    - Add license plate verification per pallet
 * ============================================================
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
  ScanLine,
  Package,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Plus,
  Mic,
  MicOff,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useRfSession } from "@/lib/rf-session";
import { fetchInboundShipments, receiveInboundShipment } from "@/lib/firestore-data";
import { createPalletsFromInbound } from "@/lib/pallet-data";
import { DROP001_LOCATION } from "@/lib/mock-data";
import { type InboundShipment, type InboundLine } from "@/lib/inbound-data";
import { useVoicePicking } from "@/hooks/useVoicePicking";
import { useTTS, ttsSpeak } from "@/lib/tts";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

type Step = "scan-container" | "manifest" | "pallet-split" | "complete";

function ReceivingInner() {
  const { employee, verified } = useRfSession();
  const [step, setStep] = useState<Step>("scan-container");
  const [shipment, setShipment] = useState<InboundShipment | null>(null);
  const [lineIdx, setLineIdx] = useState(0);
  const [receivedMap, setReceivedMap] = useState<Record<number, number>>({});
  const [splits, setSplits] = useState<{ palletSeq: number; units: number; cases: number }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const containerRef = useRef<HTMLInputElement>(null);

  const { enqueue, online } = useOfflineSync();

  const {
    mode: scanMode,
    setMode: setScanMode,
    videoRef,
    lastCode,
    toggleCamera,
  } = useBarcodeScanner({
    active: verified,
    onScan: (code) => {
      if (step === "scan-container") handleContainerScan(code);
    },
  });

  const tts = useTTS();

  const voice = useVoicePicking({
    enabled: voiceEnabled,
    locale: "en-US",
    continuous: true,
    onCommand: (cmd) => {
      if (!verified || busy) return;
      switch (cmd.command) {
        case "confirm":
          if (step === "manifest" && shipment && shipment.lines[lineIdx]) {
            const qtyInput = document.querySelector<HTMLInputElement>('input[type="number"]');
            const qty = parseInt(qtyInput?.value ?? "", 10);
            if (!isNaN(qty)) {
              recordCount(shipment.lines[lineIdx], qty);
              tts.speak("Count recorded");
            }
          } else if (step === "pallet-split" && splits.length > 0) {
            commitReceiving();
            tts.speak("Creating pallets");
          }
          break;
        case "next":
          if (step === "manifest" && shipment && lineIdx < shipment.lines.length - 1) {
            setLineIdx((i) => i + 1);
            tts.speak(`Line ${lineIdx + 2}`);
          }
          break;
        case "cancel":
          setStep("scan-container");
          setShipment(null);
          setReceivedMap({});
          setSplits([]);
          setError("");
          tts.speak("Cancelled");
          break;
        case "help":
          tts.speak("Say confirm to record count or create pallets, next for next line, cancel to start over");
          break;
        default:
          break;
      }
    },
    onError: (err) => {
      console.error("Voice picking error:", err);
    },
  });

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

  const handleContainerScan = useCallback(async (code?: string) => {
    if (!employee || busy) return;
    const containerNo = code ?? containerRef.current?.value.trim();
    if (!containerNo) {
      setError("Scan or enter Container Number");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const list = await fetchInboundShipments(
        employee.assignedClientId,
        employee.assignedWarehouseId,
      );
      const found = list.find(
        (s) =>
          s.containerNumber.toLowerCase() === containerNo.toLowerCase() ||
          s.id.toLowerCase() === containerNo.toLowerCase(),
      );
      if (!found) {
        setError(`Shipment for container ${containerNo} not found`);
        playChime("err");
        setBusy(false);
        return;
      }
      setShipment(found);
      setReceivedMap({});
      setSplits([]);
      setLineIdx(0);
      setStep("manifest");
      playChime("ok");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      playChime("err");
    } finally {
      setBusy(false);
    }
  }, [employee, busy, playChime]);

  const recordCount = useCallback(
    async (line: InboundLine, qty: number) => {
      if (!shipment || !employee || busy) return;
      setBusy(true);
      setError("");
      try {
        if (!online) {
          enqueue({
            collection: "inboundShipments",
            docId: shipment.id,
            type: "update",
            data: {
              [`lines.${line.lineNo}.receivedQty`]: qty,
              status: "received",
              receivedAt: new Date().toISOString(),
            },
          });
          toast.success("Saved offline — will sync when connected");
          setReceivedMap((m) => ({ ...m, [line.lineNo]: qty }));
          playChime("ok");
          if (lineIdx < shipment.lines.length - 1) {
            setLineIdx((i) => i + 1);
          } else {
            setStep("pallet-split");
          }
          return;
        }
        await receiveInboundShipment(shipment.id, line.lineNo, qty, []);
        setReceivedMap((m) => ({ ...m, [line.lineNo]: qty }));
        playChime("ok");
        if (lineIdx < shipment.lines.length - 1) {
          setLineIdx((i) => i + 1);
        } else {
          setStep("pallet-split");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Receive failed");
        playChime("err");
      } finally {
        setBusy(false);
      }
    },
    [shipment, employee, busy, lineIdx, playChime, online, enqueue],
  );

  const initSplits = useCallback(
    (count: number) => {
      const current = shipment?.lines[lineIdx];
      const totalQty = receivedMap[lineIdx] ?? current?.qtyExpected ?? 0;
      const perPallet = Math.ceil(totalQty / count);
      const arr: { palletSeq: number; units: number; cases: number }[] = [];
      for (let i = 0; i < count; i++) {
        const units = i === count - 1 ? totalQty - perPallet * (count - 1) : perPallet;
        arr.push({
          palletSeq: i + 1,
          units: Math.max(0, units),
          cases: Math.ceil(Math.max(0, units) / (current?.unitsPerPallet ?? 1)),
        });
      }
      setSplits(arr);
    },
    [shipment, lineIdx, receivedMap],
  );

  const commitReceiving = useCallback(async () => {
    if (!shipment || !employee || busy || splits.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const line = shipment.lines[lineIdx];
      const totalUnits = splits.reduce((s, sp) => s + sp.units, 0);
      const palletCount = splits.length;
      const prefix = `PLT-${employee.assignedWarehouseId.toUpperCase()}`;
      const newPallets = createPalletsFromInbound({
        sku: line.sku,
        description: line.description,
        itemStyle: line.itemStyle,
        tenantId: shipment.tenantId,
        warehouseId: shipment.warehouseId,
        poNumber: shipment.poNumber,
        ediSource: shipment.source,
        palletCount,
        unitsPerPallet: Math.max(1, Math.ceil(totalUnits / palletCount)),
        casePack: line.unitsPerPallet,
        weightLbsPerUnit: line.weightLbsPerUnit,
        builtBy: employee.name,
        prefix,
      });
      toast.success(`${palletCount} pallet(s) created for ${line.sku}`);
      playChime("ok");
      setStep("complete");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Pallet creation failed");
      playChime("err");
    } finally {
      setBusy(false);
    }
  }, [shipment, employee, busy, lineIdx, splits, playChime]);

  if (!verified) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Container className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">Dock Receiving</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant={scanMode === "camera" ? "default" : "ghost"}
            size="sm"
            onClick={toggleCamera}
            title={scanMode === "camera" ? "Camera Scan ON" : "Camera Scan OFF"}
          >
            <ScanLine className="h-4 w-4" />
          </Button>
          <Button
            variant={voiceEnabled ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setVoiceEnabled((v) => !v);
              if (!voiceEnabled) {
                tts.speak("Voice enabled");
              } else {
                tts.speak("Voice disabled");
              }
            }}
          >
            {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {voice.listening && (
        <div className="text-xs text-emerald-400 animate-pulse">Listening...</div>
      )}

      {scanMode === "camera" && (
        <Card className="p-2 space-y-2">
          <video
            ref={videoRef}
            className="w-full h-40 bg-black rounded"
            playsInline
            muted
          />
          {lastCode && (
            <div className="text-xs font-mono text-emerald-400">
              Last scan: {lastCode}
            </div>
          )}
        </Card>
      )}

      {error && (
        <Card className="border-amber-500/50 bg-amber-950/30 p-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {step === "scan-container" && scanMode === "manual" && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <Label className="text-xs text-slate-300">Scan Container / Work ID</Label>
          <Input
            ref={containerRef}
            autoFocus
            placeholder="Container number or ASN ID"
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleContainerScan();
            }}
          />
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => handleContainerScan()}
            disabled={busy}
          >
            <ScanLine className="h-4 w-4 mr-2" /> Look Up Shipment
          </Button>
        </Card>
      )}

      {step === "manifest" && shipment && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="text-xs text-slate-400">
            Shipment: <span className="font-mono text-white">{shipment.id}</span> · PO:{" "}
            <span className="font-mono text-white">{shipment.poNumber}</span>
          </div>
          {shipment.lines[lineIdx] && (
            <div className="space-y-2">
              <div className="text-xs text-slate-300">
                Line {lineIdx + 1}/{shipment.lines.length}:{" "}
                <span className="font-mono text-white">{shipment.lines[lineIdx].sku}</span> —{" "}
                {shipment.lines[lineIdx].description}
              </div>
              <div className="text-xs text-slate-400">
                Expected: {shipment.lines[lineIdx].qtyExpected} units ·{" "}
                {shipment.lines[lineIdx].cartonsExpected} cartons
              </div>
              <Label className="text-xs text-slate-300">Received Quantity</Label>
              <Input
                autoFocus
                type="number"
                placeholder="Enter units received"
                className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const qty = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!isNaN(qty)) recordCount(shipment.lines[lineIdx], qty);
                  }
                }}
              />
              <Button
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>('input[type="number"]');
                  const qty = parseInt(input?.value ?? "", 10);
                  if (!isNaN(qty) && shipment.lines[lineIdx])
                    recordCount(shipment.lines[lineIdx], qty);
                }}
                disabled={busy}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Count
              </Button>
            </div>
          )}
        </Card>
      )}

      {step === "pallet-split" && shipment && shipment.lines[lineIdx] && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="text-xs text-slate-300">
            Create pallets for:{" "}
            <span className="font-mono text-white">{shipment.lines[lineIdx].sku}</span>
          </div>
          <Label className="text-xs text-slate-300">Number of Pallets</Label>
          <Input
            autoFocus
            type="number"
            min={1}
            placeholder="e.g. 2"
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (n >= 1) initSplits(n);
            }}
          />
          {splits.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Pallet breakdown:</div>
              {splits.map((sp) => (
                <div
                  key={sp.palletSeq}
                  className="flex items-center justify-between border border-slate-800 rounded-md p-2"
                >
                  <span className="text-xs text-slate-300">Pallet {sp.palletSeq}</span>
                  <span className="text-xs font-mono text-white">
                    {sp.units} units · {sp.cases} cases
                  </span>
                </div>
              ))}
              <Button
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
                onClick={commitReceiving}
                disabled={busy}
              >
                <Plus className="h-4 w-4 mr-2" /> Create Pallets
              </Button>
            </div>
          )}
        </Card>
      )}

      {step === "complete" && (
        <Card className="border-emerald-500/50 bg-emerald-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Receipt complete</span>
          </div>
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => {
              setStep("scan-container");
              setShipment(null);
              setReceivedMap({});
              setSplits([]);
              setError("");
            }}
          >
            Next Receipt
          </Button>
        </Card>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rf/receiving")({
  component: function ReceivingRoute() {
    return <ReceivingInner />;
  },
});
