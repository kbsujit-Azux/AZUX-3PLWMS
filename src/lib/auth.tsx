import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Warehouse, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export type Role =
  | "Admin"
  | "Operations Manager"
  | "Warehouse Lead"
  | "Picker"
  | "Receiver"
  | "Billing"
  | "Viewer";

export type AuthUser = {
  name: string;
  email: string;
  role: Role;
  warehouseCode: string;
};

// Mock directory — mirrors the Settings → Users seed list.
// Default password for every account in the demo: azux
const DIRECTORY: AuthUser[] = [
  { name: "Jordan Avery", email: "jordan.avery@azux.com", role: "Admin", warehouseCode: "ALL" },
  {
    name: "Devon Hill",
    email: "devon.hill@azux.com",
    role: "Operations Manager",
    warehouseCode: "ATL1",
  },
  {
    name: "Sara Owens",
    email: "sara.owens@azux.com",
    role: "Warehouse Lead",
    warehouseCode: "ORD2",
  },
  {
    name: "Marcus Reid",
    email: "marcus.reid@azux.com",
    role: "Warehouse Lead",
    warehouseCode: "LAX3",
  },
  { name: "Anya Volkov", email: "anya.volkov@azux.com", role: "Receiver", warehouseCode: "EWR1" },
  { name: "Riley Park", email: "riley.park@azux.com", role: "Picker", warehouseCode: "ATL1" },
  { name: "Tomás Ruiz", email: "tomas.ruiz@azux.com", role: "Billing", warehouseCode: "ALL" },
];

const DEMO_PASSWORD = "azux";

// Route paths each role is allowed to see/visit.
export const ROLE_ROUTES: Record<Role, string[]> = {
  Admin: [
    "/",
    "/inbound",
    "/inventory",
    "/orders",
    "/allocation",
    "/shipments",
    "/pallets",
    "/masters",
    "/masters/warehouses",
    "/masters/employees",
    "/edi",
    "/documents",
    "/billing",
    "/settings",
    "/workforce",
    "/scoreboard",
    "/slotting",
    "/rf/putaway",
    "/rf/move",
    "/rf/pick",
    "/rf/receiving",
    "/rf/inquiry",
    "/rf/history",
  ],
  "Operations Manager": [
    "/",
    "/inbound",
    "/inventory",
    "/orders",
    "/allocation",
    "/shipments",
    "/pallets",
    "/masters",
    "/masters/warehouses",
    "/masters/employees",
    "/edi",
    "/documents",
    "/billing",
    "/workforce",
    "/scoreboard",
    "/slotting",
    "/rf/putaway",
    "/rf/move",
    "/rf/pick",
    "/rf/receiving",
    "/rf/inquiry",
    "/rf/history",
  ],
  "Warehouse Lead": [
    "/",
    "/inbound",
    "/inventory",
    "/orders",
    "/allocation",
    "/shipments",
    "/pallets",
    "/documents",
    "/masters",
    "/masters/warehouses",
    "/masters/employees",
    "/workforce",
    "/scoreboard",
    "/slotting",
    "/rf/putaway",
    "/rf/move",
    "/rf/pick",
    "/rf/receiving",
    "/rf/inquiry",
    "/rf/history",
  ],
  Receiver: ["/", "/inbound", "/inventory", "/pallets", "/rf/receiving", "/rf/putaway"],
  Picker: ["/", "/orders", "/allocation", "/shipments", "/inventory", "/rf/pick", "/rf/move", "/rf/inquiry"],
  Billing: ["/", "/billing", "/documents"],
  Viewer: ["/", "/inventory"],
};

type Ctx = {
  user: AuthUser | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  can: (path: string) => boolean;
};

const AuthCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "azux.auth.user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as AuthUser);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const login = (email: string, password: string) => {
    const match = DIRECTORY.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
    if (!match) {
      toast.error("Unknown user", { description: "No account found for that email." });
      return false;
    }
    if (password !== DEMO_PASSWORD) {
      toast.error("Invalid password", { description: "Demo password is: azux" });
      return false;
    }
    setUser(match);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(match));
    } catch {
      // ignore
    }
    toast.success(`Welcome, ${match.name}`, { description: `Signed in as ${match.role}` });
    return true;
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const can = (path: string) => {
    if (!user) return false;
    const allowed = ROLE_ROUTES[user.role] ?? [];
    return allowed.some((p) => (p === "/" ? path === "/" : path.startsWith(p)));
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, can }}>
      {hydrated ? children : null}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}

// ───────────────────────── Sign-In Screen ─────────────────────────
export function SignInScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState(DIRECTORY[0].email);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    login(email, password);
    setBusy(false);
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary/90 via-primary to-chart-3 p-10 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-foreground/15 backdrop-blur">
            <Warehouse className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">AZUX 3PL WMS Systems</div>
            <div className="text-[10px] uppercase tracking-wider opacity-80">
              Warehouse Operations Platform
            </div>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to your warehouse.</h1>
          <p className="text-sm opacity-90">
            Inbound · Inventory · Orders · Shipments · Pallets · EDI · Billing — all in one place.
            Your role determines which modules and warehouses you can access.
          </p>
          <div className="flex items-center gap-2 text-xs opacity-90">
            <ShieldCheck className="h-4 w-4" /> Role-based access · Audit-ready · Multi-warehouse
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider opacity-70">v1.0 · Build 2026.05</div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 lg:p-10">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Warehouse className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold tracking-tight">AZUX 3PL WMS Systems</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-xs text-muted-foreground">
              Use your AZUX account to access the operations console.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <Select value={email} onValueChange={setEmail}>
                <SelectTrigger id="email" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTORY.map((u) => (
                    <SelectItem key={u.email} value={u.email} className="text-xs">
                      <span className="font-medium">{u.name}</span>
                      <span className="ml-2 text-muted-foreground">· {u.role}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Demo: pick any seeded account. Your role decides what you can access after login.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="azux"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <p className="text-[10px] text-muted-foreground">
                Demo password: <span className="font-mono">azux</span>
              </p>
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={busy}>
            <LogIn className="h-4 w-4" /> Sign in
          </Button>

          <div className="text-[10px] text-muted-foreground text-center">
            Need access? Ask an Admin to add you under Settings → Users & Roles.
          </div>
        </form>
      </div>
    </div>
  );
}
