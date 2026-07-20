/**
 * ============================================================
 *  MODULE INDEX — Cubing Engine
 * ============================================================
 *
 *  Purpose: Automated volumetric calculation and cartonization
 *           logic for order fulfillment. Determines optimal
 *           carton sizes before picking starts.
 *
 *  Usage:
 *    const cartonization = cartonizeOrder(order, itemMaster, cartonSizes);
 *
 *  Extension points:
 *    - Add 3D bin packing algorithm
 *    - Add dunnage calculation
 *    - Add carrier-specific packing rules
 * ============================================================
 */

import type { Order, OrderLine } from "./edi-data";
import type { ItemMasterRecord } from "./master-data";
import type { CartonSize } from "./carton-catalog";
import { cartonSizes, recommendCartonSize } from "./carton-catalog";

export type PackedItem = {
  sku: string;
  description: string;
  qty: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
};

export type Carton = {
  cartonId: string;
  cartonSizeId: string;
  cartonName: string;
  seq: number;
  items: PackedItem[];
  totalQty: number;
  cubicFt: number;
  weightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export type Cartonization = {
  id: string;
  orderId: string;
  shipmentId?: string;
  cartons: Carton[];
  totalCubicFt: number;
  totalWeightLbs: number;
  recommendedCartonId?: string;
  status: "draft" | "optimized" | "confirmed" | "printed";
  cartonCount: number;
  createdAt: string;
};

export function expandOrderLinesToItems(
  order: Order,
  itemMaster: ItemMasterRecord[],
): PackedItem[] {
  const items: PackedItem[] = [];

  for (const line of order.lines) {
    const master = itemMaster.find((i) => i.sku === line.sku);
    const qty = line.qtyOrdered;

    if (master) {
      items.push({
        sku: line.sku,
        description: master.description,
        qty,
        lengthIn: master.lengthIn,
        widthIn: master.widthIn,
        heightIn: master.heightIn,
        weightLbs: master.caseWeightLbs * qty,
      });
    } else {
      items.push({
        sku: line.sku,
        description: line.description || line.sku,
        qty,
        lengthIn: 12,
        widthIn: 9,
        heightIn: 6,
        weightLbs: 1 * qty,
      });
    }
  }

  return items;
}

export function cartonizeOrder(
  order: Order,
  itemMaster: ItemMasterRecord[],
  availableCartons: CartonSize[] = cartonSizes,
): Cartonization {
  const items = expandOrderLinesToItems(order, itemMaster);
  const cartons: Carton[] = [];

  const sortedItems = [...items].sort((a, b) => b.lengthIn * b.widthIn * b.heightIn - a.lengthIn * a.widthIn * a.heightIn);

  let cartonSeq = 1;
  for (const item of sortedItems) {
    const remaining = item.qty;
    let qtyToPack = remaining;

    while (qtyToPack > 0) {
      const packQty = Math.min(qtyToPack, item.qty);
      const currentItems = [{ ...item, qty: packQty }];

      const recommended = recommendCartonSize(currentItems);
      if (!recommended) {
        qtyToPack = 0;
        continue;
      }

      const existingCarton = cartons.find((c) => {
        if (c.cartonSizeId !== recommended.id) return false;
        const projectedWeight = c.weightLbs + item.weightLbs * packQty;
        const projectedVolume = c.items.reduce((sum, i) => sum + i.lengthIn * i.widthIn * i.heightIn, 0) +
          item.lengthIn * item.widthIn * item.heightIn * packQty;
        const maxVolume = recommended.lengthIn * recommended.widthIn * recommended.heightIn;
        return projectedWeight <= recommended.maxWeightLbs && projectedVolume <= maxVolume;
      });

      if (existingCarton) {
        existingCarton.items.push({ ...item, qty: packQty });
        existingCarton.totalQty += packQty;
        existingCarton.weightLbs += item.weightLbs * packQty;
        existingCarton.cubicFt += (item.lengthIn * item.widthIn * item.heightIn * packQty) / 1728;
      } else {
        cartons.push({
          cartonId: `CTN-${order.id}-${cartonSeq}`,
          cartonSizeId: recommended.id,
          cartonName: recommended.name,
          seq: cartonSeq,
          items: [{ ...item, qty: packQty }],
          totalQty: packQty,
          cubicFt: (item.lengthIn * item.widthIn * item.heightIn * packQty) / 1728,
          weightLbs: item.weightLbs * packQty,
          lengthIn: recommended.lengthIn,
          widthIn: recommended.widthIn,
          heightIn: recommended.heightIn,
        });
        cartonSeq++;
      }

      qtyToPack -= packQty;
    }
  }

  const totalCubicFt = cartons.reduce((sum, c) => sum + c.cubicFt, 0);
  const totalWeightLbs = cartons.reduce((sum, c) => sum + c.weightLbs, 0);
  const recommendedCarton = cartons.length > 0 ? cartons[0].cartonSizeId : undefined;

  return {
    id: `CZN-${Date.now()}`,
    orderId: order.id,
    shipmentId: undefined,
    cartons,
    totalCubicFt,
    totalWeightLbs,
    recommendedCartonId: recommendedCarton,
    status: "draft",
    cartonCount: cartons.length,
    createdAt: new Date().toISOString(),
  };
}

export function canCartonize(order: Order, itemMaster: ItemMasterRecord[]): boolean {
  return order.lines.length > 0 && itemMaster.some((i) => i.sku === order.lines[0]?.sku);
}
