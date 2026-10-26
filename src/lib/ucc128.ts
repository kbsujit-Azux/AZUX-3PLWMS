// UCC128 / SSCC (Serial Shipping Container Code) generation utilities
import { doc, getDoc, setDoc, runTransaction } from "firebase/firestore";
import { db } from "./firestore";

export interface UCC128Config {
  tenantId: string;
  companyPrefix: string;
  serialStart: number;
  serialLastUsed: number;
  serialLength: number;
  active: boolean;
}

export const DEFAULT_UCC128_CONFIGS: Record<string, UCC128Config> = {
  acme: { tenantId: "acme", companyPrefix: "0012345", serialStart: 100001, serialLastUsed: 100000, serialLength: 12, active: true },
  global: { tenantId: "global", companyPrefix: "0098765", serialStart: 500001, serialLastUsed: 500000, serialLength: 12, active: true },
  techcorp: { tenantId: "techcorp", companyPrefix: "0055555", serialStart: 200001, serialLastUsed: 200000, serialLength: 12, active: true },
  retailco: { tenantId: "retailco", companyPrefix: "0077777", serialStart: 300001, serialLastUsed: 300000, serialLength: 12, active: true },
  hle: { tenantId: "hle", companyPrefix: "0033333", serialStart: 400001, serialLastUsed: 400000, serialLength: 12, active: true },
  nsap: { tenantId: "nsap", companyPrefix: "0044444", serialStart: 600001, serialLastUsed: 600000, serialLength: 12, active: true },
  vrdn: { tenantId: "vrdn", companyPrefix: "0088888", serialStart: 700001, serialLastUsed: 700000, serialLength: 12, active: true },
};

export function computeCheckDigit(base: string): string {
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
  if (base.length !== 19) {
    throw new Error(`UCC128 base must be 19 characters (got ${base.length}).`);
  }
  return base + computeCheckDigit(base);
}

export function validateUCC128(code: string): boolean {
  if (!/^\d{20}$/.test(code)) return false;
  return computeCheckDigit(code.slice(0, 19)) === code.slice(19);
}

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
    ucc128 = base + computeCheckDigit(base);
    tx.update(configRef, { serialStart: config.serialStart + 1, serialLastUsed: config.serialStart });
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
}
