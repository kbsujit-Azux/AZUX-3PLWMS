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
  updateItemInMaster,
  type MasterException,
  validateLineAgainstItemMaster,
  masterReasonLabel,
  collectMasterExceptions,
  cbmFromInches,
  nmfcFor,
} from "./master-data";

export {
  addItemToMaster,
  deleteItemFromMaster,
} from "./firestore-data";

// ─── Compliance & Governance ────────────────────────────────────────────
export {
  type SerialInventoryRecord,
  type SerialStatus,
  type InventoryLotView,
  type ValidationResult,
  type ComplianceAuditLog,
  type ComplianceAction,
  type ComplianceEntityType,
  type ComplianceDocument,
  type ComplianceDocumentType,
  type DocumentStatus,
  type Recall,
  type RecallStatus,
  type QuarantineOrder,
  type TempUnit,
  normalizeTemp,
  isTempCompatible,
} from "./compliance-types";

export {
  validateItemForLocation,
  getValidationBadge,
} from "./compliance-validator";

// ─── Cycle Counting & Physical Inventory ─────────────────────────────────
export {
  type CycleCount,
  type CycleCountLine,
  type CountSchedule,
  type AbcClass,
  type CountStatus,
  type CountType,
  type CountScheduleFrequency,
  type VarianceReason,
  type CountPriority,
  cycleCounts,
  countSchedules,
  classifyAbc,
  generateCycleCountSchedule,
  computeVariance,
  getAbcClassColor,
  getCountTypeLabel,
  getCountStatusLabel,
} from "./counting-data";

export {
  buildAbcClassificationReport,
  computeNextRunDate,
  evaluateCountLine,
  suggestVarianceReason,
  canAutoAdjust,
  buildCountLinesFromInventory,
  computeCountSummary,
  getCountEfficiencyPct,
  getVarianceRate,
} from "./counting-engine";

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
  type InvoicePayment,
  type BillingAuditLog,
  type AccessorialType,
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
  enforceMinimum,
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

// ─── Slotting Engine ────────────────────────────────────────────────────
export {
  computeSkuVelocity,
  classifyLocationZone,
  analyzeSlottingEfficiency,
  getVelocityColor,
  getPriorityBadge,
  type SlottingZone,
  type SlottingRecommendation,
  type VelocityProfile,
} from "./slotting-engine";

// ─── Voice Picking ──────────────────────────────────────────────────────
export {
  createVoicePickingEngine,
  type VoiceCommand,
  type ParsedVoiceCommand,
  type VoicePickingOptions,
  type VoicePickingState,
} from "./voice-picking";

export { useVoicePicking } from "../hooks/useVoicePicking";

// ─── Smart Glass Bridge ──────────────────────────────────────────────────
export {
  createGlassBridge,
  type GlassBridge,
  type GlassVendor,
  type GlassInput,
  type GlassInputType,
} from "./glass-bridge";

// ─── Text-to-Speech ──────────────────────────────────────────────────────
export {
  ttsSpeak,
  ttsStop,
  ttsAvailable,
  useTTS,
} from "./tts";

// ─── Carrier Services ───────────────────────────────────────────────────
export {
  type CarrierServiceRecord,
  carrierServices,
  getActiveCarriers,
  getServiceCodesByCarrier,
  getServiceCodeDescription,
} from "./carrier-services";

// --- Carrier Rate Shopping --------------------------------------------
export {
  type RateQuoteRequest,
  type RateQuoteResponse,
  type RateQuote,
  simulateRateQuotes,
  getCachedRateQuotes,
  setCachedRateQuotes,
  resolveRateQuotes,
  persistRateQuotes,
  fetchRecentRateQuotes,
  subscribeRecentRateQuotes,
} from "./carrier-rate-shopping";

export {
  type CarrierAdapterConfig,
  type CarrierAdapter,
  createCarrierAdapter,
  createMockAdapter,
  getRatesFromCarriers,
  ShipEngineAdapter,
  EasyPostAdapter,
  MockCarrierAdapter,
} from "./carrier-api-adapters";
// --- Returns Management (RMA) --------------------------------------------
export {
  fetchRmaOrders,
  fetchRmaOrder,
  createRmaOrder,
  updateRmaOrder,
  deleteRmaOrder,
  subscribeRmaOrders,
  fetchRmaLines,
  createRmaLine,
  updateRmaLine,
  deleteRmaLine,
  fetchRmaDispositions,
  createRmaDisposition,
  updateRmaDisposition,
  deleteRmaDisposition,
  createReturnProcessingFee,
  fetchReturnProcessingFees,
} from "./rma-firestore";

export {
  type RmaOrder,
  type RmaLine,
  type RmaDisposition,
  type ReturnProcessingFee,
  type RmaStatus,
  type DispositionType,
  type DispositionStatus,
  type ReturnReason,
  type ReturnProcessingFeeType,
  getDefaultDisposition,
  getDispositionLabel,
  getRmaStatusLabel,
} from "./rma-types";

// --- Tenant Portal ------------------------------------------------------
export {
  type TenantPortalUser,
  type TenantPortalReport,
  type TenantPortalCsvUpload,
  type TenantPortalSession,
  type ReportType,
  type ReportFormat,
  type CsvUploadType,
  type CsvUploadStatus,
  getTenantById,
  getWarehousesForTenant,
} from "./tenant-portal";

export {
  fetchTenantPortalUsers,
  fetchTenantPortalUser,
  createTenantPortalUser,
  updateTenantPortalUser,
  deleteTenantPortalUser,
  subscribeTenantPortalUsers,
  fetchTenantPortalCsvUploads,
  createTenantPortalCsvUpload,
  updateTenantPortalCsvUpload,
  fetchTenantPortalReports,
  createTenantPortalReport,
  updateTenantPortalReport,
} from "./tenant-portal-firestore";

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
  LABOR_STANDARDS,
  getLaborStandard,
  computeStandardSec,
  computeEfficiencyPct,
} from "./labor-data";
export {
  type LaborStandard,
  type LaborEvent,
  type LaborTaskType,
} from "./rf-types";

