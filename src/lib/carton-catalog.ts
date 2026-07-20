/**
 * ============================================================
 *  MODULE INDEX — Carton Catalog
 * ============================================================
 *
 *  Purpose: Standard carton/size catalog for containerization
 *           and cubing logic. Defines available box sizes,
 *           dimensions, weight limits, and cubic footage.
 *
 *  Key types exported:
 *    • CartonSize                  — Box specification
 *
 *  Data:
 *    • cartonSizes[]               — Seed catalog
 *
 *  Extension points:
 *    - Add pallet size definitions
 *    - Add dunnage material specs
 * ============================================================
 */

export type CartonSize = {
  id: string;
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  maxWeightLbs: number;
  cubicFt: number;
  code?: string;
};

export const cartonSizes: CartonSize[] = [
  { id: "BOX-01", name: "Small Box", lengthIn: 12, widthIn: 9, heightIn: 6, maxWeightLbs: 30, cubicFt: 0.208, code: "S" },
  { id: "BOX-02", name: "Medium Box", lengthIn: 16, widthIn: 12, heightIn: 10, maxWeightLbs: 50, cubicFt: 0.593, code: "M" },
  { id: "BOX-03", name: "Large Box", lengthIn: 20, widthIn: 16, heightIn: 14, maxWeightLbs: 70, cubicFt: 1.296, code: "L" },
  { id: "BOX-04", name: "X-Large Box", lengthIn: 24, widthIn: 18, heightIn: 18, maxWeightLbs: 100, cubicFt: 2.250, code: "XL" },
  { id: "BOX-05", name: "Flat Rate Box", lengthIn: 12, widthIn: 10, heightIn: 1.5, maxWeightLbs: 20, cubicFt: 0.052, code: "FR" },
];

export function getCartonById(id: string): CartonSize | undefined {
  return cartonSizes.find((c) => c.id === id);
}

export function recommendCartonSize(items: { lengthIn: number; widthIn: number; heightIn: number; weightLbs: number }[]): CartonSize | null {
  const totalVolume = items.reduce((sum, item) => sum + item.lengthIn * item.widthIn * item.heightIn, 0);
  const totalWeight = items.reduce((sum, item) => sum + item.weightLbs, 0);
  const sorted = [...cartonSizes].sort((a, b) => a.cubicFt - b.cubicFt);

  for (const carton of sorted) {
    const maxVolume = carton.lengthIn * carton.widthIn * carton.heightIn;
    if (totalVolume <= maxVolume && totalWeight <= carton.maxWeightLbs) {
      return carton;
    }
  }

  return sorted[sorted.length - 1] || null;
}
