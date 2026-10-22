import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { readFileSync } from "node:fs";

function loadEnv() {
  const content = readFileSync(new URL("../.env", import.meta.url), "utf-8");
  const env: Record<string, string> = {};
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length) env[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  });
  return env;
}

const env = loadEnv();
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

async function main() {
  const { setDoc, doc } = await import("firebase/firestore");
  const now = new Date().toISOString();
  const id = `INB-SBX-943-${Date.now()}`;
  const shipment = {
    id,
    ediRef: "ASN-SBX-943",
    isaControl: "999999998",
    tenantId: "acme",
    warehouseId: "atl1",
    partner: "SBX-PARTNER",
    carrier: "Sandbox Carrier",
    trailerNumber: "SBX-TRL-001",
    containerNumber: "—",
    sealNumber: "SL-SBX",
    bolNumber: "BOL-SBX-943",
    origin: "Sandbox Origin",
    poNumber: "PO-SBX-943",
    appointmentAt: now,
    expectedAt: now,
    receivedAt: null,
    doorAssigned: "D-01",
    status: "scheduled",
    source: "EDI_943",
    workOrderId: id,
    lines: [
      {
        lineNo: 1,
        sku: "SBX-832-001",
        upc: "012345678905",
        itemStyle: "SBX-STYLE-A",
        description: "Sandbox Item A (EDI 832)",
        lot: "LOT-SBX",
        expirationDate: now,
        qtyExpected: 10,
        cartonsExpected: 10,
        uom: "EA",
        weightLbsPerUnit: 2.5,
        unitsPerPallet: 10,
        receivedQty: 0,
        palletIds: [],
        status: "expected",
      },
    ],
  };

  await setDoc(doc(db, "inboundShipments", id), shipment);
  console.log("Inbound shipment created:", id);

  const workOrderId = id;
  const caseQty = 1; // pack size for SBX item
  const workOrder = {
    id: workOrderId,
    woNumber: workOrderId,
    tenantId: "acme",
    warehouseId: "atl1",
    clientName: "Sandbox Partner",
    containerNumber: shipment.containerNumber,
    trailerNumber: shipment.trailerNumber,
    sealNumber: shipment.sealNumber,
    bolNumber: shipment.bolNumber,
    poNumber: shipment.poNumber,
    ediRef: shipment.ediRef,
    carrier: shipment.carrier,
    vessel: "",
    voyageNumber: "",
    port: "",
    origin: shipment.origin,
    arrivalDate: now,
    departureDate: null,
    yardInDate: null,
    yardLeaveDate: null,
    inboundEntryDate: now,
    receivedDate: null,
    status: "scheduled",
    totalUnits: 10,
    totalCartons: Math.ceil(10 / caseQty),
    lineCount: 1,
    lines: [
      {
        lineNo: 1,
        sku: "SBX-832-001",
        upc: "012345678905",
        description: "Sandbox Item A (EDI 832)",
        lot: "LOT-SBX",
        qtyExpected: 10,
        qtyReceived: 0,
        cartons: Math.ceil(10 / caseQty),
        status: "pending",
      },
    ],
    createdAt: now,
    updatedAt: now,
    inboundShipmentId: id,
  };
  await setDoc(doc(db, "workOrders", workOrderId), workOrder);
  console.log("Work order created:", workOrderId);

  const logId = `EDI-SBX-943-${Date.now()}`;
  await setDoc(doc(db, "ediLogs", logId), {
    id: logId,
    txn: "943",
    direction: "inbound",
    partner: "SBX-PARTNER",
    documentRef: "ASN-SBX-943",
    tenantId: "acme",
    warehouseId: "atl1",
    isaControl: "999999998",
    gsControl: "9998",
    segments: 20,
    bytes: 600,
    ackStatus: "AK",
    status: "processed",
    message: "Sandbox 943 ingested; inbound shipment scheduled.",
    receivedAt: now,
  });
  console.log("EDI log written:", logId);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
