/**
 * ============================================================
 *  MODULE INDEX — Voice Picking Hook
 * ============================================================
 *
 *  Purpose: React wrapper for voice command recognition.
 *           Uses Web Speech API when available.
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createVoicePickingEngine, type VoicePickingOptions, type ParsedVoiceCommand, type VoiceCommand, type VoicePickingState } from "../lib/voice-picking";

export function useVoicePicking(options: VoicePickingOptions) {
  const [state, setState] = useState<VoicePickingState>({
    listening: false,
    supported: false,
    transcript: "",
    lastCommand: null,
    error: "",
  });

  const engineRef = useRef<ReturnType<typeof createVoicePickingEngine> | null>(null);

  useEffect(() => {
    if (!options.enabled) return;
    const engine = createVoicePickingEngine({
      ...options,
      onCommand: (cmd) => {
        options.onCommand(cmd);
        setState((prev) => ({ ...prev, lastCommand: cmd }));
      },
      onError: (error) => {
        options.onError?.(error);
        setState((prev) => ({ ...prev, error: error.message }));
      },
    });
    engineRef.current = engine;
    setState((prev) => ({ ...prev, supported: engine.state.supported }));

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [options.enabled]);

  const start = useCallback(async () => {
    engineRef.current?.start();
    setState((prev) => ({ ...prev, listening: true, error: "" }));
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setState((prev) => ({ ...prev, listening: false, transcript: "" }));
  }, []);

  return { ...state, start, stop } as const;
}
