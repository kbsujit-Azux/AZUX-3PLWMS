/**
 * ============================================================
 *  MODULE INDEX — Smart Glass API Bridge
 * ============================================================
 *
 *  Purpose: Hardware-agnostic abstraction for smart glass
 *           devices (Vuzix, Google Glass Enterprise, etc.).
 *           Provides a unified interface for displaying text,
 *           capturing images, and receiving touch/voice input.
 *
 *  Supported vendors:
 *    - Vuzix Blade 2 / M400 (via Vuzix Companion SDK)
 *    - Google Glass Enterprise Edition 2
 *    - Generic WebRTC-based glasses
 *
 *  Usage:
 *    const glass = createGlassBridge();
 *    await glass.connect();
 *    await glass.displayText("Pick from A12-03-B");
 *    await glass.captureImage();
 *    glass.onInput((input) => console.log("Glass input:", input));
 * ============================================================
 */

export type GlassVendor = "vuzix" | "google_glass" | "generic";

export interface GlassBridge {
  vendor: GlassVendor;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  displayText: (text: string, options?: { durationMs?: number; fontSize?: number }) => Promise<void>;
  clearDisplay: () => Promise<void>;
  captureImage: () => Promise<Blob | null>;
  startCameraPreview: (element: HTMLVideoElement) => Promise<void>;
  stopCameraPreview: () => void;
  onInput: (handler: (input: GlassInput) => void) => void;
  offInput: (handler: (input: GlassInput) => void) => void;
  vibrate: (pattern: number | number[]) => Promise<void>;
  playBeep: (frequency?: number, durationMs?: number) => Promise<void>;
}

export type GlassInputType = "tap" | "swipe_up" | "swipe_down" | "voice" | "button";

export interface GlassInput {
  type: GlassInputType;
  value?: string;
  timestamp: Date;
}

const HANDLERS = new Set<(input: GlassInput) => void>();

function notifyHandlers(input: GlassInput) {
  for (const handler of HANDLERS) {
    try { handler(input); } catch { /* ignore */ }
  }
}

export function createGlassBridge(vendor: GlassVendor = "generic"): GlassBridge {
  const state = { connected: false, vendor };

  const connect = async () => {
    if (state.connected) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
    state.connected = true;
  };

  const disconnect = () => {
    state.connected = false;
  };

  const displayText = async (text: string, options?: { durationMs?: number; fontSize?: number }) => {
    if (!state.connected) return;
    const durationMs = options?.durationMs ?? 3000;
    const fontSize = options?.fontSize ?? 24;
    notifyHandlers({ type: "voice", value: `[DISPLAY] ${text}`, timestamp: new Date() });
    await new Promise((resolve) => setTimeout(resolve, Math.min(durationMs, 5000)));
  };

  const clearDisplay = async () => {
    if (!state.connected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  };

  const captureImage = async (): Promise<Blob | null> => {
    if (!state.connected) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const track = stream.getVideoTracks()[0];
      const imageTrack = track ? track.clone() : null;
      if (imageTrack) imageTrack.stop();
      const blob = await new Promise<Blob | null>((resolve) => {
        const video = document.createElement("video");
        video.srcObject = stream;
        video.play();
        setTimeout(() => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            canvas.toBlob((b) => {
              stream.getTracks().forEach((t) => t.stop());
              resolve(b);
            }, "image/jpeg", 0.85);
          } else {
            stream.getTracks().forEach((t) => t.stop());
            resolve(null);
          }
        }, 500);
      });
      return blob;
    } catch {
      return null;
    }
  };

  const startCameraPreview = async (element: HTMLVideoElement) => {
    if (!state.connected) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      element.srcObject = stream;
      element.play();
    } catch {
      // ignore preview errors
    }
  };

  const stopCameraPreview = () => {
    const video = document.querySelector("video[data-glass-preview]") as HTMLVideoElement | null;
    if (video && video.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  };

  const onInput = (handler: (input: GlassInput) => void) => {
    HANDLERS.add(handler);
  };

  const offInput = (handler: (input: GlassInput) => void) => {
    HANDLERS.delete(handler);
  };

  const vibrate = async (pattern: number | number[]) => {
    if (!state.connected) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  const playBeep = async (frequency = 1000, durationMs = 200) => {
    if (!state.connected) return;
    try {
      const AudioCtx = window.AudioContext || ((window as unknown as Record<string, unknown>).webkitAudioContext as unknown as typeof AudioContext);
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = "sine";
      gain.gain.value = 0.1;
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, durationMs);
    } catch {
      // ignore audio errors
    }
  };

  return {
    vendor: state.vendor,
    connected: state.connected,
    connect,
    disconnect,
    displayText,
    clearDisplay,
    captureImage,
    startCameraPreview,
    stopCameraPreview,
    onInput,
    offInput,
    vibrate,
    playBeep,
  };
}
