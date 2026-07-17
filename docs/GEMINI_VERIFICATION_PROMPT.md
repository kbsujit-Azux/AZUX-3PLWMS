# Gemini Verification Prompt

Copy and paste the following prompt into **Google Gemini** (or any advanced LLM) to verify, rate, and get improvement recommendations for the AZUX 3PL WMS System.

---

## Prompt for Gemini

```
You are a senior solutions architect and 3PL WMS domain expert with 15+ years of experience evaluating warehouse management systems for mid-market and enterprise 3PL providers. I need you to thoroughly review and verify the functional specifications of the AZUX 3PL WMS System, a multi-tenant warehouse management platform built with React 19, TanStack Router, Vite 8, Tailwind CSS v4, and Firebase Firestore.

Please perform the following analysis:

### 1. Feature Completeness Verification
Review the listed features across all modules:
- Operations Dashboard
- Inbound Operations (EDI 943 ASN, receiving, putaway)
- Inventory Management (batch-level, location occupancy, transaction audit)
- Order Management (EDI 940, order lifecycle)
- Allocation Engine (LIFO/FIFO, auto-allocation, deallocation)
- Picking & Wave Management (directed picks, wave building)
- Outbound & Shipments (carrier dispatch, yard/dock)
- BOL & Documentation (BOL, master BOL, packing slips, EDI 945)
- Pallet Management (inbound/outbound pallets, movement tracking)
- Master Data (Item Master EDI 832, Location Master, Warehouse, Employee)
- EDI Hub (832, 940, 943, 944, 945 monitoring)
- Compliance & Governance (serial tracking, recalls, quarantine, hazmat)
- Billing Engine (charge rules, billable events, invoices, payments, disputes)
- RF Gun Terminal (putaway, move, pick, receiving, inquiry, history)
- Tenant Portal (self-service CSV, reports, invoices, white-label)
- Rate Shopping (multi-carrier LTL/parcel, adapter architecture)
- RMA / Reverse Logistics (RMA, disposition, auto-billing)
- Slotting & Warehouse Optimization (velocity analysis, slotting recommendations)
- Workforce Management (labor tracking, efficiency metrics)
- Scoreboard (worker scorecards, gamification)
- Settings & Administration (tenant, warehouse, user, carrier, billing config)

Identify any missing standard WMS features that would be expected in a production 3PL system (e.g., yard management, advanced reporting, labor forecasting, quality control, etc.).

### 2. Architecture Assessment
Evaluate the technical architecture:
- React 19 with TanStack Router v1.170 for file-based routing
- Vite 8 build system
- Tailwind CSS v4 + shadcn/ui for UI
- Firebase Firestore for NoSQL data storage
- Real-time sync via onSnapshot listeners
- React Context for Auth, Workspace, Database
- TanStack Query v5 for server state

Identify architectural strengths and potential bottlenecks or single points of failure.

### 3. Data Model Review
Assess the Firestore data model including:
- 30+ collections (tenants, warehouses, inventoryItems, pallets, orders, etc.)
- Collection relationships and denormalization strategy
- Indexing considerations
- Multi-tenant data isolation

Identify gaps, normalization issues, or scalability concerns.

### 4. Security & RBAC Analysis
Review:
- Firebase Authentication (Email/Password, Google)
- Role-Based Access Control (Admin, Operations Manager, Receiver, Putaway, Picker, Packer, Warehouse Lead, Billing)
- Firestore security rules (tenant isolation, append-only collections)
- Client-side route guarding

Identify security gaps, best practice violations, or privilege escalation risks.

### 5. Industry Comparison
Compare this system against industry-standard WMS platforms:
- Manhattan Associates WMS
- Blue Yonder WMS
- NetSuite WMS
- SAP EWM
- Fishbowl Inventory

Rate AZUX on a scale of 1-10 for each category:
- Functional Depth
- Scalability
- Integration Capabilities
- User Experience
- Real-Time Capabilities
- Reporting & Analytics
- Mobile Support
- Compliance & Audit
- Multi-Tenancy
- Total Cost of Ownership

### 6. Technical Debt Assessment
Review the known gaps:
- Pre-existing TypeScript compilation errors in billing, pallet, and compliance modules
- No automated testing (unit, integration, E2E)
- Open Firestore rules for development
- Mock carrier adapters instead of real integrations
- No barcode scanning in RF Gun
- No email notifications
- No CI/CD pipeline
- Limited user documentation

Identify any additional technical debt not already noted.

### 7. Production Readiness
Evaluate whether this system is ready for production deployment in a mid-market 3PL environment handling 100-500 orders/day across 3-5 warehouses and 10-20 tenants.

List:
- Critical blockers (must fix before production)
- High-priority items (should fix within 30 days)
- Medium-priority items (should fix within 90 days)
- Low-priority items (nice to have)

### 8. Improvement Roadmap
Provide a prioritized roadmap of enhancements to reach enterprise-grade (A- rating) status. Include estimated effort (S/M/L/XL) for each item.

Please provide your analysis in a structured markdown format with:
- Executive summary (2-3 sentences)
- Detailed findings by section
- Ratings table
- Prioritized recommendations
- Final verdict (Recommended / Not Recommended / Recommended with conditions)
```

---

## How to Use

1. Open [Google Gemini](https://gemini.google.com) (or Google AI Studio).
2. Paste the prompt above into the input field.
3. Review the generated analysis.
4. Use the recommendations to prioritize engineering work.

## Expected Output Format

Gemini should return:
1. **Executive Summary** — High-level assessment in 2-3 sentences.
2. **Feature Completeness** — List of missing features with severity.
3. **Architecture Assessment** — Strengths, weaknesses, and recommendations.
4. **Data Model Review** — Schema gaps and indexing suggestions.
5. **Security Analysis** — Vulnerabilities and hardening steps.
6. **Industry Comparison** — 1-10 ratings per category with justification.
7. **Technical Debt** — Additional debt items not in the known list.
8. **Production Readiness** — Blocker/high/medium/low priority items.
9. **Improvement Roadmap** — Prioritized backlog with effort estimates.
10. **Final Verdict** — Recommended / Not Recommended / Conditional.

---

*This prompt is designed to elicit a thorough, expert-level review of the AZUX 3PL WMS System.*
