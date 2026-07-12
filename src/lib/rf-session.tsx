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

const STORAGE_KEY = "azux.rf.badgeId";

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
  const [badgeId, setBadgeIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [employee, setEmployee] = useState<WarehouseEmployee | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!badgeId || badgeId.length < 2) return;
    let cancelled = false;
    setLoading(true);
    fetchEmployees(undefined, undefined).then((list) => {
      if (cancelled) return;
      const match = list.find(
        (e) => e.badgeId.toLowerCase() === badgeId.toLowerCase() && e.isActive,
      );
      if (match) {
        setEmployee(match);
        setVerified(true);
        try {
          localStorage.setItem(STORAGE_KEY, badgeId);
        } catch {
          // storage not available
        }
      } else {
        setEmployee(null);
        setVerified(false);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // storage not available
        }
        toast.error("Badge not found or inactive");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [badgeId]);

  const setBadgeId = (id: string) => {
    setBadgeIdState(id);
  };

  const logout = () => {
    setBadgeIdState("");
    setEmployee(null);
    setVerified(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage not available
    }
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
