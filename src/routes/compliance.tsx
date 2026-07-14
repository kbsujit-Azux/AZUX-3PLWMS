import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Shield,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ClipboardList,
  Ban,
  Package,
  Thermometer,
  FlaskConical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import {
  fetchExpiringLots,
  fetchExpiringDocuments,
  subscribeSerialInventory,
  subscribeComplianceDocuments,
  subscribeRecalls,
  subscribeQuarantineOrders,
  updateSerialInventoryStatus,
  createRecall,
  updateRecall,
  createQuarantineOrder,
  releaseQuarantineOrder,
  appendComplianceLog,
  type SerialInventoryRecord,
  type ComplianceDocument,
  type Recall,
  type QuarantineOrder,
} from "@/lib/index";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance & Governance — AZUX 3PL WMS Systems" },
      { name: "description", content: "Regulatory compliance dashboard for serialized inventory, recalls, quarantine, and documents." },
    ],
  }),
  component: CompliancePage,
});

type Tab = "expiry" | "documents" | "recalls" | "quarantine";

function CompliancePage() {
  const [activeTab, setActiveTab] = useState<Tab>("expiry");
  const [expiringLots, setExpiringLots] = useState<SerialInventoryRecord[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<ComplianceDocument[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [quarantineOrders, setQuarantineOrders] = useState<QuarantineOrder[]>([]);
  const [serialInventory, setSerialInventory] = useState<SerialInventoryRecord[]>([]);
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [recallForm, setRecallForm] = useState({ title: "", description: "", skus: "", severity: "medium" as Recall["severity"] });
  const [quarantineForm, setQuarantineForm] = useState({ serialIds: "", reason: "" });

  useEffect(() => {
    setLoading(true);
    let cancelled = false;

    const load = async () => {
      try {
        const [lots, docs] = await Promise.all([
          fetchExpiringLots("tenant-1", 90),
          fetchExpiringDocuments("tenant-1", 90),
        ]);
        if (cancelled) return;
        setExpiringLots(lots);
        setExpiringDocs(docs);
      } catch (err) {
        console.error("Failed to load compliance data", err);
        toast.error("Failed to load compliance data");
      }
    };
    load();

    const unsubLots = subscribeSerialInventory((records) => {
      if (!cancelled) setSerialInventory(records);
    }, { tenantId: "tenant-1" });

    const unsubDocs = subscribeComplianceDocuments((docs) => {
      if (!cancelled) setDocuments(docs);
    }, { tenantId: "tenant-1" });

    const unsubRecalls = subscribeRecalls((recalls) => {
      if (!cancelled) setRecalls(recalls);
    }, { tenantId: "tenant-1" });

    const unsubQuarantine = subscribeQuarantineOrders((orders) => {
      if (!cancelled) setQuarantineOrders(orders);
    }, { tenantId: "tenant-1" });

    return () => {
      cancelled = true;
      unsubLots();
      unsubDocs();
      unsubRecalls();
      unsubQuarantine();
    };
  }, []);

  useEffect(() => {
    if (serialInventory.length > 0 || documents.length > 0 || recalls.length > 0 || quarantineOrders.length > 0) {
      setLoading(false);
    }
  }, [serialInventory, documents, recalls, quarantineOrders]);

  const activeQuarantine = useMemo(() => quarantineOrders.filter((q) => q.status === "active"), [quarantineOrders]);
  const activeRecalls = useMemo(() => recalls.filter((r) => r.status === "active"), [recalls]);

  const handleQuarantine = async () => {
    if (!quarantineForm.serialIds.trim() || !quarantineForm.reason.trim()) {
      toast.error("Serial IDs and reason are required");
      return;
    }
    const ids = quarantineForm.serialIds.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const order = await createQuarantineOrder({
        id: `qo-${Date.now()}`,
        tenantId: "tenant-1",
        serialInventoryIds: ids,
        reason: quarantineForm.reason,
        issuedBy: "current-user",
        issuedAt: new Date().toISOString(),
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await appendComplianceLog({
        id: `log-${Date.now()}`,
        tenantId: "tenant-1",
        timestamp: new Date().toISOString(),
        actor: "current-user",
        action: "serial_status_changed",
        entityType: "serial_inventory",
        entityId: order.id,
        afterState: { status: "quarantined", reason: quarantineForm.reason },
      });
      toast.success("Quarantine order created");
      setQuarantineForm({ serialIds: "", reason: "" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to create quarantine order");
    }
  };

  const handleReleaseQuarantine = async (orderId: string) => {
    try {
      await releaseQuarantineOrder(orderId);
      await appendComplianceLog({
        id: `log-${Date.now()}`,
        tenantId: "tenant-1",
        timestamp: new Date().toISOString(),
        actor: "current-user",
        action: "serial_status_changed",
        entityType: "serial_inventory",
        entityId: orderId,
        afterState: { status: "released" },
      });
      toast.success("Quarantine order released");
    } catch (err) {
      console.error(err);
      toast.error("Failed to release quarantine order");
    }
  };

  const handleCreateRecall = async () => {
    if (!recallForm.title.trim() || !recallForm.description.trim() || !recallForm.skus.trim()) {
      toast.error("Title, description, and SKUs are required");
      return;
    }
    const skus = recallForm.skus.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await createRecall({
        id: `recall-${Date.now()}`,
        tenantId: "tenant-1",
        recallNumber: `RCL-${Date.now()}`,
        title: recallForm.title,
        description: recallForm.description,
        skus,
        status: "active",
        severity: recallForm.severity,
        issuedAt: new Date().toISOString(),
        createdBy: "current-user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success("Recall created");
      setRecallForm({ title: "", description: "", skus: "", severity: "medium" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to create recall");
    }
  };

  const handleResolveRecall = async (recallId: string) => {
    try {
      await updateRecall(recallId, { status: "resolved", resolvedAt: new Date().toISOString() });
      toast.success("Recall resolved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to resolve recall");
    }
  };

  const getSeverityBadge = (severity: string) => {
    const map: Record<string, string> = {
      low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
      medium: "bg-amber-500/20 text-amber-400 border-amber-500/40",
      high: "bg-orange-500/20 text-orange-400 border-orange-500/40",
      critical: "bg-red-500/20 text-red-400 border-red-500/40",
    };
    return map[severity] || map.medium;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance & Governance</h1>
          <p className="text-muted-foreground">
            Regulatory compliance, recalls, quarantine, and document management
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {activeRecalls.length} Active Recalls
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Ban className="h-3 w-3" />
            {activeQuarantine.length} Quarantined
          </Badge>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        <Button variant={activeTab === "expiry" ? "default" : "ghost"} onClick={() => setActiveTab("expiry")}>
          <Thermometer className="h-4 w-4 mr-2" />
          Expiry Alerts
        </Button>
        <Button variant={activeTab === "documents" ? "default" : "ghost"} onClick={() => setActiveTab("documents")}>
          <FileText className="h-4 w-4 mr-2" />
          Documents
        </Button>
        <Button variant={activeTab === "recalls" ? "default" : "ghost"} onClick={() => setActiveTab("recalls")}>
          <Shield className="h-4 w-4 mr-2" />
          Recalls
        </Button>
        <Button variant={activeTab === "quarantine" ? "default" : "ghost"} onClick={() => setActiveTab("quarantine")}>
          <Ban className="h-4 w-4 mr-2" />
          Quarantine
        </Button>
      </div>

      {activeTab === "expiry" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="h-5 w-5" />
                Expiring Lots & Inventory
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial / Lot</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringLots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No expiring lots in the next 90 days
                      </TableCell>
                    </TableRow>
                  ) : (
                    expiringLots.map((lot) => (
                      <TableRow key={lot.id}>
                        <TableCell className="font-mono text-xs">{lot.id}</TableCell>
                        <TableCell>{lot.sku}</TableCell>
                        <TableCell>{lot.locationId}</TableCell>
                        <TableCell>{lot.expiryDate}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <FlaskConical className="h-3 w-3" />
                            {lot.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await updateSerialInventoryStatus(lot.id, "quarantined");
                              toast.success("Lot quarantined");
                            }}
                          >
                            Quarantine
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Compliance Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Issuer</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No compliance documents found
                      </TableCell>
                    </TableRow>
                  ) : (
                    documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.documentType.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>{doc.issuer}</TableCell>
                        <TableCell>{doc.issuedAt}</TableCell>
                        <TableCell>{doc.expiresAt || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            {doc.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {doc.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "recalls" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Active Recalls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Recall Title</Label>
                  <Input
                    value={recallForm.title}
                    onChange={(e) => setRecallForm({ ...recallForm, title: e.target.value })}
                    placeholder="e.g., Voluntary recall of ACM-TENT-2P-OLV"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={recallForm.severity} onValueChange={(v: any) => setRecallForm({ ...recallForm, severity: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={recallForm.description}
                  onChange={(e) => setRecallForm({ ...recallForm, description: e.target.value })}
                  placeholder="Reason for recall..."
                />
              </div>
              <div className="space-y-2">
                <Label>SKUs (comma-separated)</Label>
                <Input
                  value={recallForm.skus}
                  onChange={(e) => setRecallForm({ ...recallForm, skus: e.target.value })}
                  placeholder="ACM-TENT-2P-OLV, HLE-EARB-PRO"
                />
              </div>
              <Button onClick={handleCreateRecall} className="w-full">
                <Shield className="h-4 w-4 mr-2" />
                Create Recall
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recall Register</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recall #</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>SKUs</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recalls.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No recalls found
                      </TableCell>
                    </TableRow>
                  ) : (
                    recalls.map((recall) => (
                      <TableRow key={recall.id}>
                        <TableCell className="font-mono text-xs">{recall.recallNumber}</TableCell>
                        <TableCell className="font-medium">{recall.title}</TableCell>
                        <TableCell>
                          <Badge className={getSeverityBadge(recall.severity)}>{recall.severity}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{recall.skus.join(", ")}</TableCell>
                        <TableCell>{recall.issuedAt}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{recall.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {recall.status === "active" && (
                            <Button size="sm" variant="outline" onClick={() => handleResolveRecall(recall.id)}>
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "quarantine" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                Create Quarantine Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Serial Inventory IDs (comma-separated)</Label>
                <Input
                  value={quarantineForm.serialIds}
                  onChange={(e) => setQuarantineForm({ ...quarantineForm, serialIds: e.target.value })}
                  placeholder="si-001, si-002, si-003"
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input
                  value={quarantineForm.reason}
                  onChange={(e) => setQuarantineForm({ ...quarantineForm, reason: e.target.value })}
                  placeholder="e.g., Failed quality inspection"
                />
              </div>
              <Button onClick={handleQuarantine} className="w-full">
                <Ban className="h-4 w-4 mr-2" />
                Create Quarantine Order
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quarantine Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Serial IDs</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quarantineOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No quarantine orders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    quarantineOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">{order.id}</TableCell>
                        <TableCell className="text-xs">{order.serialInventoryIds.join(", ")}</TableCell>
                        <TableCell>{order.reason}</TableCell>
                        <TableCell>{order.issuedAt}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.status === "active" && (
                            <Button size="sm" variant="outline" onClick={() => handleReleaseQuarantine(order.id)}>
                              Release
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
