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
  Download,
  BarChart3,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  type Unsubscribe,
  onSnapshot,
} from "firebase/firestore";
import {
  fetchInventoryItems,
  fetchPallets,
  fetchOrders,
  subscribeInvoices,
  fetchTenantPortalUsers,
  createTenantPortalUser,
  updateTenantPortalUser,
  deleteTenantPortalUser,
  fetchTenantPortalCsvUploads,
  createTenantPortalCsvUpload,
  updateTenantPortalCsvUpload,
  fetchTenantPortalReports,
  createTenantPortalReport,
  type InventoryItem,
  type Pallet,
  type Order,
  type TenantPortalUser,
  type TenantPortalSession,
  type TenantPortalCsvUpload,
  type TenantPortalReport,
  type ReportType,
  type ReportFormat,
  type CsvUploadType,
  getTenantById,
  getWarehousesForTenant,
} from "@/lib/index";

export const Route = createFileRoute("/tenant-portal/")({
  head: () => ({
    meta: [
      { title: "Tenant Portal — AZUX 3PL WMS Systems" },
      { name: "description", content: "White-labeled self-service portal for tenants." },
    ],
  }),
  component: TenantPortalPage,
});

type Tab = "inventory" | "reports" | "invoices" | "settings" | "users" | "uploads";

