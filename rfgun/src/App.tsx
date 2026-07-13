import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { toast } from "sonner";
import { db } from "@shared/lib/firestore";
import { collection, getDocs, getDoc, doc, updateDoc, addDoc, query, where, limit, orderBy, runTransaction, serverTimestamp } from "firebase/firestore";
import { hashPassword, verifyPassword } from "@shared/lib/password-utils";
import { recordLaborEvent, computeStandardSec, getAisleFromLocation } from "./lib/labor";
import { useScanner } from "./hooks/useScanner";
import { useVoicePicking } from "@shared/hooks/useVoicePicking";
import { enqueue, useOfflineQueue } from "./lib/offline-queue";
import { ttsSpeak, ttsAvailable, useTTS } from "@shared/lib/tts";
import { PackageSearch, MoveRight, ClipboardList, Container, ScanLine, History, LogOut, ArrowLeft, CheckCircle2, AlertTriangle, MapPin, Boxes, Warehouse, Camera, CameraOff, X, PackageCheck, Tag, Package, Wrench, Truck, Zap, Clock, UserCheck, Download, WifiOff, Mic, MicOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type AccessorialType =
  | "KITTING"
  | "RELABELING"
  | "MANUAL_WRAPPING"
  | "CONTAINER_DEVANNING"
  | "SPECIAL_HANDLING"
  | "LABOR_STANDBY"
  | "RUSH_PROCESSING";

interface Employee { badgeId: string; name: string; role: string; team?: string; shift?: string; assignedClientId: string; assignedWarehouseId: string; active: boolean; }
interface Pallet { id: string; sku: string; units: number; status: string; location?: string; description?: string; poNumber?: string; ediSource?: string; }
interface LocationRecord { id: string; type: string; occupiedPallets?: number; }
interface MovementHistory { movementId: string; type: string; itemCode: string; fromLocationId?: string; toLocationId?: string; movedQty: number; uom: string; referenceId: string; badgeId: string; tenantId: string; timestamp: Date; }
interface PickTicket { number: string; sku: string; qtyOrdered: number; qtyPicked: number; status: string; locationId?: string; }

// ─── Session ────────────────────────────────────────────────────────────────
function useRfSession() {
  const [badgeId, _setBadgeId] = useState<string>(() => localStorage.getItem("azux.rf.badgeId") || "");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const setBadgeId = useCallback((id: string, password?: string) => {
    _setBadgeId(id);
    if (password) {
      localStorage.setItem("azux.rf.password", password);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const storedPassword = localStorage.getItem("azux.rf.password") || "";
    if (!badgeId) { setVerified(false); setEmployee(null); return; }
    setLoading(true);
    getDocs(query(collection(db, "employees"), where("badgeId", "==", badgeId), limit(1)))
      .then((snap) => {
        if (cancelled) return;
        const d = snap.docs[0];
        if (d) {
          const data = d.data() as any;
          const storedHash = data.passwordHash || "";
          if (storedPassword && storedHash) {
            verifyPassword(storedPassword, storedHash).then((valid) => {
              if (cancelled) return;
              if (valid) {
                const emp: Employee = { id: d.id, ...data } as Employee;
                setEmployee(emp);
                setVerified(true);
                localStorage.setItem("azux.rf.badgeId", badgeId);
              } else {
                setEmployee(null);
                setVerified(false);
                localStorage.removeItem("azux.rf.badgeId");
                localStorage.removeItem("azux.rf.password");
                toast.error("Invalid credentials", { description: "Badge ID or PIN is incorrect." });
              }
            });
          } else {
            setEmployee(null);
            setVerified(false);
            toast.error("Invalid credentials", { description: "Badge ID or PIN is incorrect." });
          }
        } else {
          setEmployee(null);
          setVerified(false);
          localStorage.removeItem("azux.rf.badgeId");
          localStorage.removeItem("azux.rf.password");
          toast.error("Invalid credentials", { description: "Badge ID or PIN is incorrect." });
        }
      })
      .catch(() => { if (!cancelled) { setVerified(false); setEmployee(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [badgeId]);

  const logout = useCallback(() => { _setBadgeId(""); setEmployee(null); setVerified(false); localStorage.removeItem("azux.rf.badgeId"); localStorage.removeItem("azux.rf.password"); }, []);

  return { badgeId, employee, loading, verified, setBadgeId, logout };
}

// ─── Data helpers ───────────────────────────────────────────────────────────
async function fetchPallets(tenantId: string, warehouseId: string): Promise<Pallet[]> {
  const snap = await getDocs(query(collection(db, "pallets"), where("clientId", "==", tenantId), where("warehouseId", "==", warehouseId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pallet, "id">) } as Pallet));
}
async function fetchLocations(tenantId: string, warehouseId: string): Promise<LocationRecord[]> {
  const snap = await getDocs(query(collection(db, "locationMaster"), where("clientId", "==", tenantId), where("warehouseId", "==", warehouseId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LocationRecord, "id">) } as LocationRecord));
}
async function fetchPickTickets(tenantId: string, warehouseId: string): Promise<PickTicket[]> {
  const snap = await getDocs(query(collection(db, "pickTickets"), where("clientId", "==", tenantId), where("warehouseId", "==", warehouseId), where("status", "in", ["OPEN", "PARTIAL"])));
  return snap.docs.map((d) => ({ number: d.id, ...(d.data() as Omit<PickTicket, "number">) } as PickTicket));
}
async function fetchInboundShipments(tenantId: string, warehouseId: string) {
  const snap = await getDocs(query(collection(db, "inboundShipments"), where("clientId", "==", tenantId), where("warehouseId", "==", warehouseId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
}
async function fetchMovementHistory(tenantId: string, itemCode: string, limitCount = 25): Promise<MovementHistory[]> {
  const snap = await getDocs(query(collection(db, "movementHistory"), where("tenantId", "==", tenantId), where("itemCode", "==", itemCode), orderBy("timestamp", "desc"), limit(limitCount)));
  return snap.docs.map((d) => {
    const data = d.data() as Omit<MovementHistory, "movementId">;
    const ts = data.timestamp as { toDate?: () => Date } | string | undefined;
    const timestamp = typeof ts === "object" && ts && "toDate" in ts && typeof ts.toDate === "function" ? ts.toDate() : new Date(ts as string);
    return { movementId: d.id, ...data, timestamp } as MovementHistory;
  });
}
async function logMovement(entry: Omit<MovementHistory, "movementId" | "timestamp">) {
  await addDoc(collection(db, "movementHistory"), { ...entry, timestamp: serverTimestamp() });
}

function playChime(type: "ok" | "err") {
  try {
    const AudioCtx = window.AudioContext || ((window as unknown as Record<string, unknown>).webkitAudioContext as unknown as typeof AudioContext);
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === "ok" ? 880 : 220;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch { /* no audio */ }
}

// ─── Scanner Hook ────────────────────────────────────────────────────────────
function useCameraScanner(onScan: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>("");
  const [flash, setFlash] = useState(false);
  const [scannerSource, setScannerSource] = useState<"camera" | "datwedge" | "keyboard">("camera");
  const rafRef = useRef<number>(0);
  const lastScanRef = useRef<string>("");
  const scanCooldownRef = useRef<number>(0);
  const bufferRef = useRef<{ value: string; timer: number }>({ value: "", timer: 0 });

  const resetBuffer = useCallback(() => {
    bufferRef.current.value = "";
    clearTimeout(bufferRef.current.timer);
  }, []);

  const handleScan = useCallback((code: string, source: "camera" | "datwedge" | "keyboard") => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScannerSource(source);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    onScan(trimmed);
    lastScanRef.current = trimmed;
    scanCooldownRef.current = Date.now();
    resetBuffer();
    if (navigator.vibrate) navigator.vibrate(50);
  }, [onScan, resetBuffer]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      setStream(mediaStream);
      setError("");
      setScanning(true);
      setScannerSource("camera");
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute("playsinline", "");
        videoRef.current.play();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Camera access denied";
      setError(msg);
      toast.error("Camera error", { description: msg });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setScanning(false);
  }, [stream]);

  const tick = useCallback(async () => {
    if (!scanning || !videoRef.current || !canvasRef.current || !videoRef.current.videoWidth) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    try {
      if ("BarcodeDetector" in window && video.readyState >= 2) {
        const detector = new (window as unknown as Record<string, unknown>).BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "upc_a", "qr_code"] });
        const barcodes = await (detector as { detect: (input: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>> }).detect(canvas);
        const now = Date.now();
        for (const barcode of barcodes) {
          if (barcode.rawValue && barcode.rawValue !== lastScanRef.current && now - scanCooldownRef.current > 2000) {
            handleScan(barcode.rawValue, "camera");
            break;
          }
        }
      }
    } catch { /* barcode detection failed for this frame */ }

    rafRef.current = requestAnimationFrame(tick);
  }, [scanning, handleScan]);

  useEffect(() => {
    if (scanning) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scanning, tick]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stream]);

  // DataWedge intent listener (Zebra)
  useEffect(() => {
    const handleIntent = (e: any) => {
      try {
        const extras = e?.data?.extras || {};
        const code = extras["com.symbol.datawedge.data_string"] || extras["data"] || "";
        if (code) handleScan(String(code), "datwedge");
      } catch {
        // ignore malformed intent
      }
    };
    window.addEventListener("intent", handleIntent);
    document.addEventListener("dataswitch", handleIntent);
    return () => {
      window.removeEventListener("intent", handleIntent);
      document.removeEventListener("dataswitch", handleIntent);
    };
  }, [handleScan]);

  // Keyboard wedge listener (Honeywell/Intermec/generic HID)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const code = bufferRef.current.value.trim();
        resetBuffer();
        if (code) handleScan(code, "keyboard");
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current.value += e.key;
        clearTimeout(bufferRef.current.timer);
        bufferRef.current.timer = window.setTimeout(() => {
          resetBuffer();
        }, 80);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      clearTimeout(bufferRef.current.timer);
    };
  }, [handleScan, resetBuffer]);

  return { videoRef, canvasRef, stream, scanning, error, flash, scannerSource, startCamera, stopCamera };
}

// ─── Shared UI ──────────────────────────────────────────────────────────────
function CameraOverlay({ videoRef, canvasRef, stream, scanning, flash, scannerSource, onStart, onStop, error, arMode, arLocation, arSku, arQty, arStatus, onArConfirm }: { videoRef: React.RefObject<HTMLVideoElement | null>; canvasRef: React.RefObject<HTMLCanvasElement | null>; stream: MediaStream | null; scanning: boolean; flash: boolean; scannerSource: "camera" | "datwedge" | "keyboard"; onStart: () => void; onStop: () => void; error: string; arMode?: "pick" | "putaway" | "move" | "receive"; arLocation?: string; arSku?: string; arQty?: number; arStatus?: "pending" | "confirmed" | "error"; onArConfirm?: () => void; }) {
  const sourceLabel = scannerSource === "datwedge" ? "DataWedge" : scannerSource === "keyboard" ? "Keyboard Wedge" : "Camera";
  return (
    <div className="relative rounded-lg overflow-hidden bg-black aspect-[3/4] sm:aspect-video">
      {!stream && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 space-y-3">
          <Camera className="h-10 w-10" />
          <p className="text-xs">Camera preview</p>
          <button onClick={onStart} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-xs font-semibold">Enable Camera</button>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 space-y-2 p-4">
          <CameraOff className="h-8 w-8 text-red-400" />
          <p className="text-xs text-center">{error}</p>
        </div>
      )}
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      {scanning && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-[38%] bg-gradient-to-b from-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center">
            <div className="relative w-[82%] h-[24%]">
              <div className="absolute inset-0 border border-emerald-400/60 rounded-sm" />
              <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-sm" />
              <div className="absolute inset-x-2 top-0 h-px bg-emerald-400/40 animate-[scanline_1.2s_ease-in-out_infinite]" style={{animationName: 'scanline', animationDuration: '1.2s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite'}} />
            </div>
          </div>
          <div className="absolute top-4 left-4 px-2 py-1 bg-emerald-600 text-white text-[10px] rounded font-medium">SCANNING UCC-128</div>
          <div className="absolute top-4 right-4 px-2 py-1 bg-slate-800/80 text-emerald-400 text-[10px] rounded font-mono">{sourceLabel}</div>
        </div>
      )}
      {arMode && arLocation && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <span className="px-2 py-1 bg-indigo-600 text-white text-[10px] rounded font-bold">AR VISION</span>
            <span className="px-2 py-1 bg-slate-800/90 text-white text-[10px] rounded font-mono">{arLocation}</span>
          </div>
          <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center">
            <div className="relative w-[80%] h-[28%]">
              <div className="absolute inset-0 border-2 border-indigo-400/70 rounded-md" />
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-md" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-md" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="px-3 py-1.5 bg-black/80 text-white text-sm font-mono rounded border border-indigo-400">{arLocation}</span>
              </div>
            </div>
          </div>
          {arSku && (
            <div className="absolute bottom-8 left-4 right-4 flex items-center justify-between text-[10px] text-slate-300">
              <div>SKU: <span className="font-mono text-white">{arSku}</span></div>
              {arQty !== undefined && <div>Qty: <span className="font-mono text-white">{arQty}</span></div>}
            </div>
          )}
          {onArConfirm && (
            <button onClick={onArConfirm} className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-indigo-600 text-white rounded-md text-xs font-semibold">Confirm AR Pick</button>
          )}
        </div>
      )}
      {flash && (
        <div className="absolute inset-0 bg-emerald-400/20 pointer-events-none" />
      )}
      {stream && !scanning && !arMode && (
        <button onClick={onStart} className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-600 text-white rounded-md text-xs font-semibold flex items-center gap-2">
          <ScanLine className="h-3 w-3" /> Start Scanner
        </button>
      )}
      {scanning && !arMode && (
        <button onClick={onStop} className="absolute top-4 right-4 p-2 bg-red-600 text-white rounded-full">
          <X className="h-4 w-4" />
        </button>
      )}
      <style>{`
        @keyframes scanline {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(24vh - 1px)); }
        }
      `}</style>
    </div>
  );
}

