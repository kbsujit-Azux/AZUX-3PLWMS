import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, Target, Award, Clock, Trophy, Zap, Flame } from "lucide-react";
import { subscribeLaborEvents, subscribeEmployees } from "@/lib/firestore-data";
import type { LaborEvent, WarehouseEmployee } from "@/lib/rf-types";
import { computeEfficiencyPct, getAisleFromLocation } from "@/lib/labor-data";

interface WorkerScorecard {
  badgeId: string;
  name: string;
  role: string;
  team: string;
  shift: string;
  events: LaborEvent[];
  totalDurationSec: number;
  totalStandardSec: number;
  avgEfficiency: number;
  totalEvents: number;
  tasksByType: Record<string, number>;
  streak: number;
  level: number;
  badges: string[];
}

export const Route = createFileRoute("/scoreboard")({
  head: () => ({
    meta: [{ title: "Floor Scoreboard — AZUX 3PL WMS" }],
  }),
  component: ScoreboardPage,
});

function ScoreboardPage() {
  const [events, setEvents] = useState<LaborEvent[]>([]);
  const [employees, setEmployees] = useState<WarehouseEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"today" | "shift" | "week">("today");
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() < 12 ? 6 : 18, 0, 0);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const getFilterDate = () => {
      if (timeRange === "today") return todayStart;
      if (timeRange === "shift") return shiftStart;
      return weekStart;
    };

    const unsubEvents = subscribeLaborEvents(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter((e) => e.completedAt >= getFilterDate());
          setEvents(filtered);
        }
      },
      {}
    );

    const unsubEmployees = subscribeEmployees(
      (data) => setEmployees(data),
      ""
    );

    // Auto refresh every 30 seconds
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        // Force re-render by updating state
        setEvents((prev) => [...prev]);
      }, 30000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      unsubEvents();
      unsubEmployees();
      setLoading(false);
    };
  }, [timeRange, autoRefresh]);

  const scorecards = useMemo((): WorkerScorecard[] => {
    const byBadge = new Map<string, LaborEvent[]>();
    for (const e of events) {
      if (!byBadge.has(e.badgeId)) byBadge.set(e.badgeId, []);
      byBadge.get(e.badgeId)!.push(e);
    }

    return Array.from(byBadge.entries()).map(([badgeId, evts]) => {
      const emp = employees.find((e) => e.badgeId === badgeId);
      const totalDurationSec = evts.reduce((s, e) => s + e.durationSec, 0);
      const totalStandardSec = evts.reduce((s, e) => s + e.standardSec, 0);
      const avgEfficiency = totalStandardSec > 0 ? Math.round((totalStandardSec / totalDurationSec) * 100) : 100;
      const tasksByType: Record<string, number> = {};
      for (const e of evts) tasksByType[e.taskType] = (tasksByType[e.taskType] || 0) + 1;

      // Streak
      const dailyEfficiency = new Map<string, { std: number; act: number }>();
      for (const e of evts) {
        const day = e.completedAt.toISOString().split("T")[0];
        const d = dailyEfficiency.get(day) || { std: 0, act: 0 };
        d.std += e.standardSec;
        d.act += e.durationSec;
        dailyEfficiency.set(day, d);
      }
      const sortedDays = Array.from(dailyEfficiency.entries()).sort((a, b) => b[0].localeCompare(a[0]));
      let streak = 0;
      for (const [, v] of sortedDays) {
        if (v.act > 0 && v.std / v.act > 1) streak++;
        else break;
      }

      const level = Math.floor(Math.log2(evts.length + 1) * 10);
      const badges: string[] = [];
      if (evts.length >= 100) badges.push("Centurion");
      if (avgEfficiency >= 120) badges.push("Speed Demon");
      if (streak >= 5) badges.push("Consistency King");
      if (tasksByType["DIRECTED_PICK"] >= 50) badges.push("Pick Master");
      if (tasksByType["PUTAWAY"] >= 50) badges.push("Putaway Pro");

      return {
        badgeId,
        name: employees.find((e) => e.badgeId === badgeId)?.name || badgeId,
        role: employees.find((e) => e.badgeId === badgeId)?.role || "Worker",
        team: employees.find((e) => e.badgeId === badgeId)?.team || "Team",
        shift: employees.find((e) => e.badgeId === badgeId)?.shift || "Shift",
        events: evts,
        totalDurationSec,
        totalStandardSec,
        avgEfficiency,
        totalEvents: evts.length,
        tasksByType,
        streak,
        level,
        badges,
      };
    });
  }, [events, employees]);

  // Sort by efficiency desc
  scorecards.sort((a, b) => b.avgEfficiency - a.avgEfficiency);

  const top3 = scorecards.slice(0, 3);
  const rest = scorecards.slice(3);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Trophy className="h-16 w-16 mx-auto text-amber-400 animate-pulse" />
          <h1 className="text-3xl font-bold text-white">Loading Scoreboard...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500/20 rounded-xl">
            <Trophy className="h-10 w-10 text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">FLOOR SCOREBOARD</h1>
            <p className="text-slate-400 text-sm">Live Labor Efficiency — {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2">
            <Clock className="h-4 w-4 text-sky-400" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as "today" | "shift" | "week")}
              className="bg-transparent border-none text-white text-sm focus:outline-none"
            >
              <option value="today">Today</option>
              <option value="shift">Current Shift</option>
              <option value="week">This Week</option>
            </select>
          </div>
          <label className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-emerald-500"
            />
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-slate-300">Auto Refresh</span>
          </label>
        </div>
      </header>

      {/* Top 3 Podium */}
      <section className="space-y-4" aria-label="Top Performers">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-400" />
          TOP PERFORMERS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top3.map((s, i) => (
            <PodiumCard key={s.badgeId} scorecard={s} rank={i + 1} />
          ))}
          {top3.length < 3 && Array.from({ length: 3 - top3.length }).map((_, i) => (
            <PodiumCard key={`empty-${i}`} scorecard={null} rank={top3.length + i + 1} />
          ))}
        </div>
      </section>

      {/* Leaderboard Table */}
      <section className="space-y-4" aria-label="Full Leaderboard">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-sky-400" />
            FULL LEADERBOARD
          </h2>
          <Badge variant="outline" className="text-xs">
            {scorecards.length} active workers
          </Badge>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="p-3 text-left font-medium text-slate-400 uppercase tracking-wider text-[11px]">RANK</th>
                <th className="p-3 text-left font-medium text-slate-400 uppercase tracking-wider text-[11px]">WORKER</th>
                <th className="p-3 text-left font-medium text-slate-400 uppercase tracking-wider text-[11px]">ROLE</th>
                <th className="p-3 text-left font-medium text-slate-400 uppercase tracking-wider text-[11px]">TEAM</th>
                <th className="p-3 text-right font-medium text-slate-400 uppercase tracking-wider text-[11px]">EFFICIENCY</th>
                <th className="p-3 text-right font-medium text-slate-400 uppercase tracking-wider text-[11px]">EVENTS</th>
                <th className="p-3 text-right font-medium text-slate-400 uppercase tracking-wider text-[11px]">HOURS</th>
                <th className="p-3 text-center font-medium text-slate-400 uppercase tracking-wider text-[11px]">STREAK</th>
                <th className="p-3 text-left font-medium text-slate-400 uppercase tracking-wider text-[11px]">BADGES</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map((s, i) => (
                <tr key={s.badgeId} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-mono text-xl font-bold text-emerald-400">#{i + 1}</td>
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-xs text-slate-400">{s.role}</td>
                  <td className="p-3 text-xs text-slate-400">{s.team}</td>
                  <td className="p-3 text-right font-mono font-bold text-lg">
                    <span className={s.avgEfficiency >= 100 ? "text-emerald-400" : s.avgEfficiency >= 80 ? "text-sky-400" : "text-amber-400"}>
                      {s.avgEfficiency}%
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-300">{s.totalEvents}</td>
                  <td className="p-3 text-right font-mono text-slate-300">{(s.totalDurationSec / 3600).toFixed(1)}h</td>
                  <td className="p-3 text-center">
                    <Badge variant={s.streak >= 5 ? "default" : s.streak > 0 ? "secondary" : "outline"} className="text-xs">
                      {s.streak} <Flame className="h-3 w-3 inline-block" />
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {s.badges.map((b) => (
                        <Badge key={b} variant="outline" className="text-[10px] h-4 px-1.5">
                          {b}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stats Summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="TOTAL EVENTS"
          value={events.length}
          icon={<Users className="h-6 w-6 text-sky-400" />}
          color="text-sky-400"
        />
        <StatCard
          title="AVG EFFICIENCY"
          value={`${Math.round(scorecards.reduce((acc, s) => acc + s.avgEfficiency, 0) / (scorecards.length || 1))}%`}
          icon={<TrendingUp className="h-6 w-6 text-emerald-400" />}
          color="text-emerald-400"
        />
        <StatCard
          title="TOTAL HOURS"
          value={formatHours(events.reduce((s, e) => s + e.durationSec, 0))}
          icon={<Clock className="h-6 w-6 text-amber-400" />}
          color="text-amber-400"
        />
        <StatCard
          title="TOP STREAK"
          value={Math.max(...scorecards.map((s) => s.streak), 0)} day
          icon={<Flame className="h-6 w-6 text-orange-400" />}
          color="text-orange-400"
        />
      </section>
    </div>
  );
}

function PodiumCard({ scorecard, rank }: { scorecard: WorkerScorecard | null; rank: number }) {
  const colors = [
    "bg-amber-500/20 border-amber-400",
    "bg-slate-300/10 border-slate-400",
    "bg-amber-700/20 border-amber-600",
  ];
  const icons = [Trophy, Award, Target];
  const medals = ["🥇", "🥈", "🥉"];

  if (!scorecard) {
    return (
      <div className={`relative p-6 rounded-2xl border-2 ${colors[rank - 1]} bg-slate-900/50 text-center`}>
        <div className="text-4xl mb-2">{medals[rank - 1]}</div>
        <div className="text-slate-500">No data</div>
      </div>
    );
  }

  return (
    <div className={`relative p-6 rounded-2xl border-2 ${colors[rank - 1]} bg-slate-900/50`}>
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-4xl">{medals[rank - 1]}</div>
      <div className="absolute top-2 right-2">
        <span className="text-2xl font-bold text-emerald-400">{scorecard.avgEfficiency}%</span>
        <div className="text-xs text-slate-400">EFFICIENCY</div>
      </div>
      <div className="mb-4">
        <div className="text-xl font-bold">{scorecard.name}</div>
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">{scorecard.role}</Badge>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">{scorecard.team}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold">{scorecard.totalEvents}</div>
          <div className="text-[10px] text-slate-500">EVENTS</div>
        </div>
        <div>
          <div className="text-lg font-bold">{(scorecard.totalDurationSec / 3600).toFixed(1)}h</div>
          <div className="text-[10px] text-slate-500">HOURS</div>
        </div>
        <div>
          <div className="text-lg font-bold">{scorecard.streak}</div>
          <div className="text-[10px] text-slate-500">STREAK</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1">
        {scorecard.badges.map((b) => (
          <Badge key={b} variant="outline" className="text-[10px] h-4 px-1.5">{b}</Badge>
        ))}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 uppercase tracking-wider">{title}</span>
          <span className={color}>{icon}</span>
        </div>
        <div className="text-3xl font-bold">{value}</div>
      </div>
    </Card>
  );
}

function formatHours(sec: number): string {
  return (sec / 3600).toFixed(1);
}