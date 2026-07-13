/**
 * AZUX 3PL WMS Systems — Library Index
 *
 * This barrel file is the single entry point for all WMS 3PL domain modules.
 * It is organized by functional domain to make it trivial to locate and
 * extend any area of the system.
 *
 * Extension pattern for new advanced WMS 3PL functions:
 *   1. Define the domain type(s) in the appropriate module under src/lib/
 *   2. Add Firestore CRUD functions in firestore-data.ts following the
 *      existing fetch / subscribe / create / update / delete pattern
 *   3. Add business-logic operations in the relevant engine module
 *      (e.g. allocation-engine.ts, inbound-data.ts)
 *   4. Add a new route under src/routes/ using createFileRoute
 *   5. Register the route in src/components/app-sidebar.tsx
 *   6. Add RBAC entries in src/lib/auth.tsx ROLE_ROUTES
 *   7. Re-export from this file so the new module is discoverable
 *
 * Domain modules
 * ──────────────
 * @module core          — Foundational types, constants, utilities
 * @module auth          — Authentication, roles, RBAC
 * @module workspace     — Tenant / warehouse / strategy context
 * @module inbound       — Inbound ASN (EDI 943), receiving, receipts
 * @module inventory     — Inventory items, batches, location occupancy
 * @module orders        — Outbound orders (EDI 940), order lifecycle
 * @module allocation    — Allocation engine (LIFO/FIFO), pick, unpick
 * @module picking       — Directed pick waves, pick instructions
 * @module outbound      — Shipment lifecycle, yard/dock operations
 * @module bol           — VICS BOL, Master BOL consolidation, EDI 945
 * @module pallets       — Inbound/outbound pallet management
 * @module master-data   — Item Master (EDI 832), Location Master
 * @module edi           — EDI transaction log, status tracking
 * @module billing       — Charge rules, billable events, invoices
 * @module carriers      — Carrier service catalog, SCAC mapping
 * @module dal           — Firestore data-access layer (all CRUD)
 */

// ─── Core ───────────────────────────────────────────────────────────────
export {
  tenants,
  warehouses,
  inventoryItems,
  type Tenant,
  type Warehouse,
  type InventoryItem,
  type InventoryBatch,
  type AllocationStrategy,
  totalOnHand,
  sortedBatches,
  DROP001_LOCATION,
  NON_ALLOCATABLE_LOCATIONS,
} from "./mock-data";

// ─── Auth & RBAC ────────────────────────────────────────────────────────
export {
  type Role,
  type AuthUser,
  AuthProvider,
  useAuth,
  SignInScreen,
  ROLE_ROUTES,
} from "./auth";

// ─── Workspace Context ──────────────────────────────────────────────────
export { WorkspaceProvider, useWorkspace } from "../components/workspace-context";

// ─── Inbound Operations ─────────────────────────────────────────────────
export {
  type InboundLine,
  type InboundShipment,
  type InboundReceiptLine,
  type InboundReceipt,
  inboundShipments,
  inboundReceipts,
  warehouseCode,
  inboundProgressPct,
  shipmentProgressPct,
  closeInboundShipment,
} from "./inbound-data";

// ─── Inventory Management ───────────────────────────────────────────────
export {
  type LocationType,
  type LocationRecord,
  locationMaster,
  pickableLocations,
  findLocation,
  locationOccupancyPct,
  updateLocationInMaster,
  deleteLocationFromMaster,
} from "./master-data";

// ─── Orders (EDI 940) ───────────────────────────────────────────────────
export {
  type EdiTxnType,
  type EdiDirection,
  type EdiStatus,
  type EdiTxnMeta,
  EDI_TXNS,
  type EdiLog,
  ediLogs,
  type OrderLine,
  type Order,
  orders,
} from "./edi-data";

// ─── Allocation & Picking Engine ────────────────────────────────────────
export {
  validateOrderForAllocation,
  validateOrderForDeallocation,
  validatePickTicketForPick,
  validateOrderForPick,
  validateOrderForUnpick,
  validateOrderForShip,
  allocate_order,
  deallocate_order,
  pick_pick_ticket,
  unpick_order,
  ship_order,
  canAllocate,
  canDeallocate,
  canPick,
  canUnpick,
  canShip,
  getOrderStatusLabel,
} from "./allocation-engine";

