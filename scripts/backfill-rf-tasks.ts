import { db } from "../src/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";

async function backfill() {
  const pickSnap = await getDocs(
    query(collection(db, "pickTickets"), where("status", "==", "GENERATED"), orderBy("createdAt", "desc")),
  );
  const batchSize = 500;
  let batch: any[] = [];
  let count = 0;

  for (const pt of pickSnap.docs) {
    const data = pt.data();
    const task = {
      type: "PICK",
      pickTicketNum: data.pickTicketNum,
      sku: data.sku,
      palletId: data.palletId,
      fromLocation: data.fromLocation,
      qty: data.quantityToPick,
      status: "PENDING",
      assignedAt: new Date().toISOString(),
    };
    const ref = doc(collection(db, "rfAssignedTasks", "unassigned", "items"), pt.id);
    batch.push({ ref, data: task });
    count++;

    if (batch.length >= batchSize) {
      const writeBatch = (await import("firebase/firestore")).writeBatch(db);
      for (const item of batch) {
        writeBatch.set(item.ref, item.data);
      }
      await writeBatch.commit();
      batch = [];
      console.log(`Committed ${count} tasks...`);
    }
  }

  if (batch.length > 0) {
    const writeBatch = (await import("firebase/firestore")).writeBatch(db);
    for (const item of batch) {
      writeBatch.set(item.ref, item.data);
    }
    await writeBatch.commit();
    console.log(`Committed final ${batch.length} tasks.`);
  }

  console.log(`Backfill complete. Total tasks: ${count}`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error("Error backfilling RF tasks:", err);
  process.exit(1);
});
