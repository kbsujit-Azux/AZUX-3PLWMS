# AZUX 3PL WMS — Product Feature Catalog

> **For Marketing, Sales, and Social Media**
> **Version**: 1.0  
> **Date**: 2026-08-23  
> **Product**: AZUX 3PL Warehouse Management System

---

## What is AZUX?

AZUX is a modern, cloud-native **Warehouse Management System (WMS)** built exclusively for **third-party logistics (3PL) providers**. It unifies real-time inventory visibility, EDI integration, RF Gun terminal support, automated billing, and a tenant self-service portal into a single multi-tenant platform. No more stitching together five different tools — AZUX handles the full order-to-cash lifecycle inside the four walls.

---

## Who Is It For?

- **3PL Operators** managing multiple clients and warehouses
- **Warehouse Managers** who need live operational visibility
- **Operations Teams** executing inbound, outbound, and reverse logistics
- **Clients / Tenants** who want self-service access to inventory, orders, and invoices
- **RF Gun Operators** performing directed picking, putaway, and receiving
- **Billing Teams** automating 3PL charge capture and invoicing

---

## Core Value Propositions

| Pillar                                | What It Means                                                        |
| ------------------------------------- | -------------------------------------------------------------------- |
| **Real-Time Everything**              | Every major entity syncs live via Firestore. No refresh needed.      |
| **EDI-Native**                        | Built from the ground up with EDI 832, 940, 943, 944, 945 support.   |
| **Multi-Tenant by Design**            | Client data isolation at the database and UI level.                  |
| **RF Gun Ready**                      | Dedicated mobile workflows for warehouse floor operations.           |
| **Enterprise Modules Out of the Box** | Rate shopping, RMA, tenant portal, automated billing — all included. |
| **Modern Stack**                      | React 19, Vite 8, Tailwind CSS v4 — no legacy dependencies.          |

---

## Feature Catalog

### 1. Operations Dashboard

Live command center for warehouse leadership.

- **KPI Cards**: Active inbound, active outbound, total SKUs, network utilization
- **Volume Trends**: 7-day inbound/outbound volume charts
- **Carrier Performance**: On-time delivery and exception rates by carrier
- **Live Ops Log**: Real-time operational events with severity levels (info, warn, error, ok)
- **Tenant / Warehouse Selector**: Instant workspace switching for multi-site operations

### 2. Inbound Operations (EDI 943 / ASN)

End-to-end inbound receiving and putaway.

- **ASN Management**: View and manage advance ship notices
- **Receiving Workflow**: Receipt creation against ASN lines with carton/unit-level receiving
- **Damage Logging**: Record damages, shortages, and overages with notes
- **License Plate (LPN) Generation**: Automatic LPN creation on receipt
- **Putaway Direction**: Auto-suggested putaway locations based on slotting rules
- **Progress Tracking**: Visual progress bars for ASN receipt completion
- **CSV Export**: Export inbound data for downstream systems
- **Master Data Links**: Direct navigation to Item Master and Location Master

### 3. Inventory Management

Batch-level visibility and full auditability.

- **Batch-Level Tracking**: Track inventory by SKU + batch/lot with PO and trailer info
- **Location Occupancy**: View which locations are occupied, pickable, or blocked
- **Transaction History**: Full append-only audit trail of all inventory movements
- **Manual Adjustments**: Inventory adjustments with reason codes
- **CSV Import / Export**: Bulk inventory operations
- **Real-Time Sync**: Live updates via Firestore listeners
- **Search & Filter**: Filter by SKU, location, batch, tenant, warehouse

### 4. Order Management (EDI 940)

Complete outbound order lifecycle.

- **Order Lifecycle**: Create, allocate, pick, pack, ship, and cancel
- **EDI 940 Integration**: Import and process warehouse shipping orders
- **Line-Level Detail**: SKU, qty, UOM, pricing per line
- **Status Tracking**: New → Allocated → Picked → Packed → Shipped
- **Client Management**: Per-client order views and filtering
- **CSV Import / Export**: Bulk order operations
- **Master Data Validation**: Cross-check against Item Master before execution

### 5. Allocation Engine

Intelligent inventory assignment.

- **LIFO / FIFO Strategy**: Configurable per tenant
- **Auto-Allocation**: Automatically allocate orders against available inventory
- **Deallocation**: Release allocated inventory back to the available pool
- **Unpick**: Reverse picked inventory back to allocated or available state
- **Directed Pick**: Generate pick instructions based on allocation results
- **Validation**: Pre-allocation, pre-pick, pre-ship validation checks
- **Reallocation**: Reallocate picked orders to different locations or batches

