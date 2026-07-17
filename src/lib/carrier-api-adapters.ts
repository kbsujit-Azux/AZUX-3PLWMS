/**
 * ============================================================
 *  MODULE INDEX — Carrier API Adapters
 * ============================================================
 *
 *  Purpose: Unified carrier rate abstraction. Maps WMS rate
 *           requests to ShipEngine / EasyPost APIs and normalizes
 *           responses into the internal RateQuote model.
 *
 *  Adapters:
 *    - ShipEngineAdapter
 *    - EasyPostAdapter
 *    - MockCarrierAdapter (fallback when API keys are absent)
 * ============================================================
 */

import type { RateQuoteRequest, RateQuote, CarrierServiceRecord } from "./carrier-rate-shopping";

// ============================================================
// Types
// ============================================================

export type CarrierAdapterConfig = {
  carrierId: string;
  carrierName: string;
  apiKey?: string;
  apiEndpoint?: string;
  accountNumber?: string;
  scacCode?: string;
  enabled: boolean;
};

export interface CarrierAdapter {
  carrierId: string;
  carrierName: string;
  getRates(request: RateQuoteRequest): Promise<RateQuote[]>;
}

// ============================================================
// ShipEngine Adapter
// ============================================================

export class ShipEngineAdapter implements CarrierAdapter {
  carrierId: string;
  carrierName: string;
  private apiKey: string;
  private baseUrl = "https://api.shipengine.com/v1";

  constructor(config: CarrierAdapterConfig) {
    this.carrierId = config.carrierId;
    this.carrierName = config.carrierName;
    this.apiKey = config.apiKey || "";
  }

  async getRates(request: RateQuoteRequest): Promise<RateQuote[]> {
    if (!this.apiKey) {
      throw new Error(`ShipEngine API key not configured for ${this.carrierName}`);
    }

    const body = {
      shipment: {
        address_from: {
          address_line1: "",
          city_locality: "",
          state_province: "",
          postal_code: request.originZip,
          country_code: request.originCountry,
        },
        address_to: {
          address_line1: "",
          city_locality: "",
          state_province: "",
          postal_code: request.destinationZip,
          country_code: request.destinationCountry,
        },
        parcels: [
          {
            weight: {
              value: request.weightLbs,
              unit: "pound",
            },
            dimensions: {
              length: request.lengthIn,
              width: request.widthIn,
              height: request.heightIn,
              unit: "inch",
            },
          },
        ],
      },
      carrier_ids: [this.carrierId],
    };

    try {
      const response = await fetch(`${this.baseUrl}/rates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-Key": this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`ShipEngine API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return (data.rate_details || []).map((rate: any) => ({
        carrierId: this.carrierId,
        carrierName: this.carrierName,
        serviceLevel: this.mapShipEngineServiceCode(rate.service_code),
        transitDays: rate.delivery_days || 0,
        baseRate: rate.shipping_amount?.amount || 0,
        fuelSurcharge: rate.fuel_surcharge?.amount || 0,
        accessorials: (rate.other_amount?.amount || 0) + (rate.insurance_amount?.amount || 0),
        totalRate: rate.total_charge?.amount || 0,
        currency: rate.total_charge?.currency || "USD",
        estimatedDelivery: rate.estimated_delivery_date,
        metadata: { source: "shipengine", rateId: rate.rate_id },
      }));
    } catch (error) {
      console.error(`ShipEngine adapter error for ${this.carrierName}:`, error);
      throw error;
    }
  }

  private mapShipEngineServiceCode(code: string): string {
    const map: Record<string, string> = {
      fedex_ground: "ground",
      fedex_2_day: "2_day",
      fedex_standard_overnight: "standard_overnight",
      ups_ground: "ground",
      ups_2nd_day_air: "2nd_day_air",
      usps_ground_advantage: "ground",
      usps_priority: "priority",
    };
    return map[code.toLowerCase()] || code.toLowerCase();
  }
}

// ============================================================
// EasyPost Adapter
// ============================================================

export class EasyPostAdapter implements CarrierAdapter {
  carrierId: string;
  carrierName: string;
  private apiKey: string;
  private baseUrl = "https://api.easypost.com/v2";

  constructor(config: CarrierAdapterConfig) {
    this.carrierId = config.carrierId;
    this.carrierName = config.carrierName;
    this.apiKey = config.apiKey || "";
  }

