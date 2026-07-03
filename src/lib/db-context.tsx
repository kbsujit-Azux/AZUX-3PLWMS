import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { collection, onSnapshot, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

// Importing seed data
import { tenants, warehouses, inventoryItems } from "./mock-data";
import { itemMaster, locationMaster } from "./master-data";
import { pallets, pickWaves } from "./pallet-data";
import { orders, ediLogs } from "./edi-data";
import { inboundShipments } from "./inbound-data";
import { shipments as carrierDispatches } from "./shipment-data";
import { seedBols as bols } from "./bol-data";
import { defaultRules as billingRates, seedInvoices as billingRuns } from "./billing-data";

export type WmsDataContextType = {
  tenants: any[];
  warehouses: any[];
  inventoryItems: any[];
  pallets: any[];
  pickWaves: any[];
  orders: any[];
  inboundShipments: any[];
  carrierDispatches: any[];
  bols: any[];
  billingRates: any[];
  billingRuns: any[];
  itemMaster: any[];
  locationMaster: any[];
  ediLogs: any[];
  loading: boolean;
};

const WmsDataContext = createContext<WmsDataContextType | undefined>(undefined);

export const DatabaseProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<Omit<WmsDataContextType, "loading">>({
    tenants: [],
    warehouses: [],
    inventoryItems: [],
    pallets: [],
    pickWaves: [],
    orders: [],
    inboundShipments: [],
    carrierDispatches: [],
    bols: [],
    billingRates: [],
    billingRuns: [],
    itemMaster: [],
    locationMaster: [],
    ediLogs: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const setup = async () => {
      // 1. Seed if empty
      await seedDatabaseIfEmpty();

      // 2. Setup listeners
      const collections = [
        "tenants",
        "warehouses",
        "inventoryItems",
        "pallets",
        "pickWaves",
        "orders",
        "inboundShipments",
        "carrierDispatches",
        "bols",
        "billingRates",
        "billingRuns",
        "itemMaster",
        "locationMaster",
        "ediLogs",
      ];

      collections.forEach((colName) => {
        const unsub = onSnapshot(collection(db, colName), (snapshot) => {
          const docs = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
          setData((prev) => ({ ...prev, [colName]: docs }));
        });
        unsubs.push(unsub);
      });
      setLoading(false);
    };

    setup();

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  return <WmsDataContext.Provider value={{ ...data, loading }}>{children}</WmsDataContext.Provider>;
};

export const useWmsData = () => {
  const ctx = useContext(WmsDataContext);
  if (!ctx) throw new Error("useWmsData must be used within DatabaseProvider");
  return ctx;
};

async function seedDatabaseIfEmpty() {
  try {
    const checkCol = await getDocs(collection(db, "tenants"));
    if (!checkCol.empty) return; // already seeded

    console.log("Seeding database...");

    const seedData: Record<string, any[]> = {
      tenants,
      warehouses,
      inventoryItems,
      pallets,
      pickWaves,
      orders,
      inboundShipments,
      carrierDispatches,
      bols,
      billingRates,
      billingRuns,
      itemMaster,
      locationMaster,
      ediLogs,
    };

    for (const [colName, items] of Object.entries(seedData)) {
      for (const item of items) {
        let docRef;
        if (item.id) {
          docRef = doc(db, colName, String(item.id));
        } else if (item.sku) {
          docRef = doc(db, colName, String(item.sku));
        } else if (item.palletId) {
          docRef = doc(db, colName, String(item.palletId));
        } else if (item.waveId) {
          docRef = doc(db, colName, String(item.waveId));
        } else if (item.shipmentId) {
          docRef = doc(db, colName, String(item.shipmentId));
        } else if (item.bolNumber) {
          docRef = doc(db, colName, String(item.bolNumber));
        } else {
          docRef = doc(collection(db, colName));
        }
        await setDoc(docRef, item);
      }
    }
    console.log("Database seeded.");
  } catch (err) {
    console.error("Error seeding DB", err);
  }
}
