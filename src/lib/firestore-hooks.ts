import { useEffect, useState, useCallback } from "react";
import {
  collection,
  onSnapshot,
  getDocs,
  limit,
  doc,
  writeBatch,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  fetchTenants,
  fetchWarehouses,
  fetchInboundShipments,
  fetchItemMaster,
  fetchPallets,
  fetchOrders,
  fetchEdiLogs,
  fetchInventoryItems,
  fetchLocations,
  subscribeInboundShipments,
  subscribePallets,
  subscribeOrders,
  subscribeItemMaster,
  subscribeInventoryItems,
  updateInboundLine,
  receiveInboundShipment,
  createPallet,
  createPallets,
  updatePallet,
  updateOrder,
  addItemToMaster,
  deleteItemFromMaster,
} from "./firestore-data";
import type { Tenant, Warehouse, InventoryItem } from "./mock-data";
import type { Pallet } from "./pallet-data";
import type { ItemMasterRecord } from "./master-data";
import type { Order } from "./edi-data";
import type { InboundShipment, InboundLine } from "./inbound-data";

// Generic fetch hook
export function useFirestoreQuery<T>(fetchFn: () => Promise<T[]>, deps: any[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchFn()
      .then((result) => {
        if (mounted) setData(result);
      })
      .catch((err) => {
        if (mounted) setError(err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, deps);

  return { data, loading, error, refetch: () => fetchFn() };
}

// Generic subscription hook
export function useFirestoreSubscription<T>(
  subscribeFn: (callback: (data: T[]) => void) => Unsubscribe,
  deps: any[] = [],
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | null = null;
    setLoading(true);

    try {
      unsubscribe = subscribeFn((result) => {
        setData(result);
        setLoading(false);
      });
    } catch (err) {
      setError(err as Error);
      setLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, deps);

  return { data, loading, error };
}

// Specific hooks
export function useTenants() {
  return useFirestoreQuery<Tenant>(fetchTenants, []);
}

export function useWarehouses() {
  return useFirestoreQuery<Warehouse>(fetchWarehouses, []);
}

export function useInboundShipments(tenantId?: string, warehouseId?: string) {
  return useFirestoreSubscription<InboundShipment>(
    (cb) => subscribeInboundShipments(cb, tenantId, warehouseId),
    [tenantId, warehouseId],
  );
}

export function usePallets(tenantId?: string, warehouseId?: string) {
  return useFirestoreSubscription<Pallet>(
    (cb) => subscribePallets(cb, tenantId, warehouseId),
    [tenantId, warehouseId],
  );
}

export function useOrders(tenantId?: string, warehouseId?: string) {
  return useFirestoreSubscription<Order>(
    (cb) => subscribeOrders(cb, tenantId, warehouseId),
    [tenantId, warehouseId],
  );
}

export function useItemMaster(tenantId?: string) {
  return useFirestoreSubscription<ItemMasterRecord>(
    (cb) => subscribeItemMaster(cb, tenantId),
    [tenantId],
  );
}

export function useInventoryItems(tenantId?: string, warehouseId?: string) {
  return useFirestoreSubscription<InventoryItem>(
    (cb) => subscribeInventoryItems(cb, tenantId, warehouseId),
    [tenantId, warehouseId],
  );
}

// Mutation hooks
export function useInboundMutations() {
  const [mutating, setMutating] = useState(false);

  const updateLine = useCallback(
    async (shipmentId: string, lineNo: number, updates: Partial<InboundLine>) => {
      setMutating(true);
      try {
        await updateInboundLine(shipmentId, lineNo, updates);
      } finally {
        setMutating(false);
      }
    },
    [],
  );

  const receiveShipment = useCallback(
    async (shipmentId: string, lineNo: number, receivedQty: number, palletIds: string[]) => {
      setMutating(true);
      try {
        await receiveInboundShipment(shipmentId, lineNo, receivedQty, palletIds);
      } finally {
        setMutating(false);
      }
    },
    [],
  );

  return { updateLine, receiveShipment, mutating };
}

export function usePalletMutations() {
  const [mutating, setMutating] = useState(false);

  const createPalletMutation = useCallback(async (pallet: Pallet) => {
    setMutating(true);
    try {
      await createPallet(pallet);
    } finally {
      setMutating(false);
    }
  }, []);

  const createPalletsMutation = useCallback(async (pallets: Pallet[]) => {
    setMutating(true);
    try {
      await createPallets(pallets);
    } finally {
      setMutating(false);
    }
  }, []);

  const updatePalletMutation = useCallback(async (palletId: string, updates: Partial<Pallet>) => {
    setMutating(true);
    try {
      await updatePallet(palletId, updates);
    } finally {
      setMutating(false);
    }
  }, []);

  return {
    createPallet: createPalletMutation,
    createPallets: createPalletsMutation,
    updatePallet: updatePalletMutation,
    mutating,
  };
}

export function useOrderMutations() {
  const [mutating, setMutating] = useState(false);

  const updateOrderMutation = useCallback(async (orderId: string, updates: Partial<Order>) => {
    setMutating(true);
    try {
      await updateOrder(orderId, updates);
    } finally {
      setMutating(false);
    }
  }, []);

  return { updateOrder: updateOrderMutation, mutating };
}

export function useMasterMutations() {
  const [mutating, setMutating] = useState(false);

  const addItem = useCallback(async (rec: any) => {
    setMutating(true);
    try {
      await addItemToMaster(rec);
    } finally {
      setMutating(false);
    }
  }, []);

  const deleteItem = useCallback(async (sku: string) => {
    setMutating(true);
    try {
      await deleteItemFromMaster(sku);
    } finally {
      setMutating(false);
    }
  }, []);

  return { addItem, deleteItem, mutating };
}
