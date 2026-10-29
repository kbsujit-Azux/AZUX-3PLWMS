import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ projectId: "wms-3pl-79a05" });
const db = getFirestore();

async function seed() {
  const batch = db.batch();
  const now = new Date().toISOString();

  // Location master records for testing location priority
  const locations = [
    {
      id: "PK-01-A",
      warehouseId: "atl1",
      tenantId: "acme",
      type: "RACK",
      zone: "Primary Pick",
      capacityPallets: 10,
      occupiedPallets: 0,
      pickable: true,
      allowedItemStyles: null,
      slottingRules: { allowedStorageClasses: ["forward", "reserve", "bulk"], putawayPriority: 10, replenPriority: 10, allowedPalletTypes: ["standard_48x40"] },
      velocityMetrics: { picksPerDay: 0, linesPerDay: 0, cubicVelocity: 0, lastCalculated: now, manualOverride: false },
      zoneAdjacency: { adjacent: [], toShippingDockSec: 60 },
    },
    {
      id: "BLK-01-A",
      warehouseId: "atl1",
      tenantId: "acme",
      type: "RACK",
      zone: "Bulk Storage",
      capacityPallets: 50,
      occupiedPallets: 0,
      pickable: true,
      allowedItemStyles: null,
      slottingRules: { allowedStorageClasses: ["forward", "reserve", "bulk"], putawayPriority: 50, replenPriority: 50, allowedPalletTypes: ["standard_48x40"] },
      velocityMetrics: { picksPerDay: 0, linesPerDay: 0, cubicVelocity: 0, lastCalculated: now, manualOverride: false },
      zoneAdjacency: { adjacent: [], toShippingDockSec: 300 },
    },
    {
      id: "BLK-02-B",
      warehouseId: "atl1",
      tenantId: "acme",
      type: "RACK",
      zone: "Bulk Storage",
      capacityPallets: 50,
      occupiedPallets: 0,
      pickable: true,
      allowedItemStyles: null,
      slottingRules: { allowedStorageClasses: ["forward", "reserve", "bulk"], putawayPriority: 50, replenPriority: 50, allowedPalletTypes: ["standard_48x40"] },
      velocityMetrics: { picksPerDay: 0, linesPerDay: 0, cubicVelocity: 0, lastCalculated: now, manualOverride: false },
      zoneAdjacency: { adjacent: [], toShippingDockSec: 300 },
    },
  ];

  locations.forEach((l) => batch.set(db.doc(`locationMaster/${l.id}`), l));

  // Inventory item for ACM-TENT-2P-OLV with batches in PK + BLK locations
  const inventoryItem = {
    sku: "ACM-TENT-2P-OLV",
    upc: "081234500017",
    itemStyle: "TENT-2P",
    description: "Ridgeline 2-Person Tent, Olive",
    category: "Camping",
    uom: "EA",
    unitCost: 84.5,
    unitPrice: 189,
    caseQty: 4,
    weightLbs: 6.2,
    tenantId: "acme",
    warehouseId: "atl1",
    status: "active",
    batches: [
      { batchId: "B-PK-001", palletId: "PLT-PK-001", receivedAt: now, qty: 100, qtyAllocated: 0, location: "PK-01-A", poNumber: "PO-TEST-001", ediSource: "MANUAL" },
      { batchId: "B-BLK-001", palletId: "PLT-BLK-001", receivedAt: now, qty: 200, qtyAllocated: 0, location: "BLK-01-A", poNumber: "PO-TEST-002", ediSource: "MANUAL" },
      { batchId: "B-BLK-002", palletId: "PLT-BLK-002", receivedAt: now, qty: 150, qtyAllocated: 0, location: "BLK-02-B", poNumber: "PO-TEST-003", ediSource: "MANUAL" },
    ],
  };

  batch.set(db.doc(`inventoryItems/${inventoryItem.sku}`), inventoryItem);

  await batch.commit();
  console.log("Test #6 seed data written successfully");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
