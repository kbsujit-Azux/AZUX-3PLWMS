import { collection, doc, setDoc, getDocs, query, where, deleteDoc } from "firebase/firestore";
import { db } from "./firestore";
import { packSizeOf } from "./pallet-build-engine";
import { generateNextUCC128 } from "./ucc128";
import type { UCC128Record } from "./ucc128-record";

export async function buildUCC128ForOrder(order: any, pickTickets: any[], itemMaster?: any[]): Promise<UCC128Record[]> {
  const records: UCC128Record[] = [];
  const tenantId = order.tenantId ?? "acme";
  const warehouseId = order.warehouseId ?? "atl1";

  for (const pt of pickTickets) {
    if (pt.orderId !== order.id) continue;
    const sku = pt.sku;
    const qtyToPick = pt.quantityToPick ?? pt.qtyToPick ?? 0;
    const item = itemMaster?.find((i: any) => i.sku === sku);
    const casePack = item ? packSizeOf(item) : 1;
    if (casePack <= 1) {
      // No case pack info — treat each unit as its own carton
    }
    const itemStyle = item?.itemStyle ?? item?.style ?? pt.style ?? "";
    const itemDescription = item?.description ?? pt.description ?? "";
    const upc = item?.upc ?? pt.upc ?? "";
    const weightLbs = item?.weightLbs ?? item?.weight ?? pt.weightLbs ?? 0;
    const fromLocation = pt.fromLocation ?? "";
    const palletId = pt.palletId ?? "";

    // Calculate number of cartons
    const fullCartons = Math.floor(qtyToPick / casePack);
    const remainder = qtyToPick % casePack;
    const totalCartons = fullCartons + (remainder > 0 ? 1 : 0);

    for (let i = 0; i < totalCartons; i++) {
      const unitsInCarton = i < fullCartons ? casePack : remainder;
      let ucc = "";
      try {
        ucc = await generateNextUCC128(tenantId);
      } catch {
        // fallback to acme
        try {
          const { seedUCC128Configs } = await import("./ucc128");
          await seedUCC128Configs();
          ucc = await generateNextUCC128("acme");
        } catch {
          ucc = `00000000000000000000`;
        }
      }

      const record: UCC128Record = {
        id: ucc,
        orderId: order.id,
        tenantId,
        warehouseId,
        sku,
        itemStyle,
        itemDescription,
        upc,
        units: unitsInCarton,
        cartonNumber: i + 1,
        totalCartons,
        weightLbs: Math.round((weightLbs / Math.max(1, qtyToPick)) * unitsInCarton * 10) / 10,
        fromAddress: order.shipFromAddress ?? "",
        toAddress: order.shipToAddress1 ?? "",
        billToAddress: order.billToAddress1 ?? "",
        carrier: order.carrier ?? "",
        scac: order.scac ?? "",
        serviceLevel: order.serviceLevel ?? "",
        poNumber: order.poNumber ?? "",
        palletId,
        bolNumber: "",
        masterBolNumber: "",
        shipDate: "",
        ediDate: "",
        cancelDate: order.cancelDate ?? "",
        mustShipDate: order.mustShipDate ?? "",
        createdAt: new Date().toISOString(),
        status: "created",
      };
      records.push(record);
      await setDoc(doc(db, "ucc128Records", ucc), record);
    }
  }
  return records;
}

export async function getUCC128RecordsByOrder(orderId: string): Promise<UCC128Record[]> {
  const snap = await getDocs(query(collection(db, "ucc128Records"), where("orderId", "==", orderId)));
  return snap.docs.map((d) => d.data() as UCC128Record);
}

export async function deleteUCC128RecordsByOrder(orderId: string): Promise<void> {
  const records = await getUCC128RecordsByOrder(orderId);
  for (const r of records) {
    await deleteDoc(doc(db, "ucc128Records", r.id));
  }
}

export async function hasUCC128Records(orderId: string): Promise<boolean> {
  const records = await getUCC128RecordsByOrder(orderId);
  return records.length > 0;
}
