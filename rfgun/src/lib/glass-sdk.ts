import { createGlassBridge, type GlassBridge, type GlassVendor, type GlassInput, type GlassInputType } from "./glass-bridge";

type GlassSDK = {
  connect: () => Promise<void>;
  disconnect: () => void;
  displayText: (text: string, options?: { durationMs?: number; fontSize?: number }) => Promise<void>;
  clearDisplay: () => Promise<void>;
  captureImage: () => Promise<Blob | null>;
  onInput: (handler: (input: GlassInput) => void) => void;
  offInput: (handler: (input: GlassInput) => void) => void;
};

function createNoopSDK(): GlassSDK {
  return {
    connect: async () => {},
    disconnect: () => {},
    displayText: async () => {},
    clearDisplay: async () => {},
    captureImage: async () => null,
    onInput: () => {},
    offInput: () => {},
  };
}

export function createVuzixSDK(): GlassSDK {
  let listener: ((input: GlassInput) => void) | null = null;

  const handler = (event: MessageEvent) => {
    const data = event.data || {};
    if (data.type === "vuzix_tap") {
      listener?.({ type: "tap", value: data.value, timestamp: new Date() });
    } else if (data.type === "vuzix_swipe") {
      const inputType: GlassInputType = data.direction === "up" ? "swipe_up" : data.direction === "down" ? "swipe_down" : "tap";
      listener?.({ type: inputType, value: data.direction, timestamp: new Date() });
    } else if (data.type === "vuzix_voice") {
      listener?.({ type: "voice", value: data.text, timestamp: new Date() });
    }
  };

  return {
    connect: async () => {
      window.addEventListener("message", handler);
    },
    disconnect: () => {
      window.removeEventListener("message", handler);
      listener = null;
    },
    displayText: async (text: string, options?: { durationMs?: number }) => {
      (window as any).postMessage?.({ type: "vuzix_display", text, durationMs: options?.durationMs ?? 3000 }, "*");
      await new Promise((resolve) => setTimeout(resolve, 200));
    },
    clearDisplay: async () => {
      (window as any).postMessage?.({ type: "vuzix_clear" }, "*");
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    captureImage: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) { stream.getTracks().forEach((t) => t.stop()); return null; }
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => {
            stream.getTracks().forEach((t) => t.stop());
            resolve(b);
          }, "image/jpeg", 0.85);
        });
        return blob;
      } catch {
        return null;
      }
    },
    onInput: (handler: (input: GlassInput) => void) => {
      listener = handler;
    },
    offInput: () => {
      listener = null;
    },
  };
}

export function createGoogleGlassSDK(): GlassSDK {
  let listener: ((input: GlassInput) => void) | null = null;

  const handler = (event: MessageEvent) => {
    const data = event.data || {};
    if (data.type === "glass_tap") {
      listener?.({ type: "tap", value: data.value, timestamp: new Date() });
    } else if (data.type === "glass_swipe") {
      const inputType: GlassInputType = data.direction === "up" ? "swipe_up" : data.direction === "down" ? "swipe_down" : "tap";
      listener?.({ type: inputType, value: data.direction, timestamp: new Date() });
    } else if (data.type === "glass_voice") {
      listener?.({ type: "voice", value: data.text, timestamp: new Date() });
    }
  };

  return {
    connect: async () => {
      window.addEventListener("message", handler);
    },
    disconnect: () => {
      window.removeEventListener("message", handler);
      listener = null;
    },
    displayText: async (text: string, options?: { durationMs?: number }) => {
      (window as any).postMessage?.({ type: "glass_display", text, durationMs: options?.durationMs ?? 3000 }, "*");
      await new Promise((resolve) => setTimeout(resolve, 200));
    },
    clearDisplay: async () => {
      (window as any).postMessage?.({ type: "glass_clear" }, "*");
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    captureImage: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) { stream.getTracks().forEach((t) => t.stop()); return null; }
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => {
            stream.getTracks().forEach((t) => t.stop());
            resolve(b);
          }, "image/jpeg", 0.85);
        });
        return blob;
      } catch {
        return null;
      }
    },
    onInput: (handler: (input: GlassInput) => void) => {
      listener = handler;
    },
    offInput: () => {
      listener = null;
    },
  };
}

export function createGlassSDK(vendor: GlassVendor): GlassSDK {
  switch (vendor) {
    case "vuzix":
      return createVuzixSDK();
    case "google_glass":
      return createGoogleGlassSDK();
    default:
      return createNoopSDK();
  }
}