  async getRates(request: RateQuoteRequest): Promise<RateQuote[]> {
    if (!this.apiKey) {
      throw new Error(`EasyPost API key not configured for ${this.carrierName}`);
    }

    const auth = Buffer.from(`${this.apiKey}:`).toString("base64");

    const shipment = {
      shipment: {
        to_address: {
          zip: request.destinationZip,
          country: request.destinationCountry,
        },
        from_address: {
          zip: request.originZip,
          country: request.originCountry,
        },
        parcel: {
          weight: request.weightLbs * 16,
          length: request.lengthIn,
          width: request.widthIn,
          height: request.heightIn,
        },
        carrier_accounts: [this.carrierId],
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/shipments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(shipment),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`EasyPost API error: ${response.status} ${err}`);
      }

      const data = await response.json();
      const rates = data.shipment?.rates || [];
      return rates.map((rate: any) => ({
        carrierId: this.carrierId,
        carrierName: this.carrierName,
        serviceLevel: rate.service?.toLowerCase().replace(/\s+/g, "_") || "ground",
        transitDays: rate.delivery_days || 0,
        baseRate: rate.rate || 0,
        fuelSurcharge: 0,
        accessorials: 0,
        totalRate: rate.rate || 0,
        currency: rate.currency || "USD",
        estimatedDelivery: rate.delivery_date,
        metadata: { source: "easypost", rateId: rate.id },
      }));
    } catch (error) {
      console.error(`EasyPost adapter error for ${this.carrierName}:`, error);
      throw error;
    }
  }
}

// ============================================================
// Mock Carrier Adapter (Fallback)
// ============================================================

export class MockCarrierAdapter implements CarrierAdapter {
  carrierId: string;
  carrierName: string;
  private baseRatePerLb: number;
  private transitMin: number;
  private transitMax: number;

  constructor(config: CarrierAdapterConfig & { baseRatePerLb: number; transitMin: number; transitMax: number }) {
    this.carrierId = config.carrierId;
    this.carrierName = config.carrierName;
    this.baseRatePerLb = config.baseRatePerLb;
    this.transitMin = config.transitMin;
    this.transitMax = config.transitMax;
  }

  async getRates(request: RateQuoteRequest): Promise<RateQuote[]> {
    const base = request.weightLbs * this.baseRatePerLb;
    const fuel = +(base * 0.15).toFixed(2);
    const accessorials = request.declaredValue ? +(request.declaredValue * 0.01).toFixed(2) : 0;
    const total = +(base + fuel + accessorials).toFixed(2);
    const transitDays = Math.floor(Math.random() * (this.transitMax - this.transitMin + 1)) + this.transitMin;

    return [
      {
        carrierId: this.carrierId,
        carrierName: this.carrierName,
        serviceLevel: "ground",
        transitDays,
        baseRate: +base.toFixed(2),
        fuelSurcharge: fuel,
        accessorials,
        totalRate: total,
        currency: "USD",
        metadata: { source: "mock" },
      },
    ];
  }
}

// ============================================================
// Adapter Factory
// ============================================================

export function createCarrierAdapter(config: CarrierAdapterConfig): CarrierAdapter | null {
  if (!config.enabled) return null;

  switch (config.carrierId) {
    case "shipengine":
      return new ShipEngineAdapter(config);
    case "easypost":
      return new EasyPostAdapter(config);
    default:
      return null;
  }
}

export function createMockAdapter(carrierId: string, carrierName: string): CarrierAdapter {
  const mockConfigs: Record<string, { baseRatePerLb: number; transitMin: number; transitMax: number }> = {
    usps: { baseRatePerLb: 0.45, transitMin: 2, transitMax: 8 },
    ups: { baseRatePerLb: 0.55, transitMin: 1, transitMax: 5 },
    fedex: { baseRatePerLb: 0.52, transitMin: 1, transitMax: 5 },
    xpo: { baseRatePerLb: 0.35, transitMin: 2, transitMax: 7 },
    old_dominion: { baseRatePerLb: 0.38, transitMin: 1, transitMax: 4 },
  };

  const cfg = mockConfigs[carrierId] || { baseRatePerLb: 0.50, transitMin: 2, transitMax: 5 };
  return new MockCarrierAdapter({
    carrierId,
    carrierName,
    ...cfg,
    enabled: true,
  });
}

// ============================================================
// Multi-Carrier Rate Aggregator
// ============================================================

export async function getRatesFromCarriers(
  request: RateQuoteRequest,
  adapters: CarrierAdapter[]
): Promise<RateQuote[]> {
  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter.getRates(request))
  );

  const quotes: RateQuote[] = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      quotes.push(...result.value);
    } else {
      console.warn("Carrier rate fetch failed:", result.reason);
    }
  });

  quotes.sort((a, b) => a.totalRate - b.totalRate);
  return quotes;
}
