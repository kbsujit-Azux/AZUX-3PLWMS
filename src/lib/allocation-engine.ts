import {
  collection,
  getDocs,
  query,
  where,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firestore";
import {
  updateOrder,
  writePickTicket,
  batchWritePickTickets,
  updatePickTicket,
  deletePickTicketsByOrder,
  upsertInventoryItem,
  logInventoryTransaction,
  getNextOrderSeq,
  createOrder,
} from "./firestore-data";
import {
  DROP001_LOCATION,
  NON_ALLOCATABLE_LOCATIONS,
  type InventoryItem,
  type PickTicket,
  nextPickTicketSeq,
  inventoryItems,
  pickTickets,
  clientAllocationConfigs,
  getClientAllocationConfig,
  findPickTicketsByOrder,
  type ClientAllocationConfig,
} from "./mock-data";
import { orders, type Order, type OrderLine } from "./edi-data";
import { getNextPickTicketSeq } from "./firestore-data";
import { buildBolFromOrder, emit945ForBol } from "./bol-data";

const now = () => new Date().toISOString();

export function validateOrderForAllocation(orderId: string): Order | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }
  if (order.status !== "new") {
    throw new Error(`Order ${orderId} is in status ${order.status}. Allocation requires NEW.`);
  }
  return order;
}

export function validateOrderForDeallocation(orderId: string): Order | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }
  if (order.status !== "ALLOCATED") {
    throw new Error(
      `Order ${orderId} is in status ${order.status}. Deallocation requires ALLOCATED.`,
    );
  }
  return order;
}

export function validatePickTicketForPick(pickTicketNum: number): PickTicket | null {
  const pt = pickTickets.find((p) => p.pickTicketNum === pickTicketNum);
  if (!pt) {
    throw new Error(`Pick Ticket ${pickTicketNum} not found.`);
  }
  if (pt.status !== "GENERATED") {
    throw new Error(
      `Pick Ticket ${pickTicketNum} is in status ${pt.status}. Pick requires GENERATED.`,
    );
  }
  return pt;
}

export function validateOrderForPick(orderId: string): Order | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }
  if (order.status !== "ALLOCATED") {
    throw new Error(`Order ${orderId} is in status ${order.status}. Pick requires ALLOCATED.`);
  }
  return order;
}

export function validateOrderForUnpick(orderId: string): Order | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }
  if (order.status !== "PICKED") {
    throw new Error(`Order ${orderId} is in status ${order.status}. Unpick requires PICKED.`);
  }
  return order;
}

export function validateOrderForShip(orderId: string): Order | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }
  if (order.status !== "PICKED") {
    throw new Error(`Order ${orderId} is in status ${order.status}. Ship requires PICKED.`);
  }
  return order;
}

/** ============================================================
 *  Allocation Engine — allocate_order
 *  ============================================================ */

export interface AllocationResult {
  success: boolean;
  pickTicketNum?: number;
  allocatedLines: Array<{
    sku: string;
    palletId: string;
    location: string;
    qtyAllocated: number;
  }>;
  error?: string;
}

