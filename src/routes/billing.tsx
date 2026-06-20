import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Receipt,
  Plus,
  Trash2,
  Printer,
  Mail,
  Sparkles,
  FileText,
  Settings2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  billingClients,
  defaultRules,
  billableEvents,
  seedInvoices,
  fmtUSD,
  unitLabel,
  type BillingClient,
  type ChargeRule,
  type ClientId,
  type Invoice,
  type InvoiceLine,
  type RateUnit,
  type StorageFrequency,
} from "@/lib/billing-data";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Billing — AZUX 3PL WMS Systems" },
      { name: "description", content: "Client billing setup, invoice generation, and 3PL transactions log." },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const [rules, setRules] = useState<ChargeRule[]>(defaultRules);
  const [events, setEvents] = useState(billableEvents);
  const [invoices, setInvoices] = useState<Invoice[]>(seedInvoices);
  const [activeClient, setActiveClient] = useState<ClientId>("APEX");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(seedInvoices[0]?.id ?? null);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Receipt className="h-3.5 w-3.5" /> AZUX 3PL WMS · Billing
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Billing & Invoicing</h1>
          <p className="text-sm text-muted-foreground">
            Configure client charges, run automated billing, or invoice manually.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" /> {rules.filter(r=>r.enabled).length} active rules</Badge>
          <Badge variant="outline">{events.filter(e=>!e.billed).length} unbilled events</Badge>
          <Badge variant="outline">{invoices.length} invoices</Badge>
        </div>
      </header>

      <Tabs defaultValue="setup" className="space-y-4">
        <TabsList>
          <TabsTrigger value="setup"><Settings2 className="h-4 w-4 mr-1.5" />Client Billing Setup</TabsTrigger>
          <TabsTrigger value="invoices"><FileText className="h-4 w-4 mr-1.5" />Invoice Generator</TabsTrigger>
          <TabsTrigger value="log"><Zap className="h-4 w-4 mr-1.5" />Transactions Log</TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <SetupTab
            activeClient={activeClient}
            onClientChange={setActiveClient}
            rules={rules}
            setRules={setRules}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTab
            rules={rules}
            events={events}
            setEvents={setEvents}
            invoices={invoices}
            setInvoices={setInvoices}
            selectedInvoiceId={selectedInvoiceId}
            setSelectedInvoiceId={setSelectedInvoiceId}
          />
        </TabsContent>

        <TabsContent value="log">
          <TransactionsTab events={events} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Setup Tab ---------------- */

