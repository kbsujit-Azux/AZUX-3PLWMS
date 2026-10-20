/**
 * ============================================================
 *  SEED — 5 pallets of 40 units, bound to the inbound containers
 * ============================================================
 *
 *  Purpose: Reset the transactional pallet/inventory state and create the
 *           pallets that were built on the Inbound screen (5 pallets of
 *           40 units each), persisted to Firestore and linked to their
 *           inbound container so the Inbound and Pallet screens stay bound.
 *
 *  What it does:
 *    1. Deletes every existing pallet, inventory item and legacy location
 *       record (the stale seed data).
 *    2. For each inbound container, builds ONE pallet of 40 units from its
 *       first line, assigns a directed-putaway location using the real
 *       Location Master, and links it back to the inbound line.
 *    3. Updates the inbound line (receivedQty / palletIds / status) and the
 *       shipment status so the Inbound screen reflects the build.
 *
 *  Usage:
 *    npm run seed:pallets
 *    npm run seed:pallets -- --dry-run
 * ============================================================
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "wms-3pl-79a05",
});
const db = getFirestore(app);

const DRY_RUN = process.argv.includes("--dry-run");
const UNITS_PER_PALLET = 40;

/* ───── Stale collections to purge ──────────────────────────────────── */

/** Legacy duplicate of locationMaster + any leftover pallet/inventory data */
const PURGE_COLLECTIONS = [
  "pallets",
  "outboundPallets",
  "inventoryItems",
  "inventoryTransactions",
  "billableEvents",
  "locations", // legacy duplicate of locationMaster
];

/** Keep: tenants, warehouses, clients, itemMaster, locationMaster, employees,
 *  users, billing*, carrier*, csvUploadHistory, inboundShipments, workOrders,
 *  counters, rma*, tenantPortalUsers, cartonizations, returnProcessingFees */

/* ───── Putaway scoring (mirrors src/lib/putaway-engine.ts) ─────────── */

type Loc = {
  id: string;
  warehouseId: string;
  tenantId?: string;
  type: string;
  zone: string;
  capacityPallets: number;
  occupiedPallets: number;
  pickable: boolean;
  allowedItemStyles: string[] | null;
  slottingRules: any;
  zoneAdjacency?: any;
  status: string;
  maxPalletWeightLbs?: number;
  maxPalletHeightIn?: number;
  zoneType?: string;
};

function locationZone(l: Loc): string {
  if (l.zoneType) return l.zoneType;
  const z = (l.zone || "").toLowerCase();
  if (z.includes("forward") || z.includes("pick")) return "forward_pick";
  if (z.includes("bulk") || z.includes("reserve")) return "reserve";
  if (z.includes("hazmat")) return "hazmat";
  if (z.includes("cold")) return "cold";
  if (z.includes("stage") || z.includes("dock") || z.includes("drop")) return "staging";
  return "reserve";
}

function storageClassFor(item: any): string {
  if (!item) return "reserve";
  if (item.hazmat) return "hazmat";
  const explicit = item.velocity?.storageClass;
  if (explicit === "cold" || explicit === "hazmat") return explicit;
  const abc = item.velocity?.abcClass ?? "B";
  return abc === "A" ? "forward" : abc === "C" ? "bulk" : "reserve";
}

function idealZoneFor(sc: string): string {
  switch (sc) {
    case "forward":
      return "forward_pick";
    case "bulk":
      return "bulk";
    case "cold":
      return "cold";
    case "hazmat":
      return "hazmat";
    default:
      return "reserve";
  }
}