// ─── Task Interleaving ──────────────────────────────────────────────────
export {
  buildTaskQueue,
  assignNextTask,
  getWorkerCurrentAisle,
  formatTaskSuggestion,
} from "./interleaving-engine";

export type { Task, TaskType } from "./interleaving-types";

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
  // ─── Compliance & Governance ────────────────────────────────────────────
  subscribeSerialInventory,
  createSerialInventory,
  updateSerialInventory,
  updateSerialInventoryStatus,
  deleteSerialInventory,
  fetchExpiringLots,
  subscribeComplianceAuditLog,
  appendComplianceLog,
  fetchComplianceAuditLog,
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
  // Compliance Documents
  createComplianceDocument,
  updateComplianceDocument,
  deleteComplianceDocument,
  subscribeComplianceDocuments,
  fetchExpiringDocuments,
  // Recalls
  createRecall,
  updateRecall,
  deleteRecall,
  subscribeRecalls,
  // Quarantine Orders
  createQuarantineOrder,
  updateQuarantineOrder,
  releaseQuarantineOrder,
  subscribeQuarantineOrders,
  // Cycle Counting & Physical Inventory
  fetchCycleCounts,
  subscribeCycleCounts,
  createCycleCount,
  updateCycleCount,
  deleteCycleCount,
  fetchCycleCountLines,
  subscribeCycleCountLines,
  createCycleCountLine,
  updateCycleCountLine,
  batchWriteCycleCountLines,
  fetchCountSchedules,
  subscribeCountSchedules,
  createCountSchedule,
  updateCountSchedule,
  deleteCountSchedule,
  // RF Task Assignment
  subscribeAssignedTasks,
  assignRfTask,
  completeRfTask,
  failRfTask,
  fetchAssignedTasks,
  type RfAssignedTask,
  type RfTaskType,
  type RfTaskStatus,
  // VAS Work Orders (Firestore CRUD only)
  fetchVasWorkOrders,
  subscribeVasWorkOrders,
  createVasWorkOrder,
  updateVasWorkOrder,
  deleteVasWorkOrder,
  fetchVasWorkOrderLines,
  subscribeVasWorkOrderLines,
  createVasWorkOrderLine,
  updateVasWorkOrderLine,
  batchWriteVasWorkOrderLines,
  // RF Task Assignment
} from "./firestore-data";

// ─── VAS Domain Data & Engine ─────────────────────────────────────────────
export {
  type VasWorkOrder,
  type VasWorkOrderLine,
  type VasWorkOrderType,
  type VasWorkOrderStatus,
  type VasPriority,
  type VasLaborEvent,
  vasWorkOrders,
  vasWorkOrderLines,
  vasProgressPct,
  vasPriorityColor,
  vasTypeLabel,
  vasStatusLabel,
} from "./vas-data";

export {
  computeVasProgress,
  canReleaseWorkOrder,
  canStartWorkOrder,
  canCompleteWorkOrder,
  calculateVasCost,
  validateInventoryAvailability,
  getWorkOrderNextAction,
  getWorkOrderProgressDetails,
} from "./vas-engine";

// ─── Cross-Docking ────────────────────────────────────────────────────────
export {
  type CrossDockMatch,
  type CrossDockMatchStatus,
  type CrossDockMatchPriority,
  crossdockMatches,
  crossdockPriorityColor,
  crossdockStatusLabel,
  crossdockProgressPct,
} from "./crossdock-data";

export {
  type CrossDockEvaluationResult,
  findOpenOrdersForSku,
  findOpenPickTicketsForOrder,
  findAvailableStagingLane,
  evaluateCrossDockEligibility,
  canDispatchCrossDock,
  getCrossDockSummary,
} from "./crossdock-engine";

// ─── Containerization & Cubing ───────────────────────────────────────────
export {
  type CartonSize,
  cartonSizes,
  getCartonById,
  recommendCartonSize,
} from "./carton-catalog";

export {
  type PackedItem,
  type Carton,
  type Cartonization,
  expandOrderLinesToItems,
  cartonizeOrder,
  canCartonize,
} from "./cubing-engine";

// ─── Catch Weight Management ─────────────────────────────────────────────
export {
  type CatchWeightTransactionType,
  type CatchWeightItem,
  type CatchWeightLog,
  catchWeightItems,
  catchWeightLogs,
  validateCatchWeight,
  computeCatchWeightStats,
} from "./catch-weight-data";

export {
  computeWeightVariancePct,
  isWeightOutOfSpec,
  computeBillingWeight,
} from "./catch-weight-engine";

export {
  fetchCatchWeightItems,
  subscribeCatchWeightItems,
  createCatchWeightItem,
  updateCatchWeightItem,
  fetchCatchWeightLogs,
  subscribeCatchWeightLogs,
  createCatchWeightLog,
} from "./firestore-data";

// ─── Labor Forecasting ───────────────────────────────────────────────────
export {
  type ForecastHorizon,
  type LaborForecast,
  type ShiftSchedule,
  forecastLaborFromEdi,
  computeShiftSchedule,
} from "./labor-forecast";

export {
  createLaborForecast,
  updateLaborForecast,
  deleteLaborForecast,
  createShiftSchedule,
  updateShiftSchedule,
  deleteShiftSchedule,
} from "./firestore-data";

// ─── Re-export db-context (React data provider) ─────────────────────────
export { DatabaseProvider, useWmsData } from "./db-context";



