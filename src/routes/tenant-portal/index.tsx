import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Warehouse,
  Package,
  FileText,
  CreditCard,
  Upload,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  fetchInventoryItems,
  fetchPallets,
  fetchOrders,
  subscribeInvoices,
  type InventoryItem,
  type Pallet,
  type Order,
} from "@/lib/index";
import type { TenantPortalUser, TenantPortalSession } from "@/lib/tenant-portal";

export const Route = createFileRoute("/tenant-portal/")({
  head: () => ({
    meta: [
      { title: "Tenant Portal � AZUX 3PL WMS Systems" },
      { name: "description", content: "White-labeled self-service portal for tenants." },
    ],
  }),
  component: TenantPortalPage,
});

type Tab = "inventory" | "reports" | "invoices" | "settings";

function TenantPortalPage() {
  const [session, setSession] = useState<TenantPortalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("inventory");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Demo: auto-login first tenant user
  useEffect(() => {
    const demoUser: TenantPortalUser = {
      id: "tp-1",
      tenantId: "acme",
      email: "portal@acme.com",
      name: "Acme Portal User",
      role: "Admin",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSession({ tenantId: demoUser.tenantId, user: demoUser, warehouseId: "atl1" });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      try {
        const [inv, pal, ord] = await Promise.all([
          fetchInventoryItems(session.tenantId, session.warehouseId),
          fetchPallets(session.tenantId, session.warehouseId),
          fetchOrders(session.tenantId, session.warehouseId),
        ]);
        if (!cancelled) {
          setInventory(inv);
          setPallets(pal);
          setOrders(ord);
        }
      } catch (err) {
        console.error("Failed to load tenant data", err);
        toast.error("Failed to load data");
      }
    }
    load();

    const unsubInvoices = subscribeInvoices(
      (allInvoices) => {
        if (!cancelled) {
          const tenantInvoices = allInvoices.filter((inv) => inv.tenantId === session.tenantId);
          setInvoices(tenantInvoices);
        }
      },
      session.tenantId,
    );

    return () => {
      cancelled = true;
      unsubInvoices();
    };
  }, [session]);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    toast.info(`Uploading ${file.name}...`);
    // TODO: implement actual CSV parsing + Firestore write
    setTimeout(() => {
      toast.success(`Uploaded ${file.name} successfully`);
    }, 1000);
  };

  const handleGenerateReport = (reportType: string) => {
    toast.info(`Generating ${reportType}...`);
    setTimeout(() => {
      toast.success("Report generated");
    }, 1000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading portal...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="p-6">
          <CardTitle>Access Denied</CardTitle>
          <p className="text-muted-foreground">Please contact your 3PL administrator.</p>
        </Card>
      </div>
    );
  }

  const totalUnits = inventory.reduce((s, i) => s + i.batches.reduce((b, batch) => b + batch.qty, 0), 0);
  const totalValue = inventory.reduce((s, i) => s + i.batches.reduce((b, batch) => b + batch.qty * i.unitCost, 0), 0);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transition-transform lg:relative lg:translate-x-0`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            <span className="font-semibold">Tenant Portal</span>
          </div>
          <Button variant="ghost" size="sm" className="lg:hidden text-white" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-2">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Workspace</div>
          <div className="text-sm font-medium">{session.user.name}</div>
          <div className="text-xs text-slate-400">{session.user.email}</div>
          <Badge variant="outline" className="text-xs">
            {session.user.role}
          </Badge>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          <Button
            variant={activeTab === "inventory" ? "secondary" : "ghost"}
            className="w-full justify-start text-white hover:text-white"
            onClick={() => { setActiveTab("inventory"); setSidebarOpen(false); }}
          >
            <Package className="h-4 w-4 mr-2" /> Inventory
          </Button>
          <Button
            variant={activeTab === "reports" ? "secondary" : "ghost"}
            className="w-full justify-start text-white hover:text-white"
            onClick={() => { setActiveTab("reports"); setSidebarOpen(false); }}
          >
            <FileText className="h-4 w-4 mr-2" /> Reports
          </Button>
          <Button
            variant={activeTab === "invoices" ? "secondary" : "ghost"}
            className="w-full justify-start text-white hover:text-white"
            onClick={() => { setActiveTab("invoices"); setSidebarOpen(false); }}
          >
            <CreditCard className="h-4 w-4 mr-2" /> Invoices
          </Button>
          <Button
            variant={activeTab === "settings" ? "secondary" : "ghost"}
            className="w-full justify-start text-white hover:text-white"
            onClick={() => { setActiveTab("settings"); setSidebarOpen(false); }}
          >
            <Settings className="h-4 w-4 mr-2" /> Settings
          </Button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <Button variant="ghost" className="w-full justify-start text-white hover:text-white">
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="lg:hidden flex items-center justify-between p-4 border-b">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <span className="font-semibold">Tenant Portal</span>
          <div className="w-8" />
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {session.user.name}</h1>
            <p className="text-muted-foreground">
              {getTenantById(session.tenantId)?.name} � {session.warehouseId?.toUpperCase() || "All Warehouses"}
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">SKUs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{inventory.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Total Units</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalUnits.toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Inventory Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${totalValue.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>CSV Upload</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Upload Type</Label>
                    <select className="w-full p-2 border rounded-md bg-background">
                      <option value="inventory">Inventory</option>
                      <option value="orders">Orders</option>
                      <option value="item_master">Item Master</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Select File</Label>
                    <Input type="file" accept=".csv" onChange={handleCsvUpload} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {inventory.slice(0, 20).map((item) => (
                      <div key={item.sku} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <div className="font-mono text-sm">{item.sku}</div>
                          <div className="text-xs text-muted-foreground">{item.description}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {item.batches.reduce((s, b) => s + b.qty, 0).toLocaleString()} units
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ${(item.batches.reduce((s, b) => s + b.qty * item.unitCost, 0)).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reports" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generate Report</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Report Type</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      onChange={(e) => e.target.value && handleGenerateReport(e.target.value)}
                    >
                      <option value="">Select report type</option>
                      <option value="inventory_summary">Inventory Summary</option>
                      <option value="inventory_valuation">Inventory Valuation</option>
                      <option value="order_history">Order History</option>
                      <option value="shipment_history">Shipment History</option>
                      <option value="billing_summary">Billing Summary</option>
                      <option value="turnover_analysis">Turnover Analysis</option>
                      <option value="aging_report">Aging Report</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Format</Label>
                    <select className="w-full p-2 border rounded-md bg-background">
                      <option value="csv">CSV</option>
                      <option value="xlsx">Excel</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                  <Button className="w-full">Generate Report</Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invoices" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Invoices</CardTitle>
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No invoices found.</p>
                  ) : (
                    <div className="space-y-2">
                      {invoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <div className="font-mono text-sm">{inv.number || inv.id}</div>
                            <div className="text-xs text-muted-foreground">
                              Due: {inv.dueDate} � Status: {inv.status}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">${(inv.lines?.reduce?.((s: number, l: any) => s + (l.total || 0), 0) || 0).toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Portal Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input defaultValue={session.user.name} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input defaultValue={session.user.email} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Warehouse</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={session.warehouseId || ""}
                      onChange={(e) => setSession({ ...session, warehouseId: e.target.value || undefined })}
                    >
                      <option value="all">All Warehouses</option>
                      {getWarehousesForTenant(session.tenantId).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button className="w-full">Save Settings</Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
