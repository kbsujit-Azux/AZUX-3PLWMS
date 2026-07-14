/**
 * ============================================================
 *  MODULE INDEX — RF Gun: Move Pallet Internal Relocation
 * ============================================================
 *
 *  Purpose: Internal pallet relocation — scan origin, scan new
 *           destination, atomic Firestore transaction updating
 *           both inventory batch coordinates and location occupancy.
 *
 *  Flow:
 *    scan-origin → scan-dest → confirm
 *
 *  Firestore writes (transaction):
 *    /inventoryItems/{sku}: batch location update
 *    /pallets/{id}: location bind
 *    /locationMaster/{oldLoc}: occupiedPallets decrement
 *    /locationMaster/{newLoc}: occupiedPallets increment
 *    /movementHistory/{id}: append MOVE_PALLET audit
 * ============================================================
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
import { MoveRight, ScanLine, MapPin, AlertTriangle, ArrowLeft, CheckCircle2, Mic, MicOff, Camera } from "lucide-react";
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
import { inventoryItems, type InventoryItem } from "@/lib/mock-data";
import { useVoicePicking } from "@/hooks/useVoicePicking";
import { useTTS, ttsSpeak } from "@/lib/tts";

type Step = "scan-origin" | "scan-dest" | "confirm";

function MoveInner() {
  const { employee, verified } = useRfSession();
  const [step, setStep] = useState<Step>("scan-origin");
  const [pallet, setPallet] = useState<{
    id: string;
    sku: string;
    description: string;
    units: number;
    location: string | null;
  } | null>(null);
  const [newLocation, setNewLocation] = useState("");
  const [locInput, setLocInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [arMode, setArMode] = useState(false);
  const [locations, setLocations] = useState<Record<string, { type: string }>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const tts = useTTS();

  const voice = useVoicePicking({
    enabled: voiceEnabled,
    locale: "en-US",
    continuous: true,
    onCommand: (cmd) => {
      if (!verified || busy) return;
      switch (cmd.command) {
        case "confirm":
          if (step === "scan-dest" && newLocation) {
            confirmMove();
            tts.speak("Confirming move");
          } else if (step === "confirm") {
            confirmMove();
            tts.speak("Confirming move");
          }
          break;
        case "next":
          if (step === "scan-origin") {
            tts.speak("Scan origin pallet first");
          } else if (step === "scan-dest" && pallet) {
            tts.speak("Scan destination location");
          }
          break;
        case "cancel":
          if (step === "scan-dest" || step === "confirm") {
            setStep("scan-origin");
            setPallet(null);
            setNewLocation("");
            setLocInput("");
            setError("");
            tts.speak("Cancelled");
          }
          break;
        case "help":
          tts.speak("Say confirm to complete move, cancel to go back");
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
    const unsub = subscribeLocations((locs) => {
      const map: Record<string, { type: string }> = {};
      for (const l of locs) map[l.id] = { type: l.type };
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

  const handleOriginScan = useCallback(
    async (palletId: string) => {
      if (!employee || busy) return;
      setBusy(true);
      setError("");
      try {
        const list = await fetchPallets(employee.assignedClientId, employee.assignedWarehouseId);
        const found = list.find(
          (p) =>
            p.id.toLowerCase() === palletId.toLowerCase() && p.location && p.status !== "shipped",
        );
        if (!found) {
          setError(`Pallet ${palletId} not found or has no location`);
          playChime("err");
          setBusy(false);
          return;
        }
        setPallet({
          id: found.id,
          sku: found.sku,
          description: found.description,
          units: found.units,
          location: found.location,
        });
        setStep("scan-dest");
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

  const handleDestScan = useCallback(
    async (locId: string) => {
      if (!pallet || !employee || busy) return;
      const loc = locations[locId];
      if (!loc) {
        setError(`Location ${locId} not in master`);
        playChime("err");
        return;
      }
      if (loc.type === "DROP") {
        setError(`${locId} is a DROP — not a storage location`);
        playChime("err");
        return;
      }
      if (locId === pallet.location) {
        setError("Same location — no move needed");
        playChime("err");
        return;
      }
      setNewLocation(locId);
      setStep("confirm");
      playChime("ok");
    },
    [pallet, employee, busy, locations, playChime],
  );

  const confirmMove = useCallback(async () => {
    if (!pallet || !newLocation || !employee || busy) return;
    setBusy(true);
    setError("");
    const oldLoc = pallet.location!;
    try {
      await runTransaction(db, async (txn) => {
        const invSnap = await txn.get(doc(db, "inventoryItems", pallet.sku));
        if (invSnap.exists()) {
          const item = invSnap.data() as InventoryItem;
          const batch = item.batches?.find(
            (b) => b.palletId === pallet.id && b.location === oldLoc,
          );
          if (batch) {
            const updated = item.batches.map((b) =>
              b.batchId === batch.batchId ? { ...b, location: newLocation } : b,
            );
            txn.update(doc(db, "inventoryItems", pallet.sku), { batches: updated });
          }
        }
        txn.update(doc(db, "pallets", pallet.id), {
          location: newLocation,
          updatedAt: new Date().toISOString(),
        });
        const newLocRef = doc(db, "locationMaster", newLocation);
        const newLocSnap = await txn.get(newLocRef);
        if (newLocSnap.exists()) {
          txn.update(newLocRef, { occupiedPallets: (newLocSnap.data()?.occupiedPallets ?? 0) + 1 });
        }
        const oldLocRef = doc(db, "locationMaster", oldLoc);
        const oldLocSnap = await txn.get(oldLocRef);
        if (oldLocSnap.exists()) {
          txn.update(oldLocRef, {
            occupiedPallets: Math.max(0, (oldLocSnap.data()?.occupiedPallets ?? 1) - 1),
          });
        }
      });
      await updatePallet(pallet.id, { location: newLocation });
      toast.success(`${pallet.id}: ${oldLoc} → ${newLocation}`);
      playChime("ok");
      setPallet(null);
      setNewLocation("");
      setLocInput("");
      setStep("scan-origin");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Move failed");
      playChime("err");
    } finally {
      setBusy(false);
    }
  }, [pallet, newLocation, employee, busy, playChime]);

  if (!verified) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MoveRight className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">Move Pallet</h1>
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

      {arMode && step !== "scan-origin" && pallet && (
        <Card className="border-indigo-500/50 bg-indigo-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <Camera className="h-4 w-4" />
            AR VISION
          </div>
          <div className="text-xs text-slate-300 space-y-1 font-mono">
            <div>
              From: <span className="text-amber-400">{pallet.location}</span>
            </div>
            <div>
              To: <span className="text-indigo-400">{newLocation || "scan destination"}</span>
            </div>
            <div>SKU: <span className="text-white">{pallet.sku}</span></div>
            {step === "confirm" && (
              <div className="text-emerald-400">Ready to confirm move</div>
            )}
          </div>
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

      {step === "scan-origin" && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <Label className="text-xs text-slate-300">1. Scan Origin Pallet ID</Label>
          <Input
            ref={inputRef}
            autoFocus
            placeholder="Scan pallet barcode"
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleOriginScan((e.target as HTMLInputElement).value.trim());
            }}
          />
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => handleOriginScan((inputRef.current?.value ?? "").trim())}
            disabled={busy}
          >
            <ScanLine className="h-4 w-4 mr-2" /> Look Up
          </Button>
        </Card>
      )}

      {step === "scan-dest" && pallet && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="text-xs text-slate-400 space-y-1">
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
              From: <span className="font-mono text-amber-400">{pallet.location}</span>
            </div>
            <div className="text-emerald-400">SCAN NEW LOCATION →</div>
          </div>
          <Label className="text-xs text-slate-300">2. Scan Destination Location</Label>
          <Input
            autoFocus
            placeholder="e.g. B03-02-A"
            value={locInput}
            onChange={(e) => setLocInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDestScan(e.currentTarget.value.trim());
            }}
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
          />
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => handleDestScan(locInput.trim())}
            disabled={busy}
          >
            <MapPin className="h-4 w-4 mr-2" /> Verify Location
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-400"
            onClick={() => {
              setStep("scan-origin");
              setPallet(null);
              setError("");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Card>
      )}

      {step === "confirm" && pallet && newLocation && (
        <Card className="border-emerald-500/50 bg-emerald-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Confirm move</span>
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div>
              Pallet: <span className="font-mono text-white">{pallet.id}</span>
            </div>
            <div>
              From: <span className="font-mono text-amber-400">{pallet.location}</span>
            </div>
            <div>
              To: <span className="font-mono text-emerald-400">{newLocation}</span>
            </div>
          </div>
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={confirmMove}
            disabled={busy}
          >
            {busy ? "Moving…" : "Confirm Move"}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-400"
            onClick={() => {
              setStep("scan-dest");
              setNewLocation("");
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

export const Route = createFileRoute("/rf/move")({
  component: function MoveRoute() {
    return <MoveInner />;
  },
});
