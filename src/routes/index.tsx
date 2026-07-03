import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { warehouses } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — AZUX 3PL WMS Systems" },
      { name: "description", content: "Multi-tenant 3PL command center." },
    ],
  }),
  component: Dashboard,
});

const kpis = [
  {
    label: "Active Inbound",
    value: "147",
    delta: "+12 today",
    trend: "up",
    icon: PackageCheck,
    accent: "text-chart-2",
  },
  {
    label: "Active Outbound",
    value: "318",
    delta: "+34 today",
    trend: "up",
    icon: Truck,
    accent: "text-chart-3",
  },
  {
    label: "Total SKUs",
    value: "12,488",
    delta: "across 4 tenants",
    trend: "flat",
    icon: Boxes,
    accent: "text-chart-1",
  },
  {
    label: "Network Utilization",
    value: "72%",
    delta: "−2.1% vs yday",
    trend: "down",
    icon: Gauge,
    accent: "text-chart-4",
  },
] as const;

const volumeSeries = [
  { day: "Mon", inbound: 92, outbound: 184 },
  { day: "Tue", inbound: 108, outbound: 221 },
  { day: "Wed", inbound: 134, outbound: 256 },
  { day: "Thu", inbound: 121, outbound: 278 },
  { day: "Fri", inbound: 156, outbound: 312 },
  { day: "Sat", inbound: 78, outbound: 198 },
  { day: "Sun", inbound: 64, outbound: 142 },
  { day: "Mon", inbound: 147, outbound: 318 },
];

const carrierSeries = [
  { carrier: "FedEx", onTime: 96.4, exceptions: 1.8 },
  { carrier: "UPS", onTime: 94.1, exceptions: 2.7 },
  { carrier: "DHL", onTime: 91.8, exceptions: 3.4 },
  { carrier: "USPS", onTime: 88.2, exceptions: 5.1 },
  { carrier: "OTR LTL", onTime: 84.6, exceptions: 6.9 },
];

type LogLevel = "info" | "warn" | "error" | "ok";
const opsLogs: {
  ts: string;
  level: LogLevel;
  warehouse: string;
  message: string;
  ref: string;
}[] = [
  {
    ts: "14:42:18",
    level: "ok",
    warehouse: "ATL1",
    message: "EDI 945 ack sent to Acme Outdoor Co.",
    ref: "SO-554920",
  },
  {
    ts: "14:39:02",
    level: "info",
    warehouse: "ORD2",
    message: "Pallet PLT-ORD2-01290 directed to D04-02-B",
    ref: "PLT-ORD2-01290",
  },
  {
    ts: "14:36:51",
    level: "warn",
    warehouse: "LAX3",
    message: "Cycle count variance detected on SKU NSA-TEE-WHT-L (−12 units)",
    ref: "CC-2208",
  },
  {
    ts: "14:31:09",
    level: "info",
    warehouse: "ATL1",
    message: "Inbound ASN (EDI 943) received: 96 cartons",
    ref: "ASN-110298",
  },
  {
    ts: "14:24:33",
    level: "error",
    warehouse: "EWR1",
    message: "Carrier pickup missed window — UPS Ground",
    ref: "BOL-77410",
  },
  {
    ts: "14:18:14",
    level: "ok",
    warehouse: "ORD2",
    message: "Wave 412 picked & packed (38 orders)",
    ref: "WAVE-412",
  },
  {
    ts: "14:11:47",
    level: "info",
    warehouse: "ATL1",
    message: "CSV upload mapped: 1,204 item-master rows",
    ref: "JOB-9981",
  },
  {
    ts: "14:04:22",
    level: "warn",
    warehouse: "LAX3",
    message: "Capacity nearing threshold (91%)",
    ref: "WH-LAX3",
  },
];

const levelStyles: Record<LogLevel, { dot: string; label: string; icon: typeof AlertTriangle }> = {
  ok: { dot: "bg-chart-3", label: "text-chart-3", icon: CheckCircle2 },
  info: { dot: "bg-chart-1", label: "text-chart-1", icon: ScanLine },
  warn: { dot: "bg-chart-4", label: "text-chart-4", icon: FileWarning },
  error: { dot: "bg-destructive", label: "text-destructive", icon: AlertTriangle },
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-md">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 space-y-0.5">
        {payload.map((p: any) => (
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
  return (
    <div className="px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operations command center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live signals across clients, warehouses, and carriers.
          </p>
        </div>
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open inventory <ArrowUpRight className="h-3 w-3" />
        </Link>
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
              <CardTitle className="text-sm font-semibold">Order volume — last 8 days</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Inbound receipts vs outbound shipments, network-wide
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
              On-time delivery % · trailing 30 days
            </p>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={carrierSeries}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[80, 100]}
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
          </CardContent>
        </Card>
      </div>

      {/* Capacity + logs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Warehouse capacity</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cube utilization across the network
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouses
              .filter((w) => w.id !== "all")
              .map((w) => {
                const tone =
                  w.capacityPct >= 90
                    ? "bg-destructive"
                    : w.capacityPct >= 75
                      ? "bg-chart-4"
                      : "bg-primary";
                return (
                  <div key={w.id} className="grid grid-cols-[110px_1fr_44px] items-center gap-3">
                    <div className="flex flex-col">
                      <span className="font-mono text-[11px]">{w.code}</span>
                      <span className="text-[10px] text-muted-foreground">{w.city}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tone}`}
                        style={{ width: `${w.capacityPct}%` }}
                      />
                    </div>
                    <span className="text-right text-[11px] font-mono tabular-nums">
                      {w.capacityPct}%
                    </span>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Recent operational logs</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Live stream from WMS event bus
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-chart-3 animate-pulse" />
              Live
            </div>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
