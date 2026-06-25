import React, { createContext, useContext, useState, useEffect } from "react";
import { collection, onSnapshot, getDocs, limit, doc, writeBatch, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Import local seed data
import {
  tenants as seedTenants,
  warehouses as seedWarehouses,
  inventoryItems as seedInventoryItems,
  clientAllocationConfigs as seedClientAllocationConfigs,
} from "@/lib/mock-data";
import { pallets as seedPallets, pickWaves as seedPickWaves } from "@/lib/pallet-data";
import { orders as seedOrders, ediLogs as seedEdiLogs } from "@/lib/edi-data";
import { inboundShipments as seedInboundShipments } from "@/lib/inbound-data";
import { shipments as seedCarrierDispatches } from "@/lib/shipment-data";
import { seedBols as seedBols } from "@/lib/bol-data";
import {
  itemMaster as seedItemMaster,
  locationMaster as seedLocationMaster,
} from "@/lib/master-data";
import {
  billingClients as seedBillingClients,
  defaultRules as seedBillingRules,
  billableEvents as seedBillableEvents,
  seedInvoices,
} from "@/lib/billing-data";

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
} from "@/lib/mock-data";
import { orders as libOrders, ediLogs as libEdiLogs } from "@/lib/edi-data";
import { inboundShipments as libInboundShipments } from "@/lib/inbound-data";
import { shipments as libCarrierDispatches } from "@/lib/shipment-data";
import { seedBols as libBols } from "@/lib/bol-data";
import {
  defaultRules as libBillingRules,
  billableEvents as libBillableEvents,
  seedInvoices as libInvoices,
} from "@/lib/billing-data";

type DatabaseContextType = {
  loading: boolean;
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

  // 1. Database Seeding
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
          await seedCollection("billingClients", seedBillingClients, (item) => item.id);
          await seedCollection("billingRules", seedBillingRules, (item) => item.id);
          await seedCollection("billableEvents", seedBillableEvents, (item) => item.id);
          await seedCollection("invoices", seedInvoices, (item) => item.id);
          await seedCollection("itemMaster", seedItemMaster, (item) => item.sku);
          await seedCollection("locationMaster", seedLocationMaster, (item) => item.id);
          await seedCollection("ediLogs", seedEdiLogs, (item) => item.id);
          await seedCollection(
            "clientAllocationConfigs",
            seedClientAllocationConfigs,
            (item) => item.tenantId,
          );

          console.log("Default WMS datasets successfully seeded to Firestore!");
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
    syncCollection("inventoryItems", setInventoryItems);
    syncCollection("pallets", setPallets, libPallets);
    syncCollection("pickWaves", setPickWaves, libPickWaves as unknown as PickWave[]);
    syncCollection("orders", setOrders, libOrders);
    syncCollection("inboundShipments", setInboundShipments, libInboundShipments);
    syncCollection("carrierDispatches", setCarrierDispatches, libCarrierDispatches);
    syncCollection("bols", setBols, libBols);
    syncCollection("billingClients", setBillingClients);
    syncCollection("billingRules", setBillingRules, libBillingRules);
    syncCollection("billableEvents", setBillableEvents, libBillableEvents);
    syncCollection("invoices", setInvoices, libInvoices);
    syncCollection("itemMaster", setItemMaster, libItemMaster);
    syncCollection("locationMaster", setLocationMaster, libLocationMaster);
    syncCollection("ediLogs", setEdiLogs, libEdiLogs);
    syncCollection(
      "clientAllocationConfigs",
      setClientAllocationConfigs,
      libClientAllocationConfigs,
    );
    syncCollection("pickTickets", setPickTickets, libPickTickets);

    // Turn off loading once initial data snaps are bound
    setLoading(false);

    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  return (
    <DatabaseContext.Provider
      value={{
        loading,
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