function useBarcodeInput(onScan: (code: string) => void, placeholder = "Scan or enter barcode") {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = input.trim();
      if (val) { onScan(val); setInput(""); }
    }
  }, [input, onScan]);

  return { input, setInput, inputRef, handleKey, placeholder };
}

// ─── Screens ────────────────────────────────────────────────────────────────
function PutawayScreen({ employee }: { employee: Employee }) {
  const [step, setStep] = useState<"scan-pallet" | "scan-location" | "confirm">("scan-pallet");
  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [locInput, setLocInput] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<Record<string, LocationRecord>>({});
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [arMode, setArMode] = useState(false);
  const palletRef = useRef<HTMLInputElement>(null);
  const taskStartRef = useRef<number>(Date.now());
  const tts = useTTS();

  const voice = useVoicePicking({
    enabled: voiceEnabled,
    onCommand: (cmd) => {
      if (cmd.command === "confirm" && step === "confirm" && pallet && location) confirm();
      else if ((cmd.command === "next" || cmd.command === "skip") && step === "scan-location") setStep("scan-pallet");
      else if (cmd.command === "cancel") { setPallet(null); setLocation(""); setLocInput(""); setStep("scan-pallet"); }
      else if (cmd.command === "quantity" && typeof cmd.value === "number" && step === "confirm") { /* qty not used in putaway */ }
    },
    onError: () => {},
  });

  useEffect(() => {
    taskStartRef.current = Date.now();
    fetchLocations(employee.assignedClientId, employee.assignedWarehouseId).then((locs) => {
      const m: Record<string, LocationRecord> = {};
      for (const l of locs) m[l.id] = l;
      setLocations(m);
    });
  }, [employee]);

  const handlePallet = useCallback(async (id: string) => {
    if (busy) return; setBusy(true); setError("");
    try {
      const list = await fetchPallets(employee.assignedClientId, employee.assignedWarehouseId);
      const found = list.find((p) => p.id.toLowerCase() === id.toLowerCase());
      if (!found || found.status === "putaway" || found.status === "shipped") { setError(`Pallet ${id} not found or already put away`); playChime("err"); setBusy(false); return; }
      setPallet(found); setStep("scan-location"); playChime("ok");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Lookup failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [employee, busy]);

  const handleLoc = useCallback(async (locId: string) => {
    if (!pallet || busy) return;
    const loc = locations[locId];
    if (!loc) { setError(`Location ${locId} not found`); playChime("err"); return; }
    if (loc.type === "DROP") { setError(`${locId} is a DROP — use Move or Pick`); playChime("err"); return; }
    if (loc.occupiedPallets && loc.occupiedPallets > 0 && loc.type === "RACK") { setError(`${locId} appears occupied`); playChime("err"); return; }
    setLocation(locId); setStep("confirm"); playChime("ok");
  }, [pallet, busy, locations]);

  const confirm = useCallback(async () => {
    if (!pallet || !location || busy) return;
    setBusy(true); setError("");
    try {
      await runTransaction(db, async (txn) => {
        txn.update(doc(db, "pallets", pallet.id), { status: "putaway", location, updatedAt: new Date().toISOString() });
        const invSnap = await txn.get(doc(db, "inventoryItems", pallet.sku));
        if (invSnap.exists()) {
          const item = invSnap.data() as Record<string, unknown>;
          const batches = (item.batches as Array<{ palletId?: string; location?: string }>) || [];
          const idx = batches.findIndex((b) => b.palletId === pallet.id && b.location !== location);
          const updated = [...batches];
          if (idx >= 0 && updated[idx]) { updated[idx] = { ...updated[idx], location, receivedAt: new Date().toISOString() }; }
          else { updated.push({ batchId: `BATCH-${Date.now()}`, palletId: pallet.id, location, qty: pallet.units, qtyAllocated: 0, receivedAt: new Date().toISOString(), poNumber: pallet.poNumber, ediSource: pallet.ediSource }); }
          txn.update(doc(db, "inventoryItems", pallet.sku), { batches: updated });
        }
        const locRef = doc(db, "locationMaster", location);
        const locSnap = await txn.get(locRef);
        if (locSnap.exists()) txn.update(locRef, { occupiedPallets: ((locSnap.data() as Record<string, unknown>)?.occupiedPallets ?? 0) as number + 1 });
      });
      await logMovement({ type: "PUTAWAY", itemCode: pallet.sku, toLocationId: location, movedQty: pallet.units, uom: "EA", referenceId: pallet.id, badgeId: employee.badgeId, tenantId: employee.assignedClientId });
      await recordLaborEvent({
        badgeId: employee.badgeId,
        employeeName: employee.name,
        warehouseId: employee.assignedWarehouseId,
        tenantId: employee.assignedClientId,
        taskType: "PUTAWAY",
        referenceId: pallet.id,
        qty: pallet.units,
        uom: "EA",
        locationId: location,
        startedAt: taskStartRef.current,
      });
      ttsSpeak(`Putaway confirmed. ${pallet.id} to ${location}`);
      toast.success(`${pallet.id} → ${location}`); playChime("ok");
      setPallet(null); setLocation(""); setLocInput(""); setStep("scan-pallet");
      taskStartRef.current = Date.now();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Putaway failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [pallet, location, employee, busy]);

  const scanner = useCameraScanner((code) => {
    if (step === "scan-pallet") handlePallet(code);
    else if (step === "scan-location") handleLoc(code);
  });

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><PackageSearch className="h-5 w-5 text-emerald-400" /><h1 className="text-lg font-semibold">Directed Putaway</h1></div>
        <div className="flex items-center gap-1">
          <button onClick={() => setArMode(!arMode)} className={`h-8 w-8 rounded flex items-center justify-center ${arMode ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`} title={arMode ? "AR Vision ON" : "AR Vision OFF"}>
            <Camera className="h-4 w-4" />
          </button>
          <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`h-8 w-8 rounded flex items-center justify-center ${voiceEnabled ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`} title={voiceEnabled ? "Voice ON" : "Voice OFF"}>
            {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && (<div className="border border-amber-500/50 bg-amber-950/30 rounded-md p-3 text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>)}
      {(step === "scan-pallet" || step === "scan-location") && (
        <div className="space-y-3">
          <CameraOverlay videoRef={scanner.videoRef} canvasRef={scanner.canvasRef} stream={scanner.stream} scanning={scanner.scanning} flash={scanner.flash} scannerSource={scanner.scannerSource} onStart={scanner.startCamera} onStop={scanner.stopCamera} error={scanner.error} arMode={arMode ? "putaway" : undefined} arLocation={arMode ? location : undefined} arSku={arMode ? pallet?.sku : undefined} arQty={arMode ? pallet?.units : undefined} arStatus={arMode && location ? "pending" : undefined} />
          <div className="text-center text-[10px] text-slate-500">or use manual input below</div>
        </div>
      )}
      {step === "scan-pallet" && (<div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><p className="text-xs text-slate-300">1. Scan Pallet ID</p><input ref={palletRef} placeholder="Scan pallet barcode" className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" onKeyDown={(e) => { if (e.key === "Enter") handlePallet((e.target as HTMLInputElement).value.trim()); }} /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={() => handlePallet((palletRef.current?.value ?? "").trim())} disabled={busy}><ScanLine className="h-4 w-4 inline mr-2" />Look Up Pallet</button></div>)}
      {step === "scan-location" && pallet && (<div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><div className="text-xs text-slate-400 space-y-1"><div className="flex items-center gap-2"><Boxes className="h-3 w-3" /><span className="font-mono">{pallet.id}</span></div><div>{pallet.description} · {pallet.units} units</div><div className="text-emerald-400">SCAN TARGET LOCATION →</div></div><p className="text-xs text-slate-300">2. Scan Destination Location ID</p><input autoFocus placeholder="e.g. A12-03-B" value={locInput} onChange={(e) => setLocInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLoc(e.currentTarget.value.trim()); }} className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={() => handleLoc(locInput.trim())} disabled={busy}><MapPin className="h-4 w-4 inline mr-2" />Verify Location</button><button className="w-full text-slate-400 text-xs" onClick={() => { setStep("scan-pallet"); setPallet(null); setError(""); scanner.stopCamera(); }}><ArrowLeft className="h-4 w-4 inline mr-1" />Back</button></div>)}
      {step === "confirm" && pallet && location && (<div className="border border-emerald-500/50 bg-emerald-950/20 rounded-md p-4 space-y-3"><div className="flex items-center gap-2 text-emerald-400 text-xs"><CheckCircle2 className="h-4 w-4" /><span className="font-medium">Ready to confirm</span></div><div className="text-xs text-slate-300 space-y-1"><div>Pallet: <span className="font-mono text-white">{pallet.id}</span></div><div>SKU: <span className="font-mono text-white">{pallet.sku}</span></div><div>Units: <span className="font-mono text-white">{pallet.units}</span></div><div>From: <span className="font-mono text-amber-400">{pallet.location ?? "staged"}</span></div><div>To: <span className="font-mono text-emerald-400">{location}</span></div></div><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={confirm} disabled={busy}>{busy ? "Committing…" : "Confirm Putaway"}</button><button className="w-full text-slate-400 text-xs" onClick={() => { setStep("scan-location"); setLocation(""); setLocInput(""); setError(""); }}><ArrowLeft className="h-4 w-4 inline mr-1" />Back</button></div>)}
    </div>
  );
}

function MoveScreen({ employee }: { employee: Employee }) {
  const [step, setStep] = useState<"scan-origin" | "scan-dest" | "confirm">("scan-origin");
  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<Record<string, LocationRecord>>({});
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const taskStartRef = useRef<number>(Date.now());

  const voice = useVoicePicking({
    enabled: voiceEnabled,
    onCommand: (cmd) => {
      if (cmd.command === "confirm" && step === "confirm" && pallet && origin && dest) confirm();
      else if ((cmd.command === "next" || cmd.command === "skip") && step === "scan-dest") setStep("scan-origin");
      else if (cmd.command === "cancel") { setPallet(null); setOrigin(""); setDest(""); setStep("scan-origin"); }
    },
    onError: () => {},
  });

  useEffect(() => {
    taskStartRef.current = Date.now();
    fetchLocations(employee.assignedClientId, employee.assignedWarehouseId).then((locs) => {
      const m: Record<string, LocationRecord> = {};
      for (const l of locs) m[l.id] = l;
      setLocations(m);
    });
  }, [employee]);

  const handleOrigin = useCallback(async (locId: string) => {
    if (busy) return; setBusy(true); setError("");
    try {
      const list = await fetchPallets(employee.assignedClientId, employee.assignedWarehouseId);
      const found = list.find((p) => (p.location ?? "").toLowerCase() === locId.toLowerCase() && p.status !== "shipped");
      if (!found) { setError(`No active pallet at ${locId}`); playChime("err"); setBusy(false); return; }
      setPallet(found); setOrigin(locId); setStep("scan-dest"); playChime("ok");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Lookup failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [employee, busy]);

  const handleDest = useCallback(async (locId: string) => {
    if (!pallet || busy) return;
    const loc = locations[locId];
    if (!loc) { setError(`Location ${locId} not found`); playChime("err"); return; }
    if (loc.type === "DROP") { setError(`${locId} is a DROP`); playChime("err"); return; }
    setDest(locId); setStep("confirm"); playChime("ok");
  }, [pallet, busy, locations]);

  const confirm = useCallback(async () => {
    if (!pallet || !origin || !dest || busy) return;
    setBusy(true); setError("");
    try {
      await runTransaction(db, async (txn) => {
        txn.update(doc(db, "pallets", pallet.id), { location: dest, updatedAt: new Date().toISOString() });
        const invSnap = await txn.get(doc(db, "inventoryItems", pallet.sku));
        if (invSnap.exists()) {
          const item = invSnap.data() as Record<string, unknown>;
          const batches = (item.batches as Array<{ palletId?: string; location?: string }>) || [];
          const idx = batches.findIndex((b) => b.palletId === pallet.id);
          const updated = [...batches];
          if (idx >= 0 && updated[idx]) { updated[idx] = { ...updated[idx], location: dest }; }
          txn.update(doc(db, "inventoryItems", pallet.sku), { batches: updated });
        }
        const oldLocRef = doc(db, "locationMaster", origin);
        const oldSnap = await txn.get(oldLocRef);
        if (oldSnap.exists()) txn.update(oldLocRef, { occupiedPallets: Math.max(0, ((oldSnap.data() as Record<string, unknown>)?.occupiedPallets ?? 0) as number - 1) });
        const newLocRef = doc(db, "locationMaster", dest);
        const newSnap = await txn.get(newLocRef);
        if (newSnap.exists()) txn.update(newLocRef, { occupiedPallets: ((newSnap.data() as Record<string, unknown>)?.occupiedPallets ?? 0) as number + 1 });
      });
      await logMovement({ type: "MOVE_PALLET", itemCode: pallet.sku, fromLocationId: origin, toLocationId: dest, movedQty: pallet.units, uom: "EA", referenceId: pallet.id, badgeId: employee.badgeId, tenantId: employee.assignedClientId });
      await recordLaborEvent({
        badgeId: employee.badgeId,
        employeeName: employee.name,
        warehouseId: employee.assignedWarehouseId,
        tenantId: employee.assignedClientId,
        taskType: "MOVE_PALLET",
        referenceId: pallet.id,
        qty: pallet.units,
        uom: "EA",
        locationId: dest,
        startedAt: taskStartRef.current,
      });
      ttsSpeak(`Move confirmed. ${pallet.id} from ${origin} to ${dest}`);
      toast.success(`${pallet.id}: ${origin} → ${dest}`); playChime("ok");
      setPallet(null); setOrigin(""); setDest(""); setStep("scan-origin");
      taskStartRef.current = Date.now();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Move failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [pallet, origin, dest, employee, busy]);

  const scanner = useCameraScanner((code) => {
    if (step === "scan-origin") handleOrigin(code);
    else if (step === "scan-dest") handleDest(code);
  });

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><MoveRight className="h-5 w-5 text-emerald-400" /><h1 className="text-lg font-semibold">Move Pallet</h1></div>
        <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`h-8 w-8 rounded flex items-center justify-center ${voiceEnabled ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`} title={voiceEnabled ? "Voice ON" : "Voice OFF"}>
          {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>
      </div>
      {error && (<div className="border border-amber-500/50 bg-amber-950/30 rounded-md p-3 text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>)}
      {(step === "scan-origin" || step === "scan-dest") && (
        <CameraOverlay videoRef={scanner.videoRef} canvasRef={scanner.canvasRef} stream={scanner.stream} scanning={scanner.scanning} flash={scanner.flash} onStart={scanner.startCamera} onStop={scanner.stopCamera} error={scanner.error} />
      )}
      {step === "scan-origin" && (<div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><p className="text-xs text-slate-300">1. Scan Origin Location</p><input autoFocus placeholder="Scan origin location" className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" onKeyDown={(e) => { if (e.key === "Enter") handleOrigin(e.currentTarget.value.trim()); }} /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={() => { const v = (document.activeElement as HTMLInputElement)?.value?.trim() || ""; handleOrigin(v); }} disabled={busy}><MapPin className="h-4 w-4 inline mr-2" />Verify Origin</button></div>)}
      {step === "scan-dest" && (<div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><div className="text-xs text-slate-400">Origin: <span className="font-mono text-white">{origin}</span> · Pallet: <span className="font-mono text-white">{pallet?.id}</span></div><p className="text-xs text-slate-300">2. Scan Destination Location</p><input autoFocus placeholder="Scan destination" className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" onKeyDown={(e) => { if (e.key === "Enter") handleDest(e.currentTarget.value.trim()); }} /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={() => { const v = (document.activeElement as HTMLInputElement)?.value?.trim() || ""; handleDest(v); }} disabled={busy}><MapPin className="h-4 w-4 inline mr-2" />Verify Destination</button><button className="w-full text-slate-400 text-xs" onClick={() => { setStep("scan-origin"); setPallet(null); setError(""); scanner.stopCamera(); }}><ArrowLeft className="h-4 w-4 inline mr-1" />Back</button></div>)}
      {step === "confirm" && (<div className="border border-emerald-500/50 bg-emerald-950/20 rounded-md p-4 space-y-3"><div className="flex items-center gap-2 text-emerald-400 text-xs"><CheckCircle2 className="h-4 w-4" /><span className="font-medium">Confirm Move</span></div><div className="text-xs text-slate-300 space-y-1"><div>Pallet: <span className="font-mono text-white">{pallet?.id}</span></div><div>{origin} → {dest}</div></div><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={confirm} disabled={busy}>{busy ? "Moving…" : "Confirm Move"}</button><button className="w-full text-slate-400 text-xs" onClick={() => { setStep("scan-dest"); setDest(""); setError(""); }}><ArrowLeft className="h-4 w-4 inline mr-1" />Back</button></div>)}
    </div>
  );
}

function PickScreen({ employee }: { employee: Employee }) {
  const [ticket, setTicket] = useState<PickTicket | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const taskStartRef = useRef<number>(Date.now());

  const voice = useVoicePicking({
    enabled: voiceEnabled,
    onCommand: (cmd) => {
      if (cmd.command === "confirm" && ticket && qty) confirmPick();
      else if (cmd.command === "cancel" || cmd.command === "skip") { setTicket(null); setQty(""); }
      else if (cmd.command === "quantity" && typeof cmd.value === "number") setQty(String(cmd.value));
      else if (cmd.command === "next" || cmd.command === "previous") setTicketId("");
    },
    onError: () => {},
  });

  const handleLookup = useCallback(async () => {
    if (busy || !ticketId.trim()) return;
    setBusy(true); setError("");
    try {
      const list = await fetchPickTickets(employee.assignedClientId, employee.assignedWarehouseId);
      const found = list.find((t) => t.number.toLowerCase() === ticketId.trim().toLowerCase());
      if (!found) { setError(`Pick ticket ${ticketId} not found`); playChime("err"); setBusy(false); return; }
      setTicket(found); playChime("ok");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Lookup failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [employee, ticketId, busy]);

  const confirmPick = useCallback(async () => {
    if (!ticket || busy) return;
    const picked = parseInt(qty, 10);
    if (isNaN(picked) || picked <= 0) { setError("Enter valid quantity"); playChime("err"); return; }
    if (picked > ticket.qtyOrdered - ticket.qtyPicked) { setError(`Cannot exceed remaining ${ticket.qtyOrdered - ticket.qtyPicked}`); playChime("err"); return; }
    setBusy(true); setError("");
    try {
      const newQtyPicked = ticket.qtyPicked + picked;
      const status = newQtyPicked >= ticket.qtyOrdered ? "PICKED" : "PARTIAL";
      await updateDoc(doc(db, "pickTickets", ticket.number), { qtyPicked: newQtyPicked, status, pickedAt: new Date().toISOString() });
      await logMovement({ type: "DIRECTED_PICK", itemCode: ticket.sku, fromLocationId: ticket.locationId, toLocationId: "DROP001", movedQty: picked, uom: "EA", referenceId: ticket.number, badgeId: employee.badgeId, tenantId: employee.assignedClientId });
      await recordLaborEvent({
        badgeId: employee.badgeId,
        employeeName: employee.name,
        warehouseId: employee.assignedWarehouseId,
        tenantId: employee.assignedClientId,
        taskType: "DIRECTED_PICK",
        referenceId: ticket.number,
        qty: picked,
        uom: "EA",
        locationId: ticket.locationId || "DROP001",
        startedAt: taskStartRef.current,
      });
      ttsSpeak(`Pick confirmed. ${picked} units of ${ticket.sku} from ${ticket.locationId}`);
      toast.success(`Picked ${picked} units`); playChime("ok");
      setTicket(null); setTicketId(""); setQty("");
      taskStartRef.current = Date.now();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Pick failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [ticket, qty, employee, busy]);

  const scanner = useCameraScanner((code) => { setTicketId(code); });

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-emerald-400" /><h1 className="text-lg font-semibold">Directed Pick</h1></div>
        <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`h-8 w-8 rounded flex items-center justify-center ${voiceEnabled ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`} title={voiceEnabled ? "Voice ON" : "Voice OFF"}>
          {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>
      </div>
      {error && (<div className="border border-amber-500/50 bg-amber-950/30 rounded-md p-3 text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>)}
      {!ticket ? (
        <div className="space-y-3">
          <CameraOverlay videoRef={scanner.videoRef} canvasRef={scanner.canvasRef} stream={scanner.stream} scanning={scanner.scanning} flash={scanner.flash} scannerSource={scanner.scannerSource} onStart={scanner.startCamera} onStop={scanner.stopCamera} error={scanner.error} />
          <div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><p className="text-xs text-slate-300">Enter Pick Ticket #</p><input autoFocus placeholder="Ticket number" value={ticketId} onChange={(e) => setTicketId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }} className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={handleLookup} disabled={busy}>{busy ? "Loading…" : "Lookup Ticket"}</button></div>
        </div>
      ) : (<div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><div className="text-xs text-slate-400 space-y-1"><div>Ticket: <span className="font-mono text-white">{ticket.number}</span></div><div>SKU: <span className="font-mono text-white">{ticket.sku}</span></div><div>Ordered: <span className="font-mono text-white">{ticket.qtyOrdered}</span> · Picked: <span className="font-mono text-white">{ticket.qtyPicked}</span></div><div>Location: <span className="font-mono text-white">{ticket.locationId ?? "—"}</span></div></div><p className="text-xs text-slate-300">Pick Quantity</p><input autoFocus placeholder="Qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmPick(); }} className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={confirmPick} disabled={busy}>{busy ? "Picking…" : "Confirm Pick"}</button><button className="w-full text-slate-400 text-xs" onClick={() => { setTicket(null); setQty(""); setError(""); scanner.stopCamera(); }}><ArrowLeft className="h-4 w-4 inline mr-1" />Back</button></div>)}
    </div>
  );
}

function ReceivingScreen({ employee }: { employee: Employee }) {
  const [shipment, setShipment] = useState<any>(null);
  const [shipmentId, setShipmentId] = useState("");
  const [lines, setLines] = useState<any[]>([]);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const taskStartRef = useRef<number>(Date.now());

  const voice = useVoicePicking({
    enabled: voiceEnabled,
    onCommand: (cmd) => {
      if (cmd.command === "confirm" && shipment) confirmReceiving();
      else if (cmd.command === "cancel") { setShipment(null); setShipmentId(""); setLines([]); setReceived({}); }
      else if (cmd.command === "next" || cmd.command === "previous") setShipmentId("");
    },
    onError: () => {},
  });

  const handleLookup = useCallback(async () => {
  if (busy || !shipmentId.trim()) return;
  setBusy(true); setError("");
  try {
    const list = await fetchInboundShipments(employee.assignedClientId, employee.assignedWarehouseId);
    const found = list.find((s) => s.id.toLowerCase() === shipmentId.trim().toLowerCase()) as any;
    if (!found) { setError(`Shipment ${shipmentId} not found`); playChime("err"); setBusy(false); return; }
    setShipment(found);
    const shipmentLines = (found.lines || []) as any[];
    setLines(shipmentLines);
    const init: Record<string, number> = {};
    for (const l of shipmentLines) init[l.sku || l.itemCode] = 0;
    setReceived(init);
    playChime("ok");
    taskStartRef.current = Date.now();
  } catch (e: unknown) { setError(e instanceof Error ? e.message : "Lookup failed"); playChime("err"); }
  finally { setBusy(false); }
}, [employee, shipmentId, busy]);

  useEffect(() => {
    taskStartRef.current = Date.now();
  }, [shipmentId]);

  const updateReceived = (sku: string, delta: number) => {
    setReceived((prev) => {
      const current = prev[sku] || 0;
      const line = lines.find((l: any) => (l.sku || l.itemCode) === sku);
      const max = line ? (line.qtyExpected || line.qty || 999) : 999;
      return { ...prev, [sku]: Math.max(0, Math.min(max, current + delta)) };
    });
  };

  const confirmReceiving = useCallback(async () => {
    if (!shipment || busy) return;
    setBusy(true); setError("");
    try {
      const now = new Date().toISOString();
      for (const line of lines) {
        const sku = line.sku || line.itemCode;
        const qty = received[sku] || 0;
        if (qty <= 0) continue;
        await addDoc(collection(db, "pallets"), { sku, units: qty, status: "NEW", clientId: employee.assignedClientId, warehouseId: employee.assignedWarehouseId, poNumber: shipment.poNumber, ediSource: shipment.ediSource, createdAt: now, updatedAt: now });
        await logMovement({ type: "DOCK_RECEIVING", itemCode: sku, toLocationId: "RECEIVING", movedQty: qty, uom: "EA", referenceId: shipment.id, badgeId: employee.badgeId, tenantId: employee.assignedClientId });
        await recordLaborEvent({
          badgeId: employee.badgeId,
          employeeName: employee.name,
          warehouseId: employee.assignedWarehouseId,
          tenantId: employee.assignedClientId,
          taskType: "DOCK_RECEIVING",
          referenceId: shipment.id,
          qty,
          uom: "EA",
          locationId: "RECEIVING",
          startedAt: taskStartRef.current,
        });
      }
      await updateDoc(doc(db, "inboundShipments", shipment.id), { status: "RECEIVED", receivedAt: now });
      ttsSpeak(`Receiving complete for shipment ${shipment.id}`);
      toast.success("Receiving complete"); playChime("ok");
      setShipment(null); setShipmentId(""); setLines([]); setReceived({});
      taskStartRef.current = Date.now();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Receiving failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [shipment, lines, received, employee, busy]);

  const scanner = useCameraScanner((code) => setShipmentId(code));

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Container className="h-5 w-5 text-emerald-400" /><h1 className="text-lg font-semibold">Dock Receiving</h1></div>
        <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`h-8 w-8 rounded flex items-center justify-center ${voiceEnabled ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`} title={voiceEnabled ? "Voice ON" : "Voice OFF"}>
          {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>
      </div>
      {error && (<div className="border border-amber-500/50 bg-amber-950/30 rounded-md p-3 text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>)}
      {!shipment ? (
        <div className="space-y-3">
          <CameraOverlay videoRef={scanner.videoRef} canvasRef={scanner.canvasRef} stream={scanner.stream} scanning={scanner.scanning} flash={scanner.flash} scannerSource={scanner.scannerSource} onStart={scanner.startCamera} onStop={scanner.stopCamera} error={scanner.error} />
          <div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><p className="text-xs text-slate-300">Scan Container / ASN</p><input autoFocus placeholder="Shipment or ASN #" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }} className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={handleLookup} disabled={busy}>{busy ? "Loading…" : "Lookup Shipment"}</button></div>
        </div>
      ) : (<div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><div className="text-xs text-slate-400">Shipment: <span className="font-mono text-white">{shipment.id}</span></div>{lines.map((line: any) => { const sku = line.sku || line.itemCode; const qty = received[sku] || 0; const max = line.qtyExpected || line.qty || 999; return (<div key={sku} className="flex items-center justify-between text-xs"><div><div className="font-mono text-white">{sku}</div><div className="text-slate-500">Expected: {max}</div></div><div className="flex items-center gap-2"><button className="h-8 w-8 rounded border border-slate-700 bg-slate-800 text-white" onClick={() => updateReceived(sku, -1)}>-</button><span className="font-mono text-white w-8 text-center">{qty}</span><button className="h-8 w-8 rounded border border-slate-700 bg-slate-800 text-white" onClick={() => updateReceived(sku, 1)} disabled={qty >= max}>+</button></div></div>); })}<button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={confirmReceiving} disabled={busy}>{busy ? "Receiving…" : "Confirm Receipt"}</button><button className="w-full text-slate-400 text-xs" onClick={() => { setShipment(null); setLines([]); setReceived({}); setError(""); scanner.stopCamera(); }}><ArrowLeft className="h-4 w-4 inline mr-1" />Back</button></div>)}
    </div>
  );
}

function InquiryScreen({ employee }: { employee: Employee }) {
  const [mode, setMode] = useState<"pallet" | "location" | "sku">("pallet");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string>("");
  const [detail, setDetail] = useState<string[]>([]);

  const handleLookup = useCallback(async () => {
    if (!input.trim()) return;
    const id = input.trim();
    try {
      if (mode === "pallet") {
        const snap = await getDoc(doc(db, "pallets", id));
        if (!snap.exists()) { setResult("Not found"); setDetail([]); playChime("err"); return; }
        const d = snap.data() as Record<string, unknown>;
        setResult("Pallet Detail");
        setDetail([`SKU: ${d.sku}`, `Units: ${d.units}`, `Status: ${d.status}`, `Location: ${d.location ?? "—"}`, `PO: ${d.poNumber ?? "—"}`]);
      } else if (mode === "location") {
        const snap = await getDocs(query(collection(db, "pallets"), where("location", "==", id), where("clientId", "==", employee.assignedClientId)));
        const items = snap.docs.map((d) => { const data = d.data() as Record<string, unknown>; return `${d.id}: ${data.sku} (${data.units} units)`; });
        setResult(`Location: ${id} (${items.length} pallets)`);
        setDetail(items.length ? items : ["No pallets at this location"]);
      } else {
        const snap = await getDocs(query(collection(db, "inventoryItems"), where("sku", "==", id), where("clientId", "==", employee.assignedClientId)));
        const items = snap.docs.map((d) => { const data = d.data() as Record<string, unknown>; const batches = (data.batches as any[]) || []; const total = batches.reduce((s, b) => s + (b.qty || 0), 0); return `${d.id}: ${total} units across ${batches.length} batches`; });
        setResult(`SKU: ${id} (${items.length} items)`);
        setDetail(items.length ? items : ["No inventory for this SKU"]);
      }
      playChime("ok");
    } catch (e: unknown) { setResult(e instanceof Error ? e.message : "Lookup failed"); setDetail([]); playChime("err"); }
  }, [mode, input, employee]);

  const scanner = useCameraScanner((code) => { setInput(code); });

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-emerald-400" /><h1 className="text-lg font-semibold">Inquiry</h1></div>
      <div className="flex gap-2 text-xs">
        {(["pallet", "location", "sku"] as const).map((m) => (<button key={m} className={`flex-1 py-2 rounded border ${mode === m ? "border-emerald-500 bg-emerald-950/30 text-emerald-400" : "border-slate-800 text-slate-400"}`} onClick={() => setMode(m)}>{m.toUpperCase()}</button>))}
      </div>
      {(mode === "pallet" || mode === "location") && (
        <CameraOverlay videoRef={scanner.videoRef} canvasRef={scanner.canvasRef} stream={scanner.stream} scanning={scanner.scanning} flash={scanner.flash} onStart={scanner.startCamera} onStop={scanner.stopCamera} error={scanner.error} />
      )}
      <div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3"><p className="text-xs text-slate-300">Scan / enter {mode}</p><input autoFocus placeholder={mode === "pallet" ? "Pallet ID" : mode === "location" ? "Location ID" : "SKU / UPC"} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }} className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md" /><button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={handleLookup}>Lookup</button></div>
      {result && (<div className="border border-slate-800 bg-slate-900 rounded-md p-3 space-y-1"><div className="text-xs font-medium text-white">{result}</div>{detail.map((d, i) => (<div key={i} className="text-[11px] text-slate-300 font-mono">{d}</div>))}</div>)}
    </div>
  );
}

function HistoryScreen({ employee }: { employee: Employee }) {
  const [history, setHistory] = useState<MovementHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMovementHistory(employee.assignedClientId, employee.badgeId, 50)
      .then((items) => { if (!cancelled) { setHistory(items); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employee]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <h2 className="text-sm font-semibold text-slate-300 mb-2">Recent Activity</h2>
      {history.length === 0 && (
        <div className="text-xs text-slate-500 text-center py-8">No movement history yet.</div>
      )}
      <div className="space-y-2">
        {history.map((h) => (
          <div key={h.movementId} className="border border-slate-800 bg-slate-900 rounded-md p-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-emerald-400">{h.type}</span>
              <span className="text-slate-500">{new Date(h.timestamp).toLocaleString()}</span>
            </div>
            <div className="text-slate-300">
              {h.itemCode} · {h.movedQty} {h.uom}
            </div>
            {h.fromLocationId && <div className="text-slate-500">From: {h.fromLocationId}</div>}
            {h.toLocationId && <div className="text-slate-500">To: {h.toLocationId}</div>}
            <div className="text-slate-500">Ref: {h.referenceId}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccessorialScreen({ employee }: { employee: Employee }) {
  const [type, setType] = useState<AccessorialType>("KITTING");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const taskStartRef = useRef<number>(Date.now());

  const voice = useVoicePicking({
    enabled: voiceEnabled,
    onCommand: (cmd) => {
      if (cmd.command === "confirm" && qty) confirm();
      else if (cmd.command === "cancel") { setQty(""); setNotes(""); }
    },
    onError: () => {},
  });

  const types: AccessorialType[] = [
    "KITTING",
    "RELABELING", 
    "MANUAL_WRAPPING",
    "CONTAINER_DEVANNING",
    "SPECIAL_HANDLING",
    "LABOR_STANDBY",
    "RUSH_PROCESSING",
  ];

  const typeLabels: Record<AccessorialType, string> = {
    KITTING: "Kitting & Assembly",
    RELABELING: "Re-labeling",
    MANUAL_WRAPPING: "Manual Wrapping",
    CONTAINER_DEVANNING: "Container Devanning",
    SPECIAL_HANDLING: "Special Handling",
    LABOR_STANDBY: "Labor Standby (15-min)",
    RUSH_PROCESSING: "Rush Processing",
  };

  const confirm = useCallback(async () => {
    if (busy) return;
    const q = parseInt(qty, 10);
    if (isNaN(q) || q <= 0) { setError("Enter valid quantity"); playChime("err"); return; }
    setBusy(true); setError("");
    try {
      await addDoc(collection(db, "billableEvents"), {
        badgeId: employee.badgeId,
        employeeName: employee.name,
        warehouseId: employee.assignedWarehouseId,
        tenantId: employee.assignedClientId,
        taskType: "Custom",
        referenceId: `ACC-${Date.now()}`,
        qty: q,
        uom: type === "LABOR_STANDBY" ? "MIN" : "EA",
        locationId: employee.assignedWarehouseId,
        startedAt: taskStartRef.current,
        accessorialType: type,
        notes,
      });
      toast.success(`${typeLabels[type]} logged (${q})`); playChime("ok");
      setQty(""); setNotes(""); taskStartRef.current = Date.now();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); playChime("err"); }
    finally { setBusy(false); }
  }, [employee, type, qty, notes, busy]);

  const typeIcons: Record<AccessorialType, LucideIcon> = {
    KITTING: PackageCheck,
    RELABELING: Tag,
    MANUAL_WRAPPING: Package,
    CONTAINER_DEVANNING: Truck,
    SPECIAL_HANDLING: Zap,
    LABOR_STANDBY: Clock,
    RUSH_PROCESSING: Zap,
  };

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Tag className="h-5 w-5 text-emerald-400" /><h1 className="text-lg font-semibold">Accessorial Charges</h1></div>
        <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`h-8 w-8 rounded flex items-center justify-center ${voiceEnabled ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`} title={voiceEnabled ? "Voice ON" : "Voice OFF"}>
          {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>
      </div>
      {error && (<div className="border border-amber-500/50 bg-amber-950/30 rounded-md p-3 text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span>{error}</span></div>)}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
{types.map((t) => {
            const Icon = typeIcons[t];
            return (
              <button
                key={t}
                onClick={() => { setType(t); setError(""); setQty(""); setNotes(""); taskStartRef.current = Date.now(); }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors ${
                  type === t 
                    ? "border-emerald-500 bg-emerald-950/30 text-emerald-400" 
                    : "border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-300"
                }`}
              >
                {Icon && <Icon className="h-6 w-6" />}
                <span className="text-xs font-medium text-center">{typeLabels[t]}</span>
              </button>
            );
          })}
      </div>
      <div className="border border-slate-800 bg-slate-900 rounded-md p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-slate-300">Quantity</label>
          <input
            autoFocus
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={type === "LABOR_STANDBY" ? "Minutes (15-min increments)" : "Units"}
            className="w-full h-12 bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg rounded-md"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-slate-300">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. PO# 12345, Customer request..."
            className="w-full h-20 bg-slate-800 border border-slate-700 text-white text-sm rounded-md p-2"
            maxLength={200}
          />
        </div>
        <button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-md font-semibold" onClick={confirm} disabled={busy}>
          {busy ? "Logging…" : "Log Accessorial"}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────
const NAV = [
  { title: "Putaway", screen: "putaway" as const, icon: PackageSearch },
  { title: "Move", screen: "move" as const, icon: MoveRight },
  { title: "Pick", screen: "pick" as const, icon: ClipboardList },
  { title: "Receive", screen: "receiving" as const, icon: Container },
  { title: "Inquiry", screen: "inquiry" as const, icon: ScanLine },
  { title: "History", screen: "history" as const, icon: History },
  { title: "Accessorial", screen: "accessorial" as const, icon: Wrench },
];

export default function App() {
  const { employee, verified, loading, setBadgeId, logout } = useRfSession();
  const [screen, setScreen] = useState<"putaway" | "move" | "pick" | "receiving" | "inquiry" | "history" | "accessorial">("putaway");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const { online, pending } = useOfflineQueue();
  const scanner = useScanner();

  useEffect(() => {
    const handler = (e: any) => {
      if (e?.data?.outputInitialized) {
        setInstallPrompt(e);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.preventDefault();
    const result = await installPrompt.prompt();
    if (result.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  if (!verified && !loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-4">
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); const badgeInput = document.getElementById("rf-badge") as HTMLInputElement; const pwInput = document.getElementById("rf-password") as HTMLInputElement; if (badgeInput && pwInput) setBadgeId(badgeInput.value.trim(), pwInput.value.trim()); }} className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <img src="/logo-placeholder.svg" alt="AZUX 3PL" className="h-14 mx-auto" />
            <h1 className="text-xl font-semibold text-white tracking-tight">RF Terminal</h1>
            <p className="text-xs text-slate-400">Enter your Badge ID and PIN to continue</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="rf-badge" className="text-xs text-slate-300">Badge ID</label>
              <input id="rf-badge" autoFocus placeholder="e.g. WH-1001" className="w-full h-12 bg-slate-900 border border-slate-700 text-white text-center text-lg font-mono tracking-widest rounded-md" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rf-password" className="text-xs text-slate-300">PIN / Password</label>
              <input id="rf-password" type="password" placeholder="Enter PIN" className="w-full h-12 bg-slate-900 border border-slate-700 text-white text-center text-lg font-mono tracking-widest rounded-md" />
            </div>
          </div>
          <button type="submit" className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md" disabled={loading}>Sign In</button>
          {installPrompt && (
            <button type="button" onClick={handleInstall} className="w-full h-10 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 rounded-md text-xs font-medium flex items-center justify-center gap-2">
              <Download className="h-4 w-4" /> Install App
            </button>
          )}
          <p className="text-center text-[10px] text-slate-500">Demo: WH-1001 / admin123, WH-1002 / ops123</p>
        </form>
      </div>
    );
  }

  if (!employee) return <div className="p-4 text-xs text-slate-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-md md:max-w-2xl h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 shrink-0">
        <img src="/logo-placeholder.svg" alt="AZUX" className="h-8 w-auto" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{employee.name}</div>
          <div className="text-[10px] text-slate-400 font-mono truncate">{employee.assignedWarehouseId} · {employee.badgeId}</div>
        </div>
        <div className="flex items-center gap-1">
          {!online && (
            <span className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-[10px] font-medium text-amber-400">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          )}
          {pending > 0 && (
            <span className="rounded bg-sky-500/20 px-2 py-1 text-[10px] font-medium text-sky-400">
              {pending} pending
            </span>
          )}
          {installPrompt && (
            <button onClick={handleInstall} className="h-8 w-8 flex items-center justify-center text-emerald-400 hover:text-emerald-300" title="Install App">
              <Download className="h-4 w-4" />
            </button>
          )}
          <button className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-white" onClick={logout}><LogOut className="h-4 w-4" /></button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        {screen === "putaway" && <PutawayScreen employee={employee} />}
        {screen === "move" && <MoveScreen employee={employee} />}
        {screen === "pick" && <PickScreen employee={employee} />}
        {screen === "receiving" && <ReceivingScreen employee={employee} />}
        {screen === "inquiry" && <InquiryScreen employee={employee} />}
        {screen === "history" && <HistoryScreen employee={employee} />}
        {screen === "accessorial" && <AccessorialScreen employee={employee} />}
      </main>
      <nav className="border-t border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="grid grid-cols-6">
          {NAV.map((item) => {
            const active = screen === item.screen;
            return (
              <button key={item.screen} onClick={() => setScreen(item.screen)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors">
                <item.icon className={`h-5 w-5 ${active ? "text-emerald-400" : "text-slate-500"}`} />
                <span className={active ? "text-emerald-400 font-medium" : "text-slate-500"}>{item.title}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
