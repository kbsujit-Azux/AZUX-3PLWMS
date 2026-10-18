import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'wms-3pl-79a05'
});
const db = getFirestore(app);

async function clearShipmentData() {
  const collections = [
    'inboundShipments',
    'workOrders',
    'pallets',
    'outboundPallets',
    'shipments',
    'orders',
    'pickTickets',
    'inventoryItems',
    'inventoryTransactions',
    'inboundReceipts',
    'billsOfLading',
    'ediLogs'
  ];

  for (const coll of collections) {
    const snapshot = await db.collection(coll).get();
    console.log(`Found ${snapshot.size} documents in ${coll}`);
    if (snapshot.size > 0) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log(`Deleted all documents from ${coll}`);
    }
  }
  console.log('Done!');
  process.exit(0);
}

clearShipmentData().catch(e => { console.error(e); process.exit(1); });