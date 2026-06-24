import { createFileRoute } from "@tanstack/react-router";
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
import { toast } from "sonner";
import { CsvUploader } from "@/components/csv-uploader";
import { useWorkspace } from "@/components/workspace-context";
import { tenants, warehouses } from "@/lib/mock-data";
import {
  itemMaster,
  locationMaster,
  collectMasterExceptions,
  locationOccupancyPct,
  addItemToMaster,
  deleteItemFromMaster,
  updateItemInMaster,
  updateLocationInMaster,
  deleteLocationFromMaster,
  hasInventoryForSku,
  nmfcFor,
  type ItemMasterRecord,
  type LocationRecord,
  type LocationType,
} from "@/lib/master-data";
import { fmtDateYear } from "@/lib/utils";

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

function MastersPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [itemQuery, setItemQuery] = useState("");
  const [locQuery, setLocQuery] = useState("");
  const [csv832Open, setCsv832Open] = useState(false);
  const [csvLocOpen, setCsvLocOpen] = useState(false);
  const [, force] = useState(0);
  const [tab, setTab] = useState<string>("items");
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    prefill?: Partial<ItemMasterRecord>;
  }>({ open: false });
  const [editItem, setEditItem] = useState<ItemMasterRecord | null>(null);
  const [editLoc, setEditLoc] = useState<LocationRecord | null>(null);
  const [toDeleteItem, setToDeleteItem] = useState<ItemMasterRecord | null>(null);
  const [toDeleteLoc, setToDeleteLoc] = useState<LocationRecord | null>(null);

  // Deep-link: /masters?tab=items&addSku=...&tenantId=...&upc=...&desc=...&style=...
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    if (t === "items" || t === "locations" || t === "exceptions") setTab(t);
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

  const items = useMemo(() => {
    return itemMaster.filter((i) => {
      if (tenantId !== "all" && i.tenantId !== tenantId) return false;
      const q = itemQuery.toLowerCase();
      if (!q) return true;
      return (
        i.sku.toLowerCase().includes(q) ||
        i.upc.includes(q) ||
        i.itemStyle.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
      );
    });
  }, [tenantId, itemQuery]);

  const locs = useMemo(() => {
    return locationMaster.filter((l) => {
      if (warehouseId !== "all" && l.warehouseId !== warehouseId) return false;
      if (tenantId !== "all" && l.tenantId && l.tenantId !== tenantId) return false;
      const q = locQuery.toLowerCase();
      if (!q) return true;
      return (
        l.id.toLowerCase().includes(q) ||
        l.zone.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q) ||
        (l.tenantId?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [warehouseId, locQuery, tenantId]);

  const exceptions = useMemo(() => {
    return collectMasterExceptions().filter((e) => {
      if (tenantId !== "all" && e.tenantId !== tenantId) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, addDialog.open, editLoc]);

  const pickableCount = locs.filter((l) => l.pickable).length;

  return (
    <div className="px-6 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Master Data</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Item Master (EDI 832) and Warehouse Location Master. Inbound ASNs and Orders are
          cross-checked against these registers before execution.
        </p>
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
                      {tenants.find((t) => t.id === i.tenantId)?.code ?? i.tenantId}
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

        {/* LOCATION MASTER ------------------------------------- */}
        <TabsContent value="locations" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={locQuery}
                onChange={(e) => setLocQuery(e.target.value)}
                placeholder="Search location ID, zone, type…"
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setCsvLocOpen(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Import CSV
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Location ID
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Zone</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Tenant / Client
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Warehouse</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Capacity</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Pickable</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Allowed Styles
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Notes</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right w-24">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locs.map((l) => {
                  const pct = locationOccupancyPct(l);
                  return (
                    <TableRow key={l.id} className="text-xs">
                      <TableCell className="font-mono">{l.id}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono ${typeStyles[l.type]}`}
                        >
                          {l.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{l.zone}</TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {l.tenantId
                          ? (tenants.find((t) => t.id === l.tenantId)?.code ?? l.tenantId)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {warehouses.find((w) => w.id === l.warehouseId)?.code ?? l.warehouseId}
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 w-20" />
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {l.occupiedPallets}/{l.capacityPallets}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {l.pickable ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-chart-3/15 text-chart-3 border-chart-3/30"
                          >
                            Yes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-muted text-muted-foreground"
                          >
                            No · excluded from allocation
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {l.allowedItemStyles?.join(", ") ?? "any"}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {l.notes ?? "—"}
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
                  );
                })}
                {locs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-xs text-muted-foreground py-8"
                    >
                      No locations for the current warehouse filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* EXCEPTIONS ------------------------------------------- */}
        <TabsContent value="exceptions" className="space-y-3">
          {exceptions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
              <CheckCircle2 className="h-6 w-6 text-chart-3 mx-auto" />
              <p className="mt-2 text-sm font-medium">
                All Inbound and Order lines reconcile to Item Master
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cross-checks executed against {itemMaster.length} item-master records.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">Scope</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Document</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">SKU</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Tenant</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Reason</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-right">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map((e, idx) => (
                    <TableRow
                      key={`${e.scope}-${e.documentId}-${e.sku}-${idx}`}
                      className="text-xs"
                    >
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {e.scope}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{e.documentId}</TableCell>
                      <TableCell className="font-mono">{e.sku}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {tenants.find((t) => t.id === e.tenantId)?.code ?? e.tenantId}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-destructive/15 text-destructive border-destructive/30"
                        >
                          <Layers className="h-3 w-3 mr-1" /> {e.detail}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] gap-1.5"
                          onClick={() =>
                            setAddDialog({
                              open: true,
                              prefill: { sku: e.sku, tenantId: e.tenantId },
                            })
                          }
                        >
                          <Plus className="h-3 w-3" /> Add to Item Master
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CsvUploader
        open={csv832Open}
        onOpenChange={setCsv832Open}
        title="Ingest Item Master"
        description="Upload an EDI 832 export or vendor CSV. Fields below mirror the LIN/PO4/PRC segments."
        ediHint="EDI 832"
        targetFields={[
          { key: "sku", label: "Vendor SKU (LIN03)", required: true },
          { key: "upc", label: "UPC / GTIN (LIN05)", required: true },
          { key: "itemStyle", label: "Item style" },
          { key: "description", label: "Description (PID05)", required: true },
          { key: "uom", label: "Unit of measure" },
          { key: "caseQty", label: "Case quantity (PO404)" },
          { key: "unitCost", label: "Unit cost (PRC02)", required: true },
          { key: "unitPrice", label: "Unit price (CTP08)" },
          { key: "weightLbs", label: "Unit weight, lbs (MEA-G)" },
          { key: "caseWeightLbs", label: "Case weight, lbs (MEA-G)" },
          { key: "lengthIn", label: "Case length, in (MEA-LN)" },
          { key: "widthIn", label: "Case width, in (MEA-WD)" },
          { key: "heightIn", label: "Case height, in (MEA-HT)" },
          { key: "cbmPerCase", label: "CBM per case (MEA-CB)" },
        ]}
        exampleHeaders={[
          "sku",
          "upc",
          "style",
          "description",
          "uom",
          "case_qty",
          "unit_cost",
          "unit_price",
          "weight_lbs",
          "case_weight_lbs",
          "length_in",
          "width_in",
          "height_in",
          "cbm",
        ]}
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
              onClick={() => {
                if (toDeleteLoc) {
                  deleteLocationFromMaster(toDeleteLoc.id);
                  toast.success(`Deleted location ${toDeleteLoc.id}`);
                  force((n) => n + 1);
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
        itemStyle: seed.itemStyle ?? prefill?.itemStyle ?? "",
        description: seed.description ?? prefill?.description ?? "",
        category: seed.category ?? prefill?.category ?? "Accessories",
        uom: seed.uom ?? prefill?.uom ?? "EA",
        caseQty: seed.caseQty ?? prefill?.caseQty ?? 1,
        unitCost: seed.unitCost ?? prefill?.unitCost ?? 0,
        unitPrice: seed.unitPrice ?? prefill?.unitPrice ?? 0,
        weightLbs: seed.weightLbs ?? prefill?.weightLbs ?? 0.5,
        lengthIn: seed.lengthIn ?? prefill?.lengthIn ?? 12,
        widthIn: seed.widthIn ?? prefill?.widthIn ?? 10,
        heightIn: seed.heightIn ?? prefill?.heightIn ?? 8,
        caseWeightLbs: seed.caseWeightLbs ?? prefill?.caseWeightLbs ?? 1,
        tenantId: seed.tenantId ?? prefill?.tenantId ?? "",
      });
    }
  }, [open, editItem, prefill]);

  const set = <K extends keyof ItemMasterRecord>(k: K, v: ItemMasterRecord[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.sku || !form.tenantId || !form.description) {
      toast.error("SKU, client and description are required");
      return;
    }
    const f = nmfcFor(form.sku, form.category ?? "Default");
    const payload = {
      sku: form.sku,
      upc: form.upc ?? "",
      itemStyle: form.itemStyle ?? form.sku.split("-")[1] ?? form.sku,
      description: form.description,
      category: form.category ?? "Accessories",
      uom: form.uom ?? "EA",
      caseQty: Number(form.caseQty) || 1,
      unitCost: Number(form.unitCost) || 0,
      unitPrice: Number(form.unitPrice) || 0,
      weightLbs: Number(form.weightLbs) || 0,
      lengthIn: Number(form.lengthIn) || 0,
      widthIn: Number(form.widthIn) || 0,
      heightIn: Number(form.heightIn) || 0,
      caseWeightLbs: Number(form.caseWeightLbs) || 0,
      nmfc: form.nmfc ?? f.nmfc,
      freightClass: (form.freightClass as ItemMasterRecord["freightClass"]) ?? f.freightClass,
      tenantId: form.tenantId,
    };
    if (editItem) {
      updateItemInMaster(editItem.sku, payload);
      toast.success(`Updated ${payload.sku} in Item Master`);
    } else {
      addItemToMaster(payload);
      toast.success(`Added ${payload.sku} to Item Master`);
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
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
        </div>

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
  const isEdit = !!prefill;
  const [form, setForm] = useState<Partial<LocationRecord>>({});

  useEffect(() => {
    if (open && prefill) {
      setForm({ ...prefill, tenantId: prefill.tenantId ?? undefined });
    } else if (open) {
      setForm({
        id: "",
        warehouseId: defaultWarehouseId ?? "",
        tenantId: undefined,
        type: "RACK",
        zone: "",
        capacityPallets: 1,
        occupiedPallets: 0,
        pickable: true,
        allowedItemStyles: null,
        notes: "",
      });
    }
  }, [open, prefill, defaultWarehouseId]);

  const set = <K extends keyof LocationRecord>(k: K, v: LocationRecord[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.id || !form.warehouseId || !form.type) {
      toast.error("Location ID, warehouse and type are required");
      return;
    }
    if (isEdit && prefill) {
      updateLocationInMaster(prefill.id, form as Partial<LocationRecord>);
      toast.success(`Updated location ${form.id}`);
    } else {
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
      };
      locationMaster.push(newLoc);
      toast.success(`Added location ${newLoc.id}`);
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
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
        </div>

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
