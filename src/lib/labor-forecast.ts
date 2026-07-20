/**
 * ============================================================
 *  MODULE INDEX — Labor Forecasting Engine
 * ============================================================
 *
 *  Purpose: Predict labor needs based on incoming EDI 943
 *           (ASN) and EDI 940 (orders) volumes. Generates
 *           daily forecasts by task type and gap analysis.
 *
 *  Usage:
 *    const forecasts = forecastLaborFromEdi(inbound, orders, standards, 7);
 *
 *  Extension points:
 *    - Add historical efficiency factors
 *    - Add shift pattern optimization
 *    - Add real-time labor board
 * ============================================================
 */

import type { InboundShipment } from "./inbound-data";
import type { Order } from "./edi-data";
import type { LaborStandard } from "./rf-types";

export type ForecastHorizon = "daily" | "weekly" | "monthly";

export type LaborForecast = {
  id: string;
  tenantId: string;
  warehouseId: string;
  forecastDate: string;
  inboundPallets: number;
  inboundCases: number;
  inboundLines: number;
  outboundOrders: number;
  outboundPicks: number;
  outboundCartons: number;
  receivingHours: number;
  putawayHours: number;
  pickingHours: number;
  packingHours: number;
  shippingHours: number;
  vasHours: number;
  totalHours: number;
  scheduledHeadcount: number;
  availableHeadcount: number;
  hoursGap: number;
  headcountGap: number;
  confidence: "high" | "medium" | "low";
  inboundCertaintyPct: number;
  outboundCertaintyPct: number;
  generatedAt: string;
};

export type ShiftSchedule = {
  id: string;
  tenantId: string;
  warehouseId: string;
  shiftDate: string;
  shiftType: "day" | "swing" | "night";
  startTime: string;
  endTime: string;
  receivers: number;
  putaway: number;
  pickers: number;
  packers: number;
  forklift: number;
  vas: number;
  assignedBadgeIds: string[];
  notes?: string;
};

export function forecastLaborFromEdi(
  inboundShipments: InboundShipment[],
  orders: Order[],
  laborStandards: LaborStandard[],
  horizonDays: number,
): LaborForecast[] {
  const forecasts: LaborForecast[] = [];

  for (let day = 0; day < horizonDays; day++) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];

    const daysInbound = inboundShipments.filter((s) => {
      const expected = new Date(s.expectedAt);
      return expected.toISOString().split("T")[0] === dateStr;
    });

    const daysOrders = orders.filter((o) => {
      const requested = new Date(o.entryDate || o.receivedAt || o.id);
      return requested.toISOString().split("T")[0] === dateStr;
    });

    const inboundPallets = daysInbound.length;
    const inboundCases = daysInbound.reduce((sum, s) => sum + s.lines.reduce((s2, l) => s2 + (l.cartonsExpected || 0), 0), 0);
    const inboundLines = daysInbound.reduce((sum, s) => sum + s.lines.length, 0);
    const outboundOrders = daysOrders.length;
    const outboundPicks = daysOrders.reduce((sum, o) => sum + o.lines.length, 0);
    const outboundCartons = daysOrders.reduce((sum, o) => sum + o.lines.reduce((s2, l) => s2 + (l.cartons || l.qtyOrdered || 0), 0), 0);

    const receivingStandard = laborStandards.find((s) => s.taskType === "DOCK_RECEIVING");
    const putawayStandard = laborStandards.find((s) => s.taskType === "PUTAWAY");
    const pickStandard = laborStandards.find((s) => s.taskType === "DIRECTED_PICK");

    const receivingHours = inboundPallets * ((receivingStandard?.secFixed || 20) / 3600);
    const putawayHours = inboundPallets * ((putawayStandard?.secFixed || 25) / 3600);
    const pickingHours = outboundPicks * ((pickStandard?.secFixed || 10) / 3600);
    const packingHours = outboundCartons * 0.05;
    const shippingHours = outboundOrders * 0.25;
    const vasHours = 0;

    const totalHours = receivingHours + putawayHours + pickingHours + packingHours + shippingHours + vasHours;
    const scheduledHeadcount = Math.max(1, Math.ceil(totalHours / 8));
    const availableHeadcount = scheduledHeadcount;
    const hoursGap = Math.max(0, totalHours - availableHeadcount * 8);
    const headcountGap = Math.max(0, Math.ceil(hoursGap / 8));

    const inboundCertainty = daysInbound.length > 0 ? 85 : 100;
    const outboundCertainty = daysOrders.length > 0 ? 75 : 100;
    const confidence: "high" | "medium" | "low" =
      inboundCertainty >= 80 && outboundCertainty >= 80 ? "high" : inboundCertainty >= 50 ? "medium" : "low";

    forecasts.push({
      id: `FC-${dateStr}-${Math.random().toString(36).slice(2, 5)}`,
      tenantId: "",
      warehouseId: "",
      forecastDate: date.toISOString(),
      inboundPallets,
      inboundCases,
      inboundLines,
      outboundOrders,
      outboundPicks,
      outboundCartons,
      receivingHours: +receivingHours.toFixed(2),
      putawayHours: +putawayHours.toFixed(2),
      pickingHours: +pickingHours.toFixed(2),
      packingHours: +packingHours.toFixed(2),
      shippingHours: +shippingHours.toFixed(2),
      vasHours: +vasHours.toFixed(2),
      totalHours: +totalHours.toFixed(2),
      scheduledHeadcount,
      availableHeadcount,
      hoursGap: +hoursGap.toFixed(2),
      headcountGap,
      confidence,
      inboundCertaintyPct: inboundCertainty,
      outboundCertaintyPct: outboundCertainty,
      generatedAt: new Date().toISOString(),
    });
  }

  return forecasts;
}

export function computeShiftSchedule(
  forecast: LaborForecast,
): ShiftSchedule {
  const receivers = Math.max(1, Math.ceil(forecast.receivingHours / 8));
  const putaway = Math.max(1, Math.ceil(forecast.putawayHours / 8));
  const pickers = Math.max(1, Math.ceil(forecast.pickingHours / 8));
  const packers = Math.max(1, Math.ceil(forecast.packingHours / 8));
  const forklift = Math.max(1, Math.ceil((forecast.receivingHours + forecast.putawayHours) / 8));
  const vas = Math.max(0, Math.ceil(forecast.vasHours / 8));

  return {
    id: `SH-${forecast.forecastDate.split("T")[0]}`,
    tenantId: forecast.tenantId,
    warehouseId: forecast.warehouseId,
    shiftDate: forecast.forecastDate.split("T")[0],
    shiftType: "day",
    startTime: "06:00",
    endTime: "14:00",
    receivers,
    putaway,
    pickers,
    packers,
    forklift,
    vas,
    assignedBadgeIds: [],
  };
}
