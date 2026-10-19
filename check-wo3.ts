import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

async function check() {
  const woSnap = await db.collection("workOrders").get();
  console.log("Total work orders:", woSnap.size);
  console.log("Is empty:", woSnap.empty);
  woSnap.docs.forEach((d) => {
    const data = d.data();
    console.log("WorkOrder:", d.id, "woNumber:", data.woNumber, "ediRef:", data.ediRef);
  });

  // Try direct doc get
  const doc1 = await db.collection("workOrders").doc("INB/20261018/0001").get();
  console.log("Doc1 exists:", doc1.exists, "id:", doc1.id);

  const doc2 = await db.collection("workOrders").doc("INB/20261018/0002").get();
  console.log("Doc2 exists:", doc2.exists, "id:", doc2.id);
}

check().catch((e) => {
  console.error(e);
  process.exit(1);
});
