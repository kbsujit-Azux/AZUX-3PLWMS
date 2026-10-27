// UCC128 outbound pallet record — one per carton
export interface UCC128Record {
  id: string; // UCC128 SSCC (20-digit)
  orderId: string;
  tenantId: string;
  warehouseId: string;
  sku: string;
  itemStyle: string;
  itemDescription: string;
  upc: string;
  units: number;
  cartonNumber: number;
  totalCartons: number;
  weightLbs: number;
  fromAddress: string;
  toAddress: string;
  billToAddress: string;
  carrier: string;
  scac: string;
  serviceLevel: string;
  poNumber: string;
  palletId: string;
  bolNumber: string;
  masterBolNumber: string;
  shipDate: string;
  ediDate: string;
  cancelDate: string;
  mustShipDate: string;
  createdAt: string;
  status: "created" | "shipped" | "cancelled";
}
