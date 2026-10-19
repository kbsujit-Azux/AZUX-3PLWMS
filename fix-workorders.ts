import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

async function fixWorkOrders() {
  // First, delete the incorrectly created sub-documents
  console.log("Cleaning up incorrectly created work orders...");

  const inboundSnap = await db.collection("inboundShipments").get();
  console.log(`Found ${inboundSnap.size} inbound shipments`);

  for (const inboundDoc of inboundSnap.docs) {
    const inbound = inboundDoc.data();
    const oldWorkOrderId = inbound.workOrderId; // e.g., INB/20261018/0001

    if (!oldWorkOrderId) continue;

    // Delete the old sub-document if it exists
    try {
      // The old format creates a document at workOrders/INB/20261018/0001
      // We need to delete the document at the subcollection path
      const parts = oldWorkOrderId.split("/");
      if (parts.length === 3) {
        const subCollRef = db
          .collection("workOrders")
          .doc(parts[0])
          .collection(parts[1])
          .doc(parts[2]);
        const subDoc = await subCollRef.get();
        if (subDoc.exists) {
          await subCollRef.delete();
          console.log(`Deleted old sub-document: ${oldWorkOrderId}`);
        }
      }
    } catch (e) {
      console.log(`Error cleaning up ${oldWorkOrderId}:`, e.message);
    }

    // Generate new work order ID format (without slashes)
    const newWorkOrderId = oldWorkOrderId.replace(/\//g, "-"); // INB-20261018-0001

    // Check if new format already exists
    const newWoDoc = await db.collection("workOrders").doc(newWorkOrderId).get();
    if (newWoDoc.exists) {
      console.log(`Work order ${newWorkOrderId} already exists`);
      // Update inbound shipment to use new ID
      await inboundDoc.ref.update({ workOrderId: newWorkOrderId });
      console.log(`Updated inbound ${inboundDoc.id} workOrderId to ${newWorkOrderId}`);
      continue;
    }

    console.log(`Creating new work order ${newWorkOrderId} for inbound ${inboundDoc.id}`);

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
      .doc(newWorkOrderId)
      .set({
        id: newWorkOrderId,
        woNumber: newWorkOrderId,
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

    // Update inbound shipment to use new work order ID
    await inboundDoc.ref.update({ workOrderId: newWorkOrderId });
    console.log(`Created work order ${newWorkOrderId} and updated inbound ${inboundDoc.id}`);
  }

  console.log("Done!");
  process.exit(0);
}

fixWorkOrders().catch((e) => {
  console.error(e);
  process.exit(1);
});
