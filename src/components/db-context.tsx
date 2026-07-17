/**
 * ============================================================
 *  MODULE INDEX — Database Context Provider (React)
 * ============================================================
 *
 *  Purpose: React context that bridges Firestore real-time
 *           listeners into the component tree. On mount it:
 *     1. Seeds Firestore with mock data if the database is empty
 *     2. Subscribes to all WMS collections via onSnapshot
 *     3. Keeps in-memory lib arrays synchronized with Firestore
 *
 *  Provides (via useWmsData()):
 *    • loading                   — Initial seed/sync in progress
 *    • refreshData()             — Force re-subscribe (e.g. after auth change)
 *    • tenants[], warehouses[]   — Master data
 *    • inventoryItems[]          — Stock on hand
 *    • pallets[], pickWaves[]    — Pallet & wave management
 *    • orders[], pickTickets[]   — Order lifecycle
 *    • inboundShipments[]        — ASN receiving
 *    • carrierDispatches[]       — Shipment/yard ops
 *    • bols[]                    — Bills of lading
 *    • billingClients, billingRules, billableEvents, invoices[]
 *    • itemMaster[], locationMaster[] — Master data
 *    • ediLogs[]                 — EDI transaction log
 *    • clientAllocationConfigs[] — Per-tenant allocation config
 *
 *  Seeding:
 *    Seeds all collections on first load if tenants collection
 *    is empty. Uses writeBatch for atomic collection seeding.
 *
 *  Extension points:
 *    - Add new collections to syncCollection() calls
 *    - Add new state variables + setters for new domain data
 *    - Adjust seeding logic for production (remove mock data)
 * ============================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, getDocs, limit, doc, writeBatch, query } from "firebase/firestore";
import { db } from "@/lib/firestore";

// Import local seed data
import {
  tenants as seedTenants,
  warehouses as seedWarehouses,
} from "@/lib/mock-data";
import {
  inventoryItems as seedInventoryItems,
  clientAllocationConfigs as seedClientAllocationConfigs,
} from "@/lib/mock-data";
import {
  itemMaster as seedItemMaster,
  locationMaster as seedLocationMaster,
} from "@/lib/master-data";
import { pallets as seedPallets, pickWaves as seedPickWaves } from "@/lib/pallet-data";
import { orders as seedOrders, ediLogs as seedEdiLogs } from "@/lib/edi-data";
import { inboundShipments as seedInboundShipments } from "@/lib/inbound-data";
import { shipments as seedCarrierDispatches } from "@/lib/shipment-data";
import { seedBols as seedBols } from "@/lib/bol-data";
import { employees as seedEmployees } from "@/lib/rf-employees";

// Enterprise seed data (inline to avoid circular deps)
const seedTenantPortalUsers = [
  { id: "tp-acme", tenantId: "acme", email: "portal@acme.com", name: "Acme Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "tp-northstar", tenantId: "northstar", email: "portal@northstar.com", name: "Northstar Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "tp-harborlite", tenantId: "harborlite", email: "portal@harborlite.com", name: "Harborlite Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "tp-verdant", tenantId: "verdant", email: "portal@verdant.com", name: "Verdant Portal User", role: "Admin", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const seedRmaOrders = [
  { id: "rma-001", tenantId: "acme", warehouseId: "atl1", rmaNumber: "RMA-2026-001", status: "draft", returnReason: "customer_return", customerName: "Acme Outdoor Co.", notes: "Customer returned defective tent", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "rma-002", tenantId: "acme", warehouseId: "atl1", rmaNumber: "RMA-2026-002", status: "received", returnReason: "damaged", customerName: "Acme Outdoor Co.", notes: "Damaged during transit", createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "rma-003", tenantId: "northstar", warehouseId: "ord2", rmaNumber: "RMA-2026-003", status: "inspected", returnReason: "wrong_item", customerName: "Northstar Apparel", notes: "Wrong size shipped", createdAt: new Date(Date.now() - 172800000).toISOString(), updatedAt: new Date().toISOString() },
];

const seedRmaLines = [
  { id: "rl-001", rmaId: "rma-001", tenantId: "acme", sku: "ACM-TENT-2P-OLV", description: "Ridgeline 2-Person Tent, Olive", qtyExpected: 1, qtyReceived: 1, unitCost: 84.5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "rl-002", rmaId: "rma-002", tenantId: "acme", sku: "ACM-STV-CMP-01", description: "Compact Camp Stove, Single Burner", qtyExpected: 2, qtyReceived: 2, unitCost: 22.1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "rl-003", rmaId: "rma-003", tenantId: "northstar", sku: "NSA-HOOD-BLK-M", description: "Classic Pullover Hoodie, Black, M", qtyExpected: 3, qtyReceived: 3, unitCost: 14.2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const seedRmaDispositions = [
  { id: "rd-001", rmaId: "rma-001", lineId: "rl-001", tenantId: "acme", dispositionType: "return_to_stock", status: "completed", qty: 1, processedBy: "warehouse-lead", processedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "rd-002", rmaId: "rma-002", lineId: "rl-002", tenantId: "acme", dispositionType: "quarantine", status: "in_progress", qty: 2, processedBy: "quality-inspector", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const seedReturnProcessingFees = [
  { id: "rf-001", tenantId: "acme", rmaId: "rma-001", lineId: "rl-001", feeType: "restocking", amount: 12.68, currency: "USD", description: "Restocking fee (15% of unit cost)", autoBilled: true, createdAt: new Date().toISOString() },
  { id: "rf-002", tenantId: "acme", rmaId: "rma-002", lineId: "rl-002", feeType: "inspection", amount: 5.0, currency: "USD", description: "Inspection fee", autoBilled: true, createdAt: new Date().toISOString() },
];

const seedCarrierCredentials = [
  { id: "cc-usps", tenantId: "acme", carrierId: "usps", carrierName: "USPS", apiKey: "", apiEndpoint: "https://api.usps.com", accountNumber: "ACME-USPS-001", scacCode: "USPS", enabled: true, supportedCountries: ["US"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "cc-ups", tenantId: "acme", carrierId: "ups", carrierName: "UPS", apiKey: "", apiEndpoint: "https://api.ups.com", accountNumber: "ACME-UPS-001", scacCode: "UPSN", enabled: true, supportedCountries: ["US", "CA"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "cc-fedex", tenantId: "acme", carrierId: "fedex", carrierName: "FedEx", apiKey: "", apiEndpoint: "https://api.fedex.com", accountNumber: "ACME-FDX-001", scacCode: "FXFE", enabled: true, supportedCountries: ["US", "CA"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// Import types
import type { Tenant, Warehouse, InventoryItem } from "@/lib/mock-data";
import type { Pallet, PickWave } from "@/lib/pallet-data";
import type { Order, EdiLog } from "@/lib/edi-data";
import type { InboundShipment } from "@/lib/inbound-data";
import type { CarrierDispatch } from "@/lib/shipment-data";
import type { Bol } from "@/lib/bol-data";
import type { ItemMasterRecord, LocationRecord } from "@/lib/master-data";
import type { BillingClient, ChargeRule, BillableEvent, Invoice } from "@/lib/billing-data";
import type { ClientAllocationConfig, PickTicket } from "@/lib/mock-data";

// Import mutable library array targets for background synchronization
import {
  itemMaster as libItemMaster,
  locationMaster as libLocationMaster,
} from "@/lib/master-data";
import { pallets as libPallets, pickWaves as libPickWaves } from "@/lib/pallet-data";
import {
  clientAllocationConfigs as libClientAllocationConfigs,
  pickTickets as libPickTickets,
  inventoryItems as libInventoryItems,
} from "@/lib/mock-data";
import { orders as libOrders, ediLogs as libEdiLogs } from "@/lib/edi-data";
import { inboundShipments as libInboundShipments } from "@/lib/inbound-data";
import { shipments as libCarrierDispatches } from "@/lib/shipment-data";
import { seedBols as libBols } from "@/lib/bol-data";

type DatabaseContextType = {
  loading: boolean;
  refreshData: () => void;
  tenants: Tenant[];
  warehouses: Warehouse[];
  inventoryItems: InventoryItem[];
  pallets: Pallet[];
  pickWaves: PickWave[];
  orders: Order[];
  inboundShipments: InboundShipment[];
  carrierDispatches: CarrierDispatch[];
  bols: Bol[];
  billingClients: BillingClient[];
  billingRules: ChargeRule[];
  billableEvents: BillableEvent[];
  invoices: Invoice[];
  itemMaster: ItemMasterRecord[];
  locationMaster: LocationRecord[];
  ediLogs: EdiLog[];
  clientAllocationConfigs: ClientAllocationConfig[];
  pickTickets: PickTicket[];
  employees: any[];
  tenantPortalUsers: any[];
  rmaOrders: any[];
  rmaLines: any[];
  rmaDispositions: any[];
  returnProcessingFees: any[];
  carrierCredentials: any[];
};

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [pickWaves, setPickWaves] = useState<PickWave[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inboundShipments, setInboundShipments] = useState<InboundShipment[]>([]);
  const [carrierDispatches, setCarrierDispatches] = useState<CarrierDispatch[]>([]);
  const [bols, setBols] = useState<Bol[]>([]);
  const [billingClients, setBillingClients] = useState<BillingClient[]>([]);
  const [billingRules, setBillingRules] = useState<ChargeRule[]>([]);
  const [billableEvents, setBillableEvents] = useState<BillableEvent[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [itemMaster, setItemMaster] = useState<ItemMasterRecord[]>([]);
  const [locationMaster, setLocationMaster] = useState<LocationRecord[]>([]);
  const [ediLogs, setEdiLogs] = useState<EdiLog[]>([]);
  const [clientAllocationConfigs, setClientAllocationConfigs] = useState<ClientAllocationConfig[]>(
    [],
  );
  const [pickTickets, setPickTickets] = useState<PickTicket[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tenantPortalUsers, setTenantPortalUsers] = useState<any[]>([]);
  const [rmaOrders, setRmaOrders] = useState<any[]>([]);
  const [rmaLines, setRmaLines] = useState<any[]>([]);
  const [rmaDispositions, setRmaDispositions] = useState<any[]>([]);
  const [returnProcessingFees, setReturnProcessingFees] = useState<any[]>([]);
  const [carrierCredentials, setCarrierCredentials] = useState<any[]>([]);
  const [dataVersion, setDataVersion] = useState(0);

  const refreshData = useCallback(() => {
    setLoading(true);
    setDataVersion((v) => v + 1);
  }, []);

  // 1. Database Seeding + 2. Listener setup (re-run on manual refresh)
  useEffect(() => {
    async function initializeAndSeed() {
      try {
        const tenantsCol = collection(db, "tenants");
        const tenantsSnap = await getDocs(query(tenantsCol, limit(1)));
        if (tenantsSnap.empty) {
          console.log("Firestore database is empty. Seeding default WMS datasets...");

          const seedCollection = async (
            colName: string,
            items: any[],
            getId: (item: any) => string,
          ) => {
            const batch = writeBatch(db);
            items.forEach((item) => {
              const docRef = doc(db, colName, getId(item));
              batch.set(docRef, item);
            });
            await batch.commit();
          };

          await seedCollection("tenants", seedTenants, (item) => item.id);
          await seedCollection("warehouses", seedWarehouses, (item) => item.id);
          await seedCollection("inventoryItems", seedInventoryItems, (item) => item.sku);
          await seedCollection("pallets", seedPallets, (item) => item.id);
          await seedCollection("pickWaves", seedPickWaves, (item) => item.id);
          await seedCollection("orders", seedOrders, (item) => item.id);
          await seedCollection("inboundShipments", seedInboundShipments, (item) => item.id);
          await seedCollection("carrierDispatches", seedCarrierDispatches, (item) => item.id);
          await seedCollection("bols", seedBols, (item) => item.id);
          await seedCollection("itemMaster", seedItemMaster, (item) => item.sku);
          await seedCollection("locationMaster", seedLocationMaster, (item) => item.id);
          await seedCollection("ediLogs", seedEdiLogs, (item) => item.id);
          await seedCollection("clientAllocationConfigs", seedClientAllocationConfigs, (item) => item.tenantId);
          await seedCollection("employees", seedEmployees, (item) => item.badgeId);

          console.log("Default WMS datasets successfully seeded to Firestore!");
        } else {
          const empSnap = await getDocs(collection(db, "employees"));
          if (empSnap.empty) {
            console.log("Seeding employees into existing database...");
            const batch = writeBatch(db);
            seedEmployees.forEach((emp) => {
              batch.set(doc(db, "employees", emp.badgeId), emp);
            });
            await batch.commit();
            console.log("Employees seeded successfully!");
          }
        }

        // Seed enterprise collections (always, even if core already seeded)
        const enterpriseCollections: Record<string, any[]> = {
          tenantPortalUsers: seedTenantPortalUsers,
          rmaOrders: seedRmaOrders,
          rmaLines: seedRmaLines,
          rmaDispositions: seedRmaDispositions,
          returnProcessingFees: seedReturnProcessingFees,
          carrierCredentials: seedCarrierCredentials,
        };

        for (const [colName, items] of Object.entries(enterpriseCollections)) {
          const colSnap = await getDocs(collection(db, colName));
          if (colSnap.empty) {
            console.log(`Seeding ${colName}...`);
            const batch = writeBatch(db);
            items.forEach((item) => {
              const docRef = doc(db, colName, String(item.id));
              batch.set(docRef, item);
            });
            await batch.commit();
            console.log(`${colName} seeded successfully!`);
          }
        }
      } catch (err) {
        console.error("Firestore database seeding failed:", err);
      }
    }

    initializeAndSeed();
  }, []);

  // 2. Real-time Synchronization
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    const syncCollection = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      libArrayTarget?: T[],
    ) => {
      const unsub = onSnapshot(collection(db, colName), (snap) => {
        const list = snap.docs.map((d) => d.data() as T);
        setter(list);

        // Update in-memory reference to keep non-reactive library logic in sync
        if (libArrayTarget) {
          libArrayTarget.length = 0;
          libArrayTarget.push(...list);
        }
      });
      unsubscribers.push(unsub);
    };

    syncCollection("tenants", setTenants);
    syncCollection("warehouses", setWarehouses);
    syncCollection("inventoryItems", setInventoryItems, libInventoryItems);
    syncCollection("pallets", setPallets, libPallets);
    syncCollection("pickWaves", setPickWaves, libPickWaves as unknown as PickWave[]);
    syncCollection("orders", setOrders, libOrders);
    syncCollection("inboundShipments", setInboundShipments, libInboundShipments);
    syncCollection("carrierDispatches", setCarrierDispatches, libCarrierDispatches);
    syncCollection("bols", setBols, libBols);
    syncCollection("billingClients", setBillingClients);
    syncCollection("billingRules", setBillingRules);
    syncCollection("billableEvents", setBillableEvents);
    syncCollection("invoices", setInvoices);
    syncCollection("itemMaster", setItemMaster, libItemMaster);
    syncCollection("locationMaster", setLocationMaster, libLocationMaster);
    syncCollection("ediLogs", setEdiLogs, libEdiLogs);
    syncCollection(
      "clientAllocationConfigs",
      setClientAllocationConfigs,
      libClientAllocationConfigs,
    );
    syncCollection("pickTickets", setPickTickets, libPickTickets);
    syncCollection("employees", setEmployees as any, [] as any);
    syncCollection("tenantPortalUsers", setTenantPortalUsers as any);
    syncCollection("rmaOrders", setRmaOrders as any);
    syncCollection("rmaLines", setRmaLines as any);
    syncCollection("rmaDispositions", setRmaDispositions as any);
    syncCollection("returnProcessingFees", setReturnProcessingFees as any);
    syncCollection("carrierCredentials", setCarrierCredentials as any);

    // Turn off loading once initial data snaps are bound
    setLoading(false);

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [dataVersion]);

  return (
    <DatabaseContext.Provider
      value={{
        loading,
        refreshData,
        tenants,
        warehouses,
        inventoryItems,
        pallets,
        pickWaves,
        orders,
        inboundShipments,
        carrierDispatches,
        bols,
        billingClients,
        billingRules,
        billableEvents,
        invoices,
        itemMaster,
        locationMaster,
        ediLogs,
        clientAllocationConfigs,
        pickTickets,
        employees,
        tenantPortalUsers,
        rmaOrders,
        rmaLines,
        rmaDispositions,
        returnProcessingFees,
        carrierCredentials,
      }}
    >
      {loading ? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        children
      )}
    </DatabaseContext.Provider>
  );
}

export function useWmsData() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error("useWmsData must be used inside DatabaseProvider");
  return ctx;
}
