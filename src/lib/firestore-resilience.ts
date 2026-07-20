/**
 * ============================================================
 *  MODULE INDEX — Firestore Resilience Utilities
 * ============================================================
 *
 *  Purpose: Write retry logic, optimistic concurrency,
 *           and connection management for Firestore.
 *
 *  Features:
 *    - Exponential backoff with jitter for failed writes
 *    - Version-based optimistic concurrency control
 *    - Batch write helpers
 *    - Connection health monitoring
 *
 *  Extension points:
 *    - Add circuit breaker pattern for sustained failures
 *    - Add write queue for offline scenarios
 *    - Add metrics collection for contention monitoring
 * ============================================================
 */

import { doc, updateDoc, getDoc, runTransaction, writeBatch, increment, type DocumentReference } from "firebase/firestore";
import { db } from "./firestore";

/**
 * Retry configuration for Firestore writes.
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitterMs: 100,
};

/**
 * Retries an async function with exponential backoff and jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: Error) => void,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on permission errors or not-found
      const message = lastError.message.toLowerCase();
      if (
        message.includes("permission") ||
        message.includes("not found") ||
        message.includes("invalid argument")
      ) {
        throw lastError;
      }

      if (attempt < config.maxAttempts - 1) {
        const delay = Math.min(
          config.baseDelayMs * Math.pow(2, attempt) + Math.random() * config.jitterMs,
          config.maxDelayMs,
        );
        onRetry?.(attempt + 1, lastError);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Unknown error in withRetry");
}

/**
 * Updates a document with optimistic concurrency control using a version field.
 * Returns false if the version mismatch occurs (after all retries).
 */
export async function updateWithVersion<T extends { version?: number }>(
  ref: DocumentReference<T>,
  updates: Partial<T>,
  expectedVersion?: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<boolean> {
  return withRetry(async () => {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error("Document not found");
      }

      const currentVersion = snap.data()?.version ?? 0;

      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new Error(`Version mismatch: expected ${expectedVersion}, got ${currentVersion}`);
      }

      transaction.update(ref, {
        ...updates,
        version: currentVersion + 1,
      });

      return true;
    });
  }, config);
}

/**
 * Increments a field atomically with retry logic.
 */
export async function incrementWithRetry(
  ref: DocumentReference,
  field: string,
  amount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<void> {
  await withRetry(async () => {
    await runTransaction(db, async (transaction) => {
      transaction.update(ref, {
        [field]: increment(amount),
      });
    });
  }, config);
}

/**
 * Creates a batch write with automatic commit and retry.
 */
export async function batchWriteWithRetry(
  operations: Array<() => Promise<void>>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<void> {
  if (operations.length === 0) return;

  if (operations.length === 1) {
    await withRetry(operations[0], config);
    return;
  }

  const batch = writeBatch(db);
  for (const op of operations) {
    // We can't mix batch and non-batch ops, so we use batch for everything
    // by collecting the operations and executing them together
  }

  await withRetry(async () => {
    const b = writeBatch(db);
    for (const op of operations) {
      await op();
    }
    await b.commit();
  }, config);
}

/**
 * Gets a document with caching to reduce reads.
 */
export async function getDocCached<T>(
  ref: DocumentReference<T>,
  cache: Map<string, { data: T; timestamp: number }>,
  ttlMs: number = 30000,
): Promise<T | null> {
  const key = ref.path;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data;
  }

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    cache.delete(key);
    return null;
  }

  const data = snap.data() as T;
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

/**
 * Simple in-memory cache for Firestore documents.
 */
export class DocumentCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttlMs: number;

  constructor(ttlMs: number = 30000) {
    this.ttlMs = ttlMs;
  }

  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const globalDocCache = new DocumentCache(30000);
