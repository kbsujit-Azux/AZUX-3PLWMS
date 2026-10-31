import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Upload,
  Database,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Package,
  Plus,
  Trash2,
  Pencil,
  ShieldCheck,
  RefreshCw,
  FileText,
  Download,
  Users,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CsvUploader } from "@/components/csv-uploader";
import Papa from "papaparse";
import {
  ITEM_MASTER_CSV_FIELDS,
  ITEM_MASTER_CSV_HEADERS,
  parseItemMasterCsv,
} from "@/lib/item-master-csv";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { tenants, warehouses } from "@/lib/mock-data";
import {
  locationMaster as staticLocationMaster,
  collectMasterExceptions,
  locationOccupancyPct,
  hasInventoryForSku,
  nmfcFor,
  type ItemMasterRecord,
  type LocationRecord,
  type LocationType,
  type PalletBuildConfig,
  type VelocityClassification,
  type ApparelAttributes,
  type SlottingRules,
  type VelocityMetrics,
  type ZoneAdjacency,
} from "@/lib/master-data";
import { fmtDateYear } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  deleteInventoryBatch,
  rebuildLocationMasterFromInventory,
  fetchTransactionHistory,
  type InventoryTransaction,
  addItemToMaster,
  deleteItemFromMaster,
  updateItemInMaster,
  addLocationToMaster,
  deleteLocationFromMaster,
  updateLocationInMaster,
  repairIntegrityIssue,
  subscribeTransactionHistory,
} from "@/lib/firestore-data";
import { checkDataIntegrity } from "@/lib/data-integrity";

export const Route = createFileRoute("/masters")({
  head: () => ({
    meta: [
      { title: "Masters — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Item Master (EDI 832) and Warehouse Location Master with pickability rules and inbound/order cross-checks.",
      },
    ],
  }),
  component: MastersPage,
});

const typeStyles: Record<LocationType, string> = {
  FLR: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  DROP: "bg-primary/15 text-primary border-primary/30",
  RACK: "bg-chart-2/15 text-chart-2 border-chart-2/30",
};

const DEFAULT_PALLET_BUILD: PalletBuildConfig = {
  maxPalletHeightIn: 60,
  maxPalletWeightLbs: 2500,
  stackability: "full",
  palletPattern: "interlock",
  allowMixedSku: false,
  palletType: "standard_48x40",
};

const DEFAULT_VELOCITY: VelocityClassification = {
  abcClass: "B",
  annualPicks: 500,
  linesPerOrder: 3,
  storageClass: "reserve",
};

const DEFAULT_SLOTTING: SlottingRules = {
  allowedStorageClasses: ["forward", "reserve", "bulk"],
  putawayPriority: 50,
  replenPriority: 50,
  allowedPalletTypes: ["standard_48x40"],
};

const DEFAULT_VELOCITY_METRICS: VelocityMetrics = {
  picksPerDay: 0,
  linesPerDay: 0,
  cubicVelocity: 0,
  lastCalculated: new Date().toISOString(),
  manualOverride: false,
};

const DEFAULT_ZONE_ADJACENCY: ZoneAdjacency = {
  adjacent: [],
  toShippingDockSec: 300,
  toReceivingDockSec: 300,
};

