import { createContext, useContext, useState, type ReactNode } from "react";
import type { AllocationStrategy } from "@/lib/mock-data";

type WorkspaceCtx = {
  tenantId: string;
  setTenantId: (id: string) => void;
  warehouseId: string;
  setWarehouseId: (id: string) => void;
  strategy: AllocationStrategy;
  setStrategy: (s: AllocationStrategy) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [strategy, setStrategy] = useState<AllocationStrategy>("LIFO");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next === "dark");
      }
      return next;
    });
  };

  return (
    <Ctx.Provider
      value={{
        tenantId,
        setTenantId,
        warehouseId,
        setWarehouseId,
        strategy,
        setStrategy,
        theme,
        toggleTheme,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}
