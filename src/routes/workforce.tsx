import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, TrendingUp, Target, Award, Calendar, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
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
  streak: number; // consecutive days with > 100% efficiency
  level: number;
  badges: string[];
}

interface TeamAggregate {
  team: string;
  members: number;
  avgEfficiency: number;
  totalEvents: number;
  totalDurationSec: number;
}

export const Route = createFileRoute("/workforce")({
  head: () => ({
    meta: [{ title: "Workforce Management — AZUX 3PL WMS" }],
  }),
  component: WorkforcePage,
});

function WorkforcePage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [events, setEvents] = useState<LaborEvent[]>([]);
  const [employees, setEmployees] = useState<WarehouseEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedShift, setSelectedShift] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const unsubEvents = subscribeLaborEvents(
      (data) => {
        if (!cancelled) {
          const filtered = data.filter(
            (e) => e.tenantId === tenantId && e.warehouseId === warehouseId &&
              e.completedAt >= dateRange.from && e.completedAt <= dateRange.to
          );
          setEvents(filtered);
        }
      },
      { tenantId, warehouseId },
      500
    );

    const unsubEmployees = subscribeEmployees(
      (data) => {
        if (!cancelled) setEmployees(data.filter((e) => e.assignedWarehouseId === warehouseId || e.assignedWarehouseId === "all"));
      },
      tenantId
    );

    return () => {
      cancelled = true;
      unsubEvents();
      unsubEmployees();
      setLoading(false);
    };
  }, [tenantId, warehouseId, dateRange.from, dateRange.to]);

  // Compute scorecards
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

      // Streak: consecutive days with > 100% efficiency
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

      // Level & badges (simple: level = log2(total events + 1) * 10)
      const level = Math.floor(Math.log2(evts.length + 1) * 10);
      const badges: string[] = [];
      if (evts.length >= 100) badges.push("Centurion");
      if (avgEfficiency >= 120) badges.push("Speed Demon");
      if (streak >= 5) badges.push("Consistency King");
      if (tasksByType["DIRECTED_PICK"] >= 50) badges.push("Pick Master");
      if (tasksByType["PUTAWAY"] >= 50) badges.push("Putaway Pro");

      return {
        badgeId,
        name: emp?.name || badgeId,
        role: emp?.role || "Unknown",
        team: emp?.team || "Unassigned",
        shift: emp?.shift || "N/A",
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

  // Team aggregates
  const teams = useMemo(() => {
    const byTeam = new Map<string, WorkerScorecard[]>();
    for (const s of scorecards) {
      if (!byTeam.has(s.team)) byTeam.set(s.team, []);
      byTeam.get(s.team)!.push(s);
    }
    return Array.from(byTeam.entries()).map(([team, members]) => ({
      team,
      members: members.length,
      avgEfficiency: Math.round(members.reduce((s, m) => s + m.avgEfficiency, 0) / members.length),
      totalEvents: members.reduce((s, m) => s + m.totalEvents, 0),
      totalDurationSec: members.reduce((s, m) => s + m.totalDurationSec, 0),
    }));
  }, [scorecards]);

  // Filtered scorecards
  const filteredScorecards = useMemo(() => {
    return scorecards.filter((s) =>
      (selectedTeam === "all" || s.team === selectedTeam) &&
      (selectedShift === "all" || s.shift === selectedShift)
    );
  }, [scorecards, selectedTeam, selectedShift]);

  // Sort by efficiency desc
  filteredScorecards.sort((a, b) => b.avgEfficiency - a.avgEfficiency);

  if (loading) return <div className="p-6 text-center text-slate-400">Loading workforce data...</div>;

  if (events.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workforce Management</h1>
          <p className="text-xs text-slate-400 mt-0.5">Labor efficiency, task interleaving & gamification</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Users className="h-12 w-12 text-slate-600" />
          <div className="text-sm text-slate-400">No labor events recorded yet.</div>
          <div className="text-xs text-slate-500 max-w-md">
            Start completing tasks from the RF Gun terminal — picks, putaways, moves, and receiving will appear here automatically.
          </div>
        </div>
      </div>
    );
  }

  const allTeams = ["all", ...Array.from(new Set(scorecards.map((s) => s.team))).sort()];
  const allShifts = ["all", ...Array.from(new Set(scorecards.map((s) => s.shift))).sort()];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workforce Management</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Labor efficiency, task interleaving & gamification
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange.from.toISOString().split("T")[0]} onValueChange={(v) => setDateRange((d) => ({ ...d, from: new Date(v) }))}>
            <SelectTrigger className="w-40 h-9 bg-slate-800 border-slate-700 text-sm">
              <SelectValue placeholder="From" />
            </SelectTrigger>
            <SelectContent>
              {["7 days", "30 days", "90 days", "Custom"].map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger className="w-40 h-9 bg-slate-800 border-slate-700 text-sm">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              {allTeams.map((t) => (
                <SelectItem key={t} value={t}>{t === "all" ? "All Teams" : t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedShift} onValueChange={setSelectedShift}>
            <SelectTrigger className="w-32 h-9 bg-slate-800 border-slate-700 text-sm">
              <SelectValue placeholder="All Shifts" />
            </SelectTrigger>
            <SelectContent>
              {allShifts.map((s) => (
                <SelectItem key={s} value={s}>{s === "all" ? "All Shifts" : `Shift ${s}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Team Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {teams.map((t) => (
          <Card key={t.team} className="border-slate-800 bg-slate-900/50">
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-300">{t.team === "Unassigned" ? "Unassigned" : `Team ${t.team}`}</h3>
                <Badge variant="outline" className="text-xs">{t.members} members</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-emerald-400">{t.avgEfficiency}%</div>
                  <div className="text-[10px] text-slate-500">Efficiency</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{t.totalEvents}</div>
                  <div className="text-[10px] text-slate-500">Events</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-sky-400">{formatHours(t.totalDurationSec)}</div>
                  <div className="text-[10px] text-slate-500">Hours</div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Leaderboard Tabs */}
      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList className="bg-slate-900 border-slate-800">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="teams">Team View</TabsTrigger>
          <TabsTrigger value="gamification">Gamification</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Rank</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Worker</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Role</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Team</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Efficiency</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Events</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Hours</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Streak</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Badges</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScorecards.map((s, i) => (
                  <TableRow key={s.badgeId} className="hover:bg-slate-800/50">
                    <TableCell className="font-mono text-lg font-bold text-emerald-400">#{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs text-slate-400">{s.role}</TableCell>
                    <TableCell className="text-xs text-slate-400">{s.team}</TableCell>
                    <TableCell>
                      <span className={`font-mono font-bold ${s.avgEfficiency >= 100 ? "text-emerald-400" : s.avgEfficiency >= 80 ? "text-sky-400" : "text-amber-400"}`}>
                        {s.avgEfficiency}%
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-slate-300">{s.totalEvents}</TableCell>
                    <TableCell className="font-mono text-slate-300">{formatHours(s.totalDurationSec)}</TableCell>
                    <TableCell>
                      <Badge variant={s.streak >= 5 ? "default" : s.streak > 0 ? "secondary" : "outline"} className="text-xs">
                        {s.streak} 🔥
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.badges.map((b) => (
                          <Badge key={b} variant="outline" className="text-[10px] h-4 px-1.5">
                            {b}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Team</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Members</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Avg Efficiency</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Total Events</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Total Hours</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Top Performer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((t) => {
                  const top = scorecards.filter((s) => s.team === t.team).sort((a, b) => b.avgEfficiency - a.avgEfficiency)[0];
                  return (
                    <TableRow key={t.team} className="hover:bg-slate-800/50">
                      <TableCell className="font-medium">{t.team === "Unassigned" ? "Unassigned" : `Team ${t.team}`}</TableCell>
                      <TableCell className="font-mono text-slate-300">{t.members}</TableCell>
                      <TableCell className={`font-mono font-bold ${t.avgEfficiency >= 100 ? "text-emerald-400" : "text-sky-400"}`}>{t.avgEfficiency}%</TableCell>
                      <TableCell className="font-mono text-slate-300">{t.totalEvents}</TableCell>
                      <TableCell className="font-mono text-slate-300">{formatHours(t.totalDurationSec)}</TableCell>
                      <TableCell className="text-xs text-slate-400">{top?.name || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="gamification" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-slate-800 bg-slate-900/50">
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-400" />
                  <h3 className="text-sm font-medium text-slate-300">Badges Earned</h3>
                </div>
                <div className="flex flex-wrap gap-1">
                  {["Centurion", "Speed Demon", "Consistency King", "Pick Master", "Putaway Pro", "Interleaver"].map((b) => (
                    <Badge key={b} variant="outline" className="text-[10px] h-4 px-1.5">{b}</Badge>
                  ))}
                </div>
              </div>
            </Card>
            <Card className="border-slate-800 bg-slate-900/50">
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-sm font-medium text-slate-300">Top Streaks</h3>
                </div>
                <div className="space-y-1">
                  {scorecards.filter((s) => s.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 5).map((s, i) => (
                    <div key={s.badgeId} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">#{i + 1} {s.name}</span>
                      <Badge variant={s.streak >= 5 ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">{s.streak} days</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card className="border-slate-800 bg-slate-900/50">
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-sky-400" />
                  <h3 className="text-sm font-medium text-slate-300">Level Progression</h3>
                </div>
                <div className="space-y-1">
                  {scorecards.sort((a, b) => b.level - a.level).slice(0, 5).map((s, i) => (
                    <div key={s.badgeId} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">#{i + 1} {s.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">Lvl {s.level}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatHours(sec: number): string {
  return (sec / 3600).toFixed(1);
}