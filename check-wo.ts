import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

async function check() {
  const inboundSnap = await db.collection("inboundShipments").get();
  console.log("Total inbound shipments:", inboundSnap.size);
  inboundSnap.docs.forEach((d) => {
    const data = d.data();
    console.log("Inbound:", d.id, "workOrderId:", data.workOrderId, "ediRef:", data.ediRef);
  });

  const woSnap = await db.collection("workOrders").get();
  console.log("Total work orders:", woSnap.size);
  woSnap.docs.forEach((d) => {
    const data = d.data();
    console.log("WorkOrder:", d.id, "woNumber:", data.woNumber, "ediRef:", data.ediRef);
  });
}

check().catch((e) => {
  console.error(e);
  process.exit(1);
});
