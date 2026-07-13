import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Warehouse,
  PackageSearch,
  MoveRight,
  ClipboardList,
  Container,
  ScanLine,
  History,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RFSessionProvider, useRfSession } from "@/lib/rf-session";

const NAV = [
  { title: "Putaway", to: "/rf/putaway", icon: PackageSearch },
  { title: "Move", to: "/rf/move", icon: MoveRight },
  { title: "Pick", to: "/rf/pick", icon: ClipboardList },
  { title: "Receive", to: "/rf/receiving", icon: Container },
  { title: "Inquiry", to: "/rf/inquiry", icon: ScanLine },
  { title: "History", to: "/rf/history", icon: History },
] as const;

export function RfShell({ children }: { children: ReactNode }) {
  const { employee, logout } = useRfSession();

  return (
    <div className="mx-auto max-w-md h-screen bg-slate-950 text-white flex flex-col">
      <header className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 shrink-0">
        <Warehouse className="h-4 w-4 text-emerald-400" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{employee?.name ?? "RF Terminal"}</div>
          <div className="text-[10px] text-slate-400 font-mono truncate">
            {employee?.assignedWarehouseId ?? "——"} · {employee?.badgeId ?? "——"}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      <BottomNav />
      <BadgeGate />
    </div>
  );
}

function BadgeGate() {
  const { badgeId, setBadgeId, loading, verified } = useRfSession();
  const [input, setInput] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBadgeId(input.trim());
  };

  if (verified) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <Warehouse className="h-10 w-10 mx-auto text-emerald-400" />
          <h1 className="text-xl font-semibold text-white tracking-tight">RF Terminal</h1>
          <p className="text-xs text-slate-400">Scan badge or enter Badge ID to continue</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="badge" className="text-xs text-slate-300">Badge ID</label>
          <input
            id="badge"
            autoFocus
            placeholder="e.g. WH-1001"
            value={input}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            className="w-full h-12 bg-slate-900 border border-slate-700 text-white text-center text-lg font-mono tracking-widest rounded-md"
          />
        </div>
        <Button
          type="submit"
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          disabled={loading || !input.trim()}
        >
          {loading ? "Verifying…" : "Sign In"}
        </Button>
        <p className="text-center text-[10px] text-slate-500">Demo badges: WH-1001, WH-1002, WH-1003</p>
      </form>
    </div>
  );
}

function BottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="border-t border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="grid grid-cols-6">
        {NAV.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors"
            >
              <item.icon className={`h-5 w-5 ${active ? "text-emerald-400" : "text-slate-500"}`} />
              <span className={active ? "text-emerald-400 font-medium" : "text-slate-500"}>{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
