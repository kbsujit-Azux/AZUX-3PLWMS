import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type ScanMode = "camera" | "manual";

type BarcodeScannerOptions = {
  active?: boolean;
  onScan?: (code: string) => void;
  onError?: (error: Error) => void;
};

type UseBarcodeScannerResult = {
  mode: ScanMode;
  setMode: (mode: ScanMode) => void;
  scanning: boolean;
  lastCode: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  toggleCamera: () => void;
};

export function useBarcodeScanner({
  active = true,
  onScan,
  onError,
}: BarcodeScannerOptions = {}): UseBarcodeScannerResult {
  const [mode, setMode] = useState<ScanMode>("manual");
  const [scanning, setScanning] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    readerRef.current = null;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || typeof window === "undefined") return;
    try {
      stopCamera();
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      setScanning(true);
      const stream = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) {
            const code = result.getText();
            setLastCode(code);
            onScan?.(code);
          }
        },
      );
      streamRef.current = stream as unknown as MediaStream;
    } catch (err) {
      setScanning(false);
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
      setMode("manual");
    }
  }, [onScan, onError, stopCamera]);

  const toggleCamera = useCallback(() => {
    if (mode === "camera") {
      setMode("manual");
      stopCamera();
    } else {
      setMode("camera");
    }
  }, [mode, stopCamera]);

  useEffect(() => {
    if (mode === "camera" && active) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [mode, active, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    mode,
    setMode,
    scanning,
    lastCode,
    videoRef,
    startCamera,
    stopCamera,
    toggleCamera,
  };
}
