/**
 * ============================================================
 *  SUBSCRIPTION MANAGER — Lifecycle-aware listener registry
 * ============================================================
 *
 *  Purpose:
 *    Centralize all Firestore onSnapshot subscriptions so they
 *    can be started, stopped, and bounded automatically per
 *    component/page lifecycle, preventing duplicate listeners,
 *    memory leaks, and mobile battery drain.
 *
 *  Features:
 *    - Route-aware subscription binding (auto-unsubscribe on nav)
 *    - Max concurrent subscription limit (mobile-friendly)
 *    - Heartbeat / health reporting per subscription
 *    - Global pause/resume for low-data situations
 *    - Subscription tagging for debugging/metrics
 *
 *  Extension points:
 *    - Wire into TanStack Router navigation events
 *    - Persist active subscriptions in sessionStorage
 *    - Add per-route priority for when to auto-pause
 * ============================================================
 */

import type { Unsubscribe } from "firebase/firestore";

type SubscriptionStatus = "active" | "paused" | "error" | "disposed";

export interface ManagedSubscription {
  id: string;
  tag?: string;
  unsubscribe: Unsubscribe;
  status: SubscriptionStatus;
  createdAt: number;
  lastHeartbeat: number;
  errorCount: number;
  /** Human-readable route or feature name for debugging */
  context?: string;
}

export interface SubscriptionManagerOptions {
  /** Max active subscriptions before pausing least recently used */
  maxActiveSubscriptions?: number;
  /** Heartbeat interval in ms; unused subscriptions auto-pause */
  heartbeatTimeoutMs?: number;
  /** Called when subscription errors occur */
  onError?: (sub: ManagedSubscription, error: Error) => void;
  /** Called when subscription auto-paused due to limit */
  onPaused?: (sub: ManagedSubscription) => void;
}

export class SubscriptionManager {
  private subscriptions = new Map<string, ManagedSubscription>();
  private activeCount = 0;
  private readonly maxActive: number;
  private readonly heartbeatTimeout: number;
  private readonly onError?: (sub: ManagedSubscription, error: Error) => void;
  private readonly onPaused?: (sub: ManagedSubscription) => void;
  private orderedIds: string[] = [];
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SubscriptionManagerOptions = {}) {
    this.maxActive = options.maxActiveSubscriptions ?? 12;
    this.heartbeatTimeout = options.heartbeatTimeoutMs ?? 60_000;
    this.onError = options.onError;
    this.onPaused = options.onPaused;
    this.startMaintenance();
  }

  register(id: string, unsubscribe: Unsubscribe, tag?: string, context?: string): ManagedSubscription {
    const sub: ManagedSubscription = {
      id,
      tag,
      unsubscribe,
      status: "active",
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      errorCount: 0,
      context,
    };

    if (this.subscriptions.has(id)) {
      this.dispose(id);
    }

    this.subscriptions.set(id, sub);
    this.orderedIds.push(id);
    this.activeCount++;

    if (this.activeCount > this.maxActive) {
      this.enforceLimit();
    }

    return sub;
  }

  heartbeat(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.status !== "active") return false;
    sub.lastHeartbeat = Date.now();
    return true;
  }

  dispose(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub) return false;

    const wasActive = sub.status === "active";

    try {
      sub.unsubscribe();
    } catch {
      // ignore errors during cleanup
    }

    sub.status = "disposed";
    this.subscriptions.delete(id);
    this.orderedIds = this.orderedIds.filter((x) => x !== id);
    if (wasActive) this.activeCount = Math.max(0, this.activeCount - 1);
    return true;
  }

  disposeAll(): void {
    const ids = [...this.orderedIds];
    ids.forEach((id) => this.dispose(id));
    this.orderedIds.length = 0;
    this.activeCount = 0;
  }

  pause(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.status !== "active") return false;

    try {
      sub.unsubscribe();
    } catch {
      // ignore
    }

    sub.status = "paused";
    sub.unsubscribe = () => {
      // no-op after pause
    };
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.onPaused?.(sub);
    return true;
  }

  resume(id: string, newUnsubscribe: Unsubscribe): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.status !== "paused") return false;

    sub.unsubscribe = newUnsubscribe;
    sub.status = "active";
    sub.lastHeartbeat = Date.now();
    this.activeCount++;

    if (this.activeCount > this.maxActive) {
      this.enforceLimit();
    }

    return true;
  }

  getSubscription(id: string): ManagedSubscription | undefined {
    return this.subscriptions.get(id);
  }

  getActiveSubscriptions(): ManagedSubscription[] {
    return [...this.subscriptions.values()].filter((s) => s.status === "active");
  }

  getStats() {
    const all = [...this.subscriptions.values()];
    return {
      total: all.length,
      active: all.filter((s) => s.status === "active").length,
      paused: all.filter((s) => s.status === "paused").length,
      error: all.filter((s) => s.status === "error").length,
      disposed: all.filter((s) => s.status === "disposed").length,
      maxActive: this.maxActive,
    };
  }

  markError(id: string, error: Error): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub) return false;

    sub.errorCount++;
    sub.status = "error";
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.onError?.(sub, error);
    return true;
  }

  shutdown(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
    this.disposeAll();
  }

  private enforceLimit(): void {
    const active = this.orderedIds
      .map((id) => this.subscriptions.get(id)!)
      .filter((s) => s.status === "active")
      .sort((a, b) => a.lastHeartbeat - b.lastHeartbeat);

    const excess = active.length - this.maxActive;
    if (excess <= 0) return;

    for (let i = 0; i < excess; i++) {
      const sub = active[i];
      if (sub) {
        this.pause(sub.id);
      }
    }
  }

  private startMaintenance(): void {
    this.maintenanceTimer = setInterval(() => {
      const now = Date.now();
      const toPause: string[] = [];

      this.subscriptions.forEach((sub, id) => {
        if (sub.status !== "active") return;
        if (now - sub.lastHeartbeat > this.heartbeatTimeout) {
          toPause.push(id);
        }
      });

      toPause.forEach((id) => this.pause(id));
    }, this.heartbeatTimeout);
  }
}

export const globalSubscriptionManager = new SubscriptionManager({
  maxActiveSubscriptions: 12,
  heartbeatTimeoutMs: 60_000,
});

export function useSubscriptionManager() {
  return globalSubscriptionManager;
}