### 6. Picking & Wave Management

Directed work execution for the warehouse floor.

- **Pick Tickets**: Generate and manage pick tickets from orders
- **Directed Pick**: RF-guided pick instructions with location, SKU, qty
- **Pick Waves**: Batch picks into waves for efficient execution
- **Wave Building**: Group orders by strategy for optimized waves
- **Pick Execution**: Complete picks via desktop or RF Gun
- **Reallocation**: Reallocate picked tickets to alternative locations
- **Outbound Pallet Creation**: Create outbound pallets from picked goods
- **Shipment Record Creation**: Auto-create shipments on pick completion

### 7. Outbound & Shipments

Shipment staging, carrier dispatch, and yard tracking.

- **Shipment Lifecycle**: Create, stage, load, and close shipments
- **Carrier Integration**: Carrier selection and dispatch tracking
- **BOL Generation**: Create Bills of Lading from shipments
- **Yard / Dock Management**: Track shipments at dock doors and in yard
- **Carrier Dispatch**: Send dispatch notifications to carriers
- **Shipment Filtering**: Filter by client, warehouse, status, carrier
- **Outbound Pallet Tracking**: Track pallets through the outbound process

### 8. BOL & Documentation

Professional shipping documentation.

- **BOL Management**: Create, view, and manage Bills of Lading
- **Master BOL**: Consolidate multiple shipments into a master BOL
- **Packing Slips**: Generate and print packing slips
- **EDI 945**: Send warehouse shipping advice to clients
- **BOL Preview**: Visual preview before printing
- **Document Export**: Download BOLs and packing slips as PDFs
- **Consolidation Groups**: Group shipments for master BOL creation

### 9. Pallet Management

Full pallet lifecycle tracking.

- **Inbound Pallets**: Receive and track inbound pallets
- **Outbound Pallets**: Manage outbound pallets through staging and loading
- **Pallet Details**: View contents, location, status, and history
- **Pallet Splitting / Merging**: Split or merge pallets as needed
- **Movement Tracking**: Full audit trail of pallet movements
- **Putaway Suggestions**: AI-driven putaway location recommendations
- **Pallet Printing**: Print pallet labels and UCC-128 labels
- **Location Management**: Assign and change pallet locations

### 10. Master Data

Centralized reference data management.

- **Item Master (EDI 832)**: SKU, UPC, description, dimensions, weight, case qty, lot/serial/expiry control flags
- **CSV Import / Export**: Bulk updates for item master
- **Location Master**: Warehouse locations with aisle, rack, bin, pickable/bulk/hazmat/temp flags, capacity tracking
- **Warehouse Master**: CRUD for warehouse definitions with code, name, city, capacity
- **Employee Master**: Profiles with badge ID, name, email, role, team, shift, password/PIN management

### 11. EDI Hub

Comprehensive EDI transaction monitoring.

- **Transaction Monitoring**: Monitor EDI 832, 940, 943, 944, 945
- **Status Tracking**: Accepted, processed, pending, warning, rejected
- **Trading Partner Management**: View EDI activity by partner
- **Error Handling**: Identify and resolve EDI errors
- **Transaction History**: Full audit log of EDI transactions

### 12. Compliance & Governance

Regulatory and quality control.

- **Serialized Inventory**: Full chain of custody for serialized items
- **Expiry Tracking**: Monitor lot expiration dates with alerting
- **Document Management**: Compliance document lifecycle (upload, review, expiry)
- **Recalls**: Product recall management with affected lot tracing
- **Quarantine Orders**: Create and manage quarantine orders
- **Hazmat Validation**: Validate hazmat handling requirements by location
- **Temperature Control**: Monitor temperature-controlled storage requirements
- **Audit Logging**: Append-only compliance audit trail

### 13. Billing Engine

Automated 3PL billing and invoicing.

- **Client Billing Profiles**: Manage billing clients with addresses, tax IDs, payment terms
- **Flexible Charge Rules**:
  - Rate units: carton, pallet, container, BOL, location, warehouse, cubic feet, flat
  - Categories: Inbound, Outbound, Storage, Custom
  - Accessorial charges: kitting, relabeling, special handling, RMA processing
  - Tiered pricing with volume breaks
  - Peak season surcharges
  - Minimum monthly charges