// ─── Directed Picking ───────────────────────────────────────────────────
export {
  type PalletStatus,
  type Pallet,
  pallets,
  appendPallets,
  removePallets,
  createPalletsFromInbound,
  suggestPutawayLocation,
  computePalletCubeCuFt,
  type PickInstruction,
  type PickWave,
  buildPickWave,
  pickWaves,
} from "./pallet-data";

// ─── Bills of Lading & Shipping Docs ────────────────────────────────────
export {
  type FreightChargeTerms,
  type BolType,
  type BolStatus,
  type Party,
  type BolFreightLine,
  type BillOfLading,
  type ConsolidationGroup,
  buildBolFromOrder,
  buildConsolidationGroups,
  buildMasterBol,
  seedBols,
  emit945ForBol,
} from "./bol-data";

// ─── Outbound Pallet (SSCC-18 / UCC-128) ────────────────────────────────
export {
  type OutboundPalletStatus,
  type OutboundPalletLine,
  type OutboundPallet,
  type OutboundPalletCreateInput,
  generateSSCC18,
  buildUcc128Label,
  buildOutboundPalletId,
  createOutboundPalletFromInput,
  OUTBOUND_PALLET_STATUSES,
} from "./outbound-pallet-data";

// ─── Shipment / Carrier Dispatch ────────────────────────────────────────
export {
  type ShipmentStatus,
  type Shipment,
  type CarrierDispatch,
  shipments,
  shipmentBols,
  getBolForShipment,
  getShipmentForOrder,
  transitionShipment,
  recordPod,
  SHIPMENT_STATUSES,
} from "./shipment-data";

// ─── Master Data ────────────────────────────────────────────────────────
export {
  type ItemMasterRecord,
  itemMaster,
  findItem,
  hasInventoryForSku,
  addItemToMaster,
  deleteItemFromMaster,
  updateItemInMaster,
  type MasterException,
  validateLineAgainstItemMaster,
  masterReasonLabel,
  collectMasterExceptions,
  cbmFromInches,
  nmfcFor,
} from "./master-data";

// ─── Billing ────────────────────────────────────────────────────────────
export {
  type BillingClient,
  type RateUnit,
  type StorageFrequency,
  type ChargeRule,
  type ActivityType,
  type BillableEvent,
  type InvoiceLine,
  type Invoice,
  billingClients,
  defaultRules,
  billableEvents,
  seedInvoices,
  unitLabel,
  fmtUSD,
  accessorialLabel,
} from "./billing-data";

// ─── Billing Engine ─────────────────────────────────────────────────────
export {
  computeTieredRate,
  applyPeakSurcharge,
  enforceMinimumCharge,
  matchEventToRule,
  buildInvoiceLines,
  buildInvoiceLinesFromEvents,
  applyMinimumCharges,
  buildVolumetricStorageSnapshots,
  buildVolumetricStorageLines,
  maybeCaptureBillableEvent,
  buildAccrualsFromEvents,
  summarizeAccrualsByClient,
  recordPayment,
  issueCreditMemo,
  markInvoiceDisputed,
  resolveDispute,
  lineTotal,
  buildAuditLogEntry,
  type VolumetricStorageSnapshot,
  type MatchedBillableEvent,
  type BillableAccrual,
  type InvoicePayment,
  type BillingAuditLog,
} from "./billing-engine";

// ─── Billing Scheduler ──────────────────────────────────────────────────
export {
  startBillingScheduler,
  stopBillingScheduler,
  isBillingSchedulerRunning,
  runVolumetricSnapshots,
  runAutomatedBillingPass,
  type BillingSchedulerConfig,
  type SnapshotJobResult,
} from "./billing-scheduler";

// ─── Carrier Services ───────────────────────────────────────────────────
export {
  type CarrierServiceRecord,
  carrierServices,
  getActiveCarriers,
  getServiceCodesByCarrier,
  getServiceCodeDescription,
} from "./carrier-services";

// ─── RF Gun Domain ─────────────────────────────────────────────────────
export {
  type WarehouseEmployee,
  type MovementType,
  type MovementUom,
  type MovementHistory,
  type RfResult,
} from "./rf-types";

export { RFSessionProvider, useRfSession } from "./rf-session";

export {
  employees,
} from "./rf-employees";

