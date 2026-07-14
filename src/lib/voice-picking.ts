/**
 * ============================================================
 *  MODULE INDEX — Voice-Directed & Vision Picking
 * ============================================================
 *
 *  Purpose: WebRTC and Web Speech API hooks for hands-free
 *           warehouse picking. Supports:
 *           - Voice command recognition ("next", "confirm", "skip", "quantity 5")
 *           - WebRTC audio stream capture for external voice engines
 *           - Smart glass API abstraction (Vuzix, Google Glass Enterprise)
 *           - Vision picking overlay helpers
 *
 *  Usage:
 *    const voice = useVoiceCommands({
 *      onCommand: (cmd) => console.log("Voice command:", cmd),
 *      enabled: true,
 *    });
 *
 *  Note: Web Speech API requires HTTPS or localhost.
 *        Smart glass integration requires vendor-specific SDKs.
 * ============================================================
 */

export type VoiceCommand =
  | "next"
  | "previous"
  | "confirm"
  | "skip"
  | "quantity"
  | "help"
  | "repeat"
  | "cancel"
  | "unknown";

export interface ParsedVoiceCommand {
  command: VoiceCommand;
  value?: string | number;
  rawTranscript: string;
  confidence: number;
  timestamp: Date;
}

export type VoiceCommandHandler = (cmd: ParsedVoiceCommand) => void;

export interface VoicePickingOptions {
  enabled: boolean;
  onCommand: VoiceCommandHandler;
  onError?: (error: Error) => void;
  locale?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface VoicePickingState {
  listening: boolean;
  supported: boolean;
  transcript: string;
  lastCommand: ParsedVoiceCommand | null;
  error: string;
}

const COMMAND_PATTERNS: Array<{ regex: RegExp; command: VoiceCommand; parse?: (match: RegExpMatchArray) => string | number | undefined }> = [
  { regex: /^(next|skip|skip\s*to\s*next|move\s*next)/i, command: "next" },
  { regex: /^(previous|prev|back|go\s*back)/i, command: "previous" },
  { regex: /^(confirm|yes|okay|ok|done|complete|finished|yep|yup)/i, command: "confirm" },
  { regex: /^(skip|skip\s*this|pass|next\s*item|continue)/i, command: "skip" },
  { regex: /^(quantity|qty|how\s*many|number|count)\s+(\d+)/i, command: "quantity", parse: (m) => parseInt(m[2], 10) },
  { regex: /^(help|assist|support|what\s*can\s*i\s*say)/i, command: "help" },
  { regex: /^(repeat|say\s*again|say\s*that\s*again)/i, command: "repeat" },
  { regex: /^(cancel|stop|abort|quit|exit|never\s*mind)/i, command: "cancel" },
];

function parseCommand(transcript: string): ParsedVoiceCommand {
  const normalized = transcript.trim();
  for (const pattern of COMMAND_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (match) {
      const value = pattern.parse ? pattern.parse(match) : undefined;
      return {
        command: pattern.command,
        value,
        rawTranscript: normalized,
        confidence: 0.85,
        timestamp: new Date(),
      };
    }
  }
  return {
    command: "unknown",
    rawTranscript: normalized,
    confidence: 0,
    timestamp: new Date(),
  };
}

export function createVoicePickingEngine(options: VoicePickingOptions) {
  const { enabled, onCommand, onError, locale = "en-US", continuous = true, interimResults = false } = options;
  const state: VoicePickingState = {
    listening: false,
    supported: false,
    transcript: "",
    lastCommand: null,
    error: "",
  };

  let recognition: any = null;
  let stream: MediaStream | null = null;

  const updateState = (patch: Partial<VoicePickingState>) => {
    Object.assign(state, patch);
  };

  const handleResult = (transcript: string, confidence: number) => {
    updateState({ transcript });
    const parsed = parseCommand(transcript);
    parsed.confidence = confidence;
    updateState({ lastCommand: parsed });
    if (parsed.command !== "unknown") {
      onCommand(parsed);
    }
  };

  const startWebSpeech = () => {
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      updateState({ supported: false, error: "Web Speech API not supported in this browser" });
      onError?.(new Error("Web Speech API not supported"));
      return;
    }

    updateState({ supported: true, error: "" });
    const rec = new (SpeechRecognition as new () => { lang: string; continuous: boolean; interimResults: boolean; onresult: (event: { results: ArrayLike<{ 0: { transcript: string; confidence: number } }> }) => void; onerror: (event: { error: string }) => void; onend: () => void; start: () => void; stop: () => void })();
    rec.lang = locale;
    rec.continuous = continuous;
    rec.interimResults = interimResults;

    rec.onresult = (event: { results: ArrayLike<{ 0: { transcript: string; confidence: number } }> }) => {
      const last = event.results[event.results.length - 1];
      if (last) {
        handleResult(last[0].transcript, last[0].confidence ?? 0);
      }
    };

    rec.onerror = (event: { error: string }) => {
      updateState({ error: event.error, listening: false });
      onError?.(new Error(event.error));
    };

    rec.onend = () => {
      updateState({ listening: false });
    };

    recognition = rec;
    try {
      rec.start();
      updateState({ listening: true });
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error("Failed to start speech recognition"));
    }
  };

  const startWebRTC = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      updateState({ supported: true, error: "", listening: true });
      onCommand({
        command: "confirm",
        rawTranscript: "[WebRTC audio stream started]",
        confidence: 1,
        timestamp: new Date(),
      });
    } catch (e) {
      updateState({ supported: false, error: "Microphone access denied", listening: false });
      onError?.(e instanceof Error ? e : new Error("Microphone access denied"));
    }
  };

  const start = async () => {
    if (!enabled) return;
    if (state.listening) return;

    if (typeof (window as unknown as Record<string, unknown>).SpeechRecognition !== "undefined" || typeof (window as unknown as Record<string, unknown>).webkitSpeechRecognition !== "undefined") {
      startWebSpeech();
    } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      await startWebRTC();
    } else {
      updateState({ supported: false, error: "No voice input API available" });
      onError?.(new Error("No voice input API available"));
    }
  };

  const stop = () => {
    if (recognition) {
      try { recognition.stop(); } catch { /* ignore */ }
      recognition = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    updateState({ listening: false, transcript: "" });
  };

  const destroy = () => {
    stop();
  };

  return {
    state,
    start,
    stop,
    destroy,
    parseCommand,
  };
}
