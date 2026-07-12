import {
  createContext,
  useContext,
  useState,
  useEffect,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { fetchEmployees } from "@/lib/firestore-data";
import type { WarehouseEmployee } from "@/lib/rf-types";

type RfSessionCtx = {
  employee: WarehouseEmployee | null;
  badgeId: string;
  setBadgeId: (id: string) => void;
  loading: boolean;
  verified: boolean;
  logout: () => void;
};

const Ctx = createContext<RfSessionCtx | null>(null);

export function RFSessionProvider({ children }: { children: ReactNode }) {
  const [badgeId, setBadgeId] = useState("");
  const [employee, setEmployee] = useState<WarehouseEmployee | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!badgeId || badgeId.length < 2) return;
    let cancelled = false;
    setLoading(true);
    fetchEmployees(badgeId ? undefined : undefined, badgeId ? undefined : undefined).then(
      (list) => {
        if (cancelled) return;
        const match = list.find(
          (e) => e.badgeId.toLowerCase() === badgeId.toLowerCase() && e.isActive,
        );
        if (match) {
          setEmployee(match);
          setVerified(true);
          toast.success(`Welcome, ${match.name}`);
        } else {
          setEmployee(null);
          setVerified(false);
          toast.error("Badge not found or inactive");
        }
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [badgeId]);

  const logout = () => {
    setBadgeId("");
    setEmployee(null);
    setVerified(false);
  };

  return (
    <Ctx.Provider value={{ employee, badgeId, setBadgeId, loading, verified, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRfSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRfSession must be used inside RFSessionProvider");
  return v;
}
