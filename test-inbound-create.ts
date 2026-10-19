import { createInboundShipmentRecord } from "./src/lib/firestore-data";

async function testCreateInboundShipment() {
  try {
    const result = await createInboundShipmentRecord({
      tenantId: "acme",
      warehouseId: "atl1",
      ediRef: "ASN-TEST-001",
      poNumber: "PO-TEST-001",
      carrier: "Test Carrier",
      trailerNumber: "TRL-TEST",
      containerNumber: "CONT-TEST",
      sealNumber: "SL-TEST",
      bolNumber: "BOL-TEST",
      origin: "Test Origin",
      vessel: "Test Vessel",
      voyageNumber: "VOY-001",
      port: "Test Port",
      appointmentAt: new Date().toISOString(),
      expectedAt: new Date().toISOString(),
      status: "scheduled",
      doorAssigned: "D-01",
      source: "CSV",
      lines: [
        {
          lineNo: 1,
          sku: "TEST-SKU-001",
          upc: "123456789012",
          itemStyle: "TEST-STYLE",
          description: "Test Item",
          lot: "LOT-001",
          expirationDate: "2030-12-31",
          qtyExpected: 100,
          cartonsExpected: 10,
          unitsPerPallet: 50,
          weightLbsPerUnit: 2.5,
        },
      ],
    });
    console.log("Inbound shipment created:", result);
  } catch (e) {
    console.error("Error creating inbound shipment:", e);
  }
  process.exit(0);
}

testCreateInboundShipment();
