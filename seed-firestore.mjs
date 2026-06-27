import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize with default credentials (requires GOOGLE_APPLICATION_CREDENTIALS env var)
initializeApp({
  projectId: 'wms-3pl-79a05',
});

const db = getFirestore();

async function seedData() {
  const batch = db.batch();
  
  // Seed tenants
  const tenants = [
    { id: 'acme', name: 'Acme Outdoor Co.', code: 'ACME' },
    { id: 'northstar', name: 'Northstar Apparel', code: 'NSAP' },
    { id: 'harborlite', name: 'Harborlite Electronics', code: 'HLE' },
    { id: 'verdant', name: 'Verdant Wellness', code: 'VRDN' },
  ];
  
  tenants.forEach(t => {
    batch.set(db.doc('tenants', t.id), t);
  });

  // Seed warehouses
  const warehouses = [
    { id: 'atl1', name: 'ATL-1 Distribution', code: 'ATL1', city: 'Atlanta, GA', capacityPct: 78 },
    { id: 'ord2', name: 'ORD-2 Fulfillment', code: 'ORD2', city: 'Chicago, IL', capacityPct: 64 },
    { id: 'lax3', name: 'LAX-3 Cross-Dock', code: 'LAX3', city: 'Los Angeles, CA', capacityPct: 91 },
    { id: 'ewr1', name: 'EWR-1 Bonded', code: 'EWR1', city: 'Newark, NJ', capacityPct: 47 },
  ];
  
  warehouses.forEach(w => {
    batch.set(db.doc('warehouses', w.id), w);
  });

  // Seed sample inventory items with transaction history
  const now = new Date().toISOString();
  const inventoryItems = [
    {
      sku: 'ACM-TENT-2P-OLV',
      upc: '081234500017',
      itemStyle: 'TENT-2P',
      description: 'Ridgeline 2-Person Tent, Olive',
      category: 'Camping',
      uom: 'EA',
      unitCost: 84.5,
      unitPrice: 189,
      caseQty: 4,
      weightLbs: 6.2,
      tenantId: 'acme',
      warehouseId: 'atl1',
      status: 'active',
      batches: [
        {
          batchId: 'B-24091',
          palletId: 'PLT-ATL1-00871',
          receivedAt: now,
          qty: 96,
          qtyAllocated: 12,
          location: 'A12-03-B',
          poNumber: 'PO-554120',
          ediSource: 'EDI_943',
        },
        {
          batchId: 'B-24033',
          palletId: 'PLT-ATL1-00712',
          receivedAt: '2026-03-04T09:11:00Z',
          qty: 48,
          qtyAllocated: 0,
          location: 'A12-04-A',
          poNumber: 'PO-551003',
          ediSource: 'EDI_943',
        },
      ],
    },
    {
      sku: 'NSA-HOOD-BLK-M',
      upc: '087654300010',
      itemStyle: 'HOOD-CLASSIC',
      description: 'Classic Pullover Hoodie, Black, M',
      category: 'Apparel',
      uom: 'EA',
      unitCost: 14.2,
      unitPrice: 48,
      caseQty: 24,
      weightLbs: 1.1,
      tenantId: 'northstar',
      warehouseId: 'ord2',
      status: 'active',
      batches: [
        {
          batchId: 'B-24210',
          palletId: 'PLT-ORD2-01244',
          receivedAt: '2026-05-17T08:30:00Z',
          qty: 480,
          qtyAllocated: 0,
          location: 'D04-01-A',
          poNumber: 'PO-770221',
          ediSource: 'EDI_943',
        },
      ],
    },
  ];

  inventoryItems.forEach(item => {
    batch.set(db.doc('inventoryItems', item.sku), item);
  });

  // Seed sample order
  const order = {
    id: 'SO-2026-001',
    poNumber: 'PO-2026-001',
    ediRef: 'EDI-940-001',
    tenantId: 'acme',
    warehouseId: 'atl1',
    shipToCode: 'AVL',
    shipToName: 'Asheville, NC',
    shipToAddress1: '118 Patton Ave',
    shipToCity: 'Asheville',
    shipToState: 'NC',
    shipToZip: '28801',
    carrier: 'FedEx',
    serviceLevel: 'Ground',
    status: 'ALLOCATED',
    source: 'EDI-940',
    receivedAt: now,
    entryDate: now,
    cancelDate: '2026-06-18T23:59:00Z',
    mustShipDate: '2026-05-21T17:00:00Z',
    lines: [
      {
        sku: 'ACM-TENT-2P-OLV',
        description: 'Ridgeline 2-Person Tent, Olive',
        qtyOrdered: 48,
        qtyAllocated: 12,
        unitPrice: 189,
      },
    ],
  };
  
  batch.set(db.doc('orders', order.id), order);

  // Seed pick ticket
  const pickTicket = {
    pickTicketNum: 1001,
    orderId: 'SO-2026-001',
    sku: 'ACM-TENT-2P-OLV',
    palletId: 'PLT-ATL1-00871',
    fromLocation: 'A12-03-B',
    quantityToPick: 12,
    status: 'GENERATED',
    createdAt: now,
  };
  
  batch.set(db.doc('pickTickets', '1001'), pickTicket);

  // Seed sample transaction history
  const transactions = [
    {
      id: 'TX-2026-05-12-RECV',
      sku: 'ACM-TENT-2P-OLV',
      palletId: 'PLT-ATL1-00871',
      location: 'A12-03-B',
      orderId: 'SO-2026-001',
      pickTicketNum: 1001,
      type: 'RECEIVE',
      qtyChange: 96,
      qtyBefore: 0,
      qtyAfter: 96,
      user: 'u.harper',
      notes: 'Received via EDI 943 PO-554120',
      timestamp: '2026-05-12T14:20:00Z',
    },
    {
      id: 'TX-2026-05-15-ALLOC',
      sku: 'ACM-TENT-2P-OLV',
      palletId: 'PLT-ATL1-00871',
      location: 'A12-03-B',
      orderId: 'SO-2026-001',
      pickTicketNum: 1001,
      type: 'ALLOCATE',
      qtyChange: -12,
      qtyBefore: 96,
      qtyAfter: 84,
      user: 'system',
      notes: 'Allocated to order SO-2026-001',
      timestamp: '2026-05-15T09:00:00Z',
    },
  ];

  transactions.forEach(t => {
    batch.set(db.doc('inventoryTransactions', t.id), t);
  });

  await batch.commit();
  console.log('Seed data written to Firestore successfully');
  process.exit(0);
}

seedData().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});