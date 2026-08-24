import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Warehouse as WarehouseIcon,
  Users as UsersIcon,
  Settings as SettingsIcon,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWmsData } from "@/components/db-context";
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  createClient,
  updateClient,
  deleteClient,
  createUser,
  updateUser,
  deleteUser,
  createCarrierService,
  updateCarrierService,
  deleteCarrierService,
} from "@/lib/firestore-data";
import type { Warehouse } from "@/lib/mock-data";
import type { SettingsClient, SettingsUser } from "@/lib/firestore-data";
import type { CarrierServiceRecord } from "@/lib/carrier-services";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — AZUX 3PL WMS Systems" }] }),
  component: SettingsPage,
});

type BusinessType = "Warehousing" | "Transload" | "Warehousing+Transload";
type AllocRule = "FIFO" | "LIFO";

type ClientRecord = SettingsClient;
type UserRole =
  | "Admin"
  | "Operations Manager"
  | "Warehouse Lead"
  | "Picker"
  | "Receiver"
  | "Billing"
  | "Viewer";
type UserRecord = SettingsUser;
type CarrierServiceRecordSettings = CarrierServiceRecord;

const ROLES: UserRole[] = [
  "Admin",
  "Operations Manager",
  "Warehouse Lead",
  "Picker",
  "Receiver",
  "Billing",
  "Viewer",
];
const BIZ_TYPES: BusinessType[] = ["Warehousing", "Transload", "Warehousing+Transload"];

const uid = () => Math.random().toString(36).slice(2, 10);

