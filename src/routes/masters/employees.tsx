import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Search,
  Mail,
  MapPin,
  BadgeCheck,
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
import { Card } from "@/components/ui/card";
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
import {
  fetchEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "@/lib/firestore-data";
import { tenants, warehouses } from "@/lib/mock-data";
import type { WarehouseEmployee } from "@/lib/rf-types";
import { hashPassword } from "@/lib/password-utils";

export const Route = createFileRoute("/masters/employees")({
  head: () => ({
    meta: [{ title: "Employee Master — AZUX 3PL WMS" }],
  }),
  component: EmployeesPage,
});

const EMPTY: WarehouseEmployee = {
  badgeId: "",
  name: "",
  email: "",
  assignedClientId: "all",
  assignedWarehouseId: "all",
  isActive: true,
  createdAt: new Date().toISOString(),
  passwordHash: "",
  role: "Picker",
  team: "",
  shift: "",
};

function EmployeesPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [employees, setEmployees] = useState<WarehouseEmployee[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseEmployee | null>(null);
  const [form, setForm] = useState<WarehouseEmployee>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmployees(tenantId, warehouseId).then((list) => {
      if (cancelled) return;
      setEmployees(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, warehouseId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        e.badgeId.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY,
      assignedClientId: tenantId === "all" ? "all" : tenantId,
      assignedWarehouseId: warehouseId === "all" ? "all" : warehouseId,
    });
    setPassword("");
    setConfirmPassword("");
    setDialogOpen(true);
  };

  const openEdit = (emp: WarehouseEmployee) => {
    setEditing(emp);
    setForm({ ...emp });
    setPassword("");
    setConfirmPassword("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.badgeId.trim() || !form.name.trim() || !form.email.trim()) {
      toast.error("Badge ID, Name, and Email are required");
      return;
    }
    if (!editing && !password) {
      toast.error("Password is required for new employees");
      return;
    }
    if (password && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      let passwordHash = form.passwordHash;
      if (password) {
        passwordHash = await hashPassword(password);
      }
      const data = { ...form, passwordHash };
      if (editing) {
        await updateEmployee(editing.badgeId, data);
        toast.success("Employee updated");
      } else {
        await createEmployee(data);
        toast.success("Employee created");
      }
      setDialogOpen(false);
      setPassword("");
      setConfirmPassword("");
      const list = await fetchEmployees(tenantId, warehouseId);
      setEmployees(list);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteEmployee(deleteId);
      toast.success("Employee deleted");
      setDeleteId(null);
      const list = await fetchEmployees(tenantId, warehouseId);
      setEmployees(list);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">Employee Master</h1>
        </div>
        <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-500" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Employee
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <Input
          placeholder="Search badge, name, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 bg-slate-900 border-slate-800 text-sm"
        />
      </div>

      <Card className="border-slate-800">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                Badge
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                Name
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                Email
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                Client
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                Warehouse
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                Status
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-slate-500 w-24">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-slate-500 py-8">
                  Loading employees…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-slate-500 py-8">
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((emp) => (
                <TableRow key={emp.badgeId} className="hover:bg-slate-900/50">
                  <TableCell className="font-mono text-xs">{emp.badgeId}</TableCell>
                  <TableCell className="text-xs">{emp.name}</TableCell>
                  <TableCell className="text-xs text-slate-400">{emp.email}</TableCell>
                  <TableCell className="text-xs">{tenantName(emp.assignedClientId)}</TableCell>
                  <TableCell className="text-xs">
                    {warehouseName(emp.assignedWarehouseId)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={emp.isActive ? "default" : "secondary"}
                      className={
                        emp.isActive
                          ? "bg-emerald-900/50 text-emerald-400 border-emerald-700"
                          : "bg-slate-800 text-slate-500"
                      }
                    >
                      {emp.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEdit(emp)}
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setDeleteId(emp.badgeId)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editing ? "Edit Employee" : "New Employee"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Badge ID is the unique identifier used for RF Gun authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Badge ID</Label>
              <Input
                value={form.badgeId}
                onChange={(e) => setForm({ ...form, badgeId: e.target.value })}
                disabled={!!editing}
                className="h-9 bg-slate-800 border-slate-700 font-mono text-sm"
                placeholder="e.g. WH-1001"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Full Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-9 bg-slate-800 border-slate-700 text-sm"
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-9 bg-slate-800 border-slate-700 text-sm"
                placeholder="john@company.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Assigned Client</Label>
              <Select
                value={form.assignedClientId}
                onValueChange={(v) => setForm({ ...form, assignedClientId: v })}
              >
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tenants
                    .filter((t) => t.id !== "all")
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Assigned Warehouse</Label>
              <Select
                value={form.assignedWarehouseId}
                onValueChange={(v) => setForm({ ...form, assignedWarehouseId: v })}
              >
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w) => w.id !== "all")
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id} className="text-xs">
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
              >
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Picker", "Packer", "Receiver", "Putaway", "Warehouse Lead", "Operations Manager", "Admin", "Billing"].map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Team</Label>
              <Select
                value={form.team || ""}
                onValueChange={(v) => setForm({ ...form, team: v })}
              >
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {["Picking", "Packing", "Receiving", "Putaway", "Move", "Operations", "Admin", "All"].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Shift</Label>
              <Select
                value={form.shift || ""}
                onValueChange={(v) => setForm({ ...form, shift: v })}
              >
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {["A", "B", "C", "Day", "Night", "Swing"].map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-slate-700 bg-slate-800"
              />
              <Label htmlFor="active" className="text-xs text-slate-300">
                Active account
              </Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-300">
                {editing ? "New PIN (leave blank to keep current)" : "Set PIN"}
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 bg-slate-800 border-slate-700 text-sm"
                placeholder={editing ? "Leave blank to keep current" : "Enter PIN for RF Gun"}
              />
            </div>
            {password && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-300">Confirm PIN</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-9 bg-slate-800 border-slate-700 text-sm"
                  placeholder="Re-enter PIN"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-slate-400" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={handleSave}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Employee</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Are you sure you want to deactivate badge{" "}
              <span className="font-mono text-red-400">{deleteId}</span>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="text-slate-400" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
