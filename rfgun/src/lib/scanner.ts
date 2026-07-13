/**
 * ============================================================
 *  MODULE INDEX — Unified Scanner Abstraction
 * ============================================================
 *
 *  Purpose: Hardware-agnostic barcode scanning for warehouse
 *           floor devices. Supports:
 *           - Zebra DataWedge (intent-based)
 *           - Honeywell/Intermec keyboard wedge (HID)
 *           - Camera-based scanning (BarcodeDetector API)
 *
 *  Usage:
 *    const { start, stop, state } = createScannerStream((code, source) => {
 *      console.log("Scanned:", code, "from", source);
 *    });
 *    start();
 * ============================================================
 */

export type ScannerSource = "datwedge" | "keyboard" | "camera" | "none";

export interface ScannerState {
  source: ScannerSource;
  lastScan: string | null;
  error: string;
  active: boolean;
}

function createScannerState(): ScannerState {
  return { source: "none", lastScan: null, error: "", active: false };
}

export interface ScannerStream {
  start: () => void;
  stop: () => void;
  state: ScannerState;
}

export function createScannerStream(
  onScan: (code: string, source: ScannerSource) => void,
  options?: { cameraElement?: HTMLVideoElement | null; canvasElement?: HTMLCanvasElement | null },
): ScannerStream {
  const state = createScannerState();
  const buffer = { value: "" as string, timer: 0 as number };
  let cameraRunning = false;

  const resetBuffer = () => {
    buffer.value = "";
    clearTimeout(buffer.timer);
  };

  const handleScan = (code: string, source: ScannerSource) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    state.source = source;
    state.lastScan = trimmed;
    state.error = "";
    onScan(trimmed, source);
    resetBuffer();
  };

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleScan(buffer.value, "keyboard");
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      buffer.value += event.key;
      clearTimeout(buffer.timer);
      buffer.timer = window.setTimeout(() => {
        resetBuffer();
      }, 80);
    }
  };

  const handleDataWedgeIntent = (event: any) => {
    try {
      const extras = event?.data?.extras || {};
      const code = extras["com.symbol.datawedge.data_string"] || extras["data"] || "";
      if (code) handleScan(String(code), "datwedge");
    } catch {
      // ignore malformed intent
    }
  };

  const handleCameraScan = async () => {
    if (!options?.cameraElement || !options?.canvasElement) return;
    const video = options.cameraElement;
    const canvas = options.canvasElement;
    const ctx = canvas.getContext("2");
    if (!ctx || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    (ctx as unknown as CanvasRenderingContext2D).drawImage(video, 0, 0);

    try {
      const detector = new (window as unknown as Record<string, unknown>).BarcodeDetector({
        formats: ["code_128", "code_39", "ean_13", "upc_a", "qr_code"],
      });
      const barcodes = await (detector as { detect: (input: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>> }).detect(canvas);
      for (const barcode of barcodes) {
        if (barcode.rawValue) {
          handleScan(barcode.rawValue, "camera");
          break;
        }
      }
    } catch {
      // BarcodeDetector not supported or failed
    }
  };

  let cameraRaf = 0;

  const startCameraLoop = () => {
    if (cameraRunning) return;
    cameraRunning = true;
    const tick = async () => {
      if (!cameraRunning) return;
      await handleCameraScan();
      cameraRaf = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopCameraLoop = () => {
    cameraRunning = false;
    if (cameraRaf) cancelAnimationFrame(cameraRaf);
  };

  return {
    start() {
      state.active = true;
      window.addEventListener("keydown", handleKey);
      window.addEventListener("intent", handleDataWedgeIntent);
      document.addEventListener("dataswitch", handleDataWedgeIntent);
      startCameraLoop();
    },
    stop() {
      state.active = false;
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("intent", handleDataWedgeIntent);
      document.removeEventListener("dataswitch", handleDataWedgeIntent);
      stopCameraLoop();
      resetBuffer();
      state.source = "none";
      state.lastScan = null;
    },
    state,
  };
}
