import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException, DecodeContinuouslyResult } from "@zxing/browser";

type ScannerSource = "camera" | "datwedge" | "keyboard" | "none";

interface ScannerState {
  source: ScannerSource;
  lastScan: string | null;
  error: string;
  active: boolean;
  scanning: boolean;
}

interface UseZXingScannerOptions {
  onScan: (code: string, source: ScannerSource) => void;
  facingMode?: "environment" | "user";
  scanIntervalMs?: number;
  enabled?: boolean;
}

interface UseZXingScannerResult {
  state: ScannerState;
  start: () => Promise<void>;
  stop: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  toggleTorch?: () => Promise<void>;
  torchOn: boolean;
}

export function useZXingScanner({
  onScan,
  facingMode = "environment",
  scanIntervalMs = 500,
  enabled = true,
}: UseZXingScannerOptions = {}): UseZXingScannerResult {
  const [state, setState] = useState<ScannerState>({
    source: "none",
    lastScan: null,
    error: "",
    active: false,
    scanning: false,
  });
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<string>("");
  const cooldownRef = useRef(0);
  const rafRef = useRef(0);
  const scanningRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch {
        // ignore reset errors
      }
      readerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    scanningRef.current = false;
    setState((prev) => ({ ...prev, scanning: false }));
  }, []);

  const processResult = useCallback(
    (result: DecodeContinuouslyResult | undefined) => {
      if (!result || !result.getText()) return;
      const code = result.getText().trim();
      if (!code) return;

      const now = Date.now();
      if (code === lastScanRef.current || now - cooldownRef.current < scanIntervalMs) {
        return;
      }

      lastScanRef.current = code;
      cooldownRef.current = now;
      setState((prev) => ({ ...prev, lastScan: code, source: "camera", error: "" }));
      onScan(code, "camera");

      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    },
    [onScan, scanIntervalMs],
  );

  const start = useCallback(async () => {
    if (!enabled || !videoRef.current) return;
    try {
      stopCamera();

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      setState((prev) => ({ ...prev, active: true, error: "", scanning: true }));
      scanningRef.current = true;

      const stream = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        processResult,
      );

      streamRef.current = stream as unknown as MediaStream;
    } catch (e: unknown) {
      scanningRef.current = false;
      setState((prev) => ({
        ...prev,
        scanning: false,
        error: e instanceof Error ? e.message : "Camera access denied",
      }));
    }
  }, [enabled, processResult, stopCamera]);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !videoRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as Record<string, unknown>;
      if (!capabilities?.torch) return;

      const newState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: newState } as Record<string, unknown>],
      });
      setTorchOn(newState);
    } catch {
      // torch not supported or failed
    }
  }, [torchOn]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!enabled) {
      stopCamera();
      setState((prev) => ({ ...prev, active: false, scanning: false }));
    }
  }, [enabled, stopCamera]);

  return {
    state,
    start,
    stop: stopCamera,
    videoRef,
    toggleTorch,
    torchOn,
  };
}
