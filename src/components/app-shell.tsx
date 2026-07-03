import type { ReactNode } from "react";
import {
  Moon,
  Sun,
  ChevronsUpDown,
  Building2,
  Warehouse as WarehouseIcon,
  LogOut,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AppSidebar } from "./app-sidebar";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import { tenants, warehouses } from "@/lib/mock-data";
import { AuthProvider, SignInScreen, useAuth } from "@/lib/auth";

function Topbar() {
  const ws = useWorkspace();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <Select value={ws.tenantId} onValueChange={ws.setTenantId}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="Select tenant" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                <span className="font-mono text-[10px] text-muted-foreground mr-2">{t.code}</span>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
        <Select value={ws.warehouseId} onValueChange={ws.setWarehouseId}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Select warehouse" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id} className="text-xs">
                <span className="font-mono text-[10px] text-muted-foreground mr-2">{w.code}</span>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Allocation
          </span>
          <ToggleGroup
            type="single"
            size="sm"
            value={ws.strategy}
            onValueChange={(v) => v && ws.setStrategy(v as "LIFO" | "FIFO")}
            className="border border-border rounded-md"
          >
            <ToggleGroupItem value="LIFO" className="h-7 px-2 text-[11px] font-mono">
              LIFO
            </ToggleGroupItem>
            <ToggleGroupItem value="FIFO" className="h-7 px-2 text-[11px] font-mono">
              FIFO
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={ws.toggleTheme}>
          {ws.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <UserChip />
      </div>
    </header>
  );
}

function UserChip() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-chart-3" />
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-medium">{user.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {user.role} · {user.warehouseCode}
        </span>
      </div>
      <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={logout} title="Sign out">
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <SignInScreen />;
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>
        <WorkspaceProvider>
          <SidebarProvider>
            <div className="flex min-h-screen w-full bg-background">
              <AppSidebar />
              <div className="flex flex-1 flex-col">
                <Topbar />
                <main className="flex-1">{children}</main>
              </div>
            </div>
          </SidebarProvider>
        </WorkspaceProvider>
      </AuthGate>
    </AuthProvider>
  );
}