export async function allocate_order(orderId: string): Promise<AllocationResult> {
  const order = validateOrderForAllocation(orderId);
  if (!order) {
    return { success: false, allocatedLines: [], error: `Order ${orderId} not found.` };
  }

  const config: ClientAllocationConfig = getClientAllocationConfig(order.tenantId) ?? {
    tenantId: order.tenantId,
    strategy: "LIFO" as const,
  };

  const allocatedLines: AllocationResult["allocatedLines"] = [];
  let pickTicketNum: number | undefined;

  for (const line of order.lines) {
    if (line.qtyOrdered <= 0) continue;

    const item = inventoryItems.find((i) => i.sku === line.sku);
    if (!item) {
      return {
        success: false,
        allocatedLines: [],
        error: `SKU ${line.sku} not found in inventory.`,
      };
    }

    const candidates = item.batches
      .filter((b) => !NON_ALLOCATABLE_LOCATIONS.includes(b.location))
      .map((b) => ({
        batch: b,
        available: b.qty - b.qtyAllocated,
      }))
      .filter((c) => c.available > 0);

    if (config.locationPrefix) {
      const prefixed = candidates.filter((c) =>
        c.batch.location.startsWith(config.locationPrefix!),
      );
      prefixed.sort((a, b) =>
        config.strategy === "LIFO"
          ? new Date(b.batch.receivedAt).getTime() - new Date(a.batch.receivedAt).getTime()
          : new Date(a.batch.receivedAt).getTime() - new Date(b.batch.receivedAt).getTime(),
      );
      const nonPrefixed = candidates.filter(
        (c) => !c.batch.location.startsWith(config.locationPrefix!),
      );
      nonPrefixed.sort((a, b) =>
        config.strategy === "LIFO"
          ? new Date(b.batch.receivedAt).getTime() - new Date(a.batch.receivedAt).getTime()
          : new Date(a.batch.receivedAt).getTime() - new Date(b.batch.receivedAt).getTime(),
      );
      candidates.length = 0;
      candidates.push(...prefixed, ...nonPrefixed);
    } else {
      candidates.sort((a, b) =>
        config.strategy === "LIFO"
          ? new Date(b.batch.receivedAt).getTime() - new Date(a.batch.receivedAt).getTime()
          : new Date(a.batch.receivedAt).getTime() - new Date(b.batch.receivedAt).getTime(),
      );
    }

    let remaining = line.qtyOrdered;
    let allocatedOnThisLine = 0;

    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(candidate.available, remaining);
      candidate.batch.qtyAllocated += take;
      remaining -= take;
      allocatedOnThisLine += take;
      allocatedLines.push({
        sku: line.sku,
        palletId: candidate.batch.palletId,
        location: candidate.batch.location,
        qtyAllocated: take,
      });
    }

    if (remaining > 0) {
      return {
        success: false,
        allocatedLines,
        error: `Insufficient inventory for SKU ${line.sku}. Short by ${remaining}.`,
      };
    }
  }

  if (allocatedLines.length > 0) {
    // Generate unique pick tickets - one per allocated line
    const tickets: PickTicket[] = [];
    const allocateTxns: Promise<any>[] = [];
    for (const line of allocatedLines) {
      const ticketNum = await getNextPickTicketSeq();
      const pt: PickTicket = {
        pickTicketNum: ticketNum,
        orderId: order.id,
        sku: line.sku,
        palletId: line.palletId,
        fromLocation: line.location,
        quantityToPick: line.qtyAllocated,
        status: "GENERATED",
        createdAt: now(),
      };
      pickTickets.push(pt);
      tickets.push(pt);
      // Log allocation transaction
      allocateTxns.push(
        logInventoryTransaction({
          sku: line.sku,
          palletId: line.palletId,
          location: line.location,
          orderId: order.id,
          type: "ALLOCATE",
          qtyChange: line.qtyAllocated,
          qtyBefore: line.qtyAllocated,
          qtyAfter: line.qtyAllocated,
          user: "allocation-ui",
          notes: `Allocated ${line.qtyAllocated} units for ${order.id}`,
        }),
      );
    }
    const firstTicketNum = tickets.length > 0 ? tickets[0].pickTicketNum : undefined;
    pickTicketNum = firstTicketNum;
    order.status = "ALLOCATED";

    // Prepare all writes
    const skusToUpdate = new Set(allocatedLines.map((l) => l.sku));
    const inventoryUpdates = Array.from(skusToUpdate).map((sku) => {
      const item = inventoryItems.find((i) => i.sku === sku);
      if (item) {
        return upsertInventoryItem({ ...item });
      }
      return Promise.resolve();
    });

    // Write to Firestore - order first, then inventory, then tickets, then transactions
    await createOrder(order);
    await Promise.all([...inventoryUpdates, ...allocateTxns]);
    await batchWritePickTickets(tickets);

    // Update local arrays
    const orderIdx = orders.findIndex((o) => o.id === order.id);
    if (orderIdx >= 0) orders[orderIdx] = { ...order };
  }

  return {
    success: true,
    pickTicketNum,
    allocatedLines,
  };
}

/** ============================================================
 *  Deallocation Engine — deallocate_order
 *  ============================================================ */

export interface DeallocationResult {
  success: boolean;
  deallocatedLines: Array<{
    sku: string;
    palletId: string;
    location: string;
    qtyDeallocated: number;
  }>;
  error?: string;
}