// ─── Labor Management (LMS) ────────────────────────────────────────────
export {
  type LaborStandard,
  type LaborEvent,
  type LaborTaskType,
  LABOR_STANDARDS,
  getLaborStandard,
  computeStandardSec,
  computeEfficiencyPct,
  getAisleFromLocation,
} from "./labor-data";

// ─── Task Interleaving ──────────────────────────────────────────────────
export {
  getAisleFromLocation,
  buildTaskQueue,
  assignNextTask,
  getWorkerCurrentAisle,
  formatTaskSuggestion,
} from "./interleaving-engine";

export type { Task, TaskType } from "./interleaving-types";

export { RFSessionProvider, useRfSession } from "./rf-session";

// ─── Firestore Data-Access Layer (DAL) ──────────────────────────────────
// Every Firestore collection operation lives here. Add new collection
// functions following the established naming convention:
//   fetchX / subscribeX / createX / updateX / deleteX
export {
  db,
  fetchTenants,
  subscribeTenants,
  fetchWarehouses,
  subscribeWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  fetchItemMaster,
  subscribeItemMaster,
  fetchInboundShipments,
  subscribeInboundShipments,
  updateInboundLine,
  receiveInboundShipment,
  fetchPallets,
  subscribePallets,
  createPallet,
  createPallets,
  updatePallet,
  fetchOutboundPallets,
  subscribeOutboundPallets,
  fetchOutboundPalletsByOrder,
  createOutboundPallet,
  createOutboundPallets,
  updateOutboundPallet,
  getNextOutboundPalletSeq,
  clearDropBatchesForOrder,
  createShipmentRecord,
  updateShipmentRecord,
  subscribeShipmentRecords,
  fetchOrders,
  subscribeOrders,
  updateOrder,
  syncOrderStatusFromPickTickets,
  createOrder,
  deleteOrder,
  upsertInventoryItem,
  updateInventoryBatch,
  fetchInventoryItems,
  subscribeInventoryItems,
  writePickTicket,
  batchWritePickTickets,
  updatePickTicket,
  deletePickTicket,
  deletePickTicketsByOrder,
  fetchPickTickets,
  subscribePickTickets,
  fetchEdiLogs,
  fetchLocations,
  subscribeLocations,
  fetchClientAllocationConfigs,
  subscribeClientAllocationConfigs,
  setClientAllocationConfig,
  deleteClientAllocationConfig,
  fetchBillsOfLading,
  subscribeBillsOfLading,
  createBol,
  executeDirectedPick,
  executeManualPick,
  reallocatePickTicket,
  getNextOrderSeq,
  getNextPickTicketSeq,
  getNextBolNumber,
  shipOrder,
  allocateOrderTransactional,
  deallocateOrderTransactional,
  deleteInventoryBatch,
  rebuildLocationMasterFromInventory,
  logInventoryTransaction,
  fetchTransactionHistory,
  subscribeTransactionHistory,
  type InventoryTransaction,
  subscribeBillingClients,
  createBillingClient,
  updateBillingClient,
  deleteBillingClient,
  subscribeChargeRules,
  createChargeRule,
  updateChargeRule,
  deleteChargeRule,
  subscribeBillableEvents,
  createBillableEvent,
  updateBillableEvent,
  captureBillableEventForInboundReceive,
  captureBillableEventForPick,
  captureBillableEventForShip,
  captureBillableEventForPutaway,
  subscribeInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  subscribeInvoicePayments,
  createInvoicePayment,
  updateInvoicePayment,
  deleteInvoicePayment,
  subscribeBillingAuditLog,
  createBillingAuditLog,
  deleteBillingAuditLog,
  seedBillingData,
  // RF Gun / Employee CRUD
  fetchEmployees,
  subscribeEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  logMovement,
  fetchMovementHistory,
  subscribeMovementHistory,
  seedEmployees,
  // Labor Management (LMS)
  fetchLaborStandards,
  subscribeLaborStandards,
  createLaborStandard,
  updateLaborStandard,
  deleteLaborStandard,
  recordLaborEvent,
  fetchLaborEvents,
  subscribeLaborEvents,
} from "./firestore-data";

// ─── Re-export db-context (React data provider) ─────────────────────────
export { DatabaseProvider, useWmsData } from "./db-context";