- **Billable Event Capture**: Auto-capture from warehouse operations
- **Invoice Generation**: Create invoices with tax calculation
- **Invoice Management**: View, send, mark paid, dispute, void
- **Payment Recording**: Record payments against invoices
- **Dispute Management**: Track and resolve billing disputes
- **Audit Logging**: Full billing audit trail

### 14. RF Gun Terminal

Dedicated mobile workflows for warehouse floor operations.

- **RF Session Management**: Badge-authenticated RF sessions
- **Putaway**: Directed putaway to suggested locations
- **Move**: Move pallets/locations between positions
- **Pick**: Directed picking with RF scanning
- **Receiving**: Receive inbound inventory with RF scanning
- **Inquiry**: Look up inventory, locations, orders via RF
- **History**: View RF transaction history
- **Voice Picking**: Hands-free voice command support
- **Text-to-Speech**: Audio guidance for RF operators
- **Smart Glass Bridge**: Support for Vuzix, Google Glass Enterprise, and generic WebRTC glasses

### 15. Tenant Portal

White-labeled self-service client portal.

- **Client Self-Service**: Tenant-branded portal for clients to view their data
- **User Management**: CRUD for tenant portal users
- **CSV Uploads**: Upload CSV files for bulk data operations
- **Report Generation**: Generate custom reports (inventory, orders, shipments)
- **Invoice Viewing**: View and download invoices
- **White-Label Settings**: Customizable portal branding per tenant
- **Real-Time Data**: Live inventory, order, and pallet views

### 16. Rate Shopping

Multi-carrier LTL and parcel rate comparison.

- **Multi-Carrier Rates**: Compare rates across multiple carriers
- **LTL Support**: Full LTL freight with NMFC, class, and accessorials
- **Parcel Support**: Parcel rate comparison with dimensional weight
- **Adapter Architecture**: Pluggable carrier API adapters (ShipEngine, EasyPost, Mock)
- **Quote Caching**: Persist rate quotes for historical comparison
- **Carrier Credentials**: Secure storage of carrier API keys
- **Real API Toggle**: Switch between mock and real carrier APIs

### 17. RMA / Reverse Logistics

Complete returns management.

- **RMA Management**: Create and manage return merchandise authorizations
- **RMA Lines**: Line-level return detail with qty expected/received
- **Disposition Workflow**: Return to stock, quarantine, destroy, vendor return, refurbish
- **Return Processing Fees**: Automatic fee calculation and billing
- **Auto-Billing**: Create billable events for RMA processing, inspection, restocking
- **Return Reasons**: Categorize returns (customer return, damaged, defective, wrong item, expired, recall)
- **Status Tracking**: Draft → Submitted → Received → Inspected → Dispositioned → Closed

### 18. Slotting & Warehouse Optimization

AI-driven warehouse layout optimization.

- **Velocity Analysis**: Compute SKU velocity from movement history
- **Slotting Recommendations**: AI-driven optimal slotting suggestions
- **Priority Ranking**: High, medium, low priority recommendations
- **Efficiency Analysis**: Analyze current slotting efficiency vs. optimal
- **Execute Recommendations**: Apply slotting changes with confirmation
- **Warehouse Filtering**: Analyze by warehouse

### 19. Workforce Management

Labor tracking and efficiency analytics.

- **Labor Tracking**: Track labor events by employee, task type, and time
- **Efficiency Metrics**: Compute efficiency percentage vs. engineered standards
- **Team Aggregation**: Aggregate metrics by team and shift
- **Date Range Filtering**: Filter labor data by custom ranges
- **Employee Profiles**: View employee details and labor history

### 20. Scoreboard

Gamified worker performance.

- **Worker Scorecards**: Individual worker performance metrics
- **Efficiency Tracking**: Average efficiency, total tasks, duration
- **Streak Tracking**: Consecutive days above 100% efficiency
- **Level & Badges**: Gamification with levels and achievement badges
- **Time Range Filtering**: Today, shift, or week views
- **Auto-Refresh**: Live updating scoreboard

### 21. VAS (Value-Added Services)

Value-added service work order management.

- **VAS Work Orders**: Create and manage kitting, labeling, assembly, and custom services
- **Work Order Lines**: Line-level detail with qty, status, and priority
- **Progress Tracking**: Visual progress bars and status indicators
- **Priority Management**: High, medium, low priority classification
- **Inventory Validation**: Validate inventory availability before starting work
- **Cost Calculation**: Automatic VAS cost computation
- **Status Workflow**: Draft → Released → In Progress → Completed → Cancelled

