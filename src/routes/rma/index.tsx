import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  PackageX,
  Plus,
  Search,
  Download,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Archive,
  Undo2,
  BarChart3,
  DollarSign,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  fetchRmaOrders,
  fetchRmaLines,
  fetchRmaDispositions,
  createRmaOrder,
  updateRmaOrder,
  createRmaDisposition,
  updateRmaLine,
  createReturnProcessingFee,
  fetchReturnProcessingFees,
  type RmaOrder,
  type RmaLine,
  type RmaStatus,
  type DispositionType,
  type ReturnReason,
  type ReturnProcessingFeeType,
  getDefaultDisposition,
  getDispositionLabel,
  getRmaStatusLabel,
  createBillableEvent,
  type AccessorialType,
} from "@/lib/index";

export const Route = createFileRoute("/rma/")({
  head: () => ({
    meta: [
      { title: "Returns Management — AZUX 3PL WMS Systems" },
      { name: "description", content: "RMA, reverse logistics, and disposition workflows." },
    ],
  }),
  component: RmaPage,
});

type Tab = "orders" | "lines" | "disposition" | "fees" | "dashboard";

function RmaPage() {
  const [orders, setOrders] = useState<RmaOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<RmaOrder | null>(null);
  const [lines, setLines] = useState<RmaLine[]>([]);
  const [dispositions, setDispositions] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchRmaOrders();
        if (!cancelled) setOrders(data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load RMA orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedOrder) {
      setLines([]);
      setDispositions([]);
      setFees([]);
      return;
    }
    let cancelled = false;
    async function loadLines() {
      try {
        const [linesData, dispData, feesData] = await Promise.all([
          fetchRmaLines(selectedOrder.id),
          fetchRmaDispositions(selectedOrder.id),
          fetchReturnProcessingFees(selectedOrder.id),
        ]);
        if (!cancelled) {
          setLines(linesData);
          setDispositions(dispData);
          setFees(feesData);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadLines();
    return () => { cancelled = true; };
  }, [selectedOrder]);

  const handleCreateOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const returnReason = formData.get("returnReason") as ReturnReason;
    const order: Omit<RmaOrder, "id" | "createdAt" | "updatedAt"> = {
      tenantId: "acme",
      warehouseId: "atl1",
      rmaNumber: `RMA-${Date.now().toString(36).toUpperCase()}`,
      status: "draft",
      returnReason,
      customerName: formData.get("customerName") as string,
      notes: formData.get("notes") as string,
    };
    try {
      const created = await createRmaOrder(order);
      setOrders((prev) => [created, ...prev]);
      toast.success("RMA order created");
      form.reset();
    } catch (err) {
      console.error(err);
      toast.error("Failed to create RMA order");
    }
  };

  const handleDisposition = async (lineId: string, disposition: DispositionType) => {
    if (!selectedOrder) return;
    try {
      await createRmaDisposition({
        rmaId: selectedOrder.id,
        lineId,
        tenantId: selectedOrder.tenantId,
        dispositionType: disposition,
        status: "in_progress",
        qty: 1,
        notes: `Dispositioned via RMA ${selectedOrder.rmaNumber}`,
      });

      await updateRmaLine(lineId, { disposition, dispositionStatus: "in_progress" });

      const feeTypes: Record<DispositionType, { type: ReturnProcessingFeeType; amount: number; description: string }> = {
        return_to_stock: { type: "restocking", amount: 0.15, description: "Restocking fee (15% of unit cost)" },
        quarantine: { type: "inspection", amount: 5.0, description: "Inspection fee" },
        destroy: { type: "disposal", amount: 2.5, description: "Disposal fee per unit" },
        vendor_return: { type: "vendor_return", amount: 0, description: "Vendor return processing" },
        refurbish: { type: "refurbish", amount: 10.0, description: "Refurbishment labor" },
      };

      const fee = feeTypes[disposition];
      if (fee.amount > 0) {
        const line = lines.find((l) => l.id === lineId);
        const amount = fee.type === "restocking" ? line?.unitCost * fee.amount : fee.amount;
        await createReturnProcessingFee({
          tenantId: selectedOrder.tenantId,
          rmaId: selectedOrder.id,
          lineId,
          feeType: fee.type,
          amount: amount || fee.amount,
          currency: "USD",
          description: fee.description,
          autoBilled: true,
        });

        await createBillableEvent({
          id: `be-${Date.now()}`,
          clientId: selectedOrder.tenantId,
          tenantId: selectedOrder.tenantId,
          warehouseId: selectedOrder.warehouseId,
          date: new Date().toISOString(),
          type: "Custom",
          reference: selectedOrder.rmaNumber,
          description: `RMA ${selectedOrder.rmaNumber}: ${fee.description}`,
          quantity: 1,
          unit: "flat",
          billed: true,
          accessorialType: fee.type.toUpperCase().replace(/\s+/g, "_") as AccessorialType,
        });
      }

      await updateRmaOrder(selectedOrder.id, { status: "dispositioned" });
      setSelectedOrder((prev: RmaOrder | null) => prev ? { ...prev, status: "dispositioned" } : prev);

      const updatedLines = await fetchRmaLines(selectedOrder.id);
      setLines(updatedLines);
      const updatedFees = await fetchReturnProcessingFees(selectedOrder.id);
      setFees(updatedFees);

      toast.success(`Disposition set to ${getDispositionLabel(disposition)}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update disposition");
    }
  };

  const filteredOrders = orders.filter((o) =>
    o.rmaNumber.toLowerCase().includes(search.toLowerCase()) ||
    o.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: RmaStatus) => {
    const variants: Record<RmaStatus, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      submitted: "secondary",
      received: "default",
      inspected: "default",
      dispositioned: "default",
      closed: "outline",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{getRmaStatusLabel(status)}</Badge>;
  };

  const openOrders = orders.filter((o) => !["closed", "cancelled"].includes(o.status)).length;
  const totalReturnValue = lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0);
  const avgProcessingTime = orders.length > 0
    ? Math.round(orders.reduce((s, o) => {
        const diff = new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime();
        return s + diff / (1000 * 60 * 60 * 24);
      }, 0) / orders.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading RMA...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns Management (RMA)</h1>
          <p className="text-muted-foreground">Process reverse logistics and disposition workflows.</p>
        </div>
        <Button onClick={() => setActiveTab("orders")}>
          <Plus className="h-4 w-4 mr-2" /> New RMA
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="lines" disabled={!selectedOrder}>Lines</TabsTrigger>
          <TabsTrigger value="disposition" disabled={!selectedOrder}>Disposition</TabsTrigger>
          <TabsTrigger value="fees" disabled={!selectedOrder}>Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open RMAs</CardTitle>
                <PackageX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{openOrders}</div>
                <p className="text-xs text-muted-foreground">Active returns</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Return Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalReturnValue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Across all lines</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgProcessingTime.toFixed(1)}</div>
                <p className="text-xs text-muted-foreground">Days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{orders.length}</div>
                <p className="text-xs text-muted-foreground">All time</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent RMA Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredOrders.slice(0, 10).map((order) => (
                  <div
                    key={order.id}
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 ${
                      selectedOrder?.id === order.id ? "border-primary" : ""
                    }`}
                    onClick={() => { setSelectedOrder(order); setActiveTab("lines"); }}
                  >
                    <div>
                      <div className="font-mono text-sm">{order.rmaNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.customerName} — {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create RMA Order</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateOrder} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input name="customerName" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Return Reason</Label>
                    <Select name="returnReason" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer_return">Customer Return</SelectItem>
                        <SelectItem value="damaged">Damaged</SelectItem>
                        <SelectItem value="defective">Defective</SelectItem>
                        <SelectItem value="over_shipment">Over Shipment</SelectItem>
                        <SelectItem value="wrong_item">Wrong Item</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="recall">Recall</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input name="notes" />
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Create RMA
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>RMA Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 ${
                      selectedOrder?.id === order.id ? "border-primary" : ""
                    }`}
                    onClick={() => { setSelectedOrder(order); setActiveTab("lines"); }}
                  >
                    <div>
                      <div className="font-mono text-sm">{order.rmaNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.customerName} — {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lines" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Return Lines — {selectedOrder?.rmaNumber}</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-muted-foreground text-sm">No return lines yet.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div>
                        <div className="font-mono text-sm">{line.sku}</div>
                        <div className="text-xs text-muted-foreground">{line.description}</div>
                        <div className="text-xs text-muted-foreground">
                          Expected: {line.qtyExpected} — Received: {line.qtyReceived}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">${(line.qtyReceived * line.unitCost).toLocaleString()}</div>
                        {line.disposition && (
                          <Badge variant="secondary" className="text-xs mt-1">
                            {getDispositionLabel(line.disposition)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disposition" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Disposition Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.length === 0 ? (
                <p className="text-muted-foreground text-sm">No lines to disposition.</p>
              ) : (
                lines.map((line) => {
                  const defaultDisposition = getDefaultDisposition(selectedOrder?.returnReason || "customer_return");
                  return (
                    <div key={line.id} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div>
                        <div className="font-mono text-sm">{line.sku}</div>
                        <div className="text-xs text-muted-foreground">{line.description}</div>
                        {line.dispositionNotes && (
                          <div className="text-xs text-muted-foreground mt-1">{line.dispositionNotes}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={line.disposition || defaultDisposition}
                          onValueChange={(v) => handleDisposition(line.id, v as DispositionType)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="return_to_stock">Return to Stock</SelectItem>
                            <SelectItem value="quarantine">Quarantine</SelectItem>
                            <SelectItem value="destroy">Destroy</SelectItem>
                            <SelectItem value="vendor_return">Vendor Return</SelectItem>
                            <SelectItem value="refurbish">Refurbish</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Return Processing Fees</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Auto-billing for return processing fees is enabled.</p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between py-2 border-b">
                  <div>
                    <div className="text-sm font-medium">Restocking Fee</div>
                    <div className="text-xs text-muted-foreground">15% of unit cost</div>
                  </div>
                  <div className="text-sm font-medium">Auto-billed</div>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div>
                    <div className="text-sm font-medium">Inspection Fee</div>
                    <div className="text-xs text-muted-foreground">$5.00 per line</div>
                  </div>
                  <div className="text-sm font-medium">Auto-billed</div>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div>
                    <div className="text-sm font-medium">Disposal Fee</div>
                    <div className="text-xs text-muted-foreground">$2.50 per unit</div>
                  </div>
                  <div className="text-sm font-medium">Auto-billed</div>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div>
                    <div className="text-sm font-medium">Refurbish Fee</div>
                    <div className="text-xs text-muted-foreground">$10.00 per unit</div>
                  </div>
                  <div className="text-sm font-medium">Auto-billed</div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium">Vendor Return</div>
                    <div className="text-xs text-muted-foreground">No charge</div>
                  </div>
                  <div className="text-sm font-medium">Auto-billed</div>
                </div>
              </div>

              {fees.length > 0 && (
                <div className="mt-6 space-y-2">
                  <div className="text-sm font-medium">Generated Fees for {selectedOrder?.rmaNumber}</div>
                  {fees.map((fee) => (
                    <div key={fee.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <div className="text-sm">{fee.feeType}</div>
                        <div className="text-xs text-muted-foreground">{fee.description}</div>
                      </div>
                      <div className="text-sm font-medium">${fee.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
