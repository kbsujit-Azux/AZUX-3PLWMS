import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

// Replicate the getNextInboundSeq function
async function getNextInboundSeq() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}`;
  const counterRef = db.collection("counters").doc(`inbound_${dateStr}`);
  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(counterRef);
    if (!snap.exists) {
      transaction.set(counterRef, { seq: 1, date: dateStr });
      return `INB/${dateStr}/0001`;
    }
    const currentSeq = snap.data().seq;
    const nextSeq = currentSeq + 1;
    transaction.update(counterRef, { seq: nextSeq });
    return `INB/${dateStr}/${nextSeq.toString().padStart(4, "0")}`;
  });
}

// Replicate the createWorkOrder function
async function createWorkOrder(data) {
  const id = data.id;
  await db
    .collection("workOrders")
    .doc(id)
    .set({
      ...data,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  return id;
}

async function testFullFlow() {
  try {
    // Step 1: Get next inbound sequence
    const woNumber = await getNextInboundSeq();
    const woId = woNumber;
    console.log("Got work order number:", woNumber);

    // Step 2: Create work order
    await createWorkOrder({
      id: woId,
      woNumber: woId,
      tenantId: "acme",
      warehouseId: "atl1",
      clientName: "ACME Corp",
      containerNumber: "TEST-CONT",
      trailerNumber: "TEST-TRL",
      sealNumber: "SL-123",
      bolNumber: "BOL-123",
      poNumber: "PO-123",
      ediRef: "ASN-123",
      carrier: "Test Carrier",
      vessel: "",
      voyageNumber: "",
      port: "",
      origin: "Test Origin",
      arrivalDate: new Date().toISOString(),
      departureDate: null,
      yardInDate: null,
      yardLeaveDate: null,
      inboundEntryDate: new Date().toISOString(),
      receivedDate: null,
      status: "scheduled",
      totalUnits: 100,
      totalCartons: 10,
      lineCount: 1,
      lines: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: "",
    });
    console.log("Work order created successfully!");
  } catch (e) {
    console.error("Error in full flow:", e);
  }

  process.exit(0);
}

testFullFlow();
