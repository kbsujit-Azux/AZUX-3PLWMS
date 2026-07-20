import { Db, Firestore, FirestoreError } from "firebase/firestore";

import { doc, setDoc } from "firebase/firestore";
import { useState, useEffect, useCallback } from "react";
import { db } from "@shared/lib/firestore";

const DB_NAME = "azux-offline-outbox";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "id" });
      }
    };
  });

export interface OutboxItem {
  id: string;
  collection: string;
  docId: string;
  data: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
}

export async function enqueue(item: Omit<OutboxItem, "queuedAt" | "attempts">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").put({ ...item, queuedAt: Date.now(), attempts: 0 } as OutboxItem);
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").delete(id);
}

export async function getAllQueued(): Promise<OutboxItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readonly");
    const req = tx.objectStore("queue").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").clear();
}

export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  const items = await getAllQueued();
  let flushed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const docRef = doc(db, item.collection, item.docId);
      await setDoc(docRef, item.data, { merge: true });
      await dequeue(item.id);
      flushed++;
    } catch {
      failed++;
    }
  }

  return { flushed, failed };
}

export function useOfflineQueue() {
  const [online, setOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      const items = await getAllQueued();
      setPending(items.length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      await flushQueue();
      refreshPending();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    refreshPending();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refreshPending]);

  return { online, pending, refreshPending };
}
