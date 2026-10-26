// UCC128 / SSCC (Serial Shipping Container Code) generation utilities
// GS1 standard: 18-digit SSCC = extension digit (1) + company prefix (7-10) + serial (6-9) + check digit (1)
// We use 20-character format: company prefix (7-10) + serial (9-12) + check digit (1) = 20 total

export interface UCC128Config {
  tenantId: string;
  companyPrefix: string; // 7-10 digit GS1 company prefix
  serialStart: number; // next sequence number
  serialLength: number; // length of serial portion (9-12)
  active: boolean;
}

export function computeCheckDigit(base: string): string {
  // GS1 Mod 10 check digit algorithm
  let sum = 0;
  const reversed = base.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    const digit = parseInt(reversed[i], 10);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  const remainder = sum % 10;
  return remainder === 0 ? "0" : String(10 - remainder);
}

export function generateUCC128(config: UCC128Config): string {
  const serial = String(config.serialStart).padStart(config.serialLength, "0");
  const base = config.companyPrefix + serial;
  // Total should be 19 chars before check digit for 20-char SSCC
  if (base.length !== 19) {
    throw new Error(`UCC128 base must be 19 characters (got ${base.length}). Adjust prefix/serial length.`);
  }
  const checkDigit = computeCheckDigit(base);
  return base + checkDigit;
}

export function validateUCC128(code: string): boolean {
  if (!/^\d{20}$/.test(code)) return false;
  const base = code.slice(0, 19);
  const check = code.slice(19);
  return computeCheckDigit(base) === check;
}

import { doc, getDoc, setDoc, runTransaction, collection, getDocs } from "firebase/firestore";
import { db } from "./firestore";

export async function getUCC128Config(tenantId: string): Promise<UCC128Config | null> {
  const snap = await getDoc(doc(db, "ucc128Config", tenantId));
  if (!snap.exists()) return null;
  return snap.data() as UCC128Config;
}

export async function saveUCC128Config(config: UCC128Config): Promise<void> {
  await setDoc(doc(db, "ucc128Config", config.tenantId), config, { merge: true });
}

export async function generateNextUCC128(tenantId: string): Promise<string> {
  const configRef = doc(db, "ucc128Config", tenantId);
  let ucc128 = "";
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(configRef);
    if (!snap.exists()) throw new Error(`No UCC128 config for tenant ${tenantId}`);
    const config = snap.data() as UCC128Config;
    const serial = String(config.serialStart).padStart(config.serialLength, "0");
    const base = config.companyPrefix + serial;
    const checkDigit = computeCheckDigit(base);
    ucc128 = base + checkDigit;
    tx.update(configRef, { serialStart: config.serialStart + 1 });
  });
  return ucc128;
}

export async function seedUCC128Configs(): Promise<void> {
  for (const [tenantId, config] of Object.entries(DEFAULT_UCC128_CONFIGS)) {
    const existing = await getUCC128Config(tenantId);
    if (!existing) {
      await saveUCC128Config(config);
    }
  }
}: Record<string, UCC128Config> = {
  acme: {
    tenantId: "acme",
    companyPrefix: "0012345",
    serialStart: 100001,
    serialLength: 12,
    active: true,
  },
  global: {
    tenantId: "global",
    companyPrefix: "0098765",
    serialStart: 500001,
    serialLength: 12,
    active: true,
  },
  techcorp: {
    tenantId: "techcorp",
    companyPrefix: "0055555",
    serialStart: 200001,
    serialLength: 12,
    active: true,
  },
  retailco: {
    tenantId: "retailco",
    companyPrefix: "0077777",
    serialStart: 300001,
    serialLength: 12,
    active: true,
  },
};
