/**
 * ============================================================
 *  MODULE INDEX � Multi-Carrier Rate Shopping Engine
 * ============================================================
 *
 *  Purpose: Carrier abstraction and rate shopping for LTL/Parcel.
 *           Supports ShipEngine/EasyPost-style carrier APIs.
 *
 *  Collections:
 *    - carrierServices         � Carrier definitions and credentials
 *    - carrierRateQuotes       � Cached rate quotes
 * ============================================================
 */

import type { TenantPortalReport } from "./tenant-portal";

// ============================================================
// Carrier Types
// ============================================================

export type CarrierType = "parcel" | "ltl" | "ftl" | "same_day";

export type CarrierServiceLevel = "ground" | "express" | "overnight" | "same_day" | "ltl_std" | "ltl_acc";

export type CarrierStatus = "active" | "inactive" | "maintenance";

export type CarrierServiceRecord = {
  id: string;
  carrierName: string;
  carrierCode: string;
  type: CarrierType;
  serviceLevel: CarrierServiceLevel;
  status: CarrierStatus;
  apiKey?: string;
  apiEndpoint?: string;
  supportedCountries: string[];
  transitDaysMin?: number;
  transitDaysMax?: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

// ============================================================
// Rate Quote Request / Response
// ============================================================

export type RateQuoteRequest = {
  tenantId: string;
  warehouseId: string;
  originZip: string;
  originCountry: string;
  destinationZip: string;
  destinationCountry: string;
  weightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  declaredValue?: number;
  serviceLevels?: CarrierServiceLevel[];
};

export type RateQuote = {
  carrierId: string;
  carrierName: string;
  serviceLevel: CarrierServiceLevel;
  transitDays: number;
  baseRate: number;
  fuelSurcharge: number;
  accessorials: number;
  totalRate: number;
  currency: string;
  estimatedDelivery?: string;
  metadata?: Record<string, any>;
};

export type RateQuoteResponse = {
  quotes: RateQuote[];
  requestedAt: string;
  cacheKey: string;
};

// ============================================================
// Helpers
// ============================================================

export function getActiveCarriers(type?: CarrierType): CarrierServiceRecord[] {
  const carriers: CarrierServiceRecord[] = [
    {
      id: "usps",
      carrierName: "USPS",
      carrierCode: "USPS",
      type: "parcel",
      serviceLevel: "ground",
      status: "active",
      supportedCountries: ["US"],
      transitDaysMin: 2,
      transitDaysMax: 8,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "ups",
      carrierName: "UPS",
      carrierCode: "UPS",
      type: "parcel",
      serviceLevel: "ground",
      status: "active",
      supportedCountries: ["US", "CA"],
      transitDaysMin: 1,
      transitDaysMax: 5,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "fedex",
      carrierName: "FedEx",
      carrierCode: "FDX",
      type: "parcel",
      serviceLevel: "ground",
      status: "active",
      supportedCountries: ["US", "CA"],
      transitDaysMin: 1,
      transitDaysMax: 5,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "xpo",
      carrierName: "XPO LTL",
      carrierCode: "XPO",
      type: "ltl",
      serviceLevel: "ltl_std",
      status: "active",
      supportedCountries: ["US"],
      transitDaysMin: 2,
      transitDaysMax: 7,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "old_dominion",
      carrierName: "Old Dominion",
      carrierCode: "ODFL",
      type: "ltl",
      serviceLevel: "ltl_std",
      status: "active",
      supportedCountries: ["US"],
      transitDaysMin: 1,
      transitDaysMax: 4,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ];
  if (!type) return carriers.filter((c) => c.status === "active");
  return carriers.filter((c) => c.type === type && c.status === "active");
}

export function getServiceCodesByCarrier(carrierId: string): string[] {
  const codes: Record<string, string[]> = {
    usps: ["GROUND", "PRIORITY", "EXPRESS"],
    ups: ["GROUND", "3_DAY_SELECT", "2ND_DAY_AIR", "NEXT_DAY_AIR"],
    fedex: ["GROUND", "2_DAY", "STANDARD_OVERNIGHT"],
    xpo: ["LTL_STD", "LTL_ACC", "LTL_PREMIUM"],
    old_dominion: ["LTL_STD", "LTL_ACC"],
  };
  return codes[carrierId] || [];
}



// ============================================================
// Rate Quote Service
// ============================================================

export async function simulateRateQuotes(request: RateQuoteRequest): Promise<RateQuoteResponse> {
  const carriers = [
    { id: "usps", name: "USPS", type: "parcel" as const, baseRatePerLb: 0.45 },
    { id: "ups", name: "UPS", type: "parcel" as const, baseRatePerLb: 0.55 },
    { id: "fedex", name: "FedEx", type: "parcel" as const, baseRatePerLb: 0.52 },
    { id: "xpo", name: "XPO LTL", type: "ltl" as const, baseRatePerLb: 0.35 },
    { id: "old_dominion", name: "Old Dominion", type: "ltl" as const, baseRatePerLb: 0.38 },
  ];

  const quotes: RateQuote[] = carriers
    .filter((c) => {
      if (request.serviceLevels && request.serviceLevels.length > 0) {
        return request.serviceLevels.some((s) => c.type === "parcel" ? ["ground", "express", "overnight"].includes(s) : ["ltl_std", "ltl_acc"].includes(s));
      }
      return true;
    })
    .map((carrier) => {
      const base = request.weightLbs * carrier.baseRatePerLb;
      const fuel = +(base * 0.15).toFixed(2);
      const accessorials = request.declaredValue ? +(request.declaredValue * 0.01).toFixed(2) : 0;
      const total = +(base + fuel + accessorials).toFixed(2);
      const transitMin = carrier.type === "parcel" ? 1 : 2;
      const transitMax = carrier.type === "parcel" ? 5 : 7;
      return {
        carrierId: carrier.id,
        carrierName: carrier.name,
        serviceLevel: carrier.type === "parcel" ? "ground" : "ltl_std",
        transitDays: Math.floor(Math.random() * (transitMax - transitMin + 1)) + transitMin,
        baseRate: +base.toFixed(2),
        fuelSurcharge: fuel,
        accessorials,
        totalRate: total,
        currency: "USD",
      };
    });

  quotes.sort((a, b) => a.totalRate - b.totalRate);

  return {
    quotes,
    requestedAt: new Date().toISOString(),
    cacheKey: `${request.originZip}-${request.destinationZip}-${request.weightLbs}-${request.lengthIn}-${request.widthIn}-${request.heightIn}`,
  };
}

// ============================================================
// Cache Helpers
// ============================================================

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const rateQuoteCache = new Map<string, { response: RateQuoteResponse; expiresAt: number }>();

export function getCachedRateQuotes(cacheKey: string): RateQuoteResponse | null {
  const entry = rateQuoteCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    rateQuoteCache.delete(cacheKey);
    return null;
  }
  return entry.response;
}

export function setCachedRateQuotes(cacheKey: string, response: RateQuoteResponse): void {
  rateQuoteCache.set(cacheKey, {
    response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}


export function getServiceCodeDescription(code: string): string {
  const map: Record<string, string> = {
    GROUND: "Ground",
    PRIORITY: "Priority Mail",
    EXPRESS: "Express Mail",
    "3_DAY_SELECT": "3 Day Select",
    "2ND_DAY_AIR": "2nd Day Air",
    NEXT_DAY_AIR: "Next Day Air",
    "2_DAY": "2Day",
    STANDARD_OVERNIGHT: "Standard Overnight",
    LTL_STD: "LTL Standard",
    LTL_ACC: "LTL Accelerated",
    LTL_PREMIUM: "LTL Premium",
  };
  return map[code] || code;
}
