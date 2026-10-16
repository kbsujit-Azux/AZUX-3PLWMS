import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Container, Truck, Ship, Hash, Calendar, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { type WorkOrder } from "@/lib/inbound-data";
import { useWmsData } from "@/components/db-context";
import { deleteWorkOrder } from "@/lib/firestore-data";

export const Route = createFileRoute("/workorders")({
  head: () => ({
    meta: [
      { title: "Work Orders — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content: "Container management dashboard - track work orders from arrival to departure.",
      },
    ],
  }),
  component: WorkOrdersPage,
});

const statusColors: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  at_dock: "bg-primary/15 text-primary border-primary/30",
  unloading: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  received: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  departed: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  closed: "bg-green-500/15 text-green-600 border-green-500/30",
};

function WorkOrdersPage() {
  const [query, setQuery] = useState("");
  const [workOrderToDelete, setWorkOrderToDelete] = useState<WorkOrder | null>(null);

  const { workOrders } = useWmsData();

  const filtered = useMemo(() => {
    if (!workOrders) return [];
    return workOrders.filter((w) => {
      if (query) {
        const q = query.toLowerCase();
        const blob = `${w.woNumber} ${w.clientName} ${w.containerNumber} ${w.carrier}`.toLowerCase();
        return blob.includes(q);
      }
      return true;
    });
  }, [workOrders, query]);

  const stats = useMemo(() => {
    if (!workOrders) return { scheduled: 0, atDock: 0, unloading: 0, received: 0, departed: 0 };
    return {
      scheduled: workOrders.filter((w) => w.status === "scheduled").length,
      atDock: workOrders.filter((w) => w.status === "at_dock").length,
      unloading: workOrders.filter((w) => w.status === "unloading").length,
      received: workOrders.filter((w) => w.status === "received").length,
      departed: workOrders.filter((w) => w.status === "departed").length,
    };
  }, [workOrders]);

  const handleDelete = async (wo: WorkOrder) => {
    try {
      await deleteWorkOrder(wo.id);
      toast.success("Work order deleted");
      setWorkOrderToDelete(null);
    } catch (e: any) {
      toast.error(`Failed to delete: ${e.message}`);
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Work Orders · Container Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track containers from inbound entry through departure
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/inbound">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              Inbound Shipments
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={Container} label="Scheduled" value={stats.scheduled} />
        <StatCell icon={Truck} label="At Dock" value={stats.atDock} />
        <StatCell icon={Calendar} label="Unloading" value={stats.unloading} />
        <StatCell icon={Check} label="Received" value={stats.received} />
        <StatCell icon={Ship} label="Departed" value={stats.departed} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search WO#, client, container, carrier..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-md border border-border bg-card py-10 text-center text-xs text-muted-foreground">
            No work orders match the current filter.
          </div>
        )}
        {filtered.map((w) => (
          <div key={w.id} className="rounded-md border border-border bg-card overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border bg-muted/20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold">{w.woNumber}</span>
                  <span
                    className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColors[w.status]}`}
                  >
                    {w.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-[11px]">
                  <KeyVal label="Client" value={w.clientName} />
                  <KeyVal icon={Container} label="Container" value={w.containerNumber} />
                  <KeyVal icon={Truck} label="Trailer" value={w.trailerNumber} />
                  <KeyVal icon={Ship} label="Carrier" value={w.carrier} />
                  <KeyVal icon={Ship} label="Vessel" value={w.vessel} />
                  <KeyVal icon={Hash} label="Voyage" value={w.voyageNumber} />
                  <KeyVal icon={Calendar} label="Arrival" value={w.arrivalDate ? new Date(w.arrivalDate).toLocaleDateString() : "—"} />
                  <KeyVal label="PO" value={w.poNumber} />
                </div>
              </div>
              <div className="w-48 shrink-0">
                <div className="text-right text-[10px] text-muted-foreground">
                  <span className="tabular-nums text-foreground">{w.totalUnits}</span>
                  <div className="text-xs">units</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCell({ icon: Icon, label, value }: { icon: typeof Container; label: string; value: number }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function KeyVal({ icon: Icon, label, value }: { icon?: typeof Container; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground shrink-0" />}
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  );
}

async function deleteWorkOrder(woId: string) {
  const { getFirestoreDoc, deleteDoc } = await import("firebase/firestore");
  const { db } = await import("@/lib/firebase");
  const docRef = getFirestoreDoc(db, "workOrders", woId);
  await deleteDoc(docRef);
}

export default WorkOrdersPage;