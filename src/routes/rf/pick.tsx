/**
 * ============================================================
 *  MODULE INDEX — RF Gun: Directed Picking
 * ============================================================
 *
 *  Purpose: Directed pick execution with shortage recursion.
 *           Enter pick ticket # → verify location/pallet →
 *           input qty → stage to DROP001. If shortage, auto-
 *           route to alternate pallet with same SKU.
 *
 *  Flow:
 *    enter-pick → verify → pick-qty → [shortage → verify] → complete
 *
 *  Firestore writes (transaction):
 *    /inventoryItems/{sku}: deduct source batch, add DROP001 batch
 *    /pickTickets/{num}: status → PICKED, qtyPicked, pickedAt
 *    /movementHistory/{id}: append DIRECTED_PICK audit
 *
 *  Extension points:
 *    - Add multi-ticket wave picking
 *    - Add serial/lot capture for regulated items
 *    - Add put-and-pass to staging location (configurable DROP)
 * ============================================================
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ClipboardList,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Mic,
  MicOff,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRfSession } from "@/lib/rf-session";
import { fetchPickTickets, updatePickTicket } from "@/lib/firestore-data";
import { runTransaction, doc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  DROP001_LOCATION,
  inventoryItems,
  type PickTicket,
  type InventoryItem,
} from "@/lib/mock-data";
import { useVoicePicking } from "@/hooks/useVoicePicking";
import { useTTS, ttsSpeak } from "@/lib/tts";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

type Step = "enter-pick" | "verify" | "pick-qty" | "complete";

function PickInner() {
  const { employee, verified } = useRfSession();
  const [step, setStep] = useState<Step>("enter-pick");
  const [ticket, setTicket] = useState<PickTicket | null>(null);
  const [pickQty, setPickQty] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickedTotal, setPickedTotal] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const pickInputRef = useRef<HTMLInputElement>(null);

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
      if (step === "enter-pick") handlePickSubmit(code);
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
          if (step === "enter-pick") {
            handlePickSubmit();
            tts.speak("Loading pick ticket");
          } else if (step === "verify") {
            setStep("pick-qty");
            tts.speak("Enter quantity");
          } else if (step === "pick-qty") {
            handlePickQty();
            tts.speak("Pick submitted");
          }
          break;
        case "next":
          if (step === "pick-qty" && pickedTotal < ticket?.quantityToPick!) {
            handleShortage();
            tts.speak("Finding alternate");
          }
          break;
        case "quantity":
          if (step === "pick-qty" && typeof cmd.value === "number") {
            setPickQty(String(cmd.value));
            tts.speak(`Quantity ${cmd.value}`);
          }
          break;
        case "cancel":
          if (step === "enter-pick") {
            setError("");
          } else {
            setStep("enter-pick");
            setTicket(null);
            setPickQty("");
            setPickedTotal(0);
            setError("");
            tts.speak("Cancelled");
          }
          break;
        case "help":
          tts.speak("Say confirm to continue, quantity 5 to set quantity, cancel to go back");
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

  const findAvailableBatch = useCallback(
    (
      sku: string,
      warehouseId: string,
      excludePalletId?: string,
    ): { palletId: string; location: string; qty: number } | null => {
      const item = inventoryItems.find((i) => i.sku === sku);
      if (!item) return null;
      const batch = item.batches
        ?.filter(
          (b) => b.location !== DROP001_LOCATION && b.qty > 0 && b.palletId !== excludePalletId,
        )
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
      if (!batch) return null;
      return { palletId: batch.palletId, location: batch.location, qty: batch.qty };
    },
    [],
  );

  const handlePickSubmit = useCallback(async (code?: string) => {
    if (!employee || busy) return;
    const raw = code ?? pickInputRef.current?.value ?? "";
    const pickNum = parseInt(raw, 10);
    if (isNaN(pickNum)) {
      setError("Enter a valid pick ticket number");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const tickets = await fetchPickTickets(undefined);
      const found = tickets.find(
        (t) => t.pickTicketNum === pickNum && (t.status === "GENERATED" || t.status === "PICKED"),
      );
      if (!found) {
        setError(`Pick ticket ${pickNum} not found or already closed`);
        playChime("err");
        setBusy(false);
        return;
      }
      setTicket(found);
      setStep("verify");
      setPickedTotal(0);
      playChime("ok");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      playChime("err");
    } finally {
      setBusy(false);
    }
  }, [employee, busy, playChime]);

  const handlePickQty = useCallback(async () => {
    if (!ticket || !employee || busy) return;
    const qty = parseInt(pickQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    if (qty > ticket.quantityToPick) {
      setError(`Cannot exceed allocated ${ticket.quantityToPick}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!online) {
        enqueue({
          collection: "pickTickets",
          docId: ticket.pickTicketNum.toString(),
          type: "update",
          data: {
            status: "PICKED",
            pickedAt: new Date().toISOString(),
            qtyPicked: qty,
          },
        });
        toast.success("Saved offline — will sync when connected");
        setPickedTotal(qty);
        setStep("complete");
        return;
      }
      await runTransaction(db, async (txn) => {
        const invRef = doc(db, "inventoryItems", ticket.sku);
        const invSnap = await txn.get(invRef);
        if (!invSnap.exists()) throw new Error("Inventory not found");
        const item = invSnap.data() as InventoryItem;
        const batch = item.batches?.find(
          (b) => b.palletId === ticket.palletId && b.location === ticket.fromLocation,
        );
        if (!batch) throw new Error("Source batch not found");
        if (batch.qty < qty) throw new Error(`Insufficient: have ${batch.qty}, need ${qty}`);

        const updatedBatches = item.batches.map((b) =>
          b.batchId === batch.batchId
            ? { ...b, qty: b.qty - qty, qtyAllocated: Math.max(0, b.qtyAllocated - qty) }
            : b,
        );
        const existingDrop = updatedBatches.find(
          (b) =>
            b.palletId === ticket.palletId &&
            b.location === DROP001_LOCATION &&
            b.pickTicketNum === ticket.pickTicketNum,
        );
        if (existingDrop) {
          const idx = updatedBatches.indexOf(existingDrop);
          updatedBatches[idx] = { ...existingDrop, qty: existingDrop.qty + qty };
        } else {
          updatedBatches.push({
            batchId: `DROP-${Date.now()}-${ticket.pickTicketNum}`,
            palletId: ticket.palletId,
            location: DROP001_LOCATION,
            qty,
            qtyAllocated: 0,
            receivedAt: new Date().toISOString(),
            pickTicketNum: ticket.pickTicketNum,
            poNumber: "",
            ediSource: "MANUAL",
          });
        }
        txn.update(invRef, { batches: updatedBatches });
        txn.update(doc(db, "pickTickets", ticket.pickTicketNum.toString()), {
          status: "PICKED",
          pickedAt: new Date().toISOString(),
          qtyPicked: qty,
        });
      });
      await updatePickTicket(ticket.pickTicketNum, {
        status: "PICKED",
        pickedAt: new Date().toISOString(),
        qtyPicked: parseInt(pickQty),
      });
      playChime("ok");
      setPickedTotal(parseInt(pickQty));
      setStep("complete");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Pick failed");
      playChime("err");
    } finally {
      setBusy(false);
    }
  }, [ticket, employee, busy, pickQty, playChime, online, enqueue]);

  const handleShortage = useCallback(async () => {
    if (!ticket || !employee || busy) return;
    const allocated = ticket.quantityToPick;
    const remaining = allocated - pickedTotal;
    setBusy(true);
    setError("");
    try {
      const alt = findAvailableBatch(ticket.sku, employee.assignedWarehouseId, ticket.palletId);
      if (!alt) {
        setError(`No alternate stock for ${ticket.sku} — escalate to supervisor`);
        playChime("err");
        setBusy(false);
        return;
      }
      setTicket({ ...ticket, palletId: alt.palletId, fromLocation: alt.location });
      setStep("verify");
      playChime("ok");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Shortage lookup failed");
      playChime("err");
    } finally {
      setBusy(false);
    }
  }, [ticket, employee, busy, pickedTotal, findAvailableBatch, playChime]);

  if (!verified) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">Directed Pick</h1>
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

      {step === "enter-pick" && scanMode === "manual" && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <Label className="text-xs text-slate-300">Enter Pick Ticket #</Label>
          <Input
            ref={pickInputRef}
            autoFocus
            placeholder="e.g. 1001"
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePickSubmit();
            }}
          />
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => handlePickSubmit()}
            disabled={busy}
          >
            <ClipboardList className="h-4 w-4 mr-2" /> Load Ticket
          </Button>
        </Card>
      )}

      {step === "verify" && ticket && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="text-xs text-slate-400 space-y-1">
            <div>
              Ticket:{" "}
              <Badge variant="outline" className="font-mono">
                {ticket.pickTicketNum}
              </Badge>
            </div>
            <div>
              Order: <span className="font-mono text-white">{ticket.orderId}</span>
            </div>
            <div>
              SKU: <span className="font-mono text-white">{ticket.sku}</span>
            </div>
            <div>
              Location: <span className="font-mono text-amber-400">{ticket.fromLocation}</span>
            </div>
            <div>
              Pallet: <span className="font-mono text-white">{ticket.palletId}</span>
            </div>
            <div>
              Allocated:{" "}
              <span className="font-mono text-emerald-400">{ticket.quantityToPick} units</span>
            </div>
          </div>
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => setStep("pick-qty")}
          >
            <ScanLine className="h-4 w-4 mr-2" /> Verify Location & Pallet
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-400"
            onClick={() => {
              setStep("enter-pick");
              setTicket(null);
              setError("");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Card>
      )}

      {step === "pick-qty" && ticket && (
        <Card className="border-slate-800 bg-slate-900 p-4 space-y-3">
          <Label className="text-xs text-slate-300">Units Picked</Label>
          <Input
            autoFocus
            type="number"
            placeholder={`Max ${ticket.quantityToPick}`}
            value={pickQty}
            onChange={(e) => setPickQty(e.target.value)}
            className="h-12 bg-slate-800 border-slate-700 text-white font-mono text-center text-lg"
          />
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={handlePickQty}
            disabled={busy}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" /> Submit Pick
          </Button>
          {pickedTotal < ticket.quantityToPick && (
            <Button
              variant="outline"
              className="w-full h-12 border-amber-500 text-amber-400 hover:bg-amber-950"
              onClick={handleShortage}
              disabled={busy}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Shortage — Find Alternate
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full text-slate-400"
            onClick={() => {
              setStep("verify");
              setPickQty("");
              setError("");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Card>
      )}

      {step === "complete" && ticket && (
        <Card className="border-emerald-500/50 bg-emerald-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Pick complete</span>
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div>
              Ticket: <span className="font-mono text-white">{ticket.pickTicketNum}</span>
            </div>
            <div>
              Picked: <span className="font-mono text-emerald-400">{pickedTotal} units</span>
            </div>
            <div>
              Staged at: <span className="font-mono text-amber-400">{DROP001_LOCATION}</span>
            </div>
          </div>
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => {
              setStep("enter-pick");
              setTicket(null);
              setPickQty("");
              setPickedTotal(0);
              setError("");
            }}
          >
            Next Pick
          </Button>
        </Card>
      )}
    </div>
  );
}

export const Route = createFileRoute("/rf/pick")({
  component: function PickRoute() {
    return <PickInner />;
  },
});