export async function deallocate_order(orderId: string): Promise<DeallocationResult> {
  const order = validateOrderForDeallocation(orderId);
  if (!order) {
    return { success: false, deallocatedLines: [], error: `Order ${orderId} not found.` };
  }

  const existingTickets = findPickTicketsByOrder(orderId);
  if (existingTickets.length === 0) {
    return {
      success: false,
      deallocatedLines: [],
      error: `No pick tickets found for order ${orderId}.`,
    };
  }

  const deallocatedLines: DeallocationResult["deallocatedLines"] = [];
  const deallocateTxns: Promise<any>[] = [];

  // Build lines array and update local inventory
  for (const pt of existingTickets) {
    const item = inventoryItems.find((i) => i.sku === pt.sku);
    if (item) {
      const batch = item.batches.find(
        (b) => b.palletId === pt.palletId && b.location === pt.fromLocation,
      );
      if (batch) {
        const beforeQty = batch.qtyAllocated || 0;
        batch.qtyAllocated = Math.max(0, beforeQty - pt.quantityToPick);
        deallocatedLines.push({
          sku: pt.sku,
          palletId: pt.palletId,
          location: pt.fromLocation,
          qtyDeallocated: pt.quantityToPick,
        });
        // Log deallocation transaction
        deallocateTxns.push(
          logInventoryTransaction({
            sku: pt.sku,
            palletId: pt.palletId,
            location: pt.fromLocation,
            orderId: order.id,
            type: "ALLOCATE",
            qtyChange: -pt.quantityToPick,
            qtyBefore: beforeQty,
            qtyAfter: batch.qtyAllocated,
            user: "deallocation-ui",
            notes: `Deallocated ${pt.quantityToPick} units for ${order.id}`,
          }),
        );
      }
    }
  }

  // Clean up local arrays
  for (let i = pickTickets.length - 1; i >= 0; i--) {
    if (pickTickets[i].orderId === orderId) {
      pickTickets.splice(i, 1);
    }
  }
  order.status = "new";

  // Update unique SKUs to Firestore
  const skusToUpdate = new Set(deallocatedLines.map((l) => l.sku));
  const inventoryUpdates = Array.from(skusToUpdate).map((sku) => {
    const item = inventoryItems.find((i) => i.sku === sku);
    if (item) return upsertInventoryItem({ ...item });
    return Promise.resolve();
  });

  // Write to Firestore
  await Promise.all([
    updateOrder(order.id, { status: "new" }),
    deletePickTicketsByOrder(orderId),
    ...inventoryUpdates,
    ...deallocateTxns,
  ]);

  return {
    success: true,
    deallocatedLines,
  };
}

/** ============================================================
 *  Picking Function — pick_pick_ticket
 *  ============================================================ */

export interface PickResult {
  success: boolean;
  pickTicketNum: number;
  pickedLines: Array<{
    sku: string;
    palletId: string;
    fromLocation: string;
    toLocation: string;
    qtyPicked: number;
  }>;
  error?: string;
}

export async function pick_pick_ticket(orderId: string): Promise<PickResult> {
  const order = validateOrderForPick(orderId);
  if (!order) {
    return {
      success: false,
      pickTicketNum: 0,
      pickedLines: [],
      error: `Order ${orderId} not found.`,
    };
  }

  const tickets = findPickTicketsByOrder(orderId);
  if (tickets.length === 0) {
    return {
      success: false,
      pickTicketNum: 0,
      pickedLines: [],
      error: `No pick tickets found for order ${orderId}.`,
    };
  }

  const pickedLines: PickResult["pickedLines"] = [];
  const firstTicketNum = tickets[0].pickTicketNum;
  const updates: Array<Promise<any>> = [];

  for (const pt of tickets) {
    if (pt.status !== "GENERATED") {
      return {
        success: false,
        pickTicketNum: firstTicketNum,
        pickedLines: [],
        error: `Pick Ticket ${pt.pickTicketNum} is not in GENERATED status.`,
      };
    }

    const item = inventoryItems.find((i) => i.sku === pt.sku);
    if (!item) {
      return {
        success: false,
        pickTicketNum: firstTicketNum,
        pickedLines: [],
        error: `SKU ${pt.sku} not found in inventory.`,
      };
    }

    const originalBatch = item.batches.find(
      (b) => b.palletId === pt.palletId && b.location === pt.fromLocation,
    );
    if (!originalBatch) {
      return {
        success: false,
        pickTicketNum: firstTicketNum,
        pickedLines: [],
        error: `Original batch not found for SKU ${pt.sku} at ${pt.fromLocation}.`,
      };
    }

    if (originalBatch.qty < pt.quantityToPick) {
      return {
        success: false,
        pickTicketNum: firstTicketNum,
        pickedLines: [],
        error: `Insufficient quantity at ${pt.fromLocation}. Available: ${originalBatch.qty}, Needed: ${pt.quantityToPick}.`,
      };
    }

    originalBatch.qty -= pt.quantityToPick;
    originalBatch.qtyAllocated = Math.max(0, originalBatch.qtyAllocated - pt.quantityToPick);

    if (originalBatch.qty === 0) {
      const idx = item.batches.indexOf(originalBatch);
      if (idx >= 0) item.batches.splice(idx, 1);
    }

    const existingDrop = item.batches.find(
      (b) =>
        b.palletId === pt.palletId &&
        b.location === DROP001_LOCATION &&
        b.pickTicketNum === pt.pickTicketNum,
    );

    if (existingDrop) {
      existingDrop.qty += pt.quantityToPick;
    } else {
      item.batches.push({
        batchId: `DROP-${Date.now()}-${pt.pickTicketNum}`,
        palletId: pt.palletId,
        receivedAt: now(),
        qty: pt.quantityToPick,
        location: DROP001_LOCATION,
        poNumber: "",
        ediSource: "MANUAL",
        qtyAllocated: 0,
        pickTicketNum: pt.pickTicketNum,
      });
    }

    pt.status = "PICKED";
    pt.pickedAt = now();

    pickedLines.push({
      sku: pt.sku,
      palletId: pt.palletId,
      fromLocation: pt.fromLocation,
      toLocation: DROP001_LOCATION,
      qtyPicked: pt.quantityToPick,
    });

    updates.push(updatePickTicket(pt.pickTicketNum, { status: "PICKED", pickedAt: pt.pickedAt }));
    updates.push(
      upsertInventoryItem({
        ...item,
        batches: item.batches.map((b) =>
          b.batchId === originalBatch.batchId
            ? { ...b, qty: b.qty, qtyAllocated: b.qtyAllocated }
            : b,
        ),
      } as any),
    );
  }

  order.status = "PICKED";
  updates.push(updateOrder(order.id, { status: "PICKED" }));

  try {
    await Promise.all(updates);
  } catch (e) {
    return {
      success: false,
      pickTicketNum: firstTicketNum,
      pickedLines: [],
      error: `Firestore write failed: ${(e as Error).message}`,
    };
  }

  return {
    success: true,
    pickTicketNum: firstTicketNum,
    pickedLines,
  };
}

