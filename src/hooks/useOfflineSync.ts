import { useState, useEffect, useCallback, useRef } from "react";
import { updateDoc, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const OFFLINE_QUEUE_KEY = "azux.rf.offlineQueue";

type QueuedOpType = "update" | "set" | "delete";

type QueuedOp = {
  id: string;
  collection: string;
  docId?: string;
  type: QueuedOpType;
  data: any;
  timestamp: number;
};

type OfflineSyncState = {
  enqueue: (op: {
    collection: string;
    docId?: string;
    type: QueuedOpType;
    data: any;
  }) => void;
  queue: QueuedOp[];
  online: boolean;
  flushing: boolean;
};

export function useOfflineSync(): OfflineSyncState {
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [online, setOnline] = useState(() => {
    if (typeof navigator !== "undefined") {
      return navigator.onLine;
    }
    return true;
  });
  const [flushing, setFlushing] = useState(false);
  const flushRef = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as QueuedOp[];
        if (Array.isArray(parsed)) {
          setQueue(parsed);
        }
      }
    } catch {
      // storage unavailable
    }
  }, []);

  const persistQueue = useCallback((next: QueuedOp[]) => {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
    } catch {
      // storage full
    }
  }, []);

  const enqueue = useCallback(
    (op: { collection: string; docId?: string; type: QueuedOpType; data: any }) => {
      const entry: QueuedOp = {
        ...op,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
      };
      setQueue((q) => {
        const next = [...q, entry];
        persistQueue(next);
        return next;
      });
    },
    [persistQueue],
  );

  const flushQueue = useCallback(async () => {
    if (flushRef.current) return;
    flushRef.current = true;
    setFlushing(true);
    let remaining = queue;
    for (const op of remaining) {
      try {
        if (op.type === "update" && op.collection && op.docId) {
          await updateDoc(doc(db, op.collection, op.docId), op.data);
        } else if (op.type === "set" && op.collection && op.docId) {
          await setDoc(doc(db, op.collection, op.docId), op.data);
        } else if (op.type === "delete" && op.collection && op.docId) {
          await deleteDoc(doc(db, op.collection, op.docId));
        }
        setQueue((q) => {
          const next = q.filter((item) => item.id !== op.id);
          persistQueue(next);
          return next;
        });
      } catch (err) {
        console.warn("Offline sync failed for", op.collection, op.docId, err);
      }
    }
    setFlushing(false);
    flushRef.current = false;
  }, [queue, persistQueue]);

  useEffect(() => {
    if (!online) return;
    if (queue.length === 0) return;
    flushQueue();
  }, [online, queue, flushQueue]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { enqueue, queue, online, flushing };
}
