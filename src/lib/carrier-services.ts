/**
 * ============================================================
 *  MODULE INDEX — Carrier Service Catalog
 * ============================================================
 *
 *  Purpose: Reference catalog of carrier service levels, SCAC
 *           codes, transit times, and pricing tiers. Used for
 *           carrier selection on orders and BOL generation.
 *
 *  Key types exported:
 *    • CarrierServiceRecord        — Service definition (carrier, code, transit)
 *
 *  Data:
 *    • carrierServices[]           — All carrier/service records
 *
 *  Helper functions:
 *    • getActiveCarriers()         — Unique carrier list (active only)
 *    • getServiceCodesByCarrier()  — Filtered services for a carrier
 *    • getServiceCodeDescription() — Service code → description
 *
 *  SCAC mapping (in bol-data.ts):
 *    FedEx → FXFE, UPS → UPSN, USPS → USPS, Maersk → MAEU, etc.
 *
 *  Extension points:
 *    - Add carrier transit-time SLAs
 *    - Add carrier rate tables for cost estimation
 *    - Add carrier performance metrics (on-time %, exception rate)
 *    - Add carrier qualification/insurance tracking
 * ============================================================
 */

export type CarrierServiceRecord = {
  id: string;
  carrier: string;
  serviceCode: string;
  serviceDescription: string;
  transitDays: string;
  pricingTier: string;
  typicalUseCase: string;
  active: boolean;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const carrierServices: CarrierServiceRecord[] = [
  {
    id: uid(),
    carrier: "FedEx",
    serviceCode: "FEDEX_GROUND",
    serviceDescription: "FedEx Ground (Commercial)",
    transitDays: "1-5 Days",
    pricingTier: "Low-Mid",
    typicalUseCase: "Standard B2B inventory delivery",
    active: true,
  },
  {
    id: uid(),
    carrier: "FedEx",
    serviceCode: "FEDEX_HOME",
    serviceDescription: "FedEx Home Delivery",
    transitDays: "1-5 Days",
    pricingTier: "Mid",
    typicalUseCase: "Standard B2C e-commerce (Delivers 7 days/wk)",
    active: true,
  },
  {
    id: uid(),
    carrier: "FedEx",
    serviceCode: "FEDEX_GROUND_ECONOMY",
    serviceDescription: "FedEx Ground Economy",
    transitDays: "2-7 Days",
    pricingTier: "Very Low",
    typicalUseCase: "SmartPost replacement for lightweight <5 lbs",
    active: true,
  },
  {
    id: uid(),
    carrier: "FedEx",
    serviceCode: "FEDEX_EXPRESS_SAVER",
    serviceDescription: "FedEx Express Saver",
    transitDays: "3 Days",
    pricingTier: "Mid-High",
    typicalUseCase: "Budget-conscious time-definite delivery",
    active: true,
  },
  {
    id: uid(),
    carrier: "FedEx",
    serviceCode: "FEDEX_2_DAY",
    serviceDescription: "FedEx 2Day",
    transitDays: "2 Days",
    pricingTier: "High",
    typicalUseCase: "Two-day express delivery by end of day",
    active: true,
  },
  {
    id: uid(),
    carrier: "FedEx",
    serviceCode: "FEDEX_STANDARD_OVERNIGHT",
    serviceDescription: "FedEx Standard Overnight",
    transitDays: "1 Day",
    pricingTier: "Very High",
    typicalUseCase: "Next-day afternoon delivery (by 3:00 PM)",
    active: true,
  },
  {
    id: uid(),
    carrier: "FedEx",
    serviceCode: "FEDEX_PRIORITY_OVERNIGHT",
    serviceDescription: "FedEx Priority Overnight",
    transitDays: "1 Day",
    pricingTier: "Premium",
    typicalUseCase: "Next-day morning delivery (by 10:30 AM)",
    active: true,
  },
  {
    id: uid(),
    carrier: "UPS",
    serviceCode: "UPS_GROUND",
    serviceDescription: "UPS Ground",
    transitDays: "1-5 Days",
    pricingTier: "Low-Mid",
    typicalUseCase: "Most common 3PL ground fulfillment tier",
    active: true,
  },
  {
    id: uid(),
    carrier: "UPS",
    serviceCode: "UPS_3_DAY_SELECT",
    serviceDescription: "UPS 3 Day Select",
    transitDays: "3 Days",
    pricingTier: "Mid-High",
    typicalUseCase: "Cost-effective guaranteed 3-day transit",
    active: true,
  },
  {
    id: uid(),
    carrier: "UPS",
    serviceCode: "UPS_2ND_DAY_AIR",
    serviceDescription: "UPS 2nd Day Air",
    transitDays: "2 Days",
    pricingTier: "High",
    typicalUseCase: "Routine air shipping to all 50 states",
    active: true,
  },
  {
    id: uid(),
    carrier: "UPS",
    serviceCode: "UPS_NEXT_DAY_AIR_SAVER",
    serviceDescription: "UPS Next Day Air Saver",
    transitDays: "1 Day",
    pricingTier: "Very High",
    typicalUseCase: "Next-day PM delivery for commercial addresses",
    active: true,
  },
  {
    id: uid(),
    carrier: "UPS",
    serviceCode: "UPS_NEXT_DAY_AIR",
    serviceDescription: "UPS Next Day Air",
    transitDays: "1 Day",
    pricingTier: "Premium",
    typicalUseCase: "Next-day AM delivery (by 10:30 AM)",
    active: true,
  },
  {
    id: uid(),
    carrier: "USPS",
    serviceCode: "USPS_GROUND_ADVANTAGE",
    serviceDescription: "USPS Ground Advantage",
    transitDays: "2-5 Days",
    pricingTier: "Low",
    typicalUseCase: "Best for sub-1 lb e-commerce parcels",
    active: true,
  },
  {
    id: uid(),
    carrier: "USPS",
    serviceCode: "USPS_PRIORITY",
    serviceDescription: "USPS Priority Mail",
    transitDays: "2-3 Days",
    pricingTier: "Mid",
    typicalUseCase: "Faster D2C delivery with built-in $100 insurance",
    active: true,
  },
  {
    id: uid(),
    carrier: "USPS",
    serviceCode: "USPS_PRIORITY_EXPRESS",
    serviceDescription: "USPS Priority Mail Express",
    transitDays: "1-2 Days",
    pricingTier: "High",
    typicalUseCase: "Overnight to most locations, including P.O. Boxes",
    active: true,
  },
  {
    id: uid(),
    carrier: "USPS",
    serviceCode: "USPS_MEDIA_MAIL",
    serviceDescription: "USPS Media Mail",
    transitDays: "2-8 Days",
    pricingTier: "Lowest",
    typicalUseCase: "Restricted strictly to books, media, and educational print",
    active: true,
  },
  {
    id: uid(),
    carrier: "LTL",
    serviceCode: "LTL_STANDARD",
    serviceDescription: "LTL Carrier - Standard",
    transitDays: "3-7 Days",
    pricingTier: "Low-Mid",
    typicalUseCase: "Less-than-truckload palletized freight for B2B shipments",
    active: true,
  },
];

export function getActiveCarriers(): string[] {
  return [...new Set(carrierServices.filter((cs) => cs.active).map((cs) => cs.carrier))];
}

export function getServiceCodesByCarrier(carrier: string): CarrierServiceRecord[] {
  return carrierServices.filter((cs) => cs.carrier === carrier && cs.active);
}

export function getServiceCodeDescription(serviceCode: string): string {
  const cs = carrierServices.find((c) => c.serviceCode === serviceCode);
  return cs?.serviceDescription ?? "";
}
