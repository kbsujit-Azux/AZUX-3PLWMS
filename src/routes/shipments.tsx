import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Filter,
  Truck,
  PackageCheck,
  AlertTriangle,
  Send,
  Printer,
  FileText,
  ClipboardCheck,
  DoorOpen,
  PlayCircle,
  CircleDot,
  Download,
  RefreshCw,
  Package,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspace } from "@/components/workspace-context";
import { tenants, warehouses } from "@/lib/mock-data";
import {
  subscribeShipmentRecords,
  updateShipmentRecord,
  subscribeOutboundPallets,
  fetchOrders,
  subscribeOrders,
  updateOrder,
  clearDropBatchesForOrder,
  createBol,
  getNextBolNumber,
  fetchBillsOfLading,
  subscribeBillsOfLading,
  updateOutboundPallet,
} from "@/lib/firestore-data";
import { buildBolFromOrder, emit945ForBol, type BillOfLading } from "@/lib/bol-data";
import { BolDocument } from "@/components/bol/bol-document";
import { PackingSlip } from "@/components/bol/packing-slip";
import { fmtDateTime } from "@/lib/utils";
import type { Order } from "@/lib/edi-data";
import { useEffect } from "react";

export const Route = createFileRoute("/shipments")({
  head: () => ({
    meta: [
      { title: "Shipments — AZUX 3PL WMS Systems" },
      {
        name: "description",
        content:
          "Outbound shipments — dock door scheduling, driver check-in, 945 tender, POD capture. Each shipment ties to a systemic VICS BOL.",
      },
    ],
  }),
  component: ShipmentsPage,
});

type Shipment = {
  id: string;
  bolId: string;
  orderIds: string[];
  tenantId: string;
  warehouseId: string;
  carrier: string;
  scac: string;
  serviceLevel: string;
  mode: string;
  status: string;
  dockDoor: string;
  appointmentAt: string;
  driverName?: string;
  driverPhone?: string;
  checkInAt?: string;
  departedAt?: string;
  deliveredAt?: string;
  podSignedBy?: string;
  trailerNumber: string;
  sealNumber: string;
  proNumber: string;
  shipTo: string;
  pallets: number;
  cartons: number;
  weightLbs: number;
  declaredValue: number;
};

type ShipmentStatus = "pending" | "staged" | "loading" | "tendered" | "in-transit" | "delivered" | "exception";

const statusStyles: Record<ShipmentStatus, string> = {
  pending:     "bg-muted text-muted-foreground border-border",
  staged:      "bg-chart-4/15 text-chart-4 border-chart-4/30",
  loading:     "bg-chart-2/15 text-chart-2 border-chart-2/30",
  tendered:    "bg-primary/15 text-primary border-primary/30",
  "in-transit":"bg-chart-2/15 text-chart-2 border-chart-2/30",
  delivered:   "bg-chart-3/15 text-chart-3 border-chart-3/30",
  exception:   "bg-destructive/15 text-destructive border-destructive/30",
};

const modeStyles: Record<string, string> = {
  TL:         "bg-primary/10 text-primary border-primary/30",
  LTL:        "bg-chart-4/10 text-chart-4 border-chart-4/30",
  Parcel:     "bg-chart-3/10 text-chart-3 border-chart-3/30",
  Intermodal: "bg-chart-2/10 text-chart-2 border-chart-2/30",
};

function ShipmentsPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | ShipmentStatus>("all");
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [podOpen, setPodOpen] = useState(false);
  const [podSigner, setPodSigner] = useState("");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [ordersMap, setOrdersMap] = useState<Map<string, Order>>(new Map());
  const [outboundPallets, setOutboundPallets] = useState<any[]>([]);
  const [bols, setBols] = useState<BillOfLading[]>([]);

  // Tender dialog state
  const [tenderOpen, setTenderOpen] = useState(false);
  const [tenderShipment, setTenderShipment] = useState<Shipment | null>(null);
  const [tenderScac, setTenderScac] = useState("");
  const [tenderCarrier, setTenderCarrier] = useState("");
  const [tenderAuth, setTenderAuth] = useState("");
  const [isTendering, setIsTendering] = useState(false);

  useEffect(() => {
    const unsubShip = subscribeShipmentRecords((items) => {
      setShipments(items as Shipment[]);
    }, tenantId !== "all" ? tenantId : undefined, warehouseId !== "all" ? warehouseId : undefined);

    const unsubOrders = subscribeOrders(
      (ords) => {
        const map = new Map();
        ords.forEach((o) => map.set(o.id, o));
        setOrdersMap(map);
      },
      tenantId !== "all" ? tenantId : undefined,
      warehouseId !== "all" ? warehouseId : undefined,
    );

    const unsubPallets = subscribeOutboundPallets((pallets) => {
      setOutboundPallets(pallets);
    }, tenantId !== "all" ? tenantId : undefined, warehouseId !== "all" ? warehouseId : undefined);

    const unsubBols = subscribeBillsOfLading((items) => {
      setBols(items);
    }, tenantId !== "all" ? tenantId : undefined, warehouseId !== "all" ? warehouseId : undefined);

    return () => {
      unsubShip();
      unsubPallets();
      unsubBols();
    };
  }, [tenantId, warehouseId, tick]);

  const all = useMemo(() => [...shipments], [shipments]);

  const filtered = useMemo(() => {
    return all.filter((s) => {
      if (tenantId !== "all" && s.tenantId !== tenantId) return false;
      if (warehouseId !== "all" && s.warehouseId !== warehouseId) return false;
      if (tab !== "all" && s.status !== tab) return false;
      if (query) {
        const q = query.toLowerCase();
        const blob = `${s.id} ${s.bolId} ${s.proNumber} ${s.trailerNumber} ${s.sealNumber} ${s.carrier} ${s.scac} ${s.shipTo} ${s.orderIds.join(" ")} ${s.driverName ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [all, tenantId, warehouseId, tab, query]);

  const stats = useMemo(() => {
    const s = { staged: 0, loading: 0, transit: 0, exception: 0, deliveredToday: 0 };
    const today = new Date().toISOString().slice(0, 10);
    for (const x of all) {
      if (tenantId !== "all" && x.tenantId !== tenantId) continue;
      if (warehouseId !== "all" && x.warehouseId !== warehouseId) continue;
      if (x.status === "staged" || x.status === "pending") s.staged++;
      else if (x.status === "loading" || x.status === "tendered") s.loading++;
      else if (x.status === "in-transit") s.transit++;
      else if (x.status === "exception") s.exception++;
      if (x.status === "delivered" && x.deliveredAt?.slice(0, 10) === today) s.deliveredToday++;
    }
    return s;
  }, [all, tenantId, warehouseId]);

  const openShipment = openId ? all.find((s) => s.id === openId) : null;
  const openBol = openShipment && openShipment.bolId ? bols.find((b) => b.id === openShipment!.bolId) : undefined;

  const openTenderDialog = (shipment: Shipment) => {
    setTenderShipment(shipment);
    setTenderScac(shipment.scac || "");
    setTenderCarrier(shipment.carrier || "");
    setTenderAuth("");
    setTenderOpen(true);
  };

  const confirmTender = async () => {
    if (!tenderShipment) return;
    setIsTendering(true);
    try {
      const orderId = tenderShipment.orderIds[0];
      const order = ordersMap.get(orderId);
      const poNumber = order?.poNumber ?? "";

      const bolNumber = await getNextBolNumber();
      const scac = tenderScac || "MISC";
      const carrier = tenderCarrier || tenderShipment.carrier;
      const proNumber = `${scac}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 10)}`;

      const palletsForOrder = outboundPallets.filter((p) => p.orderId === orderId);

      let bol: BillOfLading;
      if (order) {
        const builtBol = buildBolFromOrder(order);
        bol = {
          ...builtBol,
          bolNumber,
          proNumber,
          scac,
          carrier,
          trailerNumber: `TRL-${scac}-${orderId.slice(-4)}`,
          sealNumber: `SL-${orderId.slice(-5)}`,
          status: "tendered",
        };
      } else {
        bol = {
          id: `BOL-${orderId}`,
          bolNumber,
          proNumber,
          type: "single",
          status: "tendered",
          tenantId: tenderShipment.tenantId,
          warehouseId: tenderShipment.warehouseId,
          carrier,
          scac,
          serviceLevel: tenderShipment.serviceLevel,
          trailerNumber: `TRL-${scac}-${orderId.slice(-4)}`,
          sealNumber: `SL-${orderId.slice(-5)}`,
          freightChargeTerms: "prepaid" as const,
          cod: 0,
          declaredValue: tenderShipment.declaredValue,
          shipper: {
            name: `AZUX 3PL · ${warehouses.find(w => w.id === tenderShipment.warehouseId)?.code ?? "WH"}`,
            address1: "—",
            city: "—",
            state: "—",
            zip: "—",
          },
          consignee: {
            name: tenderShipment.shipTo,
            address1: "—",
            city: "—",
            state: "—",
            zip: "—",
          },
          specialInstructions: tenderAuth || "Standard tender",
          pickupDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          childOrderIds: [orderId],
          lines: palletsForOrder.flatMap((p: any) =>
            p.lines.map((l: any) => ({
              qty: Math.ceil(l.unitsPicked / Math.max(1, l.caseQty)),
              pkgType: "CTN" as const,
              weightLbs: l.weightLbs,
              nmfc: "999999",
              freightClass: "100",
              hazmat: false,
              description: l.description,
              sku: l.sku,
              poNumber: poNumber,
              orderId,
            })),
          ),
          totals: {
            units: palletsForOrder.reduce((s: number, p: any) => s + p.lines.reduce((ls: number, l: any) => ls + l.unitsPicked, 0), 0),
            pallets: palletsForOrder.length,
            cartons: palletsForOrder.reduce((s: number, p: any) => s + p.lines.reduce((ls: number, l: any) => ls + Math.ceil(l.unitsPicked / Math.max(1, l.caseQty)), 0), 0),
            weightLbs: Math.round(palletsForOrder.reduce((s: number, p: any) => s + p.lines.reduce((ls: number, l: any) => ls + l.weightLbs, 0), 0) * 10) / 10,
          },
        };
      }

      await createBol(bol);

      if (order) {
        await updateOrder(orderId, { status: "packed" });
      }

      await clearDropBatchesForOrder(orderId);

      await updateShipmentRecord(tenderShipment.id, {
        status: "tendered",
        bolId: bol.id,
        scac,
        carrier,
        proNumber: bol.proNumber,
        tenderedAt: new Date().toISOString(),
      });

      for (const pallet of outboundPallets) {
        if (pallet.orderId === orderId) {
          await updateOutboundPallet(pallet.id, {
            status: "tendered",
            bolId: bol.id,
            scac,
            carrierName: carrier,
            authorization: tenderAuth,
            tenderedAt: new Date().toISOString(),
          });
        }
      }

      emit945ForBol(bol);

      toast.success(`${tenderShipment.id} tendered`, {
        description: `BOL ${bol.bolNumber} · PRO ${bol.proNumber} · 945 transmitted`,
      });

      setTenderOpen(false);
      setTenderShipment(null);
      setTick((t) => t + 1);
    } catch (e: any) {
      toast.error(`Tender failed: ${e.message}`);
    } finally {
      setIsTendering(false);
    }
  };

  const doTransition = async (id: string, next: ShipmentStatus, label: string) => {
    await updateShipmentRecord(id, { status: next });

    // Sync order status at key lifecycle milestones
    const shipment = all.find((s) => s.id === id);
    if (shipment) {
      for (const orderId of shipment.orderIds) {
        const order = ordersMap.get(orderId);
        if (order) {
          if (next === "in-transit") {
            await updateOrder(orderId, { status: "shipped" });
          } else if (next === "delivered") {
            await updateOrder(orderId, { status: "shipped" });
          }
        }
      }

      // Sync outbound pallet statuses
      const shipmentPallets = outboundPallets.filter((p) => p.shipmentId === id);
      for (const pallet of shipmentPallets) {
        await updateOutboundPallet(pallet.id, {
          status: next === "in-transit" ? "in-transit" :
                  next === "delivered" ? "delivered" :
                  next === "staged" ? "staged" : pallet.status,
        });
      }
    }

    setTick((t) => t + 1);
    toast.success(`${id} — ${label}`);
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Shipments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dock-door scheduling · driver check-in · EDI 945 tender · POD capture · every shipment ties to a systemic VICS BOL
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border bg-card">
        <StatCell icon={DoorOpen}       label="Staged / pending"  value={stats.staged}        tone="text-foreground" />
        <StatCell icon={PlayCircle}     label="Loading / tendered" value={stats.loading}      tone="text-chart-4" />
        <StatCell icon={Truck}          label="In transit"        value={stats.transit}       tone="text-chart-2" />
        <StatCell icon={AlertTriangle}  label="Exceptions"        value={stats.exception}     tone="text-destructive" />
        <StatCell icon={PackageCheck}   label="Delivered today"   value={stats.deliveredToday} tone="text-chart-3" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-2.5">All</TabsTrigger>
            <TabsTrigger value="staged" className="text-xs px-2.5">Staged</TabsTrigger>
            <TabsTrigger value="loading" className="text-xs px-2.5">Loading</TabsTrigger>
            <TabsTrigger value="tendered" className="text-xs px-2.5">Tendered</TabsTrigger>
            <TabsTrigger value="in-transit" className="text-xs px-2.5">In-Transit</TabsTrigger>
            <TabsTrigger value="delivered" className="text-xs px-2.5">Delivered</TabsTrigger>
            <TabsTrigger value="exception" className="text-xs px-2.5">Exception</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shipment, BOL, PRO, trailer, driver, ship-to…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Filter
            </Button>
          </div>
        </div>

        <TabsContent value={tab} className="mt-3">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[10px] uppercase tracking-wider">Shipment</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">BOL · PRO</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">WH · Door</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Carrier · Mode</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Ship-to</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Appt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Plt</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Ctn</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Wt (lb)</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-10">
                      No shipments match the current filter.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((s) => {
                  const tenant = tenants.find((t) => t.id === s.tenantId);
                  const wh = warehouses.find((w) => w.id === s.warehouseId);
                  return (
                    <TableRow key={s.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="py-2 font-mono font-medium">
                        <button
                          type="button"
                          className="text-primary hover:underline cursor-pointer"
                          onClick={() => setOpenId(s.id)}
                        >
                          {s.id}
                        </button>
                        <div className="text-[10px] text-muted-foreground font-sans">
                          {s.orderIds.length === 1 ? s.orderIds[0] : `${s.orderIds.length} orders`}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">
                        <div>{s.bolId || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{s.proNumber}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="font-mono text-[10px] text-muted-foreground mr-1">{tenant?.code}</span>
                        {tenant?.name.split(" ")[0]}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[11px]">
                        <div>{wh?.code}</div>
                        <div className="text-[10px] text-muted-foreground">{s.dockDoor}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Truck className="h-3 w-3 text-muted-foreground" />
                          <span>{s.carrier}</span>
                        </div>
                        <span className={`inline-flex items-center rounded-sm border px-1 py-0 text-[9px] font-mono mt-0.5 ${modeStyles[s.mode] || modeStyles.LTL}`}>
                          {s.mode}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">{s.shipTo}</TableCell>
                      <TableCell className="py-2 text-[11px] tabular-nums text-muted-foreground">
                        {fmtDateTime(s.appointmentAt)}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.pallets}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.cartons}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.weightLbs.toLocaleString()}</TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[s.status as ShipmentStatus]}`}>
                          <CircleDot className="h-2.5 w-2.5 mr-1" />
                          {s.status.replace("-", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {s.status === "staged" && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-[11px] gap-1.5"
                              onClick={(e) => { e.stopPropagation(); openTenderDialog(s); }}
                            >
                              <ClipboardList className="h-3 w-3" /> Tender
                            </Button>
                          )}
                          {s.status === "tendered" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1.5"
                              onClick={(e) => { e.stopPropagation(); doTransition(s.id, "loading", "driver checked in — loading"); }}
                            >
                              <PlayCircle className="h-3 w-3" /> Check-in
                            </Button>
                          )}
                          {s.status === "loading" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1.5"
                              onClick={(e) => { e.stopPropagation(); doTransition(s.id, "in-transit", "trailer departed yard"); }}
                            >
                              <Send className="h-3 w-3" /> Depart
                            </Button>
                          )}
                          {s.status === "in-transit" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1.5"
                              onClick={(e) => { e.stopPropagation(); setPodSigner(""); setPodOpen(true); }}
                            >
                              <ClipboardCheck className="h-3 w-3" /> POD
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] gap-1.5"
                            onClick={(e) => { e.stopPropagation(); setOpenId(s.id); }}
                          >
                            <FileText className="h-3 w-3" /> View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!openShipment} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {openShipment && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-mono">
                  {openShipment.id}
                  <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyles[openShipment.status as ShipmentStatus]}`}>
                    {openShipment.status.replace("-", " ")}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Tied to BOL <span className="font-mono">{openShipment.bolId || "Pending"}</span> · PRO{" "}
                  <span className="font-mono">{openShipment.proNumber}</span> · {openShipment.carrier} ({openShipment.scac})
                </DialogDescription>
              </DialogHeader>

              {/* Ops snapshot */}
              <div className="grid grid-cols-4 gap-3">
                <OpsCell label="Dock door"     value={openShipment.dockDoor} mono />
                <OpsCell label="Appointment"   value={fmtDateTime(openShipment.appointmentAt)} />
                <OpsCell label="Trailer"       value={openShipment.trailerNumber} mono />
                <OpsCell label="Seal"          value={openShipment.sealNumber} mono />
                <OpsCell label="Driver"        value={openShipment.driverName ?? "—"} />
                <OpsCell label="Driver phone"  value={openShipment.driverPhone ?? "—"} mono />
                <OpsCell label="Check-in"      value={openShipment.checkInAt ? fmtDateTime(openShipment.checkInAt) : "—"} />
                <OpsCell label="Departed"      value={openShipment.departedAt ? fmtDateTime(openShipment.departedAt) : "—"} />
                <OpsCell label="Delivered"     value={openShipment.deliveredAt ? fmtDateTime(openShipment.deliveredAt) : "—"} />
                <OpsCell label="POD signed by" value={openShipment.podSignedBy ?? "—"} />
                <OpsCell label="Pallets / Cartons" value={`${openShipment.pallets} PLT · ${openShipment.cartons} CTN`} />
                <OpsCell label="Weight · Value" value={`${openShipment.weightLbs.toLocaleString()} lb · $${openShipment.declaredValue.toLocaleString()}`} />
              </div>

              {/* Lifecycle actions */}
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Lifecycle</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <LifecycleBtn
                    icon={DoorOpen} label="Mark staged"
                    disabled={openShipment.status !== "pending"}
                    onClick={() => doTransition(openShipment.id, "staged", "marked staged at dock")}
                  />
                  {openShipment.status === "staged" && (
                    <LifecycleBtn
                      icon={ClipboardList} label="Tender shipment"
                      primary
                      onClick={() => openTenderDialog(openShipment)}
                    />
                  )}
                  <LifecycleBtn
                    icon={PlayCircle} label="Driver check-in"
                    disabled={openShipment.status !== "loading"}
                    onClick={() => doTransition(openShipment.id, "loading", "driver checked in — loading")}
                  />
                  <LifecycleBtn
                    icon={Send} label="Depart yard"
                    disabled={openShipment.status !== "tendered"}
                    onClick={() => doTransition(openShipment.id, "in-transit", "trailer departed yard")}
                  />
                  <LifecycleBtn
                    icon={ClipboardCheck} label="Capture POD"
                    disabled={openShipment.status !== "in-transit"}
                    onClick={() => { setPodSigner(""); setPodOpen(true); }}
                  />
                  <div className="flex-1" />
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    onClick={() => window.print()}
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpenId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Tender Dialog */}
      <Dialog open={tenderOpen} onOpenChange={setTenderOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-mono flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Tender Shipment {tenderShipment?.id}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter carrier details to create BOL, packing slip, and tender shipment
            </DialogDescription>
          </DialogHeader>
          {tenderShipment && (
            <div className="space-y-4">
              {/* Order Header */}
              <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Order</div>
                  <div className="font-mono font-medium">{tenderShipment.orderIds[0]}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ship-to</div>
                  <div>{tenderShipment.shipTo}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pallets</div>
                  <div className="font-mono">{tenderShipment.pallets}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Carrier SCAC</Label>
                  <Input
                    value={tenderScac}
                    onChange={(e) => setTenderScac(e.target.value.toUpperCase())}
                    placeholder="e.g. UPSN, FXFE, JBHT"
                    className="h-8 text-xs font-mono mt-1"
                    maxLength={4}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Carrier Name</Label>
                  <Input
                    value={tenderCarrier}
                    onChange={(e) => setTenderCarrier(e.target.value)}
                    placeholder="e.g. UPS, FedEx, JB Hunt"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Authorization / Notes</Label>
                  <textarea
                    value={tenderAuth}
                    onChange={(e) => setTenderAuth(e.target.value)}
                    placeholder="BOL authorization, special instructions, reference numbers…"
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              <div className="rounded-md border border-dashed border-border bg-card p-3 text-[11px] text-muted-foreground">
                This action will:
                <ul className="mt-1 space-y-1 ml-4 list-disc">
                  <li>Generate systemic VICS BOL (17-char formal number)</li>
                  <li>Create industry-standard packing slip</li>
                  <li>Clear all DROP location inventory from pick tickets</li>
                  <li>Auto-transmit EDI 945 to trading partner</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTenderOpen(false)} disabled={isTendering}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={confirmTender}
              disabled={isTendering}
            >
              {isTendering ? "Tendering..." : (
                <>
                  <Send className="h-3.5 w-3.5" /> Confirm & Tender
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POD capture */}
      <Dialog open={podOpen} onOpenChange={setPodOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Capture Proof of Delivery</DialogTitle>
            <DialogDescription className="text-xs">
              Records consignee acknowledgement and closes the shipment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Signed by</label>
            <Input
              value={podSigner}
              onChange={(e) => setPodSigner(e.target.value)}
              placeholder="Receiving contact name"
              className="h-9 text-sm"
            />
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Delivery Date</label>
            <Input
              type="date"
              className="h-9 text-sm"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPodOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!podSigner.trim() || !openShipment}
              onClick={async () => {
                if (!openShipment) return;
                await updateShipmentRecord(openShipment.id, {
                  status: "delivered",
                  deliveredAt: new Date().toISOString(),
                  podSignedBy: podSigner.trim(),
                });
                setPodOpen(false);
                setTick((t) => t + 1);
                toast.success(`POD captured · ${openShipment.id}`, {
                  description: `Signed by ${podSigner.trim()}`,
                });
              }}
            >
              <ClipboardCheck className="h-3.5 w-3.5" /> Save POD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCell({
  icon: Icon, label, value, tone,
}: { icon: typeof Truck; label: string; value: number; tone: string }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3 w-3 ${tone}`} />
        {label}
      </div>
      <div className={`text-base font-semibold tabular-nums ${tone}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function OpsCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function LifecycleBtn({
  icon: Icon, label, onClick, disabled, primary,
}: {
  icon: any; label: string; onClick: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      className="h-7 text-xs gap-1.5"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