/** Rank locations and return the best suggestion for a pallet. */
function suggestLocation(
  locs: Loc[],
  input: {
    sku: string;
    itemStyle: string;
    tenantId: string;
    warehouseId: string;
    weightLbs: number;
  },
  item: any,
): Loc | null {
  const storageClass = storageClassFor(item);
  const ideal = idealZoneFor(storageClass);

  const candidates = locs
    .filter((l) => l.warehouseId === input.warehouseId)
    .filter((l) => l.status === "active")
    .filter((l) => l.occupiedPallets < l.capacityPallets)
    .filter((l) => {
      const allowed = l.slottingRules?.allowedStorageClasses ?? [];
      return allowed.length === 0 || allowed.includes(storageClass);
    })
    .filter((l) => {
      if (l.allowedItemStyles && l.allowedItemStyles.length > 0) {
        return l.allowedItemStyles.includes(input.itemStyle);
      }
      return true;
    })
    .filter((l) => input.weightLbs <= (l.maxPalletWeightLbs ?? 2500))
    .map((l) => {
      const zone = locationZone(l);
      const allowed = l.slottingRules?.allowedStorageClasses ?? [];
      const velocity = zone === ideal ? 100 : allowed.includes(storageClass) ? 70 : 25;
      const toReceiving = l.zoneAdjacency?.toReceivingDockSec ?? 300;
      const toShipping = l.zoneAdjacency?.toShippingDockSec ?? 300;
      const travel =
        storageClass === "forward"
          ? Math.max(0, 100 - toShipping / 6)
          : Math.max(0, 100 - toReceiving / 6);
      const free = l.capacityPallets - l.occupiedPallets;
      const space = l.capacityPallets > 0 ? Math.round((free / l.capacityPallets) * 100) : 0;
      const score = velocity * 0.3 + travel * 0.2 + space * 0.15 + 100 * 0.1 + 50 * 0.25;
      return { loc: l, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.loc ?? null;
}

/* ───── Runner ─────────────────────────────────────────────────────── */

async function main() {
  console.log("Seed 5 pallets x 40 units, bound to inbound containers");
  console.log(`Project: wms-3pl-79a05`);
  console.log(`Mode:    ${DRY_RUN ? "DRY RUN" : "WRITE"}`);

  /* 1. Capture the existing pallet→shipment links BEFORE purging */
  const existingPalletSnap = await db.collection("pallets").get();
  const palletsForShipment = new Map<string, any[]>();
  existingPalletSnap.docs.forEach((d) => {
    const p = d.data() as any;
    const sid = p.shipmentId ?? p.inboundShipmentId;
    if (!sid) return;
    const list = palletsForShipment.get(sid) ?? [];
    list.push(p);
    palletsForShipment.set(sid, list);
  });

  /* 2. Purge stale transactional data */
  console.log("\n── Purging stale collections ──────────────────────");
  for (const coll of PURGE_COLLECTIONS) {
    const snap = await db.collection(coll).get();
    if (snap.empty) {
      console.log(`  ${coll}: already empty`);
      continue;
    }
    console.log(`  ${coll}: deleting ${snap.size} document(s)`);
    if (!DRY_RUN) {
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  /* 3. Load reference data */
  const inboundSnap = await db.collection("inboundShipments").get();
  const itemSnap = await db.collection("itemMaster").get();
  const locSnap = await db.collection("locationMaster").get();
  const whSnap = await db.collection("warehouses").get();

  const items = itemSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const locs = locSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Loc[];
  const warehouses = whSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  /* 4. Build one 40-unit pallet per inbound container */
  console.log("\n── Building pallets ────────────────────────────────");
  const now = new Date().toISOString();
  const batch = db.batch();
  let created = 0;

  for (const doc of inboundSnap.docs) {
    const shipment = doc.data() as any;
    const line = (shipment.lines ?? [])[0];
    if (!line) {
      console.log(`  ${shipment.id}: no lines, skipped`);
      continue;
    }

    const item = items.find((i) => i.sku === line.sku);
    const wh = warehouses.find((w) => w.id === shipment.warehouseId);
    const whCode = wh?.code ?? (shipment.warehouseId || "WH").toUpperCase();
    const seq = String(10000 + created + 1);
    const palletId = `PLT-${whCode}-${seq}`;

    const units = Math.min(UNITS_PER_PALLET, Number(line.qtyExpected) || UNITS_PER_PALLET);
    const unitWeight = Number(line.weightLbsPerUnit) || item?.weightLbs || 0;
    const weightLbs = +(units * unitWeight).toFixed(1);

    const suggested = suggestLocation(
      locs,
      {
        sku: line.sku,
        itemStyle: line.itemStyle ?? item?.itemStyle ?? "",
        tenantId: shipment.tenantId,
        warehouseId: shipment.warehouseId,
        weightLbs,
      },
      item,
    );

    const zone = suggested
      ? (locationZone(suggested) === "forward_pick"
          ? "A"
          : locationZone(suggested) === "bulk"
            ? "B"
            : locationZone(suggested) === "staging"
              ? "D"
              : "C")
      : "A";

    const casePack = Number(item?.caseQty) || Number(line.unitsPerPallet) || 1;
    const cases = units / casePack;
    const cubeCuFt = item?.cbmPerCase
      ? +(item.cbmPerCase * cases * 35.3147).toFixed(2)
      : 0;

    const pallet = {
      id: palletId,
      itemStyle: line.itemStyle ?? item?.itemStyle ?? "",
      tenantId: shipment.tenantId,
      warehouseId: shipment.warehouseId,
      sku: line.sku,
      description: line.description ?? item?.description ?? "",
      units,
      capacityUnits: Math.ceil(units * 1.15),
      casePack,
      weightLbs,
      builtAt: now,
      builtBy: "Inbound build",
      poNumber: shipment.poNumber ?? "",
      ediSource: shipment.source ?? "CSV",
      status: "staged",
      location: null,
      suggestedLocation: suggested?.id ?? "",
      zone,
      receivedAt: now,
      cubeCuFt,
      shipmentId: shipment.id,
      inboundShipmentId: shipment.id,
      createdAt: now,
      updatedAt: now,
    };

    console.log(
      `  ${shipment.id} → ${palletId}  ${units}u  ${line.sku}  suggested=${pallet.suggestedLocation || "none"}`,
    );

    if (!DRY_RUN) {
      batch.set(db.collection("pallets").doc(palletId), pallet);

      // Link the pallet back to the inbound line and advance the line status.
      // NOTE: the whole `lines` array is rewritten — a dotted path such as
      // `lines.0.receivedQty` would replace the array with a map and destroy
      // every other line and field.
      const lineIdx = 0;
      const currentLines: any[] = Array.isArray(shipment.lines) ? [...shipment.lines] : [];
      const currentLine = currentLines[lineIdx] ?? {};
      // The received quantity is DERIVED from the linked pallets (authoritative),
      // not incremented — otherwise re-running the seed accumulates.
      const linkedUnits = (palletsForShipment.get(shipment.id) ?? [])
        .filter((p: any) => p.sku === line.sku)
        .reduce((sum: number, p: any) => sum + (Number(p.units) || 0), 0);
      const nextReceived = Math.min(
        Number(currentLine.qtyExpected) || 0,
        linkedUnits || Number(currentLine.receivedQty ?? 0),
      );
      const lineStatus =
        nextReceived >= (Number(currentLine.qtyExpected) || 0) && Number(currentLine.qtyExpected) > 0
          ? "received"
          : nextReceived > 0
            ? "partial"
            : "expected";
      const mergedPalletIds = Array.from(
        new Set([
          ...(Array.isArray(currentLine.palletIds) ? currentLine.palletIds : []),
          palletId,
        ]),
      );
      currentLines[lineIdx] = {
        ...currentLine,
        receivedQty: nextReceived,
        status: lineStatus,
        palletIds: mergedPalletIds,
      };

      batch.update(doc.ref, {
        lines: currentLines,
        status: "on_dock",
        updatedAt: now,
      });
    }
    created++;
  }

  if (!DRY_RUN) {
    await batch.commit();
    console.log(`\nCommitted ${created} pallet(s).`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
