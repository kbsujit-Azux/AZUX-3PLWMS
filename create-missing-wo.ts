import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

async function createMissingWorkOrders() {
  const inboundSnap = await db.collection("inboundShipments").get();
  console.log(`Found ${inboundSnap.size} inbound shipments`);

  for (const inboundDoc of inboundSnap.docs) {
    const inbound = inboundDoc.data();
    const workOrderId = inbound.workOrderId;

    if (!workOrderId) {
      console.log(`Inbound ${inboundDoc.id} has no workOrderId, skipping`);
      continue;
    }

    const woDoc = await db.collection("workOrders").doc(workOrderId).get();
    if (woDoc.exists) {
      console.log(`Work order ${workOrderId} already exists for inbound ${inboundDoc.id}`);
      continue;
    }

    console.log(`Creating missing work order ${workOrderId} for inbound ${inboundDoc.id}`);

    const totalUnits = inbound.lines?.reduce((sum, l) => sum + (l.qtyExpected || 0), 0) || 0;
    const totalCartons = inbound.lines?.reduce((sum, l) => sum + (l.cartonsExpected || 0), 0) || 0;

    const workOrderLines =
      inbound.lines?.map((l, idx) => ({
        lineNo: idx + 1,
        sku: l.sku,
        upc: l.upc || "",
        description: l.description || "",
        lot: l.lot || "",
        qtyExpected: l.qtyExpected || 0,
        qtyReceived: l.receivedQty || 0,
        cartons: l.cartonsExpected || 0,
        status:
          l.status === "received" ? "received" : l.status === "partial" ? "partial" : "pending",
      })) || [];

    await db
      .collection("workOrders")
      .doc(workOrderId)
      .set({
        id: workOrderId,
        woNumber: workOrderId,
        tenantId: inbound.tenantId,
        warehouseId: inbound.warehouseId,
        clientName: inbound.tenantId, // placeholder
        containerNumber: inbound.containerNumber || "—",
        trailerNumber: inbound.trailerNumber || "—",
        sealNumber: inbound.sealNumber || "",
        bolNumber: inbound.bolNumber || "",
        poNumber: inbound.poNumber || "",
        ediRef: inbound.ediRef || "",
        carrier: inbound.carrier || "",
        vessel: inbound.vessel || "",
        voyageNumber: inbound.voyageNumber || "",
        port: inbound.port || "",
        origin: inbound.origin || "",
        arrivalDate: inbound.appointmentAt || new Date().toISOString(),
        departureDate: null,
        yardInDate: null,
        yardLeaveDate: null,
        inboundEntryDate: new Date().toISOString(),
        receivedDate: inbound.receivedAt || null,
        status: inbound.status || "scheduled",
        totalUnits,
        totalCartons,
        lineCount: inbound.lines?.length || 0,
        lines: workOrderLines,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: "",
      });

    console.log(`Created work order ${workOrderId}`);
  }

  console.log("Done!");
  process.exit(0);
}

createMissingWorkOrders().catch((e) => {
  console.error(e);
  process.exit(1);
});
