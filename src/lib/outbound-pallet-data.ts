export type OutboundPalletStatus =
  | "built"
  | "staged"
  | "loading"
  | "tendered"
  | "in-transit"
  | "delivered"
  | "exception";

export type OutboundPalletLine = {
  sku: string;
  description: string;
  unitsPicked: number;
  caseQty: number;
  weightLbs: number;
  pickTicketNum?: number;
};

export type OutboundPallet = {
  id: string;
  orderId: string;
  tenantId: string;
  warehouseId: string;
  palletSeq: number;
  totalPallets: number;
  lines: OutboundPalletLine[];
  ucc128Data: string;
  sscc18: string;
  status: OutboundPalletStatus;
  bolId?: string;
  shipmentId?: string;
  scac?: string;
  carrierName?: string;
  authorization?: string;
  createdAt: string;
  updatedAt: string;
  tenderedAt?: string;
  departedAt?: string;
  deliveredAt?: string;
  deliveredNotes?: string;
};

export type OutboundPalletCreateInput = {
  orderId: string;
  tenantId: string;
  warehouseId: string;
  totalPallets: number;
  lines: OutboundPalletLine[];
};

const COMPANY_PREFIX = "0412345"; // Mock GS1 company prefix (7 digits)

function computeCheckDigit(s: string): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const digit = parseInt(s[s.length - 1 - i], 10);
    if (i % 2 === 0) sum += digit * 3;
    else sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function generateSSCC18(orderId: string, palletSeq: number, totalPallets: number): string {
  const extension = "0";
  const serialRef =
    `${totalPallets}${palletSeq}`.padStart(6, "0") + orderId.replace(/\D/g, "").slice(-4);
  const payload = extension + COMPANY_PREFIX + serialRef;
  const check = computeCheckDigit(payload);
  return payload + check.toString();
}

export function buildUcc128Label(sscc18: string): string {
  return `(00)${sscc18}`;
}

export function buildOutboundPalletId(orderId: string, palletSeq: number): string {
  const cleanOrder = orderId.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `OBP-${cleanOrder}-${palletSeq.toString().padStart(3, "0")}`;
}

export function createOutboundPalletFromInput(
  input: OutboundPalletCreateInput,
  palletSeq: number,
): OutboundPallet {
  const id = buildOutboundPalletId(input.orderId, palletSeq);
  const sscc18 = generateSSCC18(input.orderId, palletSeq, input.totalPallets);
  const ucc128Data = buildUcc128Label(sscc18);
  const now = new Date().toISOString();

  return {
    id,
    orderId: input.orderId,
    tenantId: input.tenantId,
    warehouseId: input.warehouseId,
    palletSeq,
    totalPallets: input.totalPallets,
    lines: input.lines,
    ucc128Data,
    sscc18,
    status: "built",
    createdAt: now,
    updatedAt: now,
  };
}

export const OUTBOUND_PALLET_STATUSES: OutboundPalletStatus[] = [
  "built",
  "staged",
  "loading",
  "tendered",
  "in-transit",
  "delivered",
  "exception",
];
