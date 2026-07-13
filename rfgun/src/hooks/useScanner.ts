import { useState, useEffect, useCallback, useRef } from "react";
import { createScannerStream, type ScannerSource, type ScannerState } from "../lib/scanner";

export function useScanner(options?: { cameraElement?: HTMLVideoElement | null; canvasElement?: HTMLCanvasElement | null }) {
  const [state, setState] = useState<ScannerState>({ source: "none", lastScan: null, error: "", active: false });
  const streamRef = useRef<ReturnType<typeof createScannerStream> | null>(null);

  useEffect(() => {
    streamRef.current = createScannerStream(
      (code, source) => {
        setState((prev) => ({ ...prev, lastScan: code, source, error: "" }));
        if (navigator.vibrate) navigator.vibrate(50);
      },
      options,
    );
    return () => {
      streamRef.current?.stop();
    };
  }, [options?.cameraElement, options?.canvasElement]);

  const start = useCallback(() => {
    streamRef.current?.start();
    setState((prev) => ({ ...prev, active: true, error: "" }));
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.stop();
    setState((prev) => ({ ...prev, active: false, source: "none", lastScan: null }));
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  return { state, start, stop, setError };
}
