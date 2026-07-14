import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  PackageX,
  Plus,
  Search,
  Filter,
  Download,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Archive,
  Undo2,
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
  createRmaOrder,
  updateRmaOrder,
  type RmaOrder,
  type RmaLine,
  type RmaStatus,
  type DispositionType,
  type ReturnReason,
  getDefaultDisposition,
  getDispositionLabel,
  getRmaStatusLabel,
} from "@/lib/index";

export const Route = createFileRoute("/rma/")({
  head: () => ({
    meta: [
      { title: "Returns Management � AZUX 3PL WMS Systems" },
      { name: "description", content: "RMA, reverse logistics, and disposition workflows." },
    ],
  }),
  component: RmaPage,
});

type Tab = "orders" | "lines" | "disposition" | "fees";

function RmaPage() {
  const [orders, setOrders] = useState<RmaOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<RmaOrder | null>(null);
  const [lines, setLines] = useState<RmaLine[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
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
      return;
    }
    let cancelled = false;
    async function loadLines() {
      try {
        const data = await fetchRmaLines(selectedOrder.id);
        if (!cancelled) setLines(data);
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
      await updateRmaOrder(selectedOrder.id, { status: "dispositioned" });
      setSelectedOrder((prev) => prev ? { ...prev, status: "dispositioned" } : null);
      toast.success("Disposition updated");
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
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="lines" disabled={!selectedOrder}>Lines</TabsTrigger>
          <TabsTrigger value="disposition" disabled={!selectedOrder}>Disposition</TabsTrigger>
          <TabsTrigger value="fees" disabled={!selectedOrder}>Fees</TabsTrigger>
        </TabsList>

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
                        {order.customerName} � {new Date(order.createdAt).toLocaleDateString()}
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
              <CardTitle>Return Lines � {selectedOrder?.rmaNumber}</CardTitle>
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
                          Expected: {line.qtyExpected} � Received: {line.qtyReceived}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">${(line.qtyReceived * line.unitCost).toLocaleString()}</div>
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
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium">Disposal Fee</div>
                    <div className="text-xs text-muted-foreground">$2.50 per unit</div>
                  </div>
                  <div className="text-sm font-medium">Auto-billed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
