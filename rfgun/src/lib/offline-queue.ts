/**
 * ============================================================
 *  MODULE INDEX — Offline Queue
 * ============================================================
 *
 *  Purpose: Queue Firestore writes locally when offline,
 *           then flush when connectivity resumes.
 *
 *  Collections supported:
 *    - billableEvents
 *    - laborEvents
 *    - movementHistory
 * ============================================================
 */

import { useState, useEffect, useCallback } from "react";

const DB_NAME = "azux-offline-outbox";
const STORE_NAME = "queue";
const DB_VERSION = 1;

export interface OutboxItem {
  id: string;
  collection: string;
  docId: string;
  data: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function enqueue(item: Omit<OutboxItem, "queuedAt" | "attempts">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put({
    ...item,
    queuedAt: Date.now(),
    attempts: 0,
  } as OutboxItem);
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
}

export async function getAllQueued(): Promise<OutboxItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
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
    const goOnline = () => { setOnline(true); refreshPending(); };
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
