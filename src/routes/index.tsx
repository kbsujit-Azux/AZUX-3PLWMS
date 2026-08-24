import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  PackageCheck,
  Truck,
  Gauge,
  TrendingUp,
  TrendingDown,
  PackagePlus,
  PackageMinus,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — AZUX 3PL WMS Systems" },
      { name: "description", content: "Multi-tenant 3PL command center." },
    ],
  }),
  component: Dashboard,
});

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string;
    value?: string | number;
    color?: string;
  }>;
  label?: string | number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-md">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 space-y-0.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2 text-[11px] font-mono">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto tabular-nums">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const { tenantId, warehouseId } = useWorkspace();
  const {
    tenants,
    warehouses,
    inventoryItems,
    inboundShipments,
    orders,
    pickTickets,
    pallets,
    carrierDispatches,
    ediLogs,
    loading,
    refreshData,
  } = useWmsData();

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isAll = tenantId === "all";
  const isAllWh = warehouseId === "all";

  const filteredTenants = useMemo(
    () => (isAll ? tenants : tenants.filter((t) => t.id === tenantId)),
    [tenants, tenantId, isAll],
  );
  const filteredWarehouses = useMemo(
    () =>
      isAllWh
        ? warehouses.filter((w) => w.id !== "all")
        : warehouses.filter((w) => w.id === warehouseId),
    [warehouses, warehouseId, isAllWh],
  );
  const filteredInventory = useMemo(
    () =>
      isAll
        ? inventoryItems
        : inventoryItems.filter((item) => {
            const tenantMatch = item.tenantId === tenantId;
            const whMatch = isAllWh || item.warehouseId === warehouseId;
            return tenantMatch && whMatch;
          }),
    [inventoryItems, tenantId, warehouseId, isAll, isAllWh],
  );
  const filteredInbound = useMemo(
    () =>
      isAll
        ? inboundShipments
        : inboundShipments.filter((s) => {
            const tenantMatch = s.tenantId === tenantId;
            const whMatch = isAllWh || s.warehouseId === warehouseId;
            return tenantMatch && whMatch;
          }),
    [inboundShipments, tenantId, warehouseId, isAll, isAllWh],
  );
  const filteredOrders = useMemo(
    () =>
      isAll
        ? orders
        : orders.filter((o) => {
            const tenantMatch = o.tenantId === tenantId;
            const whMatch = isAllWh || o.warehouseId === warehouseId;
            return tenantMatch && whMatch;
          }),
    [orders, tenantId, warehouseId, isAll, isAllWh],
  );
  const filteredPicks = useMemo(
    () =>
      isAll
        ? pickTickets
        : pickTickets.filter((p) => {
            const tenantMatch = p.tenantId === tenantId;
            const whMatch = isAllWh || p.warehouseId === warehouseId;
            return tenantMatch && whMatch;
          }),
    [pickTickets, tenantId, warehouseId, isAll, isAllWh],
  );
  const filteredDispatches = useMemo(
    () =>
      isAll
        ? carrierDispatches
        : carrierDispatches.filter((d) => {
            const tenantMatch = d.tenantId === tenantId;
            const whMatch = isAllWh || d.warehouseId === warehouseId;
            return tenantMatch && whMatch;
          }),
    [carrierDispatches, tenantId, warehouseId, isAll, isAllWh],
  );

  const activeInbound = useMemo(
    () => filteredInbound.filter((s) => s.status !== "received" && s.status !== "closed").length,
    [filteredInbound],
  );
  const activeOutbound = useMemo(
    () =>
      filteredOrders.filter((o) => ["new", "allocated", "picked", "packed"].includes(o.status))
        .length,
    [filteredOrders],
  );
  const totalSkus = useMemo(
    () => new Set(filteredInventory.map((i) => i.sku)).size,
    [filteredInventory],
  );
  const avgUtilization = useMemo(() => {
    if (filteredWarehouses.length === 0) return 0;
    const sum = filteredWarehouses.reduce((acc, w) => acc + (w.capacityPct || 0), 0);
    return Math.round(sum / filteredWarehouses.length);
  }, [filteredWarehouses]);

  const kpis = useMemo(
    () => [
      {
        label: "Active Inbound",
        value: String(activeInbound),
        delta: filteredInbound.length > 0 ? `${filteredInbound.length} total` : "No data",
        trend: activeInbound > 0 ? "up" : "flat",
        icon: PackageCheck,
        accent: "text-chart-2",
      },
      {
        label: "Active Outbound",
        value: String(activeOutbound),
        delta: filteredOrders.length > 0 ? `${filteredOrders.length} total` : "No data",
        trend: activeOutbound > 0 ? "up" : "flat",
        icon: Truck,
        accent: "text-chart-3",
      },
      {
        label: "Total SKUs",
        value: totalSkus.toLocaleString(),
        delta:
          filteredTenants.length > 0
            ? `${filteredTenants.length} tenant${filteredTenants.length !== 1 ? "s" : ""}`
            : "No tenant",
        trend: "flat",
        icon: Boxes,
        accent: "text-chart-1",
      },
      {
        label: "Network Utilization",
        value: `${avgUtilization}%`,
        delta: avgUtilization >= 90 ? "Near capacity" : avgUtilization >= 75 ? "High" : "Normal",
        trend: avgUtilization >= 90 ? "down" : "flat",
        icon: Gauge,
        accent: "text-chart-4",
      },
    ],
    [
      activeInbound,
      activeOutbound,
      totalSkus,
      avgUtilization,
      filteredInbound,
      filteredOrders,
      filteredTenants,
    ],
  );

  const volumeSeries = useMemo(() => {
    const days: { day: string; inbound: number; outbound: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const inboundCount = filteredInbound.filter((s) => {
        const created = new Date(s.createdAt || s.effectiveAt || 0);
        return created >= dayStart && created < dayEnd;
      }).length;

      const outboundCount = filteredOrders.filter((o) => {
        const created = new Date(o.createdAt || 0);
        return created >= dayStart && created < dayEnd;
      }).length;

      days.push({ day: label, inbound: inboundCount, outbound: outboundCount });
    }
    return days;
  }, [filteredInbound, filteredOrders, now]);

  const carrierSeries = useMemo(() => {
    const byCarrier = new Map<string, { onTime: number[]; exceptions: number[] }>();
    for (const d of filteredDispatches) {
      const c = d.carrierName || d.carrier || "Unknown";
      if (!byCarrier.has(c)) byCarrier.set(c, { onTime: [], exceptions: [] });
      const entry = byCarrier.get(c)!;
      if (d.status === "delivered" || d.status === "in_transit") entry.onTime.push(1);
      if (d.status === "exception" || d.status === "cancelled") entry.exceptions.push(1);
    }
    const result: { carrier: string; onTime: number; exceptions: number }[] = [];
    byCarrier.forEach((v, k) => {
      const total = v.onTime.length + v.exceptions.length;
      const onTimePct = total > 0 ? Number(((v.onTime.length / total) * 100).toFixed(1)) : 0;
      const excPct = total > 0 ? Number(((v.exceptions.length / total) * 100).toFixed(1)) : 0;
      result.push({ carrier: k, onTime: onTimePct, exceptions: excPct });
    });
    return result.sort((a, b) => b.onTime - a.onTime).slice(0, 6);
  }, [filteredDispatches]);

  const capacityBars = useMemo(() => {
    return filteredWarehouses.map((w) => {
      const pct = w.capacityPct ?? 0;
      const tone = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-chart-4" : "bg-primary";
      return { id: w.id, code: w.code, city: w.city, pct, tone };
    });
  }, [filteredWarehouses]);

  const opsLogs = useMemo(() => {
    const logs: {
      ts: string;
      level: "info" | "warn" | "error" | "ok";
      warehouse: string;
      message: string;
      ref: string;
    }[] = [];
    const whCodes = new Set(filteredWarehouses.map((w) => w.code));
    const nowMs = Date.now();

    const addLog = (log: (typeof logs)[0]) => {
      if (!isAllWh && log.warehouse !== warehouseId) return;
      if (logs.length >= 8) return;
      logs.push(log);
    };

    const activeInboundList = filteredInbound.filter(
      (s) => s.status !== "received" && s.status !== "closed",
    );
    if (activeInboundList.length > 0) {
      const s = activeInboundList[0];
      addLog({
        ts: new Date(nowMs - 300000).toLocaleTimeString("en-US", { hour12: false }),
        level: "info",
        warehouse: s.warehouseId || warehouseId,
        message: `Inbound ASN ${s.asnNumber || s.id} received: ${s.lines?.length || 0} lines`,
        ref: s.id,
      });
    }

    const recentOrders = filteredOrders
      .filter((o) => ["picked", "packed", "shipped"].includes(o.status))
      .slice(0, 2);
    for (const o of recentOrders) {
      addLog({
        ts: new Date(nowMs - 600000).toLocaleTimeString("en-US", { hour12: false }),
        level: "ok",
        warehouse: o.warehouseId || warehouseId,
        message: `Wave ${o.waveNumber || "N/A"} ${o.status} (${o.lines?.length || 0} lines)`,
        ref: o.id,
      });
    }

    const exceptions = filteredDispatches.filter((d) => d.status === "exception");
    for (const d of exceptions.slice(0, 2)) {
      addLog({
        ts: new Date(nowMs - 900000).toLocaleTimeString("en-US", { hour12: false }),
        level: "error",
        warehouse: d.warehouseId || warehouseId,
        message: `Carrier pickup missed window — ${d.carrierName || d.carrier || "Unknown"}`,
        ref: d.id,
      });
    }

    const ediWarnings = ediLogs.filter((l) => l.status === "warning" || l.status === "rejected");
    for (const l of ediWarnings.slice(0, 2)) {
      addLog({
        ts: new Date(nowMs - 1200000).toLocaleTimeString("en-US", { hour12: false }),
        level: "warn",
        warehouse: l.warehouseCode || warehouseId,
        message: `EDI ${l.txnType} ${l.status}: ${l.direction}`,
        ref: l.id,
      });
    }

    if (logs.length === 0) {
      addLog({
        ts: new Date(nowMs).toLocaleTimeString("en-US", { hour12: false }),
        level: "info",
        warehouse: isAllWh ? "ALL" : warehouseId,
        message: "Dashboard refreshed — no recent events",
        ref: "DASH",
      });
    }

    return logs;
  }, [
    filteredInbound,
    filteredOrders,
    filteredDispatches,
    ediLogs,
    warehouseId,
    isAllWh,
    filteredWarehouses,
  ]);

  return (
    <div className="px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operations command center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAll
              ? "Network-wide view across all tenants and warehouses"
              : `${filteredTenants.map((t) => t.name).join(", ") || tenantId} · ${filteredWarehouses.map((w) => w.code).join(", ") || warehouseId}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={refreshData}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
          <Link
            to="/inventory"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open inventory <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const TrendIcon = k.trend === "down" ? TrendingDown : TrendingUp;
          return (
            <Card key={k.label} className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {k.label}
                  </span>
                  <k.icon className={`h-4 w-4 ${k.accent}`} />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums">
                    {k.value}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                      k.trend === "down"
                        ? "text-destructive"
                        : k.trend === "up"
                          ? "text-chart-3"
                          : "text-muted-foreground"
                    }`}
                  >
                    {k.trend !== "flat" && <TrendIcon className="h-3 w-3" />}
                    {k.delta}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Order volume — last 7 days</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Inbound receipts vs outbound orders
                {!isAll && ` · ${isAllWh ? "network" : warehouseId}`}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <PackagePlus className="h-3 w-3 text-chart-2" /> Inbound
              </span>
              <span className="inline-flex items-center gap-1">
                <PackageMinus className="h-3 w-3 text-chart-3" /> Outbound
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                  <Area
                    type="monotone"
                    dataKey="inbound"
                    name="Inbound"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    fill="url(#gIn)"
                  />
                  <Area
                    type="monotone"
                    dataKey="outbound"
                    name="Outbound"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    fill="url(#gOut)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Carrier performance</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              On-time delivery % · current selection
            </p>
          </CardHeader>
          <CardContent className="pt-1">
            {carrierSeries.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-[11px] text-muted-foreground">
                No dispatch data for current selection
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={carrierSeries}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="carrier"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
                    <Bar
                      dataKey="onTime"
                      name="On-time %"
                      fill="var(--chart-1)"
                      radius={[0, 3, 3, 0]}
                      barSize={14}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Capacity + logs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Warehouse capacity</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cube utilization · {isAllWh ? "selected warehouses" : warehouseId}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {capacityBars.length === 0 ? (
              <div className="text-[11px] text-muted-foreground py-2">No warehouse data</div>
            ) : (
              capacityBars.map((w) => (
                <div key={w.id} className="grid grid-cols-[110px_1fr_44px] items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-mono text-[11px]">{w.code}</span>
                    <span className="text-[10px] text-muted-foreground">{w.city}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${w.tone}`}
                      style={{ width: `${w.pct}%` }}
                    />
                  </div>
                  <span className="text-right text-[11px] font-mono tabular-nums">{w.pct}%</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Recent operational logs</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isAllWh ? "Network-wide event stream" : `Live stream · ${warehouseId}`}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-chart-3 animate-pulse" />
              Live
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32 text-[11px] text-muted-foreground">
                Loading operational data...
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-1.5 font-medium w-20">Time</th>
                      <th className="px-3 py-1.5 font-medium w-16">Level</th>
                      <th className="px-3 py-1.5 font-medium w-14">WH</th>
                      <th className="px-3 py-1.5 font-medium">Event</th>
                      <th className="px-3 py-1.5 font-medium w-36">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opsLogs.map((l, i) => {
                      const s = levelStyles[l.level];
                      return (
                        <tr key={i} className="border-t border-border hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{l.ts}</td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium ${s.label}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                              {l.level}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono">{l.warehouse}</td>
                          <td className="px-3 py-1.5">{l.message}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{l.ref}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
