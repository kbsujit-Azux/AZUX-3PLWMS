import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

async function testCreateWorkOrder() {
  try {
    const result = await db.collection("workOrders").doc("TEST-WO-001").set({
      id: "TEST-WO-001",
      woNumber: "TEST-WO-001",
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
    console.log("Work order created successfully:", result);
  } catch (e) {
    console.error("Error creating work order:", e);
  }

  process.exit(0);
}

testCreateWorkOrder();