function SettingsPage() {
  const { warehouses, clients, users, carrierServices, loading } = useWmsData();
  const [q, setQ] = useState("");

  return (
    <div className="px-6 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <SettingsIcon className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Manage Clients, Warehouses and Users with role-based access.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <Tabs defaultValue="clients" className="space-y-4">
          <TabsList>
            <TabsTrigger value="clients" className="gap-2">
              <Building2 className="h-3.5 w-3.5" /> Clients
            </TabsTrigger>
            <TabsTrigger value="warehouses" className="gap-2">
              <WarehouseIcon className="h-3.5 w-3.5" /> Warehouses
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <UsersIcon className="h-3.5 w-3.5" /> Users & Roles
            </TabsTrigger>
            <TabsTrigger value="carriers" className="gap-2">
              <Truck className="h-3.5 w-3.5" /> Carriers & Services
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clients">
            <ClientsPanel items={clients} q={q} onSearch={setQ} />
          </TabsContent>
          <TabsContent value="warehouses">
            <WarehousesPanel items={warehouses} q={q} onSearch={setQ} />
          </TabsContent>
          <TabsContent value="users">
            <UsersPanel items={users} q={q} onSearch={setQ} />
          </TabsContent>
          <TabsContent value="carriers">
            <CarriersPanel items={carrierServices} q={q} onSearch={setQ} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Toolbar({
  title,
  count,
  searchValue,
  onSearch,
  onNew,
  newLabel,
  searchPlaceholder,
}: {
  title: string;
  count: number;
  searchValue: string;
  onSearch: (v: string) => void;
  onNew: () => void;
  newLabel: string;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-[11px] text-muted-foreground">
          {count} record{count === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder ?? "Search…"}
          className="h-9 w-[280px]"
        />
        <Button onClick={onNew} size="sm" className="gap-2">
          <Plus className="h-3.5 w-3.5" /> {newLabel}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ConfirmDelete({
  open,
  label,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{label}"?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            This action removes the record from Firestore.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ───────────────────────── Clients ─────────────────────────
function emptyClient(): ClientRecord {
  return {
    id: "",
    code: "",
    name: "",
    arAccount: "",
    address: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    businessType: "Warehousing",
    allocationRule: "FIFO",
    preferredLocationPrefix: "",
    useDropForAllocation: true,
    active: true,
  };
}

function ClientsPanel({ items, q, onSearch }: { items: ClientRecord[]; q: string; onSearch: (v: string) => void }) {
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [toDelete, setToDelete] = useState<ClientRecord | null>(null);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return items;
    return items.filter((r) =>
      [r.name, r.code, r.arAccount, r.contactPerson, r.businessType]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [items, q]);

  const save = async (rec: ClientRecord) => {
    if (!rec.name.trim() || !rec.code.trim()) {
      toast.error("Client name and code are required");
      return;
    }
    try {
      if (rec.id) {
        await updateClient(rec.id, rec);
        toast.success("Client updated");
      } else {
        const id = rec.id || uid();
        await createClient({ ...rec, id });
        toast.success("Client created");
      }
      setEditing(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error("Error", { description: msg });
    }
  };

  return (
    <section className="space-y-3">
      <Toolbar
        title="All Clients"
        count={filtered.length}
        searchValue={q}
        onSearch={onSearch}
        onNew={() => setEditing(emptyClient())}
        newLabel="New client"
        searchPlaceholder="Search clients, code, AR, contact…"
      />

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">Code</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>A/R Account</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Allocation</TableHead>
              <TableHead>Loc. Prefix</TableHead>
              <TableHead>DROP</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="w-[70px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-xs text-muted-foreground">
                  No clients found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-[11px]">{c.code}</TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">{c.address}</div>
                </TableCell>
                <TableCell className="font-mono text-[11px]">{c.arAccount}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {c.businessType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className="text-[10px]"
                    variant={c.allocationRule === "FIFO" ? "default" : "secondary"}
                  >
                    {c.allocationRule}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-[11px]">
                  {c.preferredLocationPrefix || "—"}
                </TableCell>
                <TableCell>
                  {c.useDropForAllocation ? (
                    <Badge variant="outline" className="text-[10px]">
                      Yes
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-xs">{c.contactPerson}</div>
                  <div className="text-[11px] text-muted-foreground">{c.contactEmail}</div>
                </TableCell>
                <TableCell>
                  {c.active ? (
                    <Badge className="text-[10px]">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions onEdit={() => setEditing(c)} onDelete={() => setToDelete(c)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <ClientDialog value={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
      <ConfirmDelete
        open={!!toDelete}
        label={toDelete?.name ?? ""}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteClient(toDelete.id);
            toast.success(`Deleted ${toDelete.name}`);
          }
          setToDelete(null);
        }}
      />
    </section>
  );
}

function ClientDialog({
  value,
  onClose,
  onSave,
}: {
  value: ClientRecord;
  onClose: () => void;
  onSave: (r: ClientRecord) => void;
}) {
  const [draft, setDraft] = useState<ClientRecord>(value);
  const upd = <K extends keyof ClientRecord>(k: K, v: ClientRecord[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{value.id ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription className="text-xs">
            Configure billing, contact and allocation rules.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Client code">
            <Input
              value={draft.code}
              onChange={(e) => upd("code", e.target.value.toUpperCase())}
              placeholder="ACME"
            />
          </Field>
          <Field label="Client name">
            <Input
              value={draft.name}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="Acme Outdoor Co."
            />
          </Field>
          <Field label="A/R account">
            <Input
              value={draft.arAccount}
              onChange={(e) => upd("arAccount", e.target.value)}
              placeholder="AR-10045"
            />
          </Field>
          <Field label="Business type">
            <Select
              value={draft.businessType}
              onValueChange={(v) => upd("businessType", v as BusinessType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BIZ_TYPES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Address" className="col-span-2">
            <Textarea
              value={draft.address}
              onChange={(e) => upd("address", e.target.value)}
              rows={2}
              placeholder="Street, city, state, ZIP"
            />
          </Field>
          <Field label="Contact person">
            <Input
              value={draft.contactPerson}
              onChange={(e) => upd("contactPerson", e.target.value)}
            />
          </Field>
          <Field label="Contact email">
            <Input
              type="email"
              value={draft.contactEmail}
              onChange={(e) => upd("contactEmail", e.target.value)}
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={draft.contactPhone}
              onChange={(e) => upd("contactPhone", e.target.value)}
            />
          </Field>
          <Field label="Active">
            <div className="flex items-center gap-2 h-9">
              <Switch checked={draft.active} onCheckedChange={(v) => upd("active", v)} />
              <span className="text-xs text-muted-foreground">
                {draft.active ? "Active" : "Inactive"}
              </span>
            </div>
          </Field>

          <div className="col-span-2 mt-2 rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Allocation rules
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order allocation rule">
                <Select
                  value={draft.allocationRule}
                  onValueChange={(v) => upd("allocationRule", v as AllocRule)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIFO">FIFO — first in, first out</SelectItem>
                    <SelectItem value="LIFO">LIFO — last in, first out</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Preferred location prefix">
                <Input
                  value={draft.preferredLocationPrefix}
                  onChange={(e) => upd("preferredLocationPrefix", e.target.value.toUpperCase())}
                  placeholder="e.g. A12"
                />
              </Field>
              <Field label="Allocate from DROP locations" className="col-span-2">
                <div className="flex items-center gap-2 h-9">
                  <Switch
                    checked={draft.useDropForAllocation}
                    onCheckedChange={(v) => upd("useDropForAllocation", v)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {draft.useDropForAllocation
                      ? "DROP locations included in allocation"
                      : "DROP locations excluded"}
                  </span>
                </div>
              </Field>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>
            {value.id ? "Save changes" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Warehouses ─────────────────────────
function emptyWarehouse(): Omit<Warehouse, "id"> {
  return {
    code: "",
    name: "",
    city: "",
    addressLine: "",
    squareFeet: 0,
    capacityPct: 0,
    manager: "",
    active: true,
  };
}

function WarehousesPanel({ items, q, onSearch }: { items: Warehouse[]; q: string; onSearch: (v: string) => void }) {
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [toDelete, setToDelete] = useState<Warehouse | null>(null);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return items;
    return items.filter((r) =>
      [r.name, r.code, r.city, r.manager].join(" ").toLowerCase().includes(s),
    );
  }, [items, q]);

  const save = async (rec: Omit<Warehouse, "id">) => {
    if (!rec.name.trim() || !rec.code.trim()) {
      toast.error("Warehouse name and code are required");
      return;
    }
    try {
      if (editing) {
        await updateWarehouse(editing.id, rec);
        toast.success("Warehouse updated");
      } else {
        await createWarehouse(rec);
        toast.success("Warehouse created");
      }
      setEditing(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error("Error", { description: msg });
    }
  };

  return (
    <section className="space-y-3">
      <Toolbar
        title="All Warehouses"
        count={filtered.length}
        searchValue={q}
        onSearch={onSearch}
        onNew={() => setEditing(null)}
        newLabel="New warehouse"
        searchPlaceholder="Search warehouses, city, manager…"
      />
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">Code</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-right">Sq Ft</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead className="w-[70px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-xs text-muted-foreground">
                  No warehouses found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-mono text-[11px]">{w.code}</TableCell>
                <TableCell className="font-medium text-sm">{w.name}</TableCell>
                <TableCell className="text-xs">{w.city}</TableCell>
                <TableCell className="text-[11px] text-muted-foreground">{w.addressLine}</TableCell>
                <TableCell className="text-right font-mono text-[11px]">
                  {w.squareFeet.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-[11px]">{w.capacityPct}%</TableCell>
                <TableCell className="text-xs">{w.manager}</TableCell>
                <TableCell>
                  {w.active ? (
                    <Badge className="text-[10px]">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions onEdit={() => setEditing(w)} onDelete={() => setToDelete(w)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing !== null && (
        <WarehouseDialog value={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
      <ConfirmDelete
        open={!!toDelete}
        label={toDelete?.name ?? ""}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteWarehouse(toDelete.id);
            toast.success(`Deleted ${toDelete.name}`);
          }
          setToDelete(null);
        }}
      />
    </section>
  );
}

function WarehouseDialog({
  value,
  onClose,
  onSave,
}: {
  value: Warehouse;
  onClose: () => void;
  onSave: (r: Omit<Warehouse, "id">) => void;
}) {
  const [draft, setDraft] = useState<Omit<Warehouse, "id">>({
    code: value.code,
    name: value.name,
    city: value.city,
    addressLine: value.addressLine,
    squareFeet: value.squareFeet,
    capacityPct: value.capacityPct,
    manager: value.manager,
    active: value.active,
  });
  const upd = <K extends keyof Omit<Warehouse, "id">>(k: K, v: Omit<Warehouse, "id">[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{value.id ? "Edit warehouse" : "New warehouse"}</DialogTitle>
          <DialogDescription className="text-xs">
            Facility profile, capacity and ownership.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code">
            <Input
              value={draft.code}
              onChange={(e) => upd("code", e.target.value.toUpperCase())}
              placeholder="ATL1"
            />
          </Field>
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="ATL-1 Distribution"
            />
          </Field>
          <Field label="City">
            <Input
              value={draft.city}
              onChange={(e) => upd("city", e.target.value)}
              placeholder="Atlanta, GA"
            />
          </Field>
          <Field label="Manager">
            <Input value={draft.manager} onChange={(e) => upd("manager", e.target.value)} />
          </Field>
          <Field label="Street address" className="col-span-2">
            <Input value={draft.addressLine} onChange={(e) => upd("addressLine", e.target.value)} />
          </Field>
          <Field label="Square feet">
            <Input
              type="number"
              value={draft.squareFeet}
              onChange={(e) => upd("squareFeet", Number(e.target.value))}
            />
          </Field>
          <Field label="Capacity %">
            <Input
              type="number"
              min={0}
              max={100}
              value={draft.capacityPct}
              onChange={(e) => upd("capacityPct", Number(e.target.value))}
            />
          </Field>
          <Field label="Active" className="col-span-2">
            <div className="flex items-center gap-2 h-9">
              <Switch checked={draft.active} onCheckedChange={(v) => upd("active", v)} />
              <span className="text-xs text-muted-foreground">
                {draft.active ? "Active" : "Inactive"}
              </span>
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>
            {value.id ? "Save changes" : "Create warehouse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Users ─────────────────────────
function emptyUser(): UserRecord {
  return { id: "", name: "", email: "", role: "Viewer", warehouseCode: "ALL", active: true };
}

function UsersPanel({ items, q, onSearch }: { items: UserRecord[]; q: string; onSearch: (v: string) => void }) {
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [toDelete, setToDelete] = useState<UserRecord | null>(null);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return items;
    return items.filter((r) =>
      [r.name, r.email, r.role, r.warehouseCode].join(" ").toLowerCase().includes(s),
    );
  }, [items, q]);

  const save = async (rec: UserRecord) => {
    if (!rec.name.trim() || !rec.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    try {
      if (rec.id) {
        await updateUser(rec.id, rec);
        toast.success("User updated");
      } else {
        const id = rec.id || uid();
        await createUser({ ...rec, id });
        toast.success("User created");
      }
      setEditing(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error("Error", { description: msg });
    }
  };

  return (
    <section className="space-y-3">
      <Toolbar
        title="Users & Roles"
        count={filtered.length}
        searchValue={q}
        onSearch={onSearch}
        onNew={() => setEditing(emptyUser())}
        newLabel="Invite user"
        searchPlaceholder="Search users, email, role…"
      />
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="w-[70px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-sm">{u.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-[11px]">{u.warehouseCode}</TableCell>
                <TableCell>
                  {u.active ? (
                    <Badge className="text-[10px]">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Disabled
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions onEdit={() => setEditing(u)} onDelete={() => setToDelete(u)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <UserDialog
          value={editing}
          onClose={() => setEditing(null)}
          onSave={save}
          warehouseCodes={[]}
        />
      )}
      <ConfirmDelete
        open={!!toDelete}
        label={toDelete?.name ?? ""}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteUser(toDelete.id);
            toast.success(`Removed ${toDelete.name}`);
          }
          setToDelete(null);
        }}
      />
    </section>
  );
}

function UserDialog({
  value,
  onClose,
  onSave,
  warehouseCodes,
}: {
  value: UserRecord;
  onClose: () => void;
  onSave: (r: UserRecord) => void;
  warehouseCodes: string[];
}) {
  const [draft, setDraft] = useState<UserRecord>(value);
  const upd = <K extends keyof UserRecord>(k: K, v: UserRecord[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{value.id ? "Edit user" : "Invite user"}</DialogTitle>
          <DialogDescription className="text-xs">
            Assign role and warehouse scope.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" className="col-span-2">
            <Input value={draft.name} onChange={(e) => upd("name", e.target.value)} />
          </Field>
          <Field label="Email" className="col-span-2">
            <Input
              type="email"
              value={draft.email}
              onChange={(e) => upd("email", e.target.value)}
            />
          </Field>
          <Field label="Role">
            <Select value={draft.role} onValueChange={(v) => upd("role", v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Warehouse">
            <Select value={draft.warehouseCode} onValueChange={(v) => upd("warehouseCode", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">ALL — every warehouse</SelectItem>
                {warehouseCodes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Active" className="col-span-2">
            <div className="flex items-center gap-2 h-9">
              <Switch checked={draft.active} onCheckedChange={(v) => upd("active", v)} />
              <span className="text-xs text-muted-foreground">
                {draft.active ? "Active" : "Disabled"}
              </span>
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>{value.id ? "Save changes" : "Send invite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Carriers ─────────────────────────
function emptyCarrier(): CarrierServiceRecordSettings {
  return {
    id: "",
    carrier: "",
    serviceCode: "",
    serviceDescription: "",
    transitDays: "",
    pricingTier: "",
    typicalUseCase: "",
    active: true,
  };
}

function CarriersPanel({ items, q, onSearch }: { items: CarrierServiceRecord[]; q: string; onSearch: (v: string) => void }) {
  const [editing, setEditing] = useState<CarrierServiceRecord | null>(null);
  const [toDelete, setToDelete] = useState<CarrierServiceRecord | null>(null);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return items;
    return items.filter((r) =>
      [r.carrier, r.serviceCode, r.serviceDescription, r.typicalUseCase, r.pricingTier]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [items, q]);

  const save = async (rec: CarrierServiceRecord) => {
    if (!rec.carrier.trim() || !rec.serviceCode.trim() || !rec.serviceDescription.trim()) {
      toast.error("Carrier, service code, and description are required");
      return;
    }
    try {
      if (rec.id) {
        await updateCarrierService(rec.id, rec);
        toast.success("Carrier service updated");
      } else {
        const id = rec.id || uid();
        await createCarrierService({ ...rec, id });
        toast.success("Carrier service created");
      }
      setEditing(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error("Error", { description: msg });
    }
  };

  return (
    <section className="space-y-3">
      <Toolbar
        title="Carrier & Service Codes"
        count={filtered.length}
        searchValue={q}
        onSearch={onSearch}
        onNew={() => setEditing(emptyCarrier())}
        newLabel="Add carrier service"
        searchPlaceholder="Search carrier, service code, description…"
      />

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">Carrier</TableHead>
              <TableHead className="w-[180px]">Service Code</TableHead>
              <TableHead>Service Description</TableHead>
              <TableHead className="w-[100px]">Transit Days</TableHead>
              <TableHead className="w-[120px]">Pricing Tier</TableHead>
              <TableHead>Typical Use Case</TableHead>
              <TableHead className="w-[70px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-xs text-muted-foreground">
                  No carrier services found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-[11px] font-medium">{c.carrier}</TableCell>
                <TableCell className="font-mono text-[11px]">{c.serviceCode}</TableCell>
                <TableCell className="text-xs">{c.serviceDescription}</TableCell>
                <TableCell className="text-xs">{c.transitDays}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {c.pricingTier}
                  </Badge>
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground max-w-[300px] truncate">
                  {c.typicalUseCase}
                </TableCell>
                <TableCell>
                  {c.active ? (
                    <Badge className="text-[10px]">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions onEdit={() => setEditing(c)} onDelete={() => setToDelete(c)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <CarrierDialog value={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
      <ConfirmDelete
        open={!!toDelete}
        label={toDelete?.serviceDescription ?? ""}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteCarrierService(toDelete.id);
            toast.success(`Deleted ${toDelete.serviceCode}`);
          }
          setToDelete(null);
        }}
      />
    </section>
  );
}

function CarrierDialog({
  value,
  onClose,
  onSave,
}: {
  value: CarrierServiceRecord;
  onClose: () => void;
  onSave: (r: CarrierServiceRecord) => void;
}) {
  const [draft, setDraft] = useState<CarrierServiceRecord>(value);
  const upd = <K extends keyof CarrierServiceRecord>(k: K, v: CarrierServiceRecord[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{value.id ? "Edit carrier service" : "Add carrier service"}</DialogTitle>
          <DialogDescription className="text-xs">
            Carrier, service code, transit and pricing metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Carrier">
            <Input
              value={draft.carrier}
              onChange={(e) => upd("carrier", e.target.value.toUpperCase())}
              placeholder="FEDEX / UPS / USPS / LTL"
            />
          </Field>
          <Field label="Service Code">
            <Input
              value={draft.serviceCode}
              onChange={(e) => upd("serviceCode", e.target.value.toUpperCase())}
              placeholder="FEDEX_GROUND"
            />
          </Field>
          <Field label="Service Description" className="col-span-2">
            <Input
              value={draft.serviceDescription}
              onChange={(e) => upd("serviceDescription", e.target.value)}
              placeholder="FedEx Ground (Commercial)"
            />
          </Field>
          <Field label="Transit Days">
            <Input
              value={draft.transitDays}
              onChange={(e) => upd("transitDays", e.target.value)}
              placeholder="1-5 Days"
            />
          </Field>
          <Field label="Pricing Tier">
            <Input
              value={draft.pricingTier}
              onChange={(e) => upd("pricingTier", e.target.value)}
              placeholder="Low-Mid / Mid / High / Premium"
            />
          </Field>
          <Field label="Typical Use Case" className="col-span-2">
            <Textarea
              value={draft.typicalUseCase}
              onChange={(e) => upd("typicalUseCase", e.target.value)}
              rows={2}
              placeholder="When this service is typically used…"
            />
          </Field>
          <Field label="Active" className="col-span-2">
            <div className="flex items-center gap-2 h-9">
              <Switch checked={draft.active} onCheckedChange={(v) => upd("active", v)} />
              <span className="text-xs text-muted-foreground">
                {draft.active ? "Active" : "Inactive"}
              </span>
            </div>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>{value.id ? "Save changes" : "Add service"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