/** ============================================================
 *  Unpick Function — unpick_order
 *  ============================================================ */

export interface UnpickResult {
  success: boolean;
  pickTicketNum: number;
  unpickedLines: Array<{
    sku: string;
    palletId: string;
    fromLocation: string;
    toLocation: string;
    qtyUnpicked: number;
  }>;
  error?: string;
}

export async function unpick_order(orderId: string): Promise<UnpickResult> {
  const order = validateOrderForUnpick(orderId);
  if (!order) {
    return {
      success: false,
      pickTicketNum: 0,
      unpickedLines: [],
      error: `Order ${orderId} not found.`,
    };
  }

  const tickets = findPickTicketsByOrder(orderId);
  if (tickets.length === 0) {
    return {
      success: false,
      pickTicketNum: 0,
      unpickedLines: [],
      error: `No pick tickets found for order ${orderId}.`,
    };
  }

  const unpickedLines: UnpickResult["unpickedLines"] = [];
  const firstTicketNum = tickets[0].pickTicketNum;
  const updates: Array<Promise<any>> = [];

  for (const pt of tickets) {
    if (pt.status !== "PICKED") {
      return {
        success: false,
        pickTicketNum: firstTicketNum,
        unpickedLines: [],
        error: `Pick Ticket ${pt.pickTicketNum} is not in PICKED status.`,
      };
    }

    const item = inventoryItems.find((i) => i.sku === pt.sku);
    if (!item) {
      return {
        success: false,
        pickTicketNum: firstTicketNum,
        unpickedLines: [],
        error: `SKU ${pt.sku} not found in inventory.`,
      };
    }

    const dropBatch = item.batches.find(
      (b) =>
        b.palletId === pt.palletId &&
        b.location === DROP001_LOCATION &&
        b.pickTicketNum === pt.pickTicketNum,
    );
    if (!dropBatch) {
      return {
        success: false,
        pickTicketNum: firstTicketNum,
        unpickedLines: [],
        error: `DROP001 batch not found for Pick Ticket ${pt.pickTicketNum}.`,
      };
    }

    const originalBatch = item.batches.find(
      (b) => b.palletId === pt.palletId && b.location === pt.fromLocation,
    );
    if (originalBatch) {
      originalBatch.qty += dropBatch.qty;
    } else {
      item.batches.push({
        batchId: `RTN-${Date.now()}`,
        palletId: pt.palletId,
        receivedAt: now(),
        qty: dropBatch.qty,
        location: pt.fromLocation,
        poNumber: "",
        ediSource: "MANUAL",
        qtyAllocated: 0,
        pickTicketNum: undefined,
      });
    }

    const idx = item.batches.indexOf(dropBatch);
    if (idx >= 0) item.batches.splice(idx, 1);

    pt.status = "GENERATED";
    delete pt.pickedAt;

    unpickedLines.push({
      sku: pt.sku,
      palletId: pt.palletId,
      fromLocation: DROP001_LOCATION,
      toLocation: pt.fromLocation,
      qtyUnpicked: dropBatch.qty,
    });

    updates.push(updatePickTicket(pt.pickTicketNum, { status: "GENERATED" }));
  }

  order.status = "ALLOCATED";
  updates.push(updateOrder(order.id, { status: "ALLOCATED" }));

  try {
    await Promise.all(updates);
  } catch (e) {
    return {
      success: false,
      pickTicketNum: firstTicketNum,
      unpickedLines,
      error: `Firestore write failed: ${(e as Error).message}`,
    };
  }

  return {
    success: true,
    pickTicketNum: firstTicketNum,
    unpickedLines,
  };
}