function TenantPortalPage() {
  const [session, setSession] = useState<TenantPortalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [portalUsers, setPortalUsers] = useState<TenantPortalUser[]>([]);
  const [csvUploads, setCsvUploads] = useState<TenantPortalCsvUpload[]>([]);
  const [reports, setReports] = useState<TenantPortalReport[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("inventory");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [uploadType, setUploadType] = useState<CsvUploadType>("inventory");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [reportType, setReportType] = useState<ReportType>("inventory_summary");
  const [reportFormat, setReportFormat] = useState<ReportFormat>("csv");
  const [generatingReport, setGeneratingReport] = useState(false);

  const [whiteLabel, setWhiteLabel] = useState({
    portalName: "",
    logoUrl: "",
    primaryColor: "#0f172a",
  });

  const [newUser, setNewUser] = useState({ name: "", email: "", role: "Viewer" as TenantPortalUser["role"] });

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
    setWhiteLabel({
      portalName: getTenantById(demoUser.tenantId)?.name || "Tenant Portal",
      logoUrl: "",
      primaryColor: "#0f172a",
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const currentTenantId = session.tenantId;

    async function loadTenantConfig() {
      try {
        const configSnap = await getDoc(doc(db, "tenantConfigs", currentTenantId));
        if (!cancelled && configSnap.exists()) {
          const data = configSnap.data();
          setWhiteLabel({
            portalName: data.portalName || getTenantById(currentTenantId)?.name || "Tenant Portal",
            logoUrl: data.logoUrl || "",
            primaryColor: data.primaryColor || "#0f172a",
          });
        }
      } catch (err) {
        console.error("Failed to load tenant config:", err);
      }
    }

    loadTenantConfig();
    return () => { cancelled = true; };
  }, [session]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    try {
      await setDoc(doc(db, "tenantConfigs", session.tenantId), {
        tenantId: session.tenantId,
        portalName: whiteLabel.portalName,
        logoUrl: whiteLabel.logoUrl,
        primaryColor: whiteLabel.primaryColor,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      toast.success("Settings saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings");
    }
  };

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const currentTenantId = session.tenantId;

    async function load() {
      try {
        const [inv, pal, ord] = await Promise.all([
          fetchInventoryItems(currentTenantId, session!.warehouseId || "all"),
          fetchPallets(currentTenantId, session!.warehouseId || "all"),
          fetchOrders(currentTenantId, session!.warehouseId || "all"),
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

      try {
        const [users, uploads, reps] = await Promise.all([
          fetchTenantPortalUsers(currentTenantId),
          fetchTenantPortalCsvUploads(currentTenantId),
          fetchTenantPortalReports(currentTenantId),
        ]);
        if (!cancelled) {
          setPortalUsers(users);
          setCsvUploads(uploads);
          setReports(reps);
        }
      } catch (err) {
        console.error("Failed to load portal metadata", err);
      }
    }

    load();

    const unsubInvoices = subscribeInvoices((allInvoices) => {
      if (!cancelled) {
        const tenantInvoices = allInvoices.filter((inv) => inv.tenantId === currentTenantId);
        setInvoices(tenantInvoices);
      }
    });

    return () => {
      cancelled = true;
      unsubInvoices();
    };
  }, [session]);

  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !session) return;

    setUploading(true);
    try {
      const uploadRecord = await createTenantPortalCsvUpload({
        tenantId: session.tenantId,
        uploadType,
        fileName: uploadFile.name,
        status: "processing",
        uploadedBy: session.user.email,
        rowCount: 0,
        successCount: 0,
        errorCount: 0,
      });

      const text = await uploadFile.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 3) {
          errorCount++;
          errors.push(`Row ${i}: insufficient columns`);
          continue;
        }
        successCount++;
      }

      await updateTenantPortalCsvUpload(uploadRecord.id, {
        status: "completed",
        rowCount: lines.length - 1,
        successCount,
        errorCount,
        errors: errors.slice(0, 50),
        processedAt: new Date().toISOString(),
      });

      const updatedUploads = await fetchTenantPortalCsvUploads(session.tenantId);
      setCsvUploads(updatedUploads);
      toast.success(`Uploaded ${uploadFile.name} — ${successCount} rows processed`);
      setUploadFile(null);
    } catch (err) {
      console.error(err);
      toast.error("CSV upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setGeneratingReport(true);
    try {
      let fileUrl = "";
      let content = "";

      if (reportType === "inventory_summary") {
        content = inventory.map((item) => `${item.sku},"${item.description}",${item.batches.reduce((s, b) => s + b.qty, 0)},${item.unitCost}`).join("\n");
        fileUrl = `data:text/csv;charset=utf-8,${encodeURIComponent("SKU,Description,Qty,UnitCost\n" + content)}`;
      } else if (reportType === "inventory_valuation") {
        content = inventory.map((item) => `${item.sku},"${item.description}",${item.batches.reduce((s, b) => s + b.qty, 0)},${item.unitCost},${item.batches.reduce((s, b) => s + b.qty * item.unitCost, 0)}`).join("\n");
        fileUrl = `data:text/csv;charset=utf-8,${encodeURIComponent("SKU,Description,Qty,UnitCost,TotalValue\n" + content)}`;
      } else if (reportType === "order_history") {
        content = orders.map((o) => `${o.id},"${o.status}",${o.lines?.length || 0}`).join("\n");
        fileUrl = `data:text/csv;charset=utf-8,${encodeURIComponent("OrderId,Status,LineCount\n" + content)}`;
      } else {
        content = "Report type not yet implemented";
        fileUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
      }

      await createTenantPortalReport({
        tenantId: session.tenantId,
        name: `${reportType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())} Report`,
        reportType,
        filters: { warehouseId: session.warehouseId },
        generatedBy: session.user.email,
        fileUrl,
        format: reportFormat,
      });

      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();

      toast.success("Report generated and downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Report generation failed");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !newUser.email || !newUser.name) return;

    try {
      await createTenantPortalUser({
        tenantId: session.tenantId,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        active: true,
      });
      setPortalUsers((prev) => [...prev, {
        id: `tp-${Date.now()}`,
        tenantId: session.tenantId,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]);
      setNewUser({ name: "", email: "", role: "Viewer" });
      toast.success("User added");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add user");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteTenantPortalUser(userId);
      setPortalUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("User removed");
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove user");
    }
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

  const tenantName = getTenantById(session.tenantId)?.name || "Tenant";
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
            <span className="font-semibold">{whiteLabel.portalName || "Tenant Portal"}</span>
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
            variant={activeTab === "users" ? "secondary" : "ghost"}
            className="w-full justify-start text-white hover:text-white"
            onClick={() => { setActiveTab("users"); setSidebarOpen(false); }}
          >
            <Users className="h-4 w-4 mr-2" /> Users
          </Button>
          <Button
            variant={activeTab === "uploads" ? "secondary" : "ghost"}
            className="w-full justify-start text-white hover:text-white"
            onClick={() => { setActiveTab("uploads"); setSidebarOpen(false); }}
          >
            <Upload className="h-4 w-4 mr-2" /> Uploads
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
          <span className="font-semibold">{whiteLabel.portalName || "Tenant Portal"}</span>
          <div className="w-8" />
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {session.user.name}</h1>
            <p className="text-muted-foreground">
              {tenantName} — {session.warehouseId?.toUpperCase() || "All Warehouses"}
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="uploads">Uploads</TabsTrigger>
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
                  <form onSubmit={handleCsvUpload} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Upload Type</Label>
                      <select
                        className="w-full p-2 border rounded-md bg-background"
                        value={uploadType}
                        onChange={(e) => setUploadType(e.target.value as CsvUploadType)}
                      >
                        <option value="inventory">Inventory</option>
                        <option value="orders">Orders</option>
                        <option value="item_master">Item Master</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Select File</Label>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={!uploadFile || uploading}>
                      {uploading ? "Uploading..." : "Upload CSV"}
                    </Button>
                  </form>
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
                <CardContent>
                  <form onSubmit={handleGenerateReport} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Report Type</Label>
                      <select
                        className="w-full p-2 border rounded-md bg-background"
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value as ReportType)}
                      >
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
                      <select
                        className="w-full p-2 border rounded-md bg-background"
                        value={reportFormat}
                        onChange={(e) => setReportFormat(e.target.value as ReportFormat)}
                      >
                        <option value="csv">CSV</option>
                        <option value="xlsx">Excel</option>
                        <option value="pdf">PDF</option>
                      </select>
                    </div>
                    <Button type="submit" className="w-full" disabled={generatingReport}>
                      {generatingReport ? "Generating..." : "Generate Report"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {reports.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Reports</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {reports.slice(0, 10).map((report) => (
                        <div key={report.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <div className="text-sm font-medium">{report.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(report.generatedAt).toLocaleDateString()} — {report.format.toUpperCase()}
                            </div>
                          </div>
                          {report.fileUrl && (
                            <a href={report.fileUrl} download className="text-xs text-primary hover:underline">
                              Download
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
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
                              Due: {inv.dueDate} — Status: {inv.status}
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

            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Portal Users</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleAddUser} className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <select
                        className="w-full p-2 border rounded-md bg-background"
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value as TenantPortalUser["role"] })}
                      >
                        <option value="Admin">Admin</option>
                        <option value="Viewer">Viewer</option>
                        <option value="Reports">Reports</option>
                      </select>
                    </div>
                    <Button type="submit" className="self-end">Add User</Button>
                  </form>

                  <div className="space-y-2">
                    {portalUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <div className="text-sm font-medium">{user.name}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{user.role}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="uploads" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Upload History</CardTitle>
                </CardHeader>
                <CardContent>
                  {csvUploads.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No uploads yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {csvUploads.map((upload) => (
                        <div key={upload.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <div className="text-sm font-medium">{upload.fileName}</div>
                            <div className="text-xs text-muted-foreground">
                              {upload.uploadType} — {new Date(upload.uploadedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={upload.status === "completed" ? "default" : "secondary"}>
                              {upload.status}
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              {upload.successCount || 0} rows
                            </div>
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
                <CardContent>
                  <form onSubmit={handleSaveSettings} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Portal Name</Label>
                      <Input
                        value={whiteLabel.portalName}
                        onChange={(e) => setWhiteLabel({ ...whiteLabel, portalName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Logo URL</Label>
                      <Input
                        value={whiteLabel.logoUrl}
                        onChange={(e) => setWhiteLabel({ ...whiteLabel, logoUrl: e.target.value })}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Primary Color</Label>
                      <Input
                        type="color"
                        value={whiteLabel.primaryColor}
                        onChange={(e) => setWhiteLabel({ ...whiteLabel, primaryColor: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="w-full">Save Settings</Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
