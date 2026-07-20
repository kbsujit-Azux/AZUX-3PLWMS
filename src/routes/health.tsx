import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, Wifi, WifiOff, AlertTriangle, CheckCircle2, RefreshCcw } from "lucide-react";
import { db } from "@/lib/firestore";
import { globalSubscriptionManager } from "@/lib/subscription-manager";
import { getDoc, doc } from "firebase/firestore";

interface HealthStatus {
  firestore: "connected" | "disconnected" | "checking";
  subscriptions: {
    total: number;
    active: number;
    paused: number;
    error: number;
  };
  lastChecked: string;
  errors: Array<{ id: string; message: string; timestamp: string }>;
}

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [{ title: "Health Pulse — AZUX 3PL WMS" }],
  }),
  component: HealthPage,
});

function HealthPage() {
  const [health, setHealth] = useState<HealthStatus>({
    firestore: "checking",
    subscriptions: { total: 0, active: 0, paused: 0, error: 0 },
    lastChecked: new Date().toISOString(),
    errors: [],
  });
  const [autoRefresh, setAutoRefresh] = useState(true);

  const checkFirestore = async () => {
    try {
      const start = Date.now();
      await getDoc(doc(db, "health-check"));
      const latency = Date.now() - start;
      setHealth((prev) => ({
        ...prev,
        firestore: "connected",
        lastChecked: new Date().toISOString(),
      }));
    } catch {
      setHealth((prev) => ({
        ...prev,
        firestore: "disconnected",
        lastChecked: new Date().toISOString(),
      }));
    }
  };

  useEffect(() => {
    checkFirestore();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      interval = setInterval(checkFirestore, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  useEffect(() => {
    const updateSubs = () => {
      const stats = globalSubscriptionManager.getStats();
      setHealth((prev) => ({
        ...prev,
        subscriptions: stats,
        lastChecked: new Date().toISOString(),
      }));
    };

    updateSubs();
    const interval = setInterval(updateSubs, 5000);
    return () => clearInterval(interval);
  }, []);

  const firestoreStatus = health.firestore === "connected" ? (
    <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Connected
    </Badge>
  ) : health.firestore === "disconnected" ? (
    <Badge variant="outline" className="gap-1 border-red-500/30 text-red-400">
      <WifiOff className="h-3 w-3" /> Disconnected
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-400">
      <Activity className="h-3 w-3 animate-pulse" /> Checking…
    </Badge>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Health Pulse</h1>
          <p className="text-xs text-muted-foreground">System health and subscription monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className="h-8 px-3 rounded border border-slate-700 text-xs text-slate-300 hover:text-white"
          >
            {autoRefresh ? "Pause Auto-Refresh" : "Resume Auto-Refresh"}
          </button>
          <button
            onClick={checkFirestore}
            className="h-8 w-8 flex items-center justify-center rounded border border-slate-700 text-slate-300 hover:text-white"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Firestore Connection</span>
            {firestoreStatus}
          </div>
          <div className="text-[10px] text-slate-500">
            Last checked: {new Date(health.lastChecked).toLocaleTimeString()}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Subscriptions</span>
            <span className="text-2xl font-semibold">{health.subscriptions.active}</span>
          </div>
          <div className="flex gap-3 text-[10px] text-slate-500">
            <span>Total: {health.subscriptions.total}</span>
            <span>Paused: {health.subscriptions.paused}</span>
            <span>Errors: {health.subscriptions.error}</span>
          </div>
        </Card>
      </div>

      {health.subscriptions.error > 0 && (
        <Card className="p-4 border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-medium">Subscription Errors</span>
          </div>
          <div className="space-y-1">
            {health.errors.map((err) => (
              <div key={err.id} className="text-xs text-slate-400">
                {err.message} — {new Date(err.timestamp).toLocaleTimeString()}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