/** ============================================================
 *  Bill of Lading & Shipping Execution — ship_order
 *  ============================================================ */

export interface ShipResult {
  success: boolean;
  bolNumber: string;
  pickTicketNum: number;
  shippedLines: Array<{
    sku: string;
    palletId: string;
    location: string;
    qtyShipped: number;
  }>;
  error?: string;
}

export async function ship_order(orderId: string): Promise<ShipResult> {
  const order = validateOrderForShip(orderId);
  if (!order) {
    return {
      success: false,
      bolNumber: "",
      pickTicketNum: 0,
      shippedLines: [],
      error: `Order ${orderId} not found.`,
    };
  }

  const tickets = findPickTicketsByOrder(orderId);
  if (tickets.length === 0) {
    return {
      success: false,
      bolNumber: "",
      pickTicketNum: 0,
      shippedLines: [],
      error: `No pick tickets found for order ${orderId}.`,
    };
  }

  const shippedLines: ShipResult["shippedLines"] = [];
  const firstTicketNum = tickets[0].pickTicketNum;
  const updates: Array<Promise<any>> = [];

  for (const pt of tickets) {
    if (pt.status !== "PICKED") {
      return {
        success: false,
        bolNumber: "",
        pickTicketNum: firstTicketNum,
        shippedLines: [],
        error: `Pick Ticket ${pt.pickTicketNum} is not in PICKED status.`,
      };
    }

    const item = inventoryItems.find((i) => i.sku === pt.sku);
    if (!item) continue;

    const dropBatch = item.batches.find(
      (b) =>
        b.palletId === pt.palletId &&
        b.location === DROP001_LOCATION &&
        b.pickTicketNum === pt.pickTicketNum,
    );
    if (dropBatch) {
      const idx = item.batches.indexOf(dropBatch);
      if (idx >= 0) item.batches.splice(idx, 1);
      shippedLines.push({
        sku: pt.sku,
        palletId: pt.palletId,
        location: DROP001_LOCATION,
        qtyShipped: dropBatch.qty,
      });
    }

    pt.status = "CLOSED";
    pt.closedAt = now();
    updates.push(updatePickTicket(pt.pickTicketNum, { status: "CLOSED", closedAt: pt.closedAt }));
  }

  const bol = buildBolFromOrder(order);
  if (order.status === "PICKED") {
    bol.status = "tendered";
  }
  emit945ForBol(bol);

  order.status = "shipped";
  updates.push(updateOrder(order.id, { status: "shipped" }));

  try {
    await Promise.all(updates);
  } catch (e) {
    return {
      success: false,
      bolNumber: bol.bolNumber,
      pickTicketNum: firstTicketNum,
      shippedLines,
      error: `Firestore write failed: ${(e as Error).message}`,
    };
  }

  return {
    success: true,
    bolNumber: bol.bolNumber,
    pickTicketNum: firstTicketNum,
    shippedLines,
  };
}

/** ============================================================
 *  State Machine Helpers
 *  ============================================================ */

export function canAllocate(order: Order): boolean {
  return order.status === "new";
}

export function canDeallocate(order: Order): boolean {
  return order.status === "ALLOCATED";
}

export function canPick(order: Order): boolean {
  return order.status === "ALLOCATED";
}

export function canUnpick(order: Order): boolean {
  return order.status === "PICKED";
}

export function canShip(order: Order): boolean {
  return order.status === "PICKED";
}

export function getOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "NEW",
    allocated: "ALLOCATED",
    picked: "PICKED",
    shipped: "SHIPPED",
    released: "RELEASED",
    picking: "PICKING",
    packed: "PACKED",
    exception: "EXCEPTION",
  };
  return map[status.toLowerCase()] || status;
}