function MastersPage() {
  const mastersMatch = useMatch({ from: "/masters" });
  const warehousesMatch = useMatch({ from: "/masters/warehouses", shouldThrow: false });
  const employeesMatch = useMatch({ from: "/masters/employees", shouldThrow: false });
  const isExactMasters = !!mastersMatch && !warehousesMatch && !employeesMatch;
  const { tenantId, warehouseId } = useWorkspace();
  const {
    itemMaster: liveItemMaster,
    locationMaster: liveLocationMaster,
    refreshData,
    pallets: livePallets,
    inboundShipments: liveInboundShipments,
    workOrders: liveWorkOrders,
    inventoryItems: liveInventoryItems,
    cartonizations: liveCartonizations,
    orders: liveOrders,
    tenants: liveTenants,
    warehouses: liveWarehouses,
  } = useWmsData();

  /** The audit trail, used by the correlation checks */
  const [liveTransactions, setLiveTransactions] = useState<any[]>([]);
  useEffect(() => {
    const unsub = subscribeTransactionHistory((txns) => setLiveTransactions(txns));
    return unsub;
  }, []);
  const [itemQuery, setItemQuery] = useState("");
  const [locQuery, setLocQuery] = useState("");
  const [locWarehouseFilter, setLocWarehouseFilter] = useState("all");
  const [csv832Open, setCsv832Open] = useState(false);
  const [csvLocOpen, setCsvLocOpen] = useState(false);
  const [tab, setTab] = useState<string>("items");
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    prefill?: Partial<ItemMasterRecord>;
  }>({ open: false });
  const [editItem, setEditItem] = useState<ItemMasterRecord | null>(null);
  const [editLoc, setEditLoc] = useState<LocationRecord | null>(null);
  const [toDeleteItem, setToDeleteItem] = useState<ItemMasterRecord | null>(null);
  const [toDeleteLoc, setToDeleteLoc] = useState<LocationRecord | null>(null);
  const [, force] = useState(0);

  // Admin cleanup state
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [adminSku, setAdminSku] = useState("");
  const [adminPalletId, setAdminPalletId] = useState("");
  const [adminLocation, setAdminLocation] = useState("");
  const [adminDeleteResult, setAdminDeleteResult] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<string | null>(null);
  const [repairingIssue, setRepairingIssue] = useState<string | null>(null);

  /**
   * Data integrity / correlation issues across master + transactional data.
   * Everything is derived from the live Firestore subscription — there is no
   * in-memory fallback, so a clean database really means a clean screen.
   */
  const integrityIssues = useMemo(
    () =>
      checkDataIntegrity({
        pallets: livePallets ?? [],
        inboundShipments: liveInboundShipments ?? [],
        workOrders: liveWorkOrders ?? [],
        inventoryItems: liveInventoryItems ?? [],
        cartonizations: liveCartonizations ?? [],
        orders: liveOrders ?? [],
        transactions: liveTransactions ?? [],
        itemMaster: liveItemMaster ?? [],
        locationMaster: liveLocationMaster ?? [],
        tenants: liveTenants ?? [],
        warehouses: liveWarehouses ?? [],
      }),
    [
      livePallets,
      liveInboundShipments,
      liveWorkOrders,
      liveInventoryItems,
      liveCartonizations,
      liveOrders,
      liveTransactions,
      liveItemMaster,
      liveLocationMaster,
      liveTenants,
      liveWarehouses,
    ],
  );

  const integrityErrors = integrityIssues.filter((i) => i.severity === "error");
  const integrityWarnings = integrityIssues.filter((i) => i.severity === "warning");

  /** Apply a repair and refresh the live data. */
  const handleRepair = async (issue: (typeof integrityIssues)[number]) => {
    setRepairingIssue(issue.id);
    try {
      const result = await repairIntegrityIssue({
        type: issue.type,
        entity: issue.entity,
        recordId: issue.recordId,
        relatedId: issue.relatedId,
      });
      if (result.ok) {
        toast.success("Repaired", { description: result.message });
        await refreshData();
      } else {
        toast.error("Repair failed", { description: result.message });
      }
    } catch (e) {
      toast.error("Repair failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRepairingIssue(null);
    }
  };

  // Deep-link: /masters?tab=items&addSku=...&tenantId=...&upc=...&desc=...&style=...
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    if (
      t === "items" ||
      t === "locations" ||
      t === "exceptions" ||
      t === "integrity" ||
      t === "admin" ||
      t === "audit"
    )
      setTab(t);
    const addSku = sp.get("addSku");
    if (addSku) {
      setTab("items");
      setAddDialog({
        open: true,
        prefill: {
          sku: addSku,
          upc: sp.get("upc") ?? "",
          itemStyle: sp.get("style") ?? "",
          description: sp.get("desc") ?? "",
          tenantId:
            (sp.get("tenantId") ?? tenantId !== "all") ? (sp.get("tenantId") ?? tenantId) : "",
        },
      });
    }
  }, []);

  const itemMaster =
    tenantId !== "all" ? liveItemMaster.filter((i) => i.tenantId === tenantId) : liveItemMaster;

  const locationMaster =
    warehouseId !== "all" || tenantId !== "all"
      ? liveLocationMaster.filter((l) => {
          const warehouseMatch = warehouseId === "all" || l.warehouseId === warehouseId;
          const tenantMatch = tenantId === "all" || l.tenantId === tenantId;
          return warehouseMatch && tenantMatch;
        })
      : liveLocationMaster;

  const items = useMemo(() => {
    const q = itemQuery.toLowerCase();
    if (!q) return itemMaster;
    return itemMaster.filter(
      (i) =>
        i.sku.toLowerCase().includes(q) ||
        i.upc.includes(q) ||
        i.itemStyle.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
    );
  }, [itemMaster, itemQuery, tenantId]);

  const locs = useMemo(() => {
    const byWarehouse =
      locWarehouseFilter === "all"
        ? locationMaster
        : locationMaster.filter((l) => l.warehouseId === locWarehouseFilter);
    const q = locQuery.toLowerCase();
    if (!q) return byWarehouse;
    return byWarehouse.filter(
      (l) =>
        l.id.toLowerCase().includes(q) ||
        l.zone.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q) ||
        (l.warehouseId?.toLowerCase().includes(q) ?? false) ||
        (liveWarehouses.find((w) => w.id === l.warehouseId)?.code ?? "")
          .toLowerCase()
          .includes(q) ||
        (liveWarehouses.find((w) => w.id === l.warehouseId)?.city ?? "")
          .toLowerCase()
          .includes(q) ||
        (l.tenantId?.toLowerCase().includes(q) ?? false),
    );
  }, [locationMaster, locQuery, locWarehouseFilter, warehouseId, tenantId, liveWarehouses]);

  const exceptions = useMemo(() => {
    return collectMasterExceptions().filter((e) => {
      if (tenantId !== "all" && e.tenantId !== tenantId) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, addDialog.open, editLoc]);

  const pickableCount = locs.filter((l) => l.pickable).length;

  if (!isExactMasters) {
    return <Outlet />;
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Master Data</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Item Master (EDI 832) and Warehouse Location Master. Inbound ASNs and Orders are
            cross-checked against these registers before execution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={() => refreshData()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button asChild size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-500">
            <Link to="/masters/employees">
              <Users className="h-4 w-4 mr-1" /> Employees
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Kpi
          icon={<Package className="h-3.5 w-3.5" />}
          label="Active SKUs"
          value={items.filter((i) => i.active).length.toString()}
        />
        <Kpi
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Locations"
          value={locs.length.toString()}
        />
        <Kpi
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-chart-3" />}
          label="Pickable"
          value={`${pickableCount} / ${locs.length}`}
        />
        <Kpi
          icon={
            <AlertTriangle
              className={`h-3.5 w-3.5 ${exceptions.length ? "text-destructive" : "text-muted-foreground"}`}
            />
          }
          label="Master exceptions"
          value={exceptions.length.toString()}
          tone={exceptions.length ? "danger" : "default"}
        />
        <Kpi
          icon={
            <ShieldAlert
              className={`h-3.5 w-3.5 ${
                integrityErrors.length
                  ? "text-destructive"
                  : integrityWarnings.length
                    ? "text-amber-500"
                    : "text-emerald-500"
              }`}
            />
          }
          label="Data integrity"
          value={integrityIssues.length.toString()}
          tone={integrityErrors.length ? "danger" : "default"}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-3">
        <TabsList>
          <TabsTrigger value="items">
            <Database className="h-3.5 w-3.5 mr-1.5" /> Item Master (832)
          </TabsTrigger>
          <TabsTrigger value="locations">
            <MapPin className="h-3.5 w-3.5 mr-1.5" /> Location Master
          </TabsTrigger>
          <TabsTrigger value="exceptions">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Exceptions
            {exceptions.length > 0 && (
              <span className="ml-1.5 rounded-sm bg-destructive/15 text-destructive text-[10px] px-1.5 py-0.5">
                {exceptions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="integrity">
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> Data Integrity
            {integrityIssues.length > 0 && (
              <span
                className={`ml-1.5 rounded-sm text-[10px] px-1.5 py-0.5 ${
                  integrityErrors.length
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-amber-500/20 text-amber-600"
                }`}
              >
                {integrityIssues.length}
              </span>
            )}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin">
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Admin Tools
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="audit">
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Inventory Audit Trail
            </TabsTrigger>
          )}
        </TabsList>

        {/* ITEM MASTER ----------------------------------------- */}
        <TabsContent value="items" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="Search SKU, UPC, style…"
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => setAddDialog({ open: true })}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New SKU
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setCsv832Open(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Ingest 832 / CSV
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">UPC / GTIN</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Style</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Description
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Tenant</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Case
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Dims (in) L×W×H
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Case Wt
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    CBM
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">NMFC</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Class
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Cost
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Price
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Source</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Effective</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right w-24">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.sku} className="text-xs">
                    <TableCell className="font-mono">{i.sku}</TableCell>
                    <TableCell className="font-mono text-[11px]">{i.upc}</TableCell>
                    <TableCell className="font-mono">{i.itemStyle}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{i.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {liveTenants.find((t) => t.id === i.tenantId)?.code ?? i.tenantId}
                    </TableCell>
                    <TableCell className="text-right font-mono">{i.caseQty}</TableCell>
                    <TableCell className="text-right font-mono text-[11px]">
                      {i.lengthIn}×{i.widthIn}×{i.heightIn}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px]">
                      {i.caseWeightLbs.toFixed(1)} lb
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px]">
                      {i.cbmPerCase.toFixed(4)}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{i.nmfc}</TableCell>
                    <TableCell className="text-right font-mono text-[11px]">
                      <span className="inline-flex items-center rounded-sm border border-border bg-muted/40 px-1.5 py-0.5">
                        {i.freightClass}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">${i.unitCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      ${i.unitPrice.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {i.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {fmtDateYear(i.effectiveAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Edit SKU"
                          onClick={() => setEditItem(i)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {(() => {
                          const blocked = hasInventoryForSku(i.sku, i.tenantId);
                          return (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive disabled:opacity-40"
                              disabled={blocked}
                              title={
                                blocked
                                  ? "Cannot delete — inventory exists for this client"
                                  : "Delete from Item Master"
                              }
                              onClick={() => {
                                if (!blocked) setToDeleteItem(i);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          );
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={17}
                      className="text-center text-xs text-muted-foreground py-8"
                    >
                      No items match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* LOCATION MASTER --------------------------------------- */}
        <TabsContent value="locations" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={locQuery}
                onChange={(e) => setLocQuery(e.target.value)}
                placeholder="Search location ID, warehouse, zone…"
                className="pl-8 h-8 text-xs"
              />
            </div>
            <select
              value={locWarehouseFilter}
              onChange={(e) => setLocWarehouseFilter(e.target.value)}
              className="h-8 text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="all">All warehouses</option>
              {liveWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.city}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setCsvLocOpen(true)}
              >
                <Upload className="h-3.5 w-3.5" /> Import CSV
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setEditLoc({} as LocationRecord)}
              >
                <Plus className="h-3.5 w-3.5" /> New Location
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Location</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Warehouse</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Zone</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Occupancy</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Pickable</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Notes</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right w-24">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locs.map((l) => (
                  <TableRow key={l.id} className="text-xs">
                    <TableCell className="font-mono">{l.id}</TableCell>
                    <TableCell>
                      {(() => {
                        const wh = liveWarehouses.find((w) => w.id === l.warehouseId);
                        return wh ? (
                          <div>
                            <div className="font-mono font-medium">{wh.code}</div>
                            <div className="text-[10px] text-muted-foreground">{wh.city}</div>
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            {l.warehouseId ?? "—"}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ${typeStyles[l.type]}`}
                      >
                        {l.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{l.zone}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={locationOccupancyPct(l)} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground w-10 text-right">
                          {locationOccupancyPct(l)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.pickable ? "default" : "outline"} className="text-[10px]">
                        {l.pickable ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.tenantId
                        ? (liveTenants.find((t) => t.id === l.tenantId)?.code ?? l.tenantId)
                        : "All"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {l.notes}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Edit location"
                          onClick={() => setEditLoc(l)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Delete location"
                          onClick={() => setToDeleteLoc(l)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {locs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-xs text-muted-foreground py-8"
                    >
                      No locations match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* EXCEPTIONS ------------------------------------------- */}
        <TabsContent value="exceptions" className="space-y-3">
          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Entity</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Details</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Warehouse</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((e, i) => (
                  <TableRow key={i} className="text-xs">
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono bg-destructive/15 text-destructive border-destructive/30"
                      >
                        {e.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{e.documentId}</TableCell>
                    <TableCell className="max-w-md truncate">{e.detail}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {(e as any).warehouseId || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {liveTenants.find((t) => t.id === e.tenantId)?.code}
                    </TableCell>
                  </TableRow>
                ))}
                {exceptions.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-xs text-muted-foreground py-8"
                    >
                      No exceptions found. All master data is clean.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* DATA INTEGRITY ---------------------------------------- */}
        <TabsContent value="integrity" className="space-y-3">
          <div
            className={`rounded-md border p-3 ${
              integrityErrors.length
                ? "border-destructive/40 bg-destructive/5"
                : integrityWarnings.length
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-border bg-card"
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert
                className={`h-4 w-4 ${
                  integrityErrors.length
                    ? "text-destructive"
                    : integrityWarnings.length
                      ? "text-amber-500"
                      : "text-emerald-500"
                }`}
              />
              <h3 className="text-sm font-semibold">Data Integrity &amp; Correlation</h3>
              <span className="text-xs text-muted-foreground">
                {integrityErrors.length} error(s) · {integrityWarnings.length} warning(s)
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Every record is checked against the master data it depends on. Broken references are
              shown in red and can be repaired without touching the database by hand.
            </p>
          </div>

          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Severity</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Problem</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Record</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Details</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrityIssues.map((issue) => (
                  <TableRow
                    key={issue.id}
                    className={`text-xs ${
                      issue.severity === "error"
                        ? "bg-destructive/10 hover:bg-destructive/15"
                        : "bg-amber-500/5 hover:bg-amber-500/10"
                    }`}
                  >
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ${
                          issue.severity === "error"
                            ? "bg-destructive text-destructive-foreground border-destructive"
                            : "bg-amber-500/20 text-amber-600 border-amber-500/40"
                        }`}
                      >
                        {issue.severity === "error" ? "ERROR" : "WARN"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-destructive">{issue.title}</TableCell>
                    <TableCell className="font-mono text-[11px]">{issue.recordId}</TableCell>
                    <TableCell className="max-w-md text-muted-foreground">{issue.detail}</TableCell>
                    <TableCell className="text-right">
                      {issue.autoFixable ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-destructive/50 text-xs text-destructive hover:bg-destructive/10"
                          disabled={repairingIssue === issue.id}
                          onClick={() => handleRepair(issue)}
                        >
                          {repairingIssue === issue.id ? "Fixing…" : (issue.fixLabel ?? "Fix")}
                        </Button>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Manual fix
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {integrityIssues.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-emerald-600 py-8">
                      <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                      No correlation issues found. All records are consistent.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin" className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4 space-y-4">
              <h3 className="text-sm font-semibold">Admin Tools</h3>
              <p className="text-xs text-muted-foreground">
                Dangerous actions for cleaning up data from inbound errors.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    SKU to delete
                  </Label>
                  <Input
                    value={adminSku}
                    onChange={(e) => setAdminSku(e.target.value)}
                    placeholder="SKU-ABC-123"
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Pallet ID (optional)
                  </Label>
                  <Input
                    value={adminPalletId}
                    onChange={(e) => setAdminPalletId(e.target.value)}
                    placeholder="PLT-ATL1-00871"
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Location (optional)
                  </Label>
                  <Input
                    value={adminLocation}
                    onChange={(e) => setAdminLocation(e.target.value)}
                    placeholder="A12-03-B"
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  disabled={isDeleting || (!adminSku && !adminPalletId && !adminLocation)}
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      const result = await deleteInventoryBatch({
                        sku: adminSku,
                        palletId: adminPalletId || undefined,
                        location: adminLocation || undefined,
                        user: user?.name || "admin",
                      });
                      setAdminDeleteResult(`${result.deletedCount} batches deleted`);
                      force((n) => n + 1);
                    } catch (e: any) {
                      setAdminDeleteResult(`Error: ${e.message}`);
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                >
                  {isDeleting ? "Deleting..." : "Delete Inventory Batches"}
                </Button>
                {adminDeleteResult && (
                  <span className="text-xs text-muted-foreground">{adminDeleteResult}</span>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {/* INVENTORY AUDIT TRAIL */}
        {isAdmin && (
          <TabsContent value="audit" className="space-y-4">
            <InventoryAuditTrail />
          </TabsContent>
        )}
      </Tabs>

      <CsvUploader
        open={csv832Open}
        onOpenChange={setCsv832Open}
        title="Ingest Item Master"
        description="Upload an EDI 832 export or vendor CSV. Maps to the full Item Master contract including GTIN pack hierarchy, apparel matrix, pallet build intelligence, velocity and substitutions."
        ediHint="EDI 832"
        targetFields={ITEM_MASTER_CSV_FIELDS.map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
        }))}
        exampleHeaders={ITEM_MASTER_CSV_HEADERS}
        onConfirm={async (file, csvTenantId, mapping) => {
          try {
            const tenant =
              csvTenantId || (tenantId !== "all" ? tenantId : tenants[0]?.id) || "acme";
            const text = await file.text();
            const parsed = Papa.parse<Record<string, string>>(text, {
              header: true,
              skipEmptyLines: true,
            });
            if (parsed.errors.length) {
              toast.error("CSV parse error", {
                description: parsed.errors[0].message,
              });
              return;
            }
            const result = parseItemMasterCsv(parsed.data, mapping, tenant);
            if (result.errors.length) {
              toast.error(`${result.errors.length} row(s) failed validation`, {
                description: result.errors
                  .slice(0, 3)
                  .map((e) => `Row ${e.row}: ${e.message}`)
                  .join(" · "),
              });
              return;
            }
            let saved = 0;
            const failures: string[] = [];
            for (const rec of result.records) {
              try {
                await addItemToMaster(rec);
                saved++;
              } catch (e) {
                failures.push(`${rec.sku}: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            if (failures.length) {
              toast.error(`${failures.length} record(s) failed to save`, {
                description: failures.slice(0, 3).join(" · "),
              });
            }
            if (saved > 0) {
              toast.success(`Imported ${saved} SKU(s) into Item Master`, {
                description: `Tenant: ${tenant}`,
              });
            }
            if (result.warnings.length) {
              toast.warning(`${result.warnings.length} row(s) imported with warnings`, {
                description: result.warnings
                  .slice(0, 2)
                  .map((w) => `Row ${w.row}: ${w.message}`)
                  .join(" · "),
              });
            }
            force((n) => n + 1);
          } catch (e) {
            toast.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      />

      <CsvUploader
        open={csvLocOpen}
        onOpenChange={setCsvLocOpen}
        title="Import Location Master"
        description="Upload a CSV of warehouse locations. Pickable=N rows are excluded from allocation."
        ediHint="Location Master"
        targetFields={[
          { key: "id", label: "Location ID", required: true },
          { key: "type", label: "Type (FLR / DROP / RACK)", required: true },
          { key: "zone", label: "Zone" },
          { key: "tenantId", label: "Tenant / Client (optional)" },
          { key: "capacityPallets", label: "Capacity (pallets)", required: true },
          { key: "pickable", label: "Pickable (Y/N)", required: true },
          { key: "allowedItemStyles", label: "Allowed item styles (csv)" },
        ]}
        exampleHeaders={[
          "loc_id",
          "type",
          "zone",
          "tenantId",
          "capacity",
          "pickable",
          "allowed_styles",
        ]}
      />

      <AddItemDialog
        open={addDialog.open || !!editItem}
        prefill={addDialog.prefill}
        editItem={editItem}
        onOpenChange={(o) => {
          setAddDialog((s) => ({ ...s, open: o }));
          if (!o) setEditItem(null);
        }}
        onSaved={() => {
          force((n) => n + 1);
          setAddDialog({ open: false });
          setEditItem(null);
        }}
      />
      <AddLocationDialog
        open={!!editLoc}
        prefill={editLoc}
        defaultWarehouseId={warehouseId !== "all" ? warehouseId : ""}
        onOpenChange={(o) => {
          if (!o) setEditLoc(null);
        }}
        onSaved={() => {
          force((n) => n + 1);
          setEditLoc(null);
        }}
      />
      <AlertDialog open={!!toDeleteItem} onOpenChange={(o) => !o && setToDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SKU {toDeleteItem?.sku}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This permanently removes the SKU from the Item Master. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setToDeleteItem(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDeleteItem) {
                  try {
                    deleteItemFromMaster(toDeleteItem.sku);
                    toast.success(`Deleted ${toDeleteItem.sku} from Item Master`);
                    force((n) => n + 1);
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }
                setToDeleteItem(null);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDeleteLoc} onOpenChange={(o) => !o && setToDeleteLoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete location {toDeleteLoc?.id}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This permanently removes the location from the master. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setToDeleteLoc(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (toDeleteLoc) {
                  try {
                    await deleteLocationFromMaster(toDeleteLoc.id);
                    toast.success(`Deleted location ${toDeleteLoc.id}`);
                    force((n) => n + 1);
                  } catch (e) {
                    toast.error(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }
                setToDeleteLoc(null);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={`rounded-md border bg-card px-3 py-2.5 ${tone === "danger" ? "border-destructive/30" : "border-border"}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function AddItemDialog({
  open,
  prefill,
  editItem,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  prefill?: Partial<ItemMasterRecord>;
  editItem?: ItemMasterRecord | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<ItemMasterRecord>>({});

  useEffect(() => {
    if (open) {
      const seed = (editItem ?? {}) as Partial<ItemMasterRecord>;
      setForm({
        sku: seed.sku ?? prefill?.sku ?? "",
        upc: seed.upc ?? prefill?.upc ?? "",
        gtin: seed.gtin ?? prefill?.gtin ?? "",
        itemStyle: seed.itemStyle ?? prefill?.itemStyle ?? "",
        description: seed.description ?? prefill?.description ?? "",
        category: seed.category ?? prefill?.category ?? "Accessories",
        uom: seed.uom ?? prefill?.uom ?? "EA",
        caseQty: seed.caseQty ?? prefill?.caseQty ?? 1,
        innerPackQty: seed.innerPackQty ?? prefill?.innerPackQty ?? 1,
        masterPackQty: seed.masterPackQty ?? prefill?.masterPackQty ?? undefined,
        unitCost: seed.unitCost ?? prefill?.unitCost ?? 0,
        unitPrice: seed.unitPrice ?? prefill?.unitPrice ?? 0,
        weightLbs: seed.weightLbs ?? prefill?.weightLbs ?? 0.5,
        lengthIn: seed.lengthIn ?? prefill?.lengthIn ?? 12,
        widthIn: seed.widthIn ?? prefill?.widthIn ?? 10,
        heightIn: seed.heightIn ?? prefill?.heightIn ?? 8,
        caseLengthIn: seed.caseLengthIn ?? prefill?.caseLengthIn ?? undefined,
        caseWidthIn: seed.caseWidthIn ?? prefill?.caseWidthIn ?? undefined,
        caseHeightIn: seed.caseHeightIn ?? prefill?.caseHeightIn ?? undefined,
        caseWeightLbs: seed.caseWeightLbs ?? prefill?.caseWeightLbs ?? 1,
        masterLengthIn: seed.masterLengthIn ?? prefill?.masterLengthIn ?? undefined,
        masterWidthIn: seed.masterWidthIn ?? prefill?.masterWidthIn ?? undefined,
        masterHeightIn: seed.masterHeightIn ?? prefill?.masterHeightIn ?? undefined,
        masterWeightLbs: seed.masterWeightLbs ?? prefill?.masterWeightLbs ?? undefined,
        tenantId: seed.tenantId ?? prefill?.tenantId ?? "",
        palletBuild: seed.palletBuild ??
          prefill?.palletBuild ?? {
            maxPalletHeightIn: 60,
            maxPalletWeightLbs: 2500,
            stackability: "full",
            palletPattern: "interlock",
            allowMixedSku: false,
            palletType: "standard_48x40",
          },
        velocity: seed.velocity ??
          prefill?.velocity ?? {
            abcClass: "B",
            annualPicks: 500,
            linesPerOrder: 3,
            storageClass: "reserve",
          },
        substitutions: seed.substitutions ?? prefill?.substitutions ?? [],
        lotControl: seed.lotControl ?? prefill?.lotControl ?? false,
        expiryControl: seed.expiryControl ?? prefill?.expiryControl ?? false,
        serialControl: seed.serialControl ?? prefill?.serialControl ?? false,
        shelfLifeDays: seed.shelfLifeDays ?? prefill?.shelfLifeDays ?? undefined,
        storageTempMin: seed.storageTempMin ?? prefill?.storageTempMin ?? undefined,
        storageTempMax: seed.storageTempMax ?? prefill?.storageTempMax ?? undefined,
        storageTempUnit: seed.storageTempUnit ?? prefill?.storageTempUnit ?? "F",
        hazmat: seed.hazmat ?? prefill?.hazmat ?? false,
        countryOfOrigin: seed.countryOfOrigin ?? prefill?.countryOfOrigin ?? "US",
        harmonizedCode: seed.harmonizedCode ?? prefill?.harmonizedCode ?? undefined,
        brand: seed.brand ?? prefill?.brand ?? undefined,
        manufacturer: seed.manufacturer ?? prefill?.manufacturer ?? undefined,
        manufacturerSku: seed.manufacturerSku ?? prefill?.manufacturerSku ?? undefined,
      });
    }
  }, [open, editItem, prefill]);

  const set = <K extends keyof ItemMasterRecord>(k: K, v: ItemMasterRecord[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updatePalletBuild = (patch: Partial<PalletBuildConfig>) =>
    setForm((f) => ({
      ...f,
      palletBuild: { ...DEFAULT_PALLET_BUILD, ...f.palletBuild, ...patch },
    }));

  const updateVelocity = (patch: Partial<VelocityClassification>) =>
    setForm((f) => ({
      ...f,
      velocity: { ...DEFAULT_VELOCITY, ...f.velocity, ...patch },
    }));

  const updateApparel = (patch: Partial<ApparelAttributes>) =>
    setForm((f) => {
      const base = f.apparelAttrs;
      const next: ApparelAttributes = {
        style: patch.style ?? base?.style ?? "",
        color: {
          code: patch.color?.code ?? base?.color?.code ?? "",
          name: patch.color?.name ?? base?.color?.name ?? "",
        },
        size: {
          code: patch.size?.code ?? base?.size?.code ?? "",
          lengthIn: patch.size?.lengthIn ?? base?.size?.lengthIn,
          widthIn: patch.size?.widthIn ?? base?.size?.widthIn,
          heightIn: patch.size?.heightIn ?? base?.size?.heightIn,
          weightLbs: patch.size?.weightLbs ?? base?.size?.weightLbs,
        },
        fit: patch.fit ?? base?.fit,
        fabric: patch.fabric ?? base?.fabric,
        season: patch.season ?? base?.season,
        gender: patch.gender ?? base?.gender,
      };
      return { ...f, apparelAttrs: next };
    });

  const save = async () => {
    if (!form.sku || !form.tenantId || !form.description) {
      toast.error("SKU, client and description are required");
      return;
    }
    const f = nmfcFor(form.sku, form.category ?? "Default");
    const payload = {
      sku: form.sku,
      upc: form.upc ?? "",
      gtin: form.gtin ?? "",
      itemStyle: form.itemStyle ?? form?.sku?.split("-")[1] ?? form.sku,
      description: form.description,
      category: form.category ?? "Accessories",
      uom: form.uom ?? "EA",
      caseQty: Number(form.caseQty) || 1,
      innerPackQty: Number(form.innerPackQty) || 1,
      masterPackQty: Number(form.masterPackQty) || undefined,
      unitCost: Number(form.unitCost) || 0,
      unitPrice: Number(form.unitPrice) || 0,
      weightLbs: Number(form.weightLbs) || 0,
      lengthIn: Number(form.lengthIn) || 0,
      widthIn: Number(form.widthIn) || 0,
      heightIn: Number(form.heightIn) || 0,
      caseLengthIn: Number(form.caseLengthIn) || undefined,
      caseWidthIn: Number(form.caseWidthIn) || undefined,
      caseHeightIn: Number(form.caseHeightIn) || undefined,
      caseWeightLbs: Number(form.caseWeightLbs) || 0,
      masterLengthIn: Number(form.masterLengthIn) || undefined,
      masterWidthIn: Number(form.masterWidthIn) || undefined,
      masterHeightIn: Number(form.masterHeightIn) || undefined,
      masterWeightLbs: Number(form.masterWeightLbs) || undefined,
      palletBuild: form.palletBuild ?? {
        maxPalletHeightIn: 60,
        maxPalletWeightLbs: 2500,
        stackability: "full",
        palletPattern: "interlock",
        allowMixedSku: false,
        palletType: "standard_48x40",
      },
      velocity: form.velocity ?? {
        abcClass: "B",
        annualPicks: 500,
        linesPerOrder: 3,
        storageClass: "reserve",
      },
      substitutions: form.substitutions ?? [],
      lotControl: form.lotControl ?? false,
      expiryControl: form.expiryControl ?? false,
      serialControl: form.serialControl ?? false,
      shelfLifeDays: Number(form.shelfLifeDays) || undefined,
      storageTempMin: Number(form.storageTempMin) || undefined,
      storageTempMax: Number(form.storageTempMax) || undefined,
      storageTempUnit: form.storageTempUnit ?? "F",
      hazmat: form.hazmat ?? false,
      countryOfOrigin: form.countryOfOrigin ?? "US",
      harmonizedCode: form.harmonizedCode ?? undefined,
      brand: form.brand ?? undefined,
      manufacturer: form.manufacturer ?? undefined,
      manufacturerSku: form.manufacturerSku ?? undefined,
      nmfc: form.nmfc ?? f.nmfc,
      freightClass: (form.freightClass as ItemMasterRecord["freightClass"]) ?? f.freightClass,
      tenantId: form.tenantId,
    };
    if (editItem) {
      try {
        await updateItemInMaster(editItem.sku, payload);
        toast.success(`Updated ${payload.sku} in Item Master`);
      } catch (e) {
        toast.error(`Failed to update: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    } else {
      try {
        await addItemToMaster(payload);
        toast.success(`Added ${payload.sku} to Item Master`);
      } catch (e) {
        toast.error(`Failed to add: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editItem ? "Edit Item Master Record" : "Add SKU to Item Master"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {editItem
              ? "Update fields on this item. SKU and client cannot be changed here."
              : "Inbound receipts and order allocation cannot proceed until the SKU exists in the client's Item Master."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="core" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start h-8 shrink-0">
            <TabsTrigger value="core" className="text-xs h-7">
              Core
            </TabsTrigger>
            <TabsTrigger value="pack" className="text-xs h-7">
              Pack
            </TabsTrigger>
            <TabsTrigger value="pallet" className="text-xs h-7">
              Pallet Build
            </TabsTrigger>
            <TabsTrigger value="velocity" className="text-xs h-7">
              Velocity
            </TabsTrigger>
            <TabsTrigger value="compliance" className="text-xs h-7">
              Compliance
            </TabsTrigger>
            <TabsTrigger value="commercial" className="text-xs h-7">
              Commercial
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pr-1 mt-3 min-h-0">
            <TabsContent value="core" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="SKU">
                  <Input
                    value={form.sku ?? ""}
                    disabled={!!editItem}
                    onChange={(e) => set("sku", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Client">
                  <select
                    value={form.tenantId ?? ""}
                    disabled={!!editItem}
                    onChange={(e) => set("tenantId", e.target.value)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                  >
                    <option value="">Select client…</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="UPC / GTIN">
                  <Input
                    value={form.upc ?? ""}
                    onChange={(e) => set("upc", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Item style">
                  <Input
                    value={form.itemStyle ?? ""}
                    onChange={(e) => set("itemStyle", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Description" className="col-span-2">
                  <Input
                    value={form.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Category">
                  <Input
                    value={form.category ?? ""}
                    onChange={(e) => set("category", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="UOM">
                  <Input
                    value={form.uom ?? ""}
                    onChange={(e) => set("uom", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Case Qty">
                  <Input
                    type="number"
                    min={1}
                    value={form.caseQty ?? 1}
                    onChange={(e) => set("caseQty", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Unit weight (lb)">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.weightLbs ?? 0}
                    onChange={(e) => set("weightLbs", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Length (in)">
                  <Input
                    type="number"
                    value={form.lengthIn ?? 0}
                    onChange={(e) => set("lengthIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Width (in)">
                  <Input
                    type="number"
                    value={form.widthIn ?? 0}
                    onChange={(e) => set("widthIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Height (in)">
                  <Input
                    type="number"
                    value={form.heightIn ?? 0}
                    onChange={(e) => set("heightIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Case wt (lb)">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.caseWeightLbs ?? 0}
                    onChange={(e) => set("caseWeightLbs", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="GTIN-14">
                  <Input
                    value={form.gtin ?? ""}
                    onChange={(e) => set("gtin", e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="00812345000031"
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="pack" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inner Pack Qty">
                  <Input
                    type="number"
                    min={1}
                    value={form.innerPackQty ?? 1}
                    onChange={(e) => set("innerPackQty", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Master Pack Qty">
                  <Input
                    type="number"
                    min={1}
                    value={form.masterPackQty ?? 1}
                    onChange={(e) => set("masterPackQty", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Case Length (in)">
                  <Input
                    type="number"
                    value={form.caseLengthIn ?? 0}
                    onChange={(e) => set("caseLengthIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Case Width (in)">
                  <Input
                    type="number"
                    value={form.caseWidthIn ?? 0}
                    onChange={(e) => set("caseWidthIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Case Height (in)">
                  <Input
                    type="number"
                    value={form.caseHeightIn ?? 0}
                    onChange={(e) => set("caseHeightIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Master Length (in)">
                  <Input
                    type="number"
                    value={form.masterLengthIn ?? 0}
                    onChange={(e) => set("masterLengthIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Master Width (in)">
                  <Input
                    type="number"
                    value={form.masterWidthIn ?? 0}
                    onChange={(e) => set("masterWidthIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Master Height (in)">
                  <Input
                    type="number"
                    value={form.masterHeightIn ?? 0}
                    onChange={(e) => set("masterHeightIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Master Weight (lb)">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.masterWeightLbs ?? 0}
                    onChange={(e) => set("masterWeightLbs", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Base Pack Level">
                  <Select
                    value={form.basePackLevel ?? "each"}
                    onValueChange={(v) => set("basePackLevel", v as any)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="each">Each</SelectItem>
                      <SelectItem value="inner">Inner</SelectItem>
                      <SelectItem value="master">Master</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    GTIN Hierarchy (parent / child)
                  </Label>
                  <Textarea
                    value={JSON.stringify(form.packHierarchy ?? [], null, 2)}
                    onChange={(e) => {
                      try {
                        set("packHierarchy", JSON.parse(e.target.value));
                      } catch {}
                    }}
                    className="h-32 text-xs font-mono"
                    placeholder='[{"parentGtin":"00812345000031","childGtin":"10812345000038","qtyPerParent":6,"packLevel":"inner","packLengthIn":22,"packWidthIn":16,"packHeightIn":14,"packWeightLbs":27.8,"isBaseUnit":false}]'
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Apparel Style">
                    <Input
                      value={form.apparelAttrs?.style ?? ""}
                      onChange={(e) => updateApparel({ style: e.target.value })}
                      className="h-8 text-xs"
                      placeholder="HOODIE-PULLOVER"
                    />
                  </Field>
                  <Field label="Color Code / Name">
                    <div className="flex gap-2">
                      <Input
                        value={form.apparelAttrs?.color?.code ?? ""}
                        onChange={(e) =>
                          updateApparel({
                            color: {
                              code: e.target.value,
                              name: form.apparelAttrs?.color?.name ?? "",
                            },
                          })
                        }
                        className="h-8 text-xs w-1/2"
                        placeholder="BLK"
                      />
                      <Input
                        value={form.apparelAttrs?.color?.name ?? ""}
                        onChange={(e) =>
                          updateApparel({
                            color: {
                              code: form.apparelAttrs?.color?.code ?? "",
                              name: e.target.value,
                            },
                          })
                        }
                        className="h-8 text-xs w-1/2"
                        placeholder="Black"
                      />
                    </div>
                  </Field>
                  <Field label="Size Code">
                    <Input
                      value={form.apparelAttrs?.size?.code ?? ""}
                      onChange={(e) =>
                        updateApparel({
                          size: { ...form.apparelAttrs?.size, code: e.target.value },
                        })
                      }
                      className="h-8 text-xs"
                      placeholder="M"
                    />
                  </Field>
                  <Field label="Size L / W / H (in)">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={form.apparelAttrs?.size?.lengthIn ?? 0}
                        onChange={(e) =>
                          updateApparel({
                            size: {
                              code: form.apparelAttrs?.size?.code ?? "",
                              lengthIn: Number(e.target.value),
                            },
                          })
                        }
                        className="h-8 text-xs text-right w-1/3"
                        placeholder="L"
                      />
                      <Input
                        type="number"
                        value={form.apparelAttrs?.size?.widthIn ?? 0}
                        onChange={(e) =>
                          updateApparel({
                            size: {
                              code: form.apparelAttrs?.size?.code ?? "",
                              widthIn: Number(e.target.value),
                            },
                          })
                        }
                        className="h-8 text-xs text-right w-1/3"
                        placeholder="W"
                      />
                      <Input
                        type="number"
                        value={form.apparelAttrs?.size?.heightIn ?? 0}
                        onChange={(e) =>
                          updateApparel({
                            size: {
                              code: form.apparelAttrs?.size?.code ?? "",
                              heightIn: Number(e.target.value),
                            },
                          })
                        }
                        className="h-8 text-xs text-right w-1/3"
                        placeholder="H"
                      />
                    </div>
                  </Field>
                  <Field label="Fit">
                    <Select
                      value={form.apparelAttrs?.fit ?? "regular"}
                      onValueChange={(v) => updateApparel({ fit: v as any })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="slim">Slim</SelectItem>
                        <SelectItem value="relaxed">Relaxed</SelectItem>
                        <SelectItem value="oversized">Oversized</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Fabric">
                    <Input
                      value={form.apparelAttrs?.fabric?.primary ?? ""}
                      onChange={(e) =>
                        updateApparel({
                          fabric: {
                            primary: e.target.value,
                            pct: form.apparelAttrs?.fabric?.pct ?? 100,
                          },
                        })
                      }
                      className="h-8 text-xs"
                      placeholder="cotton 80%"
                    />
                  </Field>
                  <Field label="Season">
                    <Input
                      value={form.apparelAttrs?.season ?? ""}
                      onChange={(e) => updateApparel({ season: e.target.value })}
                      className="h-8 text-xs"
                      placeholder="Fall / Core"
                    />
                  </Field>
                  <Field label="Gender">
                    <Select
                      value={form.apparelAttrs?.gender ?? "Unisex"}
                      onValueChange={(v) => updateApparel({ gender: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mens">Mens</SelectItem>
                        <SelectItem value="Womens">Womens</SelectItem>
                        <SelectItem value="Unisex">Unisex</SelectItem>
                        <SelectItem value="Kids">Kids</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="pallet" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max Pallet Height (in)">
                  <Input
                    type="number"
                    value={form.palletBuild?.maxPalletHeightIn ?? 60}
                    onChange={(e) =>
                      updatePalletBuild({ maxPalletHeightIn: Number(e.target.value) })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Max Pallet Weight (lb)">
                  <Input
                    type="number"
                    value={form.palletBuild?.maxPalletWeightLbs ?? 2500}
                    onChange={(e) =>
                      updatePalletBuild({ maxPalletWeightLbs: Number(e.target.value) })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Max Stack Height (in)">
                  <Input
                    type="number"
                    value={form.palletBuild?.maxStackHeightIn ?? ""}
                    onChange={(e) =>
                      updatePalletBuild({
                        maxStackHeightIn: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Overhang (in)">
                  <Input
                    type="number"
                    value={form.palletBuild?.overhangIn ?? ""}
                    onChange={(e) =>
                      updatePalletBuild({
                        overhangIn: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Stackability">
                  <Select
                    value={form.palletBuild?.stackability ?? "full"}
                    onValueChange={(v) => updatePalletBuild({ stackability: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full</SelectItem>
                      <SelectItem value="limited">Limited</SelectItem>
                      <SelectItem value="non-stackable">Non-Stackable</SelectItem>
                      <SelectItem value="crushable">Crushable</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Pallet Pattern">
                  <Select
                    value={form.palletBuild?.palletPattern ?? "interlock"}
                    onValueChange={(v) => updatePalletBuild({ palletPattern: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="column">Column</SelectItem>
                      <SelectItem value="interlock">Interlock</SelectItem>
                      <SelectItem value="brick">Brick</SelectItem>
                      <SelectItem value="pinwheel">Pinwheel</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Pallet Type">
                  <Select
                    value={form.palletBuild?.palletType ?? "standard_48x40"}
                    onValueChange={(v) => updatePalletBuild({ palletType: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard_48x40">Standard 48x40</SelectItem>
                      <SelectItem value="euro_48x32">Euro 48x32</SelectItem>
                      <SelectItem value="half_48x20">Half 48x20</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Allow Mixed SKU">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.palletBuild?.allowMixedSku ?? false}
                      onCheckedChange={(c) => updatePalletBuild({ allowMixedSku: c === true })}
                    />
                    Allow mixed SKU on pallet
                  </label>
                </Field>
                <Field label="Mixed SKU Styles (comma-separated)" className="col-span-2">
                  <Input
                    value={form.palletBuild?.mixedSkuStyles?.join(", ") ?? ""}
                    onChange={(e) =>
                      updatePalletBuild({
                        mixedSkuStyles: e.target.value
                          ? e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : undefined,
                      })
                    }
                    className="h-8 text-xs"
                    placeholder="STV-CMP, TENT-2P"
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="velocity" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="ABC Class">
                  <Select
                    value={form.velocity?.abcClass ?? "B"}
                    onValueChange={(v) => updateVelocity({ abcClass: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A - Fast</SelectItem>
                      <SelectItem value="B">B - Medium</SelectItem>
                      <SelectItem value="C">C - Slow</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Storage Class">
                  <Select
                    value={form.velocity?.storageClass ?? "reserve"}
                    onValueChange={(v) => updateVelocity({ storageClass: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forward">Forward Pick</SelectItem>
                      <SelectItem value="reserve">Reserve</SelectItem>
                      <SelectItem value="bulk">Bulk</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                      <SelectItem value="hazmat">Hazmat</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Annual Picks">
                  <Input
                    type="number"
                    value={form.velocity?.annualPicks ?? 500}
                    onChange={(e) => updateVelocity({ annualPicks: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Lines per Order">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.velocity?.linesPerOrder ?? 3}
                    onChange={(e) => updateVelocity({ linesPerOrder: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Reorder Days">
                  <Input
                    type="number"
                    value={form.velocity?.reorderDays ?? ""}
                    onChange={(e) =>
                      updateVelocity({
                        reorderDays: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Peak Months (comma-separated)">
                  <Input
                    value={form.velocity?.peakMonths?.join(", ") ?? ""}
                    onChange={(e) =>
                      updateVelocity({
                        peakMonths: e.target.value
                          ? e.target.value
                              .split(",")
                              .map((s) => Number(s.trim()))
                              .filter(Boolean)
                          : undefined,
                      })
                    }
                    className="h-8 text-xs"
                    placeholder="1,2,11,12"
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Substitutions (alternate SKUs)
                </Label>
                <Textarea
                  value={JSON.stringify(form.substitutions ?? [], null, 2)}
                  onChange={(e) => {
                    try {
                      set("substitutions", JSON.parse(e.target.value));
                    } catch {}
                  }}
                  className="h-32 text-xs font-mono"
                  placeholder='[{"alternateSku":"NSA-HOOD-NVY-M","type":"substitute","priority":1,"condition":"stockout","costImpactPct":0}]'
                />
              </div>
            </TabsContent>

            <TabsContent value="compliance" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lot Control">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.lotControl ?? false}
                      onCheckedChange={(c) => set("lotControl", c === true)}
                    />
                    Require lot/batch tracking
                  </label>
                </Field>
                <Field label="Expiry Control">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.expiryControl ?? false}
                      onCheckedChange={(c) => set("expiryControl", c === true)}
                    />
                    Require expiration tracking
                  </label>
                </Field>
                <Field label="Serial Control">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.serialControl ?? false}
                      onCheckedChange={(c) => set("serialControl", c === true)}
                    />
                    Require serial tracking
                  </label>
                </Field>
                <Field label="Hazmat">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.hazmat ?? false}
                      onCheckedChange={(c) => set("hazmat", c === true)}
                    />
                    Hazardous material
                  </label>
                </Field>
                <Field label="Shelf Life (days)">
                  <Input
                    type="number"
                    value={form.shelfLifeDays ?? ""}
                    onChange={(e) =>
                      set("shelfLifeDays", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Temp Unit">
                  <Select
                    value={form.storageTempUnit ?? "F"}
                    onValueChange={(v) => set("storageTempUnit", v as any)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="F">Fahrenheit</SelectItem>
                      <SelectItem value="C">Celsius</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Storage Temp Min (°F)">
                  <Input
                    type="number"
                    value={form.storageTempMin ?? ""}
                    onChange={(e) =>
                      set("storageTempMin", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Storage Temp Max (°F)">
                  <Input
                    type="number"
                    value={form.storageTempMax ?? ""}
                    onChange={(e) =>
                      set("storageTempMax", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="NMFC">
                  <Input
                    value={form.nmfc ?? ""}
                    onChange={(e) => set("nmfc", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Freight Class">
                  <Select
                    value={form.freightClass ?? "100"}
                    onValueChange={(v) => set("freightClass", v as any)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="55">55</SelectItem>
                      <SelectItem value="60">60</SelectItem>
                      <SelectItem value="65">65</SelectItem>
                      <SelectItem value="70">70</SelectItem>
                      <SelectItem value="77.5">77.5</SelectItem>
                      <SelectItem value="85">85</SelectItem>
                      <SelectItem value="92.5">92.5</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="110">110</SelectItem>
                      <SelectItem value="125">125</SelectItem>
                      <SelectItem value="150">150</SelectItem>
                      <SelectItem value="175">175</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                      <SelectItem value="250">250</SelectItem>
                      <SelectItem value="300">300</SelectItem>
                      <SelectItem value="400">400</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="commercial" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Unit cost ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.unitCost ?? 0}
                    onChange={(e) => set("unitCost", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Unit price ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.unitPrice ?? 0}
                    onChange={(e) => set("unitPrice", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Country of Origin">
                  <Input
                    value={form.countryOfOrigin ?? "US"}
                    onChange={(e) => set("countryOfOrigin", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="HS/HTS Code">
                  <Input
                    value={form.harmonizedCode ?? ""}
                    onChange={(e) => set("harmonizedCode", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="6110.20.2020"
                  />
                </Field>
                <Field label="Brand">
                  <Input
                    value={form.brand ?? ""}
                    onChange={(e) => set("brand", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Manufacturer">
                  <Input
                    value={form.manufacturer ?? ""}
                    onChange={(e) => set("manufacturer", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Mfg SKU">
                  <Input
                    value={form.manufacturerSku ?? ""}
                    onChange={(e) => set("manufacturerSku", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={save}>
            <Plus className="h-3.5 w-3.5" />
            {editItem ? "Save changes" : "Add to Item Master"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLocationDialog({
  open,
  prefill,
  defaultWarehouseId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  prefill?: LocationRecord | null;
  defaultWarehouseId?: string;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { tenantId: workspaceTenantId, warehouseId: workspaceWarehouseId } = useWorkspace();
  const isEdit = !!prefill;
  const [form, setForm] = useState<Partial<LocationRecord>>({});

  useEffect(() => {
    if (open && prefill) {
      setForm({ ...prefill, tenantId: prefill.tenantId ?? undefined });
    } else if (open) {
      setForm({
        id: "",
        warehouseId: defaultWarehouseId ?? workspaceWarehouseId ?? "",
        tenantId: workspaceTenantId !== "all" ? workspaceTenantId : undefined,
        type: "RACK",
        zone: "",
        capacityPallets: 1,
        occupiedPallets: 0,
        pickable: true,
        allowedItemStyles: null,
        notes: "",
        slottingRules: {
          allowedStorageClasses: ["forward", "reserve", "bulk"],
          putawayPriority: 50,
          replenPriority: 50,
          allowedPalletTypes: ["standard_48x40"],
        },
        velocityMetrics: {
          picksPerDay: 0,
          linesPerDay: 0,
          cubicVelocity: 0,
          lastCalculated: new Date().toISOString(),
          manualOverride: false,
        },
        zoneAdjacency: {
          adjacent: [],
          toShippingDockSec: 300,
          toReceivingDockSec: 300,
        },
        zoneType: "reserve",
        velocityScore: 0,
        recommendedSku: undefined,
        hazmatAllowed: false,
        tempControlled: false,
        tempMin: undefined,
        tempMax: undefined,
        status: "active",
        lastCycleCount: new Date().toISOString(),
        cycleCountFreqDays: 90,
        putawaySequence: 50,
        maxPalletWeightLbs: 2500,
        maxPalletHeightIn: 72,
        clearanceHeightIn: 96,
      });
    }
  }, [open, prefill, defaultWarehouseId, workspaceTenantId, workspaceWarehouseId]);

  const set = <K extends keyof LocationRecord>(k: K, v: LocationRecord[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateSlotting = (patch: Partial<SlottingRules>) =>
    setForm((f) => ({
      ...f,
      slottingRules: { ...DEFAULT_SLOTTING, ...f.slottingRules, ...patch },
    }));

  const updateSlottingAttrs = (patch: NonNullable<SlottingRules["requiredItemAttrs"]>) =>
    setForm((f) => ({
      ...f,
      slottingRules: {
        ...DEFAULT_SLOTTING,
        ...f.slottingRules,
        requiredItemAttrs: { ...f.slottingRules?.requiredItemAttrs, ...patch },
      },
    }));

  const updateVelocityMetrics = (patch: Partial<VelocityMetrics>) =>
    setForm((f) => ({
      ...f,
      velocityMetrics: { ...DEFAULT_VELOCITY_METRICS, ...f.velocityMetrics, ...patch },
    }));

  const updateZoneAdjacency = (patch: Partial<ZoneAdjacency>) =>
    setForm((f) => ({
      ...f,
      zoneAdjacency: { ...DEFAULT_ZONE_ADJACENCY, ...f.zoneAdjacency, ...patch },
    }));

  const save = async () => {
    if (!form.id || !form.warehouseId || !form.type) {
      toast.error("Location ID, warehouse and type are required");
      return;
    }
    if (isEdit && prefill) {
      try {
        await updateLocationInMaster(prefill.id, form as Partial<LocationRecord>);
        toast.success(`Updated location ${form.id}`);
      } catch (e) {
        toast.error(`Failed to update: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    } else {
      try {
        const newLoc: LocationRecord = {
          id: form.id,
          warehouseId: form.warehouseId,
          tenantId: form.tenantId,
          type: form.type,
          zone: form.zone ?? "",
          capacityPallets: form.capacityPallets ?? 1,
          occupiedPallets: form.occupiedPallets ?? 0,
          pickable: form.pickable ?? true,
          allowedItemStyles: form.allowedItemStyles ?? null,
          notes: form.notes,
          lengthFt: form.lengthFt,
          widthFt: form.widthFt,
          heightFt: form.heightFt,
          cubicFeet: form.cubicFeet,
          slottingRules: form.slottingRules ?? {
            allowedStorageClasses: ["forward", "reserve", "bulk"],
            putawayPriority: 50,
            replenPriority: 50,
            allowedPalletTypes: ["standard_48x40"],
          },
          velocityMetrics: form.velocityMetrics ?? {
            picksPerDay: 0,
            linesPerDay: 0,
            cubicVelocity: 0,
            lastCalculated: new Date().toISOString(),
            manualOverride: false,
          },
          zoneAdjacency: form.zoneAdjacency ?? {
            adjacent: [],
            toShippingDockSec: 300,
            toReceivingDockSec: 300,
          },
          zoneType: form.zoneType ?? "reserve",
          velocityScore: form.velocityScore ?? 0,
          recommendedSku: form.recommendedSku,
          hazmatAllowed: form.hazmatAllowed ?? false,
          tempControlled: form.tempControlled ?? false,
          tempMin: form.tempMin,
          tempMax: form.tempMax,
          status: form.status ?? "active",
          lastCycleCount: form.lastCycleCount ?? new Date().toISOString(),
          cycleCountFreqDays: form.cycleCountFreqDays ?? 90,
          putawaySequence: form.putawaySequence ?? 50,
          maxPalletWeightLbs: form.maxPalletWeightLbs ?? 2500,
          maxPalletHeightIn: form.maxPalletHeightIn ?? 72,
          clearanceHeightIn: form.clearanceHeightIn ?? 96,
        };
        await addLocationToMaster(newLoc);
        toast.success(`Added location ${newLoc.id}`);
      } catch (e) {
        toast.error(`Failed to add: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isEdit ? "Edit Location" : "Add Location"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? "Update location details. Location ID cannot be changed."
              : "Create a new warehouse location in the master."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="core" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start h-8 shrink-0">
            <TabsTrigger value="core" className="text-xs h-7">
              Core
            </TabsTrigger>
            <TabsTrigger value="slotting" className="text-xs h-7">
              Slotting
            </TabsTrigger>
            <TabsTrigger value="velocity" className="text-xs h-7">
              Velocity
            </TabsTrigger>
            <TabsTrigger value="environment" className="text-xs h-7">
              Environment
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pr-1 mt-3 min-h-0">
            <TabsContent value="core" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Location ID">
                  <Input
                    value={form.id ?? ""}
                    disabled={isEdit}
                    onChange={(e) => set("id", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Warehouse">
                  <select
                    value={form.warehouseId ?? ""}
                    disabled={isEdit && !!prefill}
                    onChange={(e) => set("warehouseId", e.target.value)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                  >
                    <option value="">Select warehouse…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.city}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type">
                  <select
                    value={form.type ?? "RACK"}
                    onChange={(e) => set("type", e.target.value as LocationType)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                  >
                    <option value="FLR">FLR</option>
                    <option value="DROP">DROP</option>
                    <option value="RACK">RACK</option>
                  </select>
                </Field>
                <Field label="Zone">
                  <Input
                    value={form.zone ?? ""}
                    onChange={(e) => set("zone", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Capacity (pallets)">
                  <Input
                    type="number"
                    min={1}
                    value={form.capacityPallets ?? 1}
                    onChange={(e) => set("capacityPallets", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Occupied (pallets)">
                  <Input
                    type="number"
                    min={0}
                    value={form.occupiedPallets ?? 0}
                    onChange={(e) => set("occupiedPallets", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Pickable">
                  <select
                    value={form.pickable ? "yes" : "no"}
                    onChange={(e) => set("pickable", e.target.value === "yes")}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
                <Field label="Allowed item styles (comma-separated)">
                  <Input
                    value={form.allowedItemStyles?.join(", ") ?? ""}
                    onChange={(e) =>
                      set(
                        "allowedItemStyles",
                        e.target.value
                          ? e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : null,
                      )
                    }
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Tenant / Client (optional)" className="col-span-2">
                  <select
                    value={form.tenantId ?? ""}
                    onChange={(e) => set("tenantId", e.target.value || undefined)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                  >
                    <option value="">Any / Unassigned</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Notes" className="col-span-2">
                  <Input
                    value={form.notes ?? ""}
                    onChange={(e) => set("notes", e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Length (ft)" className="col-span-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.lengthFt ?? ""}
                    onChange={(e) =>
                      set("lengthFt", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Width (ft)" className="col-span-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.widthFt ?? ""}
                    onChange={(e) =>
                      set("widthFt", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Height (ft)" className="col-span-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.heightFt ?? ""}
                    onChange={(e) =>
                      set("heightFt", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Cubic Feet" className="col-span-2">
                  <Input
                    type="number"
                    value={form.cubicFeet ?? ""}
                    onChange={(e) =>
                      set("cubicFeet", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Max Pallet Weight (lb)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.maxPalletWeightLbs ?? 2500}
                    onChange={(e) => set("maxPalletWeightLbs", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Max Pallet Height (in)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.maxPalletHeightIn ?? 72}
                    onChange={(e) => set("maxPalletHeightIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Clearance Height (in)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.clearanceHeightIn ?? 96}
                    onChange={(e) => set("clearanceHeightIn", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="slotting" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Allowed Storage Classes" className="col-span-2">
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(["forward", "reserve", "bulk", "cold", "hazmat"] as const).map((sc) => (
                      <label key={sc} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={form.slottingRules?.allowedStorageClasses?.includes(sc) ?? false}
                          onCheckedChange={(c) => {
                            const current = form.slottingRules?.allowedStorageClasses ?? [];
                            const next = c ? [...current, sc] : current.filter((x) => x !== sc);
                            updateSlotting({ allowedStorageClasses: next });
                          }}
                        />
                        {sc}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Putaway Priority" className="col-span-2">
                  <Input
                    type="number"
                    value={form.slottingRules?.putawayPriority ?? 50}
                    onChange={(e) => updateSlotting({ putawayPriority: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Replen Priority" className="col-span-2">
                  <Input
                    type="number"
                    value={form.slottingRules?.replenPriority ?? 50}
                    onChange={(e) => updateSlotting({ replenPriority: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Max Weight (lb)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.slottingRules?.requiredItemAttrs?.maxWeightLbs ?? ""}
                    onChange={(e) =>
                      updateSlottingAttrs({
                        maxWeightLbs: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Allowed Pallet Types" className="col-span-2">
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(["standard_48x40", "euro_48x32", "half_48x20"] as const).map((pt) => (
                      <label key={pt} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={form.slottingRules?.allowedPalletTypes?.includes(pt) ?? false}
                          onCheckedChange={(c) => {
                            const current = form.slottingRules?.allowedPalletTypes ?? [];
                            const next = c ? [...current, pt] : current.filter((x) => x !== pt);
                            updateSlotting({ allowedPalletTypes: next });
                          }}
                        />
                        {pt}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Allowed ABC Classes" className="col-span-2">
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(["A", "B", "C"] as const).map((abc) => (
                      <label key={abc} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={
                            form.slottingRules?.requiredItemAttrs?.abcClass?.includes(abc) ?? false
                          }
                          onCheckedChange={(c) => {
                            const current = form.slottingRules?.requiredItemAttrs?.abcClass ?? [];
                            const next =
                              c === true ? [...current, abc] : current.filter((x) => x !== abc);
                            updateSlottingAttrs({ abcClass: next });
                          }}
                        />
                        {abc}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Adjacent Zones (comma-separated)" className="col-span-2">
                  <Input
                    value={form.slottingRules?.adjacentZones?.join(", ") ?? ""}
                    onChange={(e) =>
                      updateSlotting({
                        adjacentZones: e.target.value
                          ? e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : undefined,
                      })
                    }
                    className="h-8 text-xs"
                    placeholder="Reserve, Forward Pick"
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="velocity" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Picks / Day" className="col-span-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.velocityMetrics?.picksPerDay ?? 0}
                    onChange={(e) => updateVelocityMetrics({ picksPerDay: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Lines / Day" className="col-span-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.velocityMetrics?.linesPerDay ?? 0}
                    onChange={(e) => updateVelocityMetrics({ linesPerDay: Number(e.target.value) })}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Cubic Velocity" className="col-span-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.velocityMetrics?.cubicVelocity ?? 0}
                    onChange={(e) =>
                      updateVelocityMetrics({ cubicVelocity: Number(e.target.value) })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Velocity Score (legacy)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.velocityScore ?? 0}
                    onChange={(e) => set("velocityScore", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="To Shipping Dock (sec)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.zoneAdjacency?.toShippingDockSec ?? 300}
                    onChange={(e) =>
                      updateZoneAdjacency({ toShippingDockSec: Number(e.target.value) })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="To Receiving Dock (sec)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.zoneAdjacency?.toReceivingDockSec ?? 300}
                    onChange={(e) =>
                      updateZoneAdjacency({ toReceivingDockSec: Number(e.target.value) })
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="environment" className="mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hazmat Allowed" className="col-span-2">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.hazmatAllowed ?? false}
                      onCheckedChange={(c) => set("hazmatAllowed", c === true)}
                    />
                    Allow hazardous materials
                  </label>
                </Field>
                <Field label="Temp Controlled" className="col-span-2">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.tempControlled ?? false}
                      onCheckedChange={(c) => set("tempControlled", c === true)}
                    />
                    Temperature controlled
                  </label>
                </Field>
                <Field label="Temp Min (°F)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.tempMin ?? ""}
                    onChange={(e) =>
                      set("tempMin", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Temp Max (°F)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.tempMax ?? ""}
                    onChange={(e) =>
                      set("tempMax", e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-8 text-xs text-right"
                  />
                </Field>
                <Field label="Status" className="col-span-2">
                  <Select
                    value={form.status ?? "active"}
                    onValueChange={(v) => set("status", v as any)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="damaged">Damaged</SelectItem>
                      <SelectItem value="quarantine">Quarantine</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Cycle Count Freq (days)" className="col-span-2">
                  <Input
                    type="number"
                    value={form.cycleCountFreqDays ?? 90}
                    onChange={(e) => set("cycleCountFreqDays", Number(e.target.value))}
                    className="h-8 text-xs text-right"
                  />
                </Field>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={save}>
            <Plus className="h-3.5 w-3.5" />
            {isEdit ? "Save changes" : "Add location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ============================================================
// Inventory Audit Trail Component
// ============================================================
function InventoryAuditTrail() {
  const [auditTransactions, setAuditTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditSku, setAuditSku] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const allTxns = await fetchTransactionHistory();
      setAuditTransactions(allTxns);
    } catch (e: any) {
      toast.error(`Failed to load audit trail: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const filteredTransactions = useMemo(() => {
    return auditTransactions.filter((t) => {
      if (auditSku && t.sku !== auditSku) return false;
      if (auditQuery) {
        const q = auditQuery.toLowerCase();
        const blob =
          `${t.sku} ${t.palletId} ${t.location} ${t.user} ${t.notes || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (auditDateFrom) {
        const from = new Date(auditDateFrom);
        const txnDate = new Date(t.timestamp);
        if (txnDate < from) return false;
      }
      if (auditDateTo) {
        const to = new Date(auditDateTo);
        to.setHours(23, 59, 59, 999);
        const txnDate = new Date(t.timestamp);
        if (txnDate > to) return false;
      }
      return true;
    });
  }, [auditTransactions, auditQuery, auditSku, auditDateFrom, auditDateTo]);

  const exportAuditCsv = () => {
    const headers = [
      "Timestamp",
      "SKU",
      "Pallet ID",
      "Location",
      "Type",
      "Qty Change",
      "Qty Before",
      "Qty After",
      "User",
      "Order ID",
      "Pick Ticket",
      "Notes",
    ];
    const lines = [headers.join(",")];
    for (const t of filteredTransactions) {
      lines.push(
        [
          fmtDateYear(t.timestamp),
          t.sku,
          t.palletId,
          t.location,
          t.type,
          t.qtyChange,
          t.qtyBefore,
          t.qtyAfter,
          t.user,
          t.orderId || "",
          t.pickTicketNum ? `PT-${t.pickTicketNum}` : "",
          t.notes || "",
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `azux-inventory-audit-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Audit trail exported", {
      description: `${filteredTransactions.length} records · ready for download`,
    });
  };

  const typeColors: Record<string, string> = {
    RECEIVE: "bg-chart-3/15 text-chart-3 border-chart-3/30",
    PICK: "bg-destructive/15 text-destructive border-destructive/30",
    ALLOCATE: "bg-chart-1/15 text-chart-1 border-chart-1/30",
    REALLOCATE: "bg-primary/15 text-primary border-primary/30",
    SHIP: "bg-muted/15 text-muted-foreground border-border",
    ADJUST: "bg-chart-4/15 text-chart-4 border-chart-4/30",
    PUTAWAY: "bg-chart-2/15 text-chart-2 border-chart-2/30",
    MOVE: "bg-chart-5/15 text-chart-5 border-chart-5/30",
    DELETE: "bg-destructive/15 text-destructive border-destructive/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Inventory Audit Trail</h3>
          <p className="text-xs text-muted-foreground">
            Complete audit log of all inventory changes: putaway, move, delete, allocate, update
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={exportAuditCsv}>
          <Download className="h-3.5 w-3.5" /> Export Audit Report
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            placeholder="Search SKU, pallet, location, user…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Input
          value={auditSku}
          onChange={(e) => setAuditSku(e.target.value)}
          placeholder="SKU filter…"
          className="h-8 text-xs font-mono w-48"
        />
        <Input
          type="date"
          value={auditDateFrom}
          onChange={(e) => setAuditDateFrom(e.target.value)}
          className="h-8 text-xs w-36"
        />
        <Input
          type="date"
          value={auditDateTo}
          onChange={(e) => setAuditDateTo(e.target.value)}
          className="h-8 text-xs w-36"
        />
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-[10px] uppercase tracking-wider">
                <th className="text-left p-2 font-normal">Timestamp</th>
                <th className="text-left p-2 font-normal">SKU</th>
                <th className="text-left p-2 font-normal">Pallet / Location</th>
                <th className="text-left p-2 font-normal">Type</th>
                <th className="text-right p-2 font-normal">Change</th>
                <th className="text-right p-2 font-normal">Before → After</th>
                <th className="text-left p-2 font-normal">User</th>
                <th className="text-left p-2 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-muted-foreground">
                    Loading audit trail…
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-muted-foreground">
                    No audit records match the current filters.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-2 text-[11px] tabular-nums">{fmtDateYear(t.timestamp)}</td>
                    <td className="p-2 font-mono">{t.sku}</td>
                    <td className="p-2 font-mono text-[11px]">
                      <div>{t.palletId}</div>
                      <div className="text-[10px] text-muted-foreground">{t.location}</div>
                    </td>
                    <td className="p-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${typeColors[t.type] || "bg-muted/15"}`}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {t.qtyChange > 0 ? "+" : ""}
                      {t.qtyChange}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {t.qtyBefore} → {t.qtyAfter}
                    </td>
                    <td className="p-2 font-mono">{t.user}</td>
                    <td
                      className="p-2 text-[11px] text-muted-foreground truncate max-w-48"
                      title={t.notes}
                    >
                      {t.notes || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