function SetupTab({
  activeClient, onClientChange, rules, setRules,
}: {
  activeClient: ClientId;
  onClientChange: (id: ClientId) => void;
  rules: ChargeRule[];
  setRules: (r: ChargeRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const clientRules = rules.filter((r) => r.clientId === activeClient);

  const toggle = (id: string) =>
    setRules(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  const remove = (id: string) => setRules(rules.filter((r) => r.id !== id));

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Clients</CardTitle>
          <CardDescription className="text-xs">Select a client to edit rules</CardDescription>
        </CardHeader>
        <CardContent className="p-2">
          {billingClients.map((c) => (
            <button
              key={c.id}
              onClick={() => onClientChange(c.id)}
              className={`w-full text-left rounded-md px-3 py-2 text-sm transition ${
                activeClient === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">{c.name}</div>
              <div className={`text-[11px] ${activeClient === c.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {c.accountNumber} · {rules.filter(r=>r.clientId===c.id).length} rules
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Master List of Charges</CardTitle>
            <CardDescription>
              {billingClients.find(c=>c.id===activeClient)?.name} — toggle, edit or add rules.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Add Rule</Button>
            </DialogTrigger>
            <RuleDialog
              clientId={activeClient}
              onSave={(rule) => { setRules([...rules, rule]); setOpen(false); toast.success("Rule added"); }}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {clientRules.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No billing rules yet. Invoicing will fall back to manual entry.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Unit / Frequency</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Enabled</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientRules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><CategoryBadge cat={r.category} /></TableCell>
                    <TableCell className="font-medium">{r.description}</TableCell>
                    <TableCell>{fmtUSD(r.rate)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {unitLabel(r.unit)}
                      {r.frequency ? ` · ${r.frequency}${r.customCycleDays ? ` (${r.customCycleDays}d)` : ""}` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                      {r.trigger ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryBadge({ cat }: { cat: ChargeRule["category"] }) {
  const cls =
    cat === "Inbound" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
    : cat === "Outbound" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : cat === "Storage" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300";
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{cat}</span>;
}

function RuleDialog({ clientId, onSave }: { clientId: ClientId; onSave: (r: ChargeRule) => void }) {
  const [category, setCategory] = useState<ChargeRule["category"]>("Inbound");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<RateUnit | "flat">("pallet");
  const [rate, setRate] = useState<number>(0);
  const [frequency, setFrequency] = useState<StorageFrequency>("daily");
  const [customCycleDays, setCustomCycleDays] = useState<number>(7);
  const [trigger, setTrigger] = useState("");

  const save = () => {
    if (!description || !rate) { toast.error("Description and rate are required"); return; }
    onSave({
      id: `r${Date.now()}`,
      clientId, category, description, unit, rate,
      frequency: category === "Storage" ? frequency : undefined,
      customCycleDays: category === "Storage" && frequency === "custom" ? customCycleDays : undefined,
      trigger: category === "Custom" ? trigger || undefined : undefined,
      enabled: true,
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New Billing Rule</DialogTitle>
        <DialogDescription>Configure a charge for this client.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <Field label="Category">
          <Select value={category} onValueChange={(v) => setCategory(v as ChargeRule["category"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Inbound">Inbound</SelectItem>
              <SelectItem value="Outbound">Outbound</SelectItem>
              <SelectItem value="Storage">Storage</SelectItem>
              <SelectItem value="Custom">Custom / Automation</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Pick & pack per carton" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate (USD)">
            <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Unit">
            <Select value={unit} onValueChange={(v) => setUnit(v as RateUnit | "flat")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="carton">per carton</SelectItem>
                <SelectItem value="pallet">per pallet</SelectItem>
                <SelectItem value="container">per container</SelectItem>
                <SelectItem value="bol">per BOL</SelectItem>
                <SelectItem value="flat">flat charge</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {category === "Storage" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <Select value={frequency} onValueChange={(v) => setFrequency(v as StorageFrequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom cycle</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {frequency === "custom" && (
              <Field label="Cycle (days)">
                <Input type="number" value={customCycleDays} onChange={(e) => setCustomCycleDays(parseInt(e.target.value) || 1)} />
              </Field>
            )}
          </div>
        )}
        {category === "Custom" && (
          <Field label="Trigger condition">
            <Textarea value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="e.g. Container Inbounded AND Putaway" />
          </Field>
        )}
      </div>
      <DialogFooter>
        <Button onClick={save}>Save Rule</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/* ---------------- Invoices Tab ---------------- */

function InvoicesTab({
  rules, events, setEvents, invoices, setInvoices, selectedInvoiceId, setSelectedInvoiceId,
}: {
  rules: ChargeRule[];
  events: typeof billableEvents;
  setEvents: (e: typeof billableEvents) => void;
  invoices: Invoice[];
  setInvoices: (i: Invoice[]) => void;
  selectedInvoiceId: string | null;
  setSelectedInvoiceId: (id: string | null) => void;
}) {
  const [genClient, setGenClient] = useState<ClientId>("APEX");
  const [manualOpen, setManualOpen] = useState(false);
  const selected = invoices.find((i) => i.id === selectedInvoiceId) ?? null;

  const runAutomated = () => {
    const clientRules = rules.filter((r) => r.clientId === genClient && r.enabled);
    const clientEvents = events.filter((e) => e.clientId === genClient && !e.billed);
    if (clientRules.length === 0) {
      toast.error("No billing rules configured. Use 'Create Manual Bill' instead.");
      return;
    }
    if (clientEvents.length === 0) {
      toast.error("No unbilled activity for this client.");
      return;
    }
    const lines: InvoiceLine[] = [];
    const matchedIds: string[] = [];
    clientEvents.forEach((ev) => {
      const rule = clientRules.find((r) =>
        (r.category === ev.type || (r.category === "Custom" && ev.type === "Custom")) &&
        r.unit === ev.unit,
      );
      if (!rule) return;
      lines.push({
        id: `ln-${ev.id}`,
        activityType: ev.type,
        description: `${ev.description} (${ev.reference})`,
        quantity: ev.quantity,
        rate: rule.rate,
        total: +(ev.quantity * rule.rate).toFixed(2),
      });
      matchedIds.push(ev.id);
    });
    if (lines.length === 0) {
      toast.error("No events matched active rules.");
      return;
    }
    const inv = buildInvoice(genClient, lines, "Automated", invoices.length);
    setInvoices([inv, ...invoices]);
    setEvents(events.map((e) => (matchedIds.includes(e.id) ? { ...e, billed: true } : e)));
    setSelectedInvoiceId(inv.id);
    toast.success(`Draft invoice ${inv.number} compiled from ${lines.length} events`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Generate Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Client">
              <Select value={genClient} onValueChange={(v) => setGenClient(v as ClientId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {billingClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-col gap-2">
              <Button onClick={runAutomated}><Sparkles className="h-4 w-4" /> Run Automated Billing</Button>
              <Dialog open={manualOpen} onOpenChange={setManualOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Plus className="h-4 w-4" /> Create Manual Bill</Button>
                </DialogTrigger>
                <ManualInvoiceDialog
                  clientId={genClient}
                  onSave={(inv) => {
                    setInvoices([inv, ...invoices]);
                    setSelectedInvoiceId(inv.id);
                    setManualOpen(false);
                    toast.success(`Manual invoice ${inv.number} created`);
                  }}
                  nextSeq={invoices.length}
                />
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Invoice History</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {invoices.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No invoices yet.</div>
            )}
            {invoices.map((inv) => {
              const c = billingClients.find((b) => b.id === inv.clientId)!;
              const total = lineTotal(inv);
              return (
                <button
                  key={inv.id}
                  onClick={() => setSelectedInvoiceId(inv.id)}
                  className={`w-full text-left rounded-md px-3 py-2 mb-1 text-sm transition ${
                    selectedInvoiceId === inv.id ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{inv.number}</span>
                    <span className="text-xs text-muted-foreground">{inv.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{c.name}</span>
                    <span>{fmtUSD(total)}</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div>
        {selected ? (
          <InvoicePreview invoice={selected} />
        ) : (
          <Card className="h-full">
            <CardContent className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
              Select or generate an invoice to preview.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function buildInvoice(clientId: ClientId, lines: InvoiceLine[], source: Invoice["source"], seq: number): Invoice {
  const now = new Date();
  const due = new Date(); due.setDate(due.getDate() + 30);
  return {
    id: `inv-${Date.now()}`,
    number: `AZ-${now.getFullYear()}-${String(45 + seq).padStart(4, "0")}`,
    clientId,
    issueDate: now.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    status: "Draft",
    lines,
    taxRate: 0.0875,
    source,
  };
}

function lineTotal(inv: Invoice): number {
  const sub = inv.lines.reduce((s, l) => s + l.total, 0);
  return +(sub * (1 + inv.taxRate)).toFixed(2);
}

function ManualInvoiceDialog({
  clientId, onSave, nextSeq,
}: { clientId: ClientId; onSave: (i: Invoice) => void; nextSeq: number }) {
  const [client, setClient] = useState<ClientId>(clientId);
  const [lines, setLines] = useState<InvoiceLine[]>([
    { id: "ml1", activityType: "Service", description: "", quantity: 1, rate: 0, total: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(8.75);

  const update = (id: string, patch: Partial<InvoiceLine>) =>
    setLines(lines.map((l) => {
      if (l.id !== id) return l;
      const merged = { ...l, ...patch };
      merged.total = +(merged.quantity * merged.rate).toFixed(2);
      return merged;
    }));

  const sub = lines.reduce((s, l) => s + l.total, 0);
  const tax = +(sub * (taxRate / 100)).toFixed(2);

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Create Manual Bill</DialogTitle>
        <DialogDescription>Add ad-hoc line items for this client.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <Select value={client} onValueChange={(v) => setClient(v as ClientId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {billingClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tax %">
            <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} />
          </Field>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Activity</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-28">Rate</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell><Input value={l.activityType} onChange={(e) => update(l.id, { activityType: e.target.value })} /></TableCell>
                <TableCell><Input value={l.description} onChange={(e) => update(l.id, { description: e.target.value })} /></TableCell>
                <TableCell><Input type="number" value={l.quantity} onChange={(e) => update(l.id, { quantity: parseFloat(e.target.value) || 0 })} /></TableCell>
                <TableCell><Input type="number" step="0.01" value={l.rate} onChange={(e) => update(l.id, { rate: parseFloat(e.target.value) || 0 })} /></TableCell>
                <TableCell className="text-right font-medium">{fmtUSD(l.total)}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button size="sm" variant="outline" onClick={() => setLines([...lines, { id: `ml-${Date.now()}`, activityType: "Service", description: "", quantity: 1, rate: 0, total: 0 }])}>
          <Plus className="h-4 w-4" /> Add line
        </Button>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtUSD(sub)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span>{fmtUSD(tax)}</span></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{fmtUSD(sub + tax)}</span></div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => {
            if (lines.length === 0) { toast.error("Add at least one line"); return; }
            const inv = buildInvoice(client, lines, "Manual", nextSeq);
            inv.taxRate = taxRate / 100;
            onSave(inv);
          }}
        >
          Create Invoice
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------------- Invoice Preview ---------------- */

function InvoicePreview({ invoice }: { invoice: Invoice }) {
  const client = billingClients.find((c) => c.id === invoice.clientId) as BillingClient;
  const sub = invoice.lines.reduce((s, l) => s + l.total, 0);
  const tax = +(sub * invoice.taxRate).toFixed(2);
  const total = +(sub + tax).toFixed(2);

  const print = () => window.print();
  const email = () => toast.success(`Invoice successfully emailed to ${client.email}`);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between print:hidden">
        <div>
          <CardTitle className="text-base">Invoice {invoice.number}</CardTitle>
          <CardDescription>{invoice.source} · {invoice.status}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={print}><Printer className="h-4 w-4" /> Print / PDF</Button>
          <Button size="sm" onClick={email}><Mail className="h-4 w-4" /> Email Client</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div id="invoice-print" className="bg-white text-slate-900 dark:bg-white p-8 rounded-md border print:border-0 print:shadow-none">
          <div className="flex items-start justify-between border-b pb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">AZUX 3PL WMS Systems</div>
              <div className="text-2xl font-bold mt-1">AZUX 3PL</div>
              <div className="text-xs text-slate-500 mt-1">Third-Party Logistics · Warehousing & Distribution</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-slate-500">Invoice</div>
              <div className="text-xl font-semibold">{invoice.number}</div>
              <div className="text-xs text-slate-500 mt-2">
                <div>Issue: {invoice.issueDate}</div>
                <div>Due: {invoice.dueDate}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 py-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Bill To</div>
              <div className="text-sm font-semibold">{client.name}</div>
              {client.billToAddress.map((l, i) => (
                <div key={i} className="text-sm text-slate-600">{l}</div>
              ))}
              <div className="text-xs text-slate-500 mt-2">Account #: {client.accountNumber}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Remit To</div>
              <div className="text-sm font-semibold">AZUX 3PL Holdings, LLC</div>
              <div className="text-sm text-slate-600">1200 Logistics Way</div>
              <div className="text-sm text-slate-600">Dallas, TX 75201</div>
              <div className="text-xs text-slate-500 mt-2">billing@azux3pl.com</div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-y bg-slate-50 text-slate-600">
                <th className="text-left p-2 text-xs uppercase tracking-wider">Activity</th>
                <th className="text-left p-2 text-xs uppercase tracking-wider">Description</th>
                <th className="text-right p-2 text-xs uppercase tracking-wider w-20">Qty</th>
                <th className="text-right p-2 text-xs uppercase tracking-wider w-28">Rate</th>
                <th className="text-right p-2 text-xs uppercase tracking-wider w-28">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="border-b">
                  <td className="p-2 align-top">{l.activityType}</td>
                  <td className="p-2 align-top">{l.description}</td>
                  <td className="p-2 align-top text-right">{l.quantity.toLocaleString()}</td>
                  <td className="p-2 align-top text-right">{fmtUSD(l.rate)}</td>
                  <td className="p-2 align-top text-right font-medium">{fmtUSD(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-6">
            <div className="w-72 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmtUSD(sub)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax ({(invoice.taxRate * 100).toFixed(2)}%)</span><span>{fmtUSD(tax)}</span></div>
              <div className="flex justify-between border-t-2 border-slate-900 pt-2 mt-2 text-base font-bold">
                <span>Grand Total</span><span>{fmtUSD(total)}</span>
              </div>
            </div>
          </div>

          <div className="border-t mt-8 pt-4 text-[11px] text-slate-500 text-center">
            Generated by AZUX 3PL WMS Systems · Payment terms Net 30 · Questions? billing@azux3pl.com
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Transactions Tab ---------------- */

function TransactionsTab({ events }: { events: typeof billableEvents }) {
  const [filter, setFilter] = useState<"ALL" | ClientId>("ALL");
  const filtered = useMemo(
    () => events.filter((e) => filter === "ALL" || e.clientId === filter),
    [events, filter],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Billable Events Log</CardTitle>
          <CardDescription>All inbound, outbound, storage and custom activity captured from WMS.</CardDescription>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as "ALL" | ClientId)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All clients</SelectItem>
            {billingClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => {
              const c = billingClients.find((b) => b.id === e.clientId)!;
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground">{e.date}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell><CategoryBadge cat={e.type} /></TableCell>
                  <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                  <TableCell className="max-w-[320px]">{e.description}</TableCell>
                  <TableCell className="text-right">{e.quantity.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{unitLabel(e.unit)}</TableCell>
                  <TableCell>
                    {e.billed
                      ? <Badge variant="secondary">Billed</Badge>
                      : <Badge variant="outline">Unbilled</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}