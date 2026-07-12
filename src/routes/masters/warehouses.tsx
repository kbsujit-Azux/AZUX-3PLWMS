import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Warehouse,
  Plus,
  Pencil,
  Trash2,
  Search,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/workspace-context";
import { tenants, warehouses as mockWarehouses } from "@/lib/mock-data";
import type { Warehouse as WarehouseType } from "@/lib/mock-data";
import {
  fetchWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from "@/lib/firestore-data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/masters/warehouses")({
  head: () => ({
    meta: [{ title: "Warehouse Master — AZUX 3PL WMS" }],
  }),
  component: WarehousesPage,
});

const EMPTY: Omit<WarehouseType, "id"> = {
  name: "",
  code: "",
  city: "",
  capacityPct: 0,
};

function WarehousesPage() {
  const { tenantId } = useWorkspace();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseType | null>(null);
  const [deleting, setDeleting] = useState<WarehouseType | null>(null);
  const [form, setForm] = useState<Omit<WarehouseType, "id">>(EMPTY);

  const isAdmin = user?.role === "Admin";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWarehouses().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter((w) => {
      if (q) {
        return (
          w.name.toLowerCase().includes(q) ||
          w.code.toLowerCase().includes(q) ||
          w.city.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, query]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  };

  const openEdit = (w: WarehouseType) => {
    setEditing(w);
    setForm({
      name: w.name,
      code: w.code,
      city: w.city,
      capacityPct: w.capacityPct,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast.error("Validation", { description: "Name and code are required." });
      return;
    }
    try {
      if (editing) {
        await updateWarehouse(editing.id, form);
        toast.success("Warehouse updated");
      } else {
        await createWarehouse(form);
        toast.success("Warehouse created");
      }
      setFormOpen(false);
      const data = await fetchWarehouses();
      setItems(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error("Error", { description: msg });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteWarehouse(deleting.id);
      toast.success("Warehouse deleted");
      setDeleting(null);
      const data = await fetchWarehouses();
      setItems(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      toast.error("Error", { description: msg });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Warehouse Master</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage warehouse locations, codes, and capacity.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Add Warehouse
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search warehouses..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          {filtered.length} {filtered.length === 1 ? "warehouse" : "warehouses"}
        </Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                  No warehouses found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.code}</TableCell>
                  <TableCell className="text-sm">{w.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{w.city}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            w.capacityPct >= 90
                              ? "bg-destructive"
                              : w.capacityPct >= 75
                                ? "bg-chart-4"
                                : "bg-chart-3"
                          }`}
                          style={{ width: `${Math.min(100, w.capacityPct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono tabular-nums w-10 text-right">
                        {w.capacityPct}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && w.id !== "all" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(w)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleting(w)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update warehouse details below." : "Enter the new warehouse details below."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="wh-code">Code</Label>
              <Input
                id="wh-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. ATL1"
                disabled={!!editing}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. ATL-1 Distribution"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wh-city">City</Label>
              <Input
                id="wh-city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g. Atlanta, GA"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wh-capacity">Capacity %</Label>
              <Input
                id="wh-capacity"
                type="number"
                min={0}
                max={100}
                value={form.capacityPct}
                onChange={(e) => setForm({ ...form, capacityPct: parseInt(e.target.value, 10) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Warehouse</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-mono text-foreground">{deleting?.code}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
