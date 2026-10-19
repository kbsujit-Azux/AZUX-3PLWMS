import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

async function fixWorkOrders() {
  console.log("Cleaning up incorrectly created work orders...");

  // First delete all existing work orders
  const woSnap = await db.collection("workOrders").get();
  console.log(`Found ${woSnap.size} work orders to clean up`);

  if (woSnap.size > 0) {
    const batch = db.batch();
    woSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log("Deleted all existing work orders");
  }

  // Now recreate work orders from inbound shipments
  const inboundSnap = await db.collection("inboundShipments").get();
  console.log(`Found ${inboundSnap.size} inbound shipments`);

  for (const inboundDoc of inboundSnap.docs) {
    const inbound = inboundDoc.data();
    const workOrderId = inboundDoc.id; // Use same ID as inbound

    console.log(`Creating work order ${workOrderId} for inbound ${inboundDoc.id}`);

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
        clientName: inbound.tenantId,
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

    // Update inbound to use the same ID
    await inboundDoc.ref.update({ workOrderId: workOrderId });
    console.log(`Created work order ${workOrderId} and updated inbound ${inboundDoc.id}`);
  }

  console.log("Done!");
  process.exit(0);
}

fixWorkOrders().catch((e) => {
  console.error(e);
  process.exit(1);
});
