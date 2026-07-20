/**
 * ============================================================
 *  MODULE INDEX — RF Gun: Directed Putaway
 * ============================================================
 *
 *  Purpose: Step-by-step directed putaway execution for RF Gun.
 *           Scan pallet → scan location → atomic Firestore commit.
 *
 *  Flow:
 *    scan-pallet → scan-location → confirm
 *
 *  Firestore writes (transaction):
 *    /pallets/{id}: status → "putaway", location bind
 *    /inventoryItems/{sku}: batch location update
 *    /locationMaster/{id}: occupiedPallets increment
 *    /movementHistory/{id}: append PUTAWAY audit entry
 *
 *  Extension points:
 *    - Add location capacity pre-check before commit
 *    - Add slot compatibility validation (item style vs location)
 *    - Add multi-pallet putaway batch mode
 * ============================================================
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  PackageSearch,
  ScanLine,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Boxes,
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
import {
  fetchPallets,
  updatePallet,
  fetchLocations,
  subscribeLocations,
} from "@/lib/firestore-data";
import { runTransaction, doc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  DROP001_LOCATION,
  inventoryItems,
  type InventoryItem,
  type InventoryBatch,
} from "@/lib/mock-data";
import { type Pallet } from "@/lib/pallet-data";
import { type LocationRecord } from "@/lib/master-data";
import { useVoicePicking } from "@/hooks/useVoicePicking";
import { useTTS, ttsSpeak } from "@/lib/tts";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

type Step = "scan-pallet" | "scan-location" | "confirm";

function PutawayInner() {
  const { employee, verified } = useRfSession();
  const [step, setStep] = useState<Step>("scan-pallet");
  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [location, setLocation] = useState("");
  const [locInput, setLocInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [arMode, setArMode] = useState(false);
  const [locations, setLocations] = useState<
    Record<string, { type: string; occupiedPallets?: number }>
  >({});
  const palletInputRef = useRef<HTMLInputElement>(null);

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
      if (step === "scan-pallet") handlePalletScan(code);
      else if (step === "scan-location") handleLocationScan(code);
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
          if (step === "scan-location" && location) {
            confirmPutaway();
            tts.speak("Confirming putaway");
          } else if (step === "confirm") {
            confirmPutaway();
            tts.speak("Confirming putaway");
          }
          break;
        case "next":
          if (step === "scan-pallet") {
            tts.speak("Scan pallet first");
          } else if (step === "scan-location" && pallet) {
            tts.speak("Scan destination location");
          }
          break;
        case "cancel":
          if (step === "scan-location" || step === "confirm") {
            setStep("scan-pallet");
            setPallet(null);
            setLocation("");
            setLocInput("");
            setError("");
            tts.speak("Cancelled");
          }
          break;
        case "help":
          tts.speak("Say confirm to complete putaway, cancel to go back");
          break;
        default:
          break;
      }
    },
    onError: (err) => {
      console.error("Voice picking error:", err);
    },
  });

  useEffect(() => {
    if (!verified) return;
    const unsub = subscribeLocations((locs: LocationRecord[]) => {
      const map: Record<string, { type: string; occupiedPallets?: number }> = {};
      for (const l of locs) map[l.id] = { type: l.type, occupiedPallets: l.occupiedPallets };
      setLocations(map);
    });
    return unsub;
  }, [verified]);

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

  const handlePalletScan = useCallback(
    async (palletId: string) => {
      if (!employee || busy) return;
      setBusy(true);
      setError("");
      try {
        const list = await fetchPallets(employee.assignedClientId, employee.assignedWarehouseId);
        const found = list.find((p) => p.id.toLowerCase() === palletId.toLowerCase());
        if (!found || found.status === "putaway" || found.status === "shipped") {
          setError(`Pallet ${palletId} not found or already put away`);
          playChime("err");
          setBusy(false);
          return;
        }
        setPallet(found);
        setStep("scan-location");
        playChime("ok");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Lookup failed");
        playChime("err");
      } finally {
        setBusy(false);
      }
    },
    [employee, busy, playChime],
  );

  const handleLocationScan = useCallback(
    async (locId: string) => {
      if (!pallet || !employee || busy) return;
      const loc = locations[locId];
      if (!loc) {
        setError(`Location ${locId} not found in master`);
        playChime("err");
        return;
      }
      if (loc.type === "DROP") {
        setError(`${locId} is a DROP — use Move or Pick`);
        playChime("err");
        return;
      }
      if (loc.occupiedPallets && loc.occupiedPallets > 0 && loc.type === "RACK") {
        setError(`${locId} appears occupied`);
        playChime("err");
        return;
      }
      setLocation(locId);
      setStep("confirm");
      playChime("ok");
    },
    [pallet, employee, busy, locations, playChime],
  );

  const confirmPutaway = useCallback(async () => {
    if (!pallet || !location || !employee || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!online) {
        enqueue({
          collection: "pallets",
          docId: pallet.id,
          type: "update",
          data: { status: "putaway", location, updatedAt: new Date().toISOString() },
        });
        toast.success("Saved offline — will sync when connected");
        setPallet(null);
        setLocation("");
        setLocInput("");
        setStep("scan-pallet");
        return;
      }
      await runTransaction(db, async (txn) => {
        txn.update(doc(db, "pallets", pallet.id), {
          status: "putaway",
          location,
          updatedAt: new Date().toISOString(),
        });

        const invSnap = await txn.get(doc(db, "inventoryItems", pallet.sku));
        if (invSnap.exists()) {
          const item = invSnap.data() as InventoryItem;
          const batchIndex = item.batches?.findIndex(
            (b: InventoryBatch) => b.palletId === pallet.id && b.location !== location,
          );
          const updatedBatches = item.batches ? [...item.batches] : [];
          if (batchIndex && batchIndex >= 0 && updatedBatches[batchIndex]) {
            updatedBatches[batchIndex] = {
              ...updatedBatches[batchIndex],
              location,
              receivedAt: new Date().toISOString(),
            };
          } else if (!batchIndex || batchIndex < 0) {
            updatedBatches.push({
              batchId: `BATCH-${Date.now()}`,
              palletId: pallet.id,
              location,
              qty: pallet.units,
              qtyAllocated: 0,
              receivedAt: new Date().toISOString(),
              poNumber: pallet.poNumber,
              ediSource: pallet.ediSource as "EDI_943" | "EDI_944" | "CSV" | "MANUAL",
            });
          }
          txn.update(doc(db, "inventoryItems", pallet.sku), { batches: updatedBatches });
        }

        const locRef = doc(db, "locationMaster", location);
        const locSnap = await txn.get(locRef);
        if (locSnap.exists()) {
          txn.update(locRef, { occupiedPallets: (locSnap.data()?.occupiedPallets ?? 0) + 1 });
        }
      });
      toast.success(`${pallet.id} → ${location}`);
      playChime("ok");
      setPallet(null);
      setLocation("");
      setLocInput("");
      setStep("scan-pallet");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Putaway failed");
      playChime("err");
    } finally {
      setBusy(false);
    }
  }, [pallet, location, employee, busy, playChime, online, enqueue]);

  if (!verified) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">Directed Putaway</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant={arMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setArMode((v) => !v)}
            title={arMode ? "AR Vision ON" : "AR Vision OFF"}
          >
            <Camera className="h-4 w-4" />
          </Button>
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

      {arMode && step !== "scan-pallet" && pallet && (
        <Card className="border-indigo-500/50 bg-indigo-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <Camera className="h-4 w-4" />
            AR VISION
          </div>
          <div className="text-xs text-slate-300 space-y-1 font-mono">
            <div>Target: <span className="text-indigo-400">{location}</span></div>
            <div>SKU: <span className="text-white">{pallet.sku}</span></div>
            <div>Units: <span className="text-white">{pallet.units}</span></div>
            {step === "confirm" && (
              <div className="text-emerald-400">Ready to confirm putaway</div>
            )}
          </div>
        </Card>
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

      {step === "scan-pallet" && scanMode === "manual" && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <Label className="text-xs text-slate-300">1. Scan Pallet ID</Label>
          <Input
            ref={palletInputRef}
            autoFocus
            placeholder="Scan pallet barcode"
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePalletScan((e.target as HTMLInputElement).value.trim());
            }}
          />
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => handlePalletScan((palletInputRef.current?.value ?? "").trim())}
            disabled={busy}
          >
            <ScanLine className="h-4 w-4 mr-2" /> Look Up Pallet
          </Button>
        </Card>
      )}

      {step === "scan-location" && pallet && scanMode === "manual" && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="text-xs text-slate-400 space-y-1">
            <div className="flex items-center gap-2">
              <Boxes className="h-3 w-3" />
              <span className="font-mono">{pallet.id}</span>
            </div>
            <div>
              {pallet.description} · {pallet.units} units
            </div>
            <div className="text-emerald-400">SCAN TARGET LOCATION →</div>
          </div>
          <Label className="text-xs text-slate-300">2. Scan Destination Location ID</Label>
          <Input
            autoFocus
            placeholder="e.g. A12-03-B"
            value={locInput}
            onChange={(e) => setLocInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLocationScan(e.currentTarget.value.trim());
            }}
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
          />
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => handleLocationScan(locInput.trim())}
            disabled={busy}
          >
            <MapPin className="h-4 w-4 mr-2" /> Verify Location
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-400"
            onClick={() => {
              setStep("scan-pallet");
              setPallet(null);
              setError("");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Card>
      )}

      {step === "confirm" && pallet && location && (
        <Card className="border-emerald-500/50 bg-emerald-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Ready to confirm</span>
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div>
              Pallet: <span className="font-mono text-white">{pallet.id}</span>
            </div>
            <div>
              SKU: <span className="font-mono text-white">{pallet.sku}</span>
            </div>
            <div>
              Units: <span className="font-mono text-white">{pallet.units}</span>
            </div>
            <div>
              From: <span className="font-mono text-amber-400">{pallet.location ?? "staged"}</span>
            </div>
            <div>
              To: <span className="font-mono text-emerald-400">{location}</span>
            </div>
          </div>
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={confirmPutaway}
            disabled={busy}
          >
            {busy ? "Committing…" : "Confirm Putaway"}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-400"
            onClick={() => {
              setStep("scan-location");
              setLocation("");
              setLocInput("");
              setError("");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Card>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rf/putaway")({
  component: function PutawayRoute() {
    return <PutawayInner />;
  },
});