### 22. Cross-Docking

Streamline cross-dock operations.

- **Cross-Dock Matching**: Match incoming inventory directly to outbound orders
- **Priority Classification**: High, medium, low priority matches
- **Status Tracking**: Pending, matched, dispatched, completed
- **Progress Tracking**: Visual progress for cross-dock operations
- **SKU-Level Matching**: Match by SKU across inbound and outbound

### 23. Cycle Counting

Physical inventory and discrepancy management.

- **Cycle Count Schedules**: Automated count scheduling
- **ABC Analysis**: Classify inventory by velocity (A/B/C)
- **Blind Counting**: Support for blind count workflows
- **Variance Reconciliation**: Compute and reconcile count variances
- **Discrepancy Workflows**: Investigate and resolve count discrepancies
- **Count Efficiency**: Track counting accuracy and speed
- **Auto-Adjustment**: Automated adjustment rules for approved variances

### 24. Catch Weight Management

Variable weight tracking for irregular items.

- **Catch Weight Items**: Define items with nominal and actual weights
- **Weight Validation**: Validate actual weight against tolerances
- **Weight Variance**: Compute variance percentage
- **Billing Weight**: Compute billable weight (actual vs. nominal)
- **Transaction Logging**: Full audit trail of weight transactions
- **Out-of-Spec Alerts**: Flag weights outside acceptable tolerances

### 25. Packing & Cartonization

Automated containerization and cubing logic.

- **Carton Catalog**: Predefined carton sizes with dimensions
- **Automated Cartonization**: Determine optimal carton sizes before picking
- **Volumetric Calculation**: Compute cubic feet and dimensional weight
- **Carton Recommendations**: Suggest best-fit carton per order
- **Multi-Carton Orders**: Split orders across multiple cartons
- **Packing Slips**: Generate packing slips per carton

### 26. Task Interleaving

Reduce deadheading with intelligent task sequencing.

- **Task Queue Building**: Combine open picks and putaways into a unified queue
- **Aisle-Aware Sequencing**: Assign next task in same aisle, then adjacent, then any
- **Priority Weighting**: Hot picks and aging putaways get priority
- **Worker Routing**: Minimize empty travel across the warehouse

### 27. Labor Forecasting

Predictive labor planning.

- **Forecast Labor from EDI**: Predict labor requirements from incoming EDI orders
- **Shift Scheduling**: Compute shift schedules based on forecasted labor
- **Horizon Planning**: Short-term and medium-term labor forecasts

### 28. Smart Glass & Voice Picking

Next-generation hands-free operations.

- **Smart Glass Bridge**: Hardware abstraction for Vuzix, Google Glass Enterprise, and generic WebRTC glasses
- **Display Text**: Show pick instructions on glass display
- **Camera Capture**: Capture images for proof of pick
- **Voice Input**: Tap, swipe, voice, and button input support
- **Voice Picking Engine**: Parse voice commands for hands-free operation
- **Text-to-Speech**: Audio guidance for warehouse operators

### 29. Settings & Administration

Complete system configuration.

- **Tenant Management**: CRUD for tenants with branding, address, contact
- **Warehouse Management**: CRUD for warehouse locations with settings
- **User Management**: Manage warehouse employees with roles and permissions
- **Carrier Management**: Configure carrier credentials and service levels
- **Allocation Configuration**: Set default LIFO/FIFO strategy per tenant
- **Billing Configuration**: Manage billing clients, charge rules, and invoices
- **System Settings**: General WMS configuration

---

## Technology Stack

| Layer                | Technology                               |
| -------------------- | ---------------------------------------- |
| **Frontend**         | React 19, TanStack Router v1.170, Vite 8 |
| **UI Framework**     | Tailwind CSS v4, shadcn/ui, Recharts     |
| **Backend**          | Firebase Firestore (NoSQL)               |
| **Real-Time**        | Firestore `onSnapshot` listeners         |
| **Authentication**   | Firebase Auth (Email/Password, Google)   |
| **Hosting**          | Firebase Hosting                         |
| **State Management** | React Context, TanStack Query v5         |
| **Language**         | TypeScript                               |
| **Build**            | Vite 8 with PWA support for RF Gun       |
| **Deployment**       | Docker, Firebase CLI, CI/CD              |

---

## Deployment Options

