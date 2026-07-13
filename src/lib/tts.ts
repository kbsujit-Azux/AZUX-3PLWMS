/**
 * ============================================================
 *  MODULE INDEX — Text-to-Speech Helper
 * ============================================================
 *
 *  Purpose: Lightweight wrapper around Web Speech API
 *           for voice confirmations and guidance.
 * ============================================================
 */

const SPEECH_AVAILABLE =
  typeof window !== "undefined" &&
  typeof (window as any).speechSynthesis !== "undefined";

let queue: string[] = [];
let speaking = false;

function speakNext() {
  if (speaking || queue.length === 0) return;
  const text = queue.shift();
  if (!text || !SPEECH_AVAILABLE) return;
  speaking = true;
  const utterance = new (window as any).SpeechSynthesisUtterance(text);
  utterance.volume = 0.8;
  utterance.rate = 1.05;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  utterance.onend = () => {
    speaking = false;
    speakNext();
  };
  utterance.onerror = () => {
    speaking = false;
    speakNext();
  };
  (window as any).speechSynthesis.speak(utterance);
}

export function ttsSpeak(text: string, priority = false) {
  if (!SPEECH_AVAILABLE) return;
  if (priority) {
    queue = [text, ...queue];
  } else {
    queue = [...queue, text];
  }
  speakNext();
}

export function ttsStop() {
  queue = [];
  speaking = false;
  if (SPEECH_AVAILABLE) {
    (window as any).speechSynthesis.cancel();
  }
}

export function ttsAvailable(): boolean {
  return SPEECH_AVAILABLE;
}

export function useTTS() {
  const [enabled, setEnabled] = useState(() => ttsAvailable());

  useEffect(() => {
    if (!enabled) ttsStop();
  }, [enabled]);

  const speak = useCallback((text: string) => {
    if (enabled) ttsSpeak(text);
  }, [enabled]);

  return { enabled, setEnabled, speak, stop: ttsStop };
}
