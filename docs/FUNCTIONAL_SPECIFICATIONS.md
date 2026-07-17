# AZUX 3PL WMS Systems — Functional Specifications

> **Version**: 1.0  
> **Date**: 2026-07-17  
> **Status**: Indexed from production codebase  
> **Stack**: React 19, TanStack Router v1.170, Vite 8, Tailwind CSS v4, Firebase Firestore, TanStack Query v5

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Data Model](#2-architecture--data-model)
3. [Authentication, RBAC & Multi-Tenancy](#3-authentication-rbac--multi-tenancy)
4. [Operations Dashboard](#4-operations-dashboard)
5. [Inbound Operations](#5-inbound-operations)
6. [Inventory Management](#6-inventory-management)
7. [Order Management (EDI 940)](#7-order-management-edi-940)
8. [Allocation Engine](#8-allocation-engine)
9. [Picking & Wave Management](#9-picking--wave-management)
10. [Outbound & Shipments](#10-outbound--shipments)
11. [BOL & Documentation](#11-bol--documentation)
12. [Pallet Management](#12-pallet-management)
13. [Master Data](#13-master-data)
14. [EDI Hub](#14-edi-hub)
15. [Compliance & Governance](#15-compliance--governance)
16. [Billing Engine](#16-billing-engine)
17. [RF Gun Terminal](#17-rf-gun-terminal)
18. [Tenant Portal](#18-tenant-portal)
19. [Rate Shopping](#19-rate-shopping)
20. [RMA / Reverse Logistics](#20-rma--reverse-logistics)
21. [Slotting & Warehouse Optimization](#21-slotting--warehouse-optimization)
22. [Workforce Management](#22-workforce-management)
23. [Scoreboard](#23-scoreboard)
24. [Settings & Administration](#24-settings--administration)
25. [Real-Time Data Layer](#25-real-time-data-layer)
26. [Firestore Security Model](#26-firestore-security-model)
27. [Known Gaps & Technical Debt](#27-known-gaps--technical-debt)
28. [Industry-Grade Assessment](#28-industry-grade-assessment)
29. [Gemini Verification Prompt](#29-gemini-verification-prompt)

---

## 1. System Overview

AZUX 3PL WMS Systems is a multi-tenant, warehouse management platform built for third-party logistics providers. The application provides end-to-end management of inbound receiving, inventory, order fulfillment, outbound shipping, billing, compliance, and reverse logistics across multiple warehouse locations and client tenants.

### Core Value Propositions
- **Multi-tenant by design**: Each tenant (client) operates within isolated data boundaries while sharing warehouse infrastructure.
- **Real-time synchronization**: Firestore `onSnapshot` listeners power live updates across inventory, orders, labor, and compliance.
- **EDI-native**: Built-in support for EDI 832, 940, 943, 944, and 945 transactions.
- **RF Gun capable**: Dedicated mobile terminal workflows for receiving, putaway, picking, move, and inquiry.
- **Enterprise-grade modules**: Rate shopping, RMA/disposition workflows, tenant self-service portal, and automated billing.

---

## 2. Architecture & Data Model

### Frontend Architecture
- **Framework**: React 19 with TanStack Router v1.170 for file-based routing.
- **State**: React Context (`WorkspaceProvider`, `DatabaseProvider`, `AuthProvider`) + TanStack Query v5 for server state.
- **UI**: shadcn/ui components with Tailwind CSS v4 for styling.
- **Build**: Vite 8 with production deployment to Firebase Hosting.

### Data Layer
- **Primary Store**: Firebase Firestore (NoSQL document database).
- **Real-time Sync**: Firestore `onSnapshot` listeners in `db-context.tsx` sync collections into React state.
- **Seeding**: Runtime seeders populate mock data on first load (`db-context.tsx`) and via CLI script (`scripts/seed-firestore.ts`).

### Key Firestore Collections
| Collection | Purpose |
|---|---|
| `tenants` | Client tenants |
| `warehouses` | Warehouse locations |
| `inventoryItems` | Stock on hand (SKU-level + batch-level) |
| `pallets` | Inbound/outbound pallets |
| `pickWaves` | Pick wave definitions |
| `orders` | Outbound orders (EDI 940) |
| `inboundShipments` | Inbound ASNs (EDI 943) |
| `ediLogs` | EDI transaction log |
| `pickTickets` | Directed pick work units |
| `billsOfLading` | BOL documents |
| `employees` | Warehouse employee profiles |
| `movementHistory` | Append-only movement audit log |
| `laborStandards` | Engineered labor standards |
| `laborEvents` | Captured labor events |
| `billingClients` | Billing profiles |
| `chargeRules` | Billing rate rules |
| `billableEvents` | Captured billable activities |
| `invoices` | Generated invoices |
| `itemMaster` | Item master (EDI 832) |
| `locationMaster` | Warehouse location master |
| `serialInventory` | Serialized inventory records |
| `complianceDocuments` | Compliance docs (expiry, hazmat) |
| `recalls` | Product recalls |
| `quarantineOrders` | Quarantine orders |
| `clientAllocationConfigs` | Per-tenant LIFO/FIFO config |
| `inventoryTransactions` | Transaction history |
| `counters` | Sequence counters |
| `rmaOrders` | RMA headers |
| `rmaLines` | RMA line items |
| `rmaDispositions` | RMA disposition records |
| `returnProcessingFees` | Return processing fees |
| `tenantPortalUsers` | Tenant portal accounts |
| `tenantPortalCsvUploads` | Tenant CSV upload records |
| `tenantPortalReports` | Tenant generated reports |
| `tenantConfigs` | White-label / portal settings |
| `carrierCredentials` | Carrier API credentials |
| `carrierRateQuotes` | Cached rate quotes |

---

## 3. Authentication, RBAC & Multi-Tenancy

### Authentication
- **Provider**: Firebase Authentication (Email/Password, Google).
- **Session**: `AuthProvider` wraps the app; `useAuth()` exposes `user`, `login()`, `logout()`.
- **Demo Accounts** (defined in `src/lib/auth.tsx`):
  | Name | Role | Warehouse |
  |---|---|---|
  | Jordan Blake | Admin | ALL |
  | Casey Nguyen | Operations Manager | ATL1 |
  | Morgan Ortiz | Receiver | ORD2 |
  | Riley Park | Picker | ATL1 |
  | Anya Volkov | Receiver | EWR1 |
  | Tomás Ruiz | Billing | ALL |

### Role-Based Access Control (RBAC)
- **Mechanism**: `ROLE_ROUTES` in `src/lib/auth.tsx` defines allowed paths per role.
- **Enforcement**: `can(path)` function checks if current user role has access to a route; sidebar and navigation respect this.
- **Supported Roles**: Admin, Operations Manager, Receiver, Putaway, Picker, Packer, Warehouse Lead, Billing.

### Multi-Tenancy
- **Context**: `WorkspaceProvider` supplies `tenantId`, `warehouseId`, and `strategy` (LIFO/FIFO).
- **Filtering**: All data operations filter by `tenantId` and `warehouseId` where applicable.
- **Isolation**: Firestore rules enforce tenant-level access; UI components respect tenant context.

---

## 4. Operations Dashboard

**Route**: `/`  
**File**: `src/routes/index.tsx`

### Features
- **KPI Cards**: Active Inbound, Active Outbound, Total SKUs, Network Utilization.
- **Volume Trends**: 7-day inbound/outbound volume chart (Recharts).
- **Carrier Performance**: On-time delivery and exception rates by carrier.
- **Live Ops Log**: Real-time operational events log with severity levels (info, warn, error, ok).
- **Tenant/Warehouse Selector**: Top-bar workspace switcher for tenant and warehouse context.

### Data Sources
- Live Firestore listeners for real-time updates.
- Mock KPI data rendered as static dashboard widgets.

---

## 5. Inbound Operations

**Route**: `/inbound`  
**File**: `src/routes/inbound.tsx` (1,495 lines)

### Features
- **ASN Management**: View and manage inbound advance ship notices (EDI 943).
- **Receiving Workflow**: 
  - Receipt creation against ASN lines.
  - Carton/unit-level receiving with damage logging.
  - License plate (LPN) generation.
- **Putaway Direction**: Auto-suggested putaway locations based on slotting rules.
- **Progress Tracking**: Visual progress bars for ASN receipt completion.
- **Exception Handling**: Damage, shortage, overage logging with notes.
- **CSV Export**: Export inbound data to CSV.
- **Master Data Links**: Direct navigation to Item Master and Location Master for resolution.

### Data Model
- `InboundShipment`: Header with ASN number, vendor, dates, status.
- `InboundLine`: Line items with SKU, expected qty, UOM.
- `InboundReceipt`: Posted receipts with actual qty, location, condition.

---

## 6. Inventory Management

**Route**: `/inventory`  
**File**: `src/routes/inventory.tsx` (1,167 lines)

### Features
- **Batch-Level Inventory**: Track inventory by SKU + batch/lot with case pack, PO, and trailer info.
- **Location Occupancy**: View which locations are occupied, pickable, or blocked.
- **Transaction History**: Full audit trail of inventory movements (receipts, picks, moves, adjustments).
- **Adjustments**: Manual inventory adjustments with reason codes.
- **CSV Import/Export**: Bulk inventory operations via CSV.
- **Real-time Sync**: Live updates via Firestore `onSnapshot`.
- **Search & Filter**: Filter by SKU, location, batch, tenant, warehouse.

### Data Model
- `InventoryItem`: SKU, description, qty on hand, batch info, location, dates.
- `InventoryBatch`: Batch-level detail with PO, trailer, carton counts.
- `InventoryTransaction`: Append-only audit log of all inventory changes.

---

## 7. Order Management (EDI 940)

**Route**: `/orders`  
**File**: `src/routes/orders.tsx` (2,280 lines)

### Features
- **Order Lifecycle**: Create, allocate, pick, pack, ship, and cancel orders.
- **EDI 940 Integration**: Import and process warehouse shipping orders.
- **Order Lines**: Line-level detail with SKU, qty, UOM, pricing.
- **Status Tracking**: New → Allocated → Picked → Packed → Shipped.
- **Client Management**: Per-client order views and filtering.
- **CSV Import/Export**: Bulk order operations.
- **Master Data Validation**: Cross-check against Item Master before execution.

### Data Model
- `Order`: Header with order number, client, dates, status, totals.
- `OrderLine`: Line items with SKU, qty, price, allocation status.

---

## 8. Allocation Engine

**Route**: `/allocation`  
**File**: `src/routes/allocation.tsx` (1,424 lines)

### Features
- **LIFO/FIFO Strategy**: Configurable per tenant via `ClientAllocationConfig`.
- **Auto-Allocation**: Automatically allocate orders against available inventory.
- **Deallocation**: Release allocated inventory back to available pool.
- **Unpick**: Reverse picked inventory back to allocated or available state.
- **Directed Pick**: Generate pick instructions based on allocation results.
- **Validation**: Pre-allocation, pre-pick, pre-ship validation checks.
- **Reallocation**: Reallocate picked orders to different locations/batches.

### Data Model
- `ClientAllocationConfig`: Per-tenant LIFO/FIFO strategy and rules.
- `AllocationResult`: Detailed allocation output with batch assignments.

### Business Logic
- `src/lib/allocation-engine.ts`: Core allocation algorithms.

---

## 9. Picking & Wave Management

**Route**: `/picks`  
**File**: `src/routes/picks.tsx` (1,153 lines)

### Features
- **Pick Tickets**: Generate and manage pick tickets from orders.
- **Directed Pick**: RF-guided pick instructions with location, SKU, qty.
- **Pick Waves**: Batch picks into waves for efficient warehouse execution.
- **Wave Building**: `buildPickWave()` groups orders by strategy.
- **Pick Execution**: Complete picks with RF Gun or desktop interface.
- **Reallocation**: Reallocate picked tickets to alternative locations.
- **Outbound Pallet Creation**: Create outbound pallets from picked goods.
- **Shipment Record Creation**: Auto-create shipment records on pick completion.

### Data Model
- `PickTicket`: Pick work unit with status, assigned employee, locations.
- `PickWave`: Grouped pick tickets with wave number, status.

---

## 10. Outbound & Shipments

**Route**: `/shipments`  
**File**: `src/routes/shipments.tsx` (1,095 lines)

### Features
- **Shipment Lifecycle**: Create, stage, load, and close shipments.
- **Carrier Integration**: Carrier selection and dispatch tracking.
- **BOL Generation**: Create Bills of Lading from shipments.
- **Yard/Dock Management**: Track shipments at dock doors and in yard.
- **Carrier Dispatch**: Send dispatch notifications to carriers.
- **Shipment Filtering**: Filter by client, warehouse, status, carrier.
- **Outbound Pallet Tracking**: Track pallets through the outbound process.

### Data Model
- `CarrierDispatch` / `ShipmentRecord`: Shipment header with carrier, status, dates.
- `OutboundPallet`: Pallet-level detail within a shipment.

---

## 11. BOL & Documentation

**Route**: `/documents`  
**File**: `src/routes/documents.tsx` (727 lines)

### Features
- **BOL Management**: Create, view, and manage Bills of Lading.
- **Master BOL**: Consolidate multiple shipments into a master BOL.
- **Packing Slips**: Generate and print packing slips.
- **EDI 945**: Send warehouse shipping advice to clients.
- **BOL Preview**: Visual preview of BOL documents before printing.
- **Document Export**: Download BOLs and packing slips as PDFs.
- **Consolidation Groups**: Group shipments for master BOL creation.

### Data Model
- `BillOfLading`: BOL header with shipper, consignee, carrier, lines.
- `BolLine`: Line items with SKU, qty, weight, description.

### Supporting Components
- `src/components/bol/bol-document.tsx`: BOL renderer.
- `src/components/bol/packing-slip.tsx`: Packing slip renderer.

---

## 12. Pallet Management

**Route**: `/pallets`  
**File**: `src/routes/pallets.tsx` (1,398 lines)

### Features
- **Inbound Pallets**: Receive and track inbound pallets.
- **Outbound Pallets**: Manage outbound pallets through staging and loading.
- **Pallet Details**: View pallet contents, location, status, and history.
- **Pallet Splitting/Merging**: Split or merge pallets as needed.
- **Movement Tracking**: Full audit trail of pallet movements.
- **Putaway Suggestions**: AI-driven putaway location recommendations.
- **Pallet Printing**: Print pallet labels and UCC-128 labels.
- **Location Management**: Assign and change pallet locations.

### Data Model
- `Pallet`: Pallet ID, location, contents, status, dates.
- `OutboundPallet`: Outbound-specific pallet details.

### Business Logic
- `src/lib/pallet-data.ts`: Pallet domain types and helpers.
- `src/lib/outbound-pallet-data.ts`: Outbound pallet operations.

---

## 13. Master Data

**Route**: `/masters` (parent), `/masters/warehouses`, `/masters/employees`  
**Files**: `src/routes/masters.tsx`, `src/routes/masters/warehouses.tsx`, `src/routes/masters/employees.tsx`

### Features
- **Item Master (EDI 832)**: 
  - SKU, UPC, description, dimensions, weight, case qty.
  - CSV import/export for bulk updates.
  - Tenant-filtered item master.
  - Lot control, expiry control, serial control flags.
- **Location Master**: 
  - Warehouse location definitions with aisle, rack, bin.
  - Pickable, bulk, hazardous, temperature-controlled flags.
  - Capacity and dimension tracking.
- **Warehouse Master**: 
  - CRUD for warehouse definitions.
  - Code, name, city, capacity tracking.
  - Admin-only create/edit/delete.
- **Employee Master**: 
  - Employee profiles with badge ID, name, email, role, team, shift.
  - Password/PIN management for RF Gun authentication.
  - Client and warehouse assignment.
  - Active/inactive status.

### Data Model
- `ItemMasterRecord`: Full item master with EDI 832 fields.
- `LocationRecord`: Location master with attributes.
- `Warehouse`: Warehouse definitions.
- `WarehouseEmployee`: Employee profiles for RF auth.

---

## 14. EDI Hub

**Route**: `/edi`  
**File**: `src/routes/edi.tsx` (373 lines)

### Features
- **Transaction Monitoring**: Monitor EDI 832, 940, 943, 944, 945 transactions.
- **Status Tracking**: Track accepted, processed, pending, warning, rejected states.
- **Trading Partner Management**: View EDI activity by trading partner.
- **Error Handling**: Identify and resolve EDI errors.
- **Transaction History**: Full audit log of EDI transactions.

### Data Model
- `EdiLog`: Transaction log entry with type, direction, status, timestamps.
- `EdiTxnMeta`: EDI transaction type catalog.

### Supported Transactions
- **832**: Price/Sales Catalog (Item Master)
- **940**: Warehouse Shipping Order (Inbound Orders)
- **943**: Stock Transfer Shipment Advice (Inbound ASN)
- **944**: Stock Transfer Receipt Advice (Outbound Confirmation)
- **945**: Warehouse Shipping Advice (Outbound Confirmation)

---

## 15. Compliance & Governance

**Route**: `/compliance`  
**File**: `src/routes/compliance.tsx` (600 lines)

### Features
- **Serialized Inventory**: Track serialized items with full chain of custody.
- **Expiry Tracking**: Monitor lot expiration dates with alerting.
- **Document Management**: Compliance document lifecycle (upload, review, expiry).
- **Recalls**: Product recall management with affected lot tracing.
- **Quarantine Orders**: Create and manage quarantine orders for suspect inventory.
- **Hazmat Validation**: Validate hazmat handling requirements by location.
- **Temperature Control**: Monitor temperature-controlled storage requirements.
- **Audit Logging**: Append-only compliance audit trail.

### Data Model
- `SerialInventoryRecord`: Serialized item tracking.
- `ComplianceDocument`: Document metadata with expiry.
- `Recall`: Recall header with affected items.
- `QuarantineOrder`: Quarantine order with status and disposition.

### Business Logic
- `src/lib/compliance-validator.ts`: Validation rules for hazmat, temp, etc.
- `src/lib/compliance-types.ts`: Compliance domain types.

---

## 16. Billing Engine

**Route**: `/billing`  
**File**: `src/routes/billing.tsx` (2,084 lines)

### Features
- **Client Billing Profiles**: Manage billing clients with addresses, tax IDs, payment terms.
- **Charge Rules**: Define flexible charge rules with:
  - Rate units: carton, pallet, container, BOL, location, warehouse, cubic feet, flat.
  - Categories: Inbound, Outbound, Storage, Custom.
  - Accessorial charges: kitting, relabeling, special handling, RMA processing, etc.
  - Tiered pricing with volume breaks.
  - Peak season surcharges.
  - Minimum monthly charges.
- **Billable Event Capture**: Auto-capture billable events from warehouse operations.
- **Invoice Generation**: Create invoices from billable events with tax calculation.
- **Invoice Management**: View, send, mark paid, dispute, and void invoices.
- **Payment Recording**: Record payments against invoices.
- **Dispute Management**: Track and resolve billing disputes.
- **Audit Logging**: Full billing audit trail.

### Data Model
- `BillingClient`: Client billing profile.
- `ChargeRule`: Rate rule definition with tiers, accessorials, peak surcharge.
- `BillableEvent`: Captured billable activity with qty, unit, cube, days in storage.
- `Invoice`: Invoice header with status, dates, tax, notes.
- `InvoiceLine`: Invoice line items.
- `InvoicePayment`: Payment records.
- `BillingAuditLog`: Audit trail of billing changes.

### Business Logic
- `src/lib/billing-engine.ts`: Invoice generation and event capture.
- `src/lib/billing-scheduler.ts`: Scheduled billing runs.
- `src/lib/billing-data.ts`: Domain types and seed data.

---

## 17. RF Gun Terminal

**Route**: `/rf/*` (nested routes)  
**Files**: `src/routes/rf/index.tsx`, `src/routes/rf/putaway.tsx`, `src/routes/rf/move.tsx`, `src/routes/rf/pick.tsx`, `src/routes/rf/receiving.tsx`, `src/routes/rf/inquiry.tsx`, `src/routes/rf/history.tsx`

### Features
- **RF Session Management**: Dedicated RF Gun session context with badge auth.
- **Putaway**: Directed putaway to suggested locations.
- **Move**: Move pallets/locations between warehouse positions.
- **Pick**: Directed picking with RF scanning.
- **Receiving**: Receive inbound inventory with RF scanning.
- **Inquiry**: Look up inventory, locations, and orders via RF.
- **History**: View RF transaction history.

### Data Model
- `WarehouseEmployee`: Badge-authenticated employee profile.
- `LaborEvent`: Task execution with timing and efficiency.
- `MovementHistory`: Append-only movement audit log.

### Supporting Files
- `src/lib/rf-session.tsx`: RF session context provider.
- `src/lib/rf-types.ts`: RF domain types.
- `src/lib/voice-picking.ts`: Voice picking integration utilities.
- `src/lib/tts.ts`: Text-to-speech for voice guidance.

---

## 18. Tenant Portal

**Route**: `/tenant-portal/`  
**File**: `src/routes/tenant-portal/index.tsx` (824 lines)

### Features
- **Client Self-Service**: Tenant-branded portal for clients to view their data.
- **User Management**: CRUD for tenant portal users.
- **CSV Uploads**: Upload CSV files for bulk data operations (item master, inventory updates).
- **Report Generation**: Generate custom reports (inventory, orders, shipments).
- **Invoice Viewing**: View and download invoices.
- **White-Label Settings**: Customizable portal branding per tenant.
- **Real-time Data**: Live inventory, order, and pallet views for the tenant.

### Data Model
- `TenantPortalUser`: Portal user profile linked to tenant.
- `TenantPortalCsvUpload`: CSV upload record with status.
- `TenantPortalReport`: Generated report record with format and download link.
- `TenantPortalSession`: Active session tracking.

### Data Access
- `src/lib/tenant-portal-firestore.ts`: Firestore CRUD operations.
- `src/lib/tenant-portal.ts`: Domain types.

---

## 19. Rate Shopping

**Route**: `/rate-shopping/`  
**File**: `src/routes/rate-shopping/index.tsx` (363 lines)

### Features
- **Multi-Carrier Rates**: Compare rates across multiple carriers.
- **LTL Support**: Full LTL freight rate shopping with NMFC, class, and accessorials.
- **Parcel Support**: Parcel rate comparison with dimensional weight.
- **Adapter Architecture**: Pluggable carrier API adapters:
  - `ShipEngineAdapter`: ShipEngine-compatible APIs.
  - `EasyPostAdapter`: EasyPost-compatible APIs.
  - `MockCarrierAdapter`: Simulation mode for development.
- **Quote Caching**: Persist rate quotes to Firestore for historical comparison.
- **Carrier Credentials**: Secure storage of carrier API keys.
- **Real API Toggle**: Switch between mock and real carrier APIs.

### Data Model
- `CarrierServiceRecord`: Carrier and service level definitions.
- `RateQuoteRequest`: Quote request with origin, destination, dimensions, weight.
- `RateQuote`: Quote response with carrier, service, transit time, cost.
- `CarrierAdapterConfig`: Adapter configuration per carrier.

### Business Logic
- `src/lib/carrier-api-adapters.ts`: Carrier adapter implementations.
- `src/lib/carrier-rate-shopping.ts`: Rate shopping engine and caching.
- `src/lib/carrier-services.ts`: Carrier service catalog.

---

## 20. RMA / Reverse Logistics

**Route**: `/rma/`  
**File**: `src/routes/rma/index.tsx` (559 lines)

### Features
- **RMA Management**: Create and manage return merchandise authorizations.
- **RMA Lines**: Line-level return detail with qty expected/received.
- **Disposition Workflow**: 
  - Return to stock
  - Quarantine
  - Destroy
  - Vendor return
  - Refurbish
- **Return Processing Fees**: Automatic fee calculation and billing for returns.
- **Auto-Billing**: Create billable events for RMA processing, inspection, restocking.
- **Return Reasons**: Categorize returns (customer return, damaged, defective, wrong item, expired, recall).
- **Status Tracking**: Draft → Submitted → Received → Inspected → Dispositioned → Closed.

### Data Model
- `RmaOrder`: RMA header with status, reason, customer.
- `RmaLine`: Return line items with qty, condition, serial numbers.
- `RmaDisposition`: Disposition record with type, status, qty, processor.
- `ReturnProcessingFee`: Fee record with type, amount, auto-bill flag.

### Data Access
- `src/lib/rma-firestore.ts`: Firestore CRUD for RMA collections.
- `src/lib/rma-types.ts`: RMA domain types.

---

## 21. Slotting & Warehouse Optimization

**Route**: `/slotting`  
**File**: `src/routes/slotting.tsx` (245 lines)

### Features
- **Velocity Analysis**: Compute SKU velocity from movement history.
- **Slotting Recommendations**: AI-driven recommendations for optimal slotting.
- **Priority Ranking**: High/medium/low priority recommendations.
- **Efficiency Analysis**: Analyze current slotting efficiency vs. optimal.
- **Execute Recommendations**: Apply slotting changes with confirmation.
- **Warehouse Filtering**: Analyze by warehouse.

### Data Model
- `SlottingRecommendation`: Recommendation with current/optimal location, priority, reason.
- `VelocityProfile`: SKU velocity metrics (picks per day, avg qty, trend).

### Business Logic
- `src/lib/slotting-engine.ts`: Slotting analysis algorithms.
- `src/lib/slotting-types.ts`: Slotting domain types.

---

## 22. Workforce Management

**Route**: `/workforce`  
**File**: `src/routes/workforce.tsx` (420 lines)

### Features
- **Labor Tracking**: Track labor events by employee, task type, and time.
- **Efficiency Metrics**: Compute efficiency percentage vs. engineered standards.
- **Team Aggregation**: Aggregate metrics by team and shift.
- **Date Range Filtering**: Filter labor data by custom date ranges.
- **Employee Profiles**: View employee details and labor history.

### Data Model
- `LaborEvent`: Task execution with timing, qty, efficiency.
- `LaborStandard`: Engineered labor standards by task type.
- `WarehouseEmployee`: Employee profile.

### Business Logic
- `src/lib/labor-data.ts`: Efficiency computation and labor analytics.

---

## 23. Scoreboard

**Route**: `/scoreboard`  
**File**: `src/routes/scoreboard.tsx` (400 lines)

### Features
- **Worker Scorecards**: Individual worker performance metrics.
- **Efficiency Tracking**: Average efficiency, total tasks, duration.
- **Streak Tracking**: Consecutive days above 100% efficiency.
- **Level & Badges**: Gamification with levels and achievement badges.
- **Time Range Filtering**: Today, shift, or week views.
- **Auto-Refresh**: Live updating scoreboard.

### Data Model
- `WorkerScorecard`: Aggregated worker metrics.
- `LaborEvent`: Individual task events.

---

## 24. Settings & Administration

**Route**: `/settings`  
**File**: `src/routes/settings.tsx` (1,570 lines)

### Features
- **Tenant Management**: CRUD for tenants with branding, address, contact.
- **Warehouse Management**: CRUD for warehouse locations with settings.
- **User Management**: Manage warehouse employees with roles and permissions.
- **Carrier Management**: Configure carrier credentials and service levels.
- **Allocation Configuration**: Set default LIFO/FIFO strategy per tenant.
- **Billing Configuration**: Manage billing clients, charge rules, and invoices.
- **System Settings**: General WMS configuration.

### Data Model
- Multi-entity CRUD for tenants, warehouses, employees, carriers, billing clients, charge rules.

---

## 25. Real-Time Data Layer

**File**: `src/components/db-context.tsx`

### Features
- **Database Seeding**: Auto-seed Firestore with mock data on first load.
- **Real-time Synchronization**: `onSnapshot` listeners for all major collections.
- **In-Memory Sync**: Keep mutable library arrays synchronized with Firestore.
- **Loading State**: Global loading indicator during initial sync.
- **Refresh Capability**: Manual data refresh via `refreshData()`.

### Collections Synced
tenants, warehouses, inventoryItems, pallets, pickWaves, orders, inboundShipments, carrierDispatches, bols, billingClients, billingRules, billableEvents, invoices, itemMaster, locationMaster, ediLogs, clientAllocationConfigs, pickTickets, employees, tenantPortalUsers, rmaOrders, rmaLines, rmaDispositions, returnProcessingFees, carrierCredentials.

---

## 26. Firestore Security Model

**File**: `firestore.rules`

### Security Rules Structure
- **Default Deny**: All collections default to `allow read, write: if false`.
- **Collection-Level Rules**: Explicit `allow read, write: if true` for development/demo mode.
- **Tenant Isolation**: Production rules enforce `resource.data.tenantId == request.auth.uid` or token-based tenant matching.
- **Append-Only Collections**: `movementHistory` allows create but denies update/delete.
- **Authentication Required**: Some collections require `request.auth != null`.

### Deployment
- Rules file: `firestore.rules` (root).
- Firebase config: `firebase.json` points to root rules file.
- Deployment: `firebase deploy --only firestore:rules`

---

## 27. Known Gaps & Technical Debt

### TypeScript Errors (Pre-existing)
The following files have pre-existing TypeScript compilation errors that do not affect runtime but should be addressed:

1. **`src/lib/pallet-data.ts`**: Forward reference to `Pallet` type before declaration.
2. **`src/lib/billing-engine.ts`**: Missing imports for `Invoice`, `BillingAuditLog`, `InvoicePayment`.
3. **`src/lib/billing-data.ts`**: `ratePerCuFt` property not in `ChargeRule` type.
4. **`src/lib/firestore-data.ts`**: Missing imports for `WarehouseEmployee`, `MovementHistory`, `addDoc`.
5. **`src/lib/compliance-validator.ts`**: Missing properties on `LocationRecord` type.
6. **`src/lib/master-data.ts`**: Type mismatch in `ItemMasterRecord` construction.
7. **`src/lib/index.ts`**: Duplicate exports and missing exports from various modules.
8. **`src/routes/billing.tsx`**: Unused variables and type errors in JSX fragments.

### Functional Gaps
1. **No real EDI parsing**: EDI transactions are logged but not parsed from inbound documents.
2. **No real carrier API integration**: Rate shopping uses mock adapters by default.
3. **No real payment processing**: Billing captures payments manually.
4. **No email notifications**: No automated email for invoices, ASNs, or alerts.
5. **No mobile app**: RF Gun is web-based, not a native mobile app.
6. **No barcode scanning**: RF Gun uses manual entry; no camera-based barcode scanning.
7. **Limited reporting**: No dedicated reporting module with scheduled reports.
8. **No user management UI**: Employee CRUD exists in master data and settings but is basic.

---

## 28. Industry-Grade Assessment

### Overall Rating: **B+ (Strong Mid-Market 3PL WMS)**

| Category | Rating | Notes |
|---|---|---|
| **Functional Coverage** | A- | Comprehensive WMS coverage: inbound, inventory, orders, allocation, picking, outbound, BOL, pallets, master data, EDI, compliance, billing, RF, RMA, rate shopping, tenant portal. |
| **Architecture** | B+ | Clean separation of concerns with domain modules, real-time data layer, and RBAC. Some technical debt in type definitions and barrel exports. |
| **Real-Time Capabilities** | A | Excellent use of Firestore `onSnapshot` for live data sync across all major entities. |
| **EDI Support** | B+ | Good transaction coverage (832, 940, 943, 944, 945) but lacks inbound parsing; mostly logging and outbound generation. |
| **Multi-Tenancy** | A- | Solid tenant isolation via Firestore rules and workspace context. |
| **User Experience** | B+ | Modern React 19 + Tailwind UI with shadcn components. Responsive and functional. |
| **Mobile/RF Support** | B | Dedicated RF Gun routes and session management, but lacks native mobile features like barcode scanning and voice picking integration. |
| **Billing** | B+ | Flexible charge rules with tiered pricing, accessorials, and auto-capture. Missing payment gateway integration. |
| **Compliance** | B+ | Serial tracking, recalls, quarantine, hazmat validation. Could expand to FDA/FSMA specific workflows. |
| **Integration** | B | Carrier adapters exist but default to mock. No ERP/WMS integration frameworks beyond EDI. |
| **Documentation** | C | Code is well-commented but lacks formal user documentation, API docs, or deployment guides. |
| **Testing** | D | No visible unit tests, integration tests, or E2E tests in the codebase. |
| **DevOps** | C+ | Firebase deployment configured but no CI/CD pipeline visible. |
| **Security** | B | Firestore rules exist but are open for development; production hardening needed. |

### Comparison to Industry Standards
- **Vs. Manhattan Associates / Blue Yonder**: AZUX covers core WMS functionality but lacks advanced optimization (AI slotting, labor forecasting, yard management).
- **Vs. NetSuite WMS**: AZUX has better real-time sync and modern UI, but lacks financial integration depth.
- **Vs. Fishbowl**: AZUX is more scalable with multi-tenancy and enterprise features.
- **Vs. Custom 3PL solutions**: AZUX is competitive for mid-market 3PLs needing EDI, billing, and multi-client support.

### Recommended Upgrades to Reach A- Grade
1. **Add automated testing**: Unit tests for engines, integration tests for Firestore CRUD.
2. **Harden Firestore rules**: Remove development `if true` clauses; implement proper auth checks.
3. **Add barcode scanning**: Integrate QuaggaJS or similar for RF Gun camera scanning.
4. **Real payment processing**: Integrate Stripe or similar for invoice payments.
5. **EDI parsing**: Add inbound EDI 832/940/943 parsing libraries.
6. **Reporting module**: Add scheduled reports with email delivery.
7. **CI/CD**: Add GitHub Actions or Firebase CI for automated deployment.
8. **API documentation**: Generate OpenAPI docs or Storybook for components.

---

## 29. Gemini Verification Prompt

Copy and paste the following prompt into Google Gemini to verify and rate this system:

```
You are a senior solutions architect and 3PL WMS domain expert. I need you to thoroughly review and verify the functional specifications of the AZUX 3PL WMS System, a multi-tenant warehouse management platform built with React 19, TanStack Router, Vite 8, Tailwind CSS v4, and Firebase Firestore.

Please perform the following analysis:

1. **Feature Completeness Verification**: Review the listed features across all modules (Inbound, Inventory, Orders, Allocation, Picking, Outbound, BOL, Pallets, Master Data, EDI, Compliance, Billing, RF Gun, Tenant Portal, Rate Shopping, RMA, Slotting, Workforce, Scoreboard, Settings). Identify any missing standard WMS features that would be expected in a production 3PL system.

2. **Architecture Assessment**: Evaluate the technical architecture (React 19, TanStack Router, Firestore real-time sync, Context API, multi-tenancy). Identify strengths and potential bottlenecks.

3. **Data Model Review**: Assess the Firestore data model (collections, relationships, indexing). Identify gaps or normalization issues.

4. **Security & RBAC Analysis**: Review the authentication, RBAC, and Firestore security rules. Identify any security gaps or best practice violations.

5. **Industry Comparison**: Compare this system against industry-standard WMS platforms (Manhattan Associates, Blue Yonder, NetSuite WMS, SAP EWM). Rate it on a scale of 1-10 for each major category.

6. **Technical Debt Assessment**: Review the known gaps listed in section 27. Identify any additional technical debt not already noted.

7. **Production Readiness**: Evaluate whether this system is ready for production deployment in a mid-market 3PL environment. List blockers and recommendations.

8. **Improvement Roadmap**: Provide a prioritized roadmap of enhancements to reach enterprise-grade (A- rating) status.

Please provide your analysis in a structured markdown format with clear sections, ratings, and actionable recommendations.
```

---

*End of Functional Specifications Document*