- **Cloud (SaaS)**: Firebase Hosting with managed Firestore
- **Self-Hosted**: Docker and docker-compose for on-premise deployment
- **PWA**: Progressive Web App for RF Gun terminals
- **CI/CD**: GitHub Actions pipeline for automated testing and deployment

---

## Security & Multi-Tenancy

- **Firebase Authentication**: Email/Password and Google SSO
- **Role-Based Access Control (RBAC)**: Admin, Operations Manager, Receiver, Putaway, Picker, Packer, Warehouse Lead, Billing, Viewer
- **Tenant Isolation**: Firestore security rules enforce tenant-level data boundaries
- **Append-Only Collections**: Movement and audit logs cannot be modified or deleted
- **Secure Credential Storage**: Carrier API keys stored securely in Firestore

---

## Integration Capabilities

- **EDI Transactions**: 832, 940, 943, 944, 945
- **Carrier APIs**: ShipEngine and EasyPost adapter architecture
- **CSV Import/Export**: Bulk data operations across all major entities
- **Firestore**: Real-time NoSQL database with offline support
- **Third-Party APIs**: Extensible adapter pattern for carrier and system integration

---

## Competitive Differentiators

1. **Real-Time Everything**: Every major entity syncs live via Firestore. No refresh needed.
2. **EDI-Native**: Built from the ground up with EDI 832, 940, 943, 944, 945 support.
3. **Multi-Tenant by Design**: Client data isolation at the database and UI level.
4. **RF Gun Ready**: Dedicated mobile workflows for warehouse floor operations.
5. **Enterprise Modules**: Rate shopping, RMA, tenant portal, and automated billing out of the box.
6. **Modern Stack**: React 19, Vite 8, Tailwind v4 — no legacy dependencies.
7. **Voice & Smart Glass**: Hands-free operations with voice picking and smart glass support.
8. **AI-Driven Slotting**: Velocity-based slotting recommendations for optimal warehouse layout.
9. **Task Interleaving**: Reduce worker deadheading with intelligent task sequencing.
10. **Catch Weight & Cartonization**: Advanced packaging and weight management for irregular items.

---

## Use Cases

| Use Case                                            | AZUX Module                 |
| --------------------------------------------------- | --------------------------- |
| 3PL warehouse receiving ASNs from multiple clients  | Inbound + EDI Hub           |
| Directed picking with RF guns                       | Picking + RF Gun Terminal   |
| Automated billing per client, per activity          | Billing Engine              |
| Client self-service portal for inventory visibility | Tenant Portal               |
| Cross-dock operations for fast-moving goods         | Cross-Docking               |
| Returns processing and disposition                  | RMA / Reverse Logistics     |
| LTL rate comparison before shipment                 | Rate Shopping               |
| Warehouse layout optimization                       | Slotting & Optimization     |
| Labor tracking and gamification                     | Workforce + Scoreboard      |
| Value-added services (kitting, labeling)            | VAS Work Orders             |
| Serialized inventory and recalls                    | Compliance & Governance     |
| Catch-weight items (seafood, meat, chemicals)       | Catch Weight Management     |
| Automated carton selection                          | Packing & Cartonization     |
| Hands-free picking with voice                       | Voice Picking + Smart Glass |
| Cyclical physical inventory                         | Cycle Counting              |

---

## Industry-Grade Rating

**Overall: B+ (Strong Mid-Market 3PL WMS)**

| Category               | Rating |
| ---------------------- | ------ |
| Functional Coverage    | A-     |
| Architecture           | B+     |
| Real-Time Capabilities | A      |
| EDI Support            | B+     |
| Multi-Tenancy          | A-     |
| User Experience        | B+     |
| Mobile / RF Support    | B      |
| Billing                | B+     |
| Compliance             | B+     |
| Integration            | B      |
| Documentation          | C      |
| Testing                | D      |
| DevOps                 | C+     |
| Security               | B      |

---

## Contact & Deployment

- **Production URL**: https://wms-3pl-79a05.web.app
- **RF Gun URL**: https://rfgun.web.app
- **Firebase Project**: wms-3pl-79a05
- **GitHub**: https://github.com/kbsujit-Azux/AZUX-3PLWMS
- **Documentation**: `docs/FUNCTIONAL_SPECIFICATIONS.md`
- **Deployment Guide**: `FIREBASE_DEPLOY.md`

---

_AZUX 3PL WMS Systems — Enterprise-grade warehouse management for modern 3PL providers._
