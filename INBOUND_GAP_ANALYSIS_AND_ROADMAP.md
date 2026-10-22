# AZUX 3PL WMS — Inbound System Review, Gap Analysis & Roadmap

**Date:** 22 Oct 2026
**Scope:** Full inbound domain (container receipt → palletize → putaway → OSD → close → bill)
**Baseline:** The "Inbound Workflow Detailed Plan" issued earlier, compared against the code as it stands today
**Status:** Review only — no system changes made in this document

---

## 1. Executive Summary

The inbound system has moved **well beyond** the original plan in the areas that matter most for correctness and auditability, and it is now a genuinely usable 3PL receiving system rather than a prototype. The pieces that were hardest to get right — the pallet build engine, client-aware putaway, the receiving variance model, the correlation checker and the Firestore-only persistence discipline — are all in place and well covered by tests.

However, the review surfaced **three functional gaps that break promises the UI already makes to the operator**, and a large block of the original plan that was never built: the mistake-recovery (revert) path, real storage billing, and actual EDI 944 transmission.

| Area | State |
|---|---|
| Item & Location Master enrichment | **Complete** — beyond plan |
| Pallet build intelligence | **Complete** — beyond plan |
| Directed putaway | **Complete** — beyond plan |
| Receiving variance (OSD) | **Complete** — beyond plan |
| Data correlation & self-healing | **Complete** — beyond plan |
| Audit trail | **Strong** — but no field-level diff |
| Auto-billing on close | **Working** — but storage billing is dead code and double-billing is possible |
| Mistake recovery (revert/undo) | **Missing** — the plan's central promise |
| Gate check-in, unload, pallet build on RF | **Missing** — RF has 3 of 6 planned screens |
| Photos, temperature, driver signature | **Missing** |
| EDI 944 transmission | **Missing** — toast only |
| Real-time scheduling / storage accrual | **Missing** — scheduler never started |

**Recommendation:** close the three functional gaps in Wave 1 (est. 2 weeks), then build the operational completeness in Waves 2–4. The current system is safe to run for inbound on a single-site, single-operator basis; it is **not** yet ready for multi-client, multi-site, audited operations.

---

## 2. What We Built Since the Plan — Scorecard

### 2.1 Section 1 — Item Master (all ✅, plus extras)

| Plan item | Status | Notes |
|---|---|---|
| 1.1 GTIN hierarchy | ✅ **Delivered + exceeded** | `GTINHierarchy[]` with parent/child GTINs, 4 pack levels, dims/weight per level. `unitsPerPackLevel()` and `convertPackQuantity()` implemented. The Add Container / Edit Container SKU picker fills UPC, style, description, UOM, case pack and unit weight from the master. |
| 1.2 Apparel attribute matrix | ✅ **Delivered** | `ApparelAttributes` with style, colour (code+name), size (+dim overrides), fit, fabric, care code, season, gender. Seeded on `NSA-HOOD-BLK-M` and `NSA-TEE-WHT-L`. |
| 1.3 Pallet build intelligence | ✅ **Delivered + exceeded** | `PalletBuildConfig` with all 14 fields. The **Pallet Build Engine** (`src/lib/pallet-build-engine.ts`) computes cases/layer with 90° rotation, pattern efficiency factors, layers from height/weight limits, and scores patterns (interlock > brick > column > pinwheel). `maxCasesPerLayer` and `maxLayers` are actually *enforced*, not just noted. |
| 1.4 Velocity classification | ✅ **Delivered** | ABC class, annual picks, lines/order, peak months, storage class, reorder days. |
| 1.5 Substitution rules | ✅ **Delivered** | Substitute/upgrade/downgrade/equivalent, priority, condition, cost impact. JSON editor in the dialog. |
| 1.6 ItemMasterRecord | ✅ **Delivered** | All 40+ plan fields present, plus 8 more. |

### 2.2 Section 2 — Location Master (all ✅, plus extras)

| Plan item | Status | Notes |
|---|---|---|
| 2.1 Slotting intelligence | ✅ **Delivered** | `SlottingRules` with storage-class compatibility, required item attrs (hazmat/temp/weight/dims/ABC), putaway + replen priority, allowed pallet types. |
| 2.2 Velocity metrics | ✅ **Delivered** | Picks/day, lines/day, cubic velocity, last-calculated, manual-override flag. |
| 2.3 Zone adjacency | ✅ **Delivered** | Adjacent zones with travel times, dock distances. |
| 2.4 LocationRecord | ✅ **Delivered** | All plan fields + status, cycle count, putaway sequence, max pallet weight/height, clearance height. |

### 2.3 Section 3 — Database Collections (⚠️ partial)

| Plan collection | Status |
|---|---|
| `itemMaster` (enriched) | ✅ Live, 11 records, all enhanced fields populated |
| `locationMaster` (enriched) | ✅ Live, 20 records, slotting/velocity/adjacency populated |
| `palletBuildTemplates` | ❌ **Not created** |
| `slottingRules` (rule engine) | ❌ **Not created** — the rules live inside each location record instead |
| `putawaySuggestions` | ❌ **Not created** — suggestions are computed live per render instead |

The three unbuilt collections were **deliberate design changes**, not oversights: rules are embedded in the location record (simpler, one read) and suggestions are computed on demand from the live master (always fresh, no cache to invalidate). The *reusable template* concept, however, is genuinely missing — see §5.6.

### 2.4 Section 4 — UI Screens (✅ delivered)

| Plan item | Status | Notes |
|---|---|---|
| 4.1 Item dialog, 6 tabs | ✅ Delivered | Core / Pack / Pallet Build / Velocity / Compliance / Commercial. GTIN hierarchy + apparel are in the Pack tab. |
| 4.2 Location dialog, 6 tabs | ✅ Delivered as 4 | Core / Slotting / Velocity / Environment (dimensions folded into Core, adjacency into Velocity). |
| 4.3 Pallet build wizard | ✅ Delivered, integrated | Not a standalone wizard — the engine runs inside the Inbound "Build pallets" dialog, which is better UX (the operator never leaves the line). Auto-applies the recommendation. |
| 4.4 Putaway dashboard | ⚠️ Delivered, single-pallet only | The "Directed putaway" tab is a real dashboard with suggestions and reasons. **No bulk assign, no drag-and-drop** — one pallet per scan. |
| — | ➕ Beyond plan | **Scan-to-confirm dialog** with pallet-identity + location validation, client-aware suggestions, and a "valid locations" chip list. |
| — | ➕ Beyond plan | **Container close / depart confirmation** showing every outstanding item in red/amber with a fix link and an explicit acknowledgement. |
| — | ➕ Beyond plan | **Receiving variance panel** in the build dialog: Found on truck / Good / Damaged, required damage reason, separate damage-hold pallet. |

### 2.5 Section 5 — Algorithms (✅ all delivered, one gap)

| Plan item | Status |
|---|---|
| 5.1 Pallet build recommendation | ✅ Delivered, and the `maxCasesPerLayer`/`maxLayers` caps are enforced. |
| 5.2 Putaway recommendation | ✅ Delivered, and **made client-aware** (a location owned by another client is never recommended). |
| 5.3 GTIN pack conversion | ✅ Delivered. |

### 2.6 Section 6 — CSV/EDI Import (✅ delivered, extended)

Item Master CSV now maps **78 columns** (plan said ~25) covering GTIN hierarchy, apparel, pallet build, velocity, substitutions and compliance. The inbound ASN CSV covers the extended header plus `Storage Slot`, `Door` and `Vessel`/`Voyage`/`Port`.

### 2.7 Section 7 — Implementation Phases

| Phase | Status |
|---|---|
| 1 — Core data model | ✅ Complete, plus a migration script family (`refresh:item-master`, `refresh:location-master`, `refresh:warehouses`, `repair:inbound-lines`, `reconcile:inbound`, `reconcile:inventory`, `reconcile:pallets`) |
| 2 — UI dialogs | ✅ Complete |
| 3 — Intelligence engine | ✅ Complete, with **173 unit tests** across 18 files |
| 4 — Integration | ✅ Complete for the web. **RF gun is ~40% complete.** |
| 5 — Analytics & Admin | ⚠️ **Mostly missing** — see §5.7 |

### 2.8 Section 8 — Backward Compatibility (✅ delivered, exceeded)

Every new field is optional with a sensible default; five migration/reconciliation scripts exist; a `Data Integrity` screen detects and repairs drift automatically.

---

## 3. Verified Defects

These were reproduced against the running code, not inferred.

### D1 — 🔴 The `on_dock` state is unreachable (reverts to `arrived`)

The container status and the work order status are two vocabularies linked by a bidirectional map. `arrived` and `on_dock` **both** map to the work order status `at_dock`, which maps back to `arrived`:

```
container "arrived" -> WO "at_dock" -> container "arrived"  ✓
container "on_dock" -> WO "at_dock" -> container "arrived"  ✗ REVERTS
container "putaway" -> WO "unloading" -> container "putaway" ✓
container "received" -> WO "received" -> container "received" ✓
```

**Impact:** clicking **"Move to On-Dock"** leaves the container showing `arrived`. The **"Start Putaway"** button (which renders only when `status === "on_dock"`) is therefore **unreachable** from the Inbound screen. The `on_dock` state is only ever entered as a side-effect of a pallet build. The operator is effectively unable to park a container on the dock.

**Fix:** the inbound→WO map needs a distinct work order status for `on_dock` (e.g. add `on_dock` to `WorkOrderStatus`), or the sync must not write the status back when the transition originated from the container screen.

### D2 — 🔴 Storage billing is entirely dead code

- `startBillingScheduler()` is referenced **only** in its own file and the barrel export — it is **never called**.
- `runVolumetricSnapshots()` is called only by that never-started scheduler.
- `buildVolumetricStorageLines` is imported into `billing.tsx` and **never used**; `enforceMinimum` likewise.
- **No runtime Storage capture path exists.** `maybeCaptureBillableEvent` is only ever invoked with `type: "Inbound"` or `"Outbound"`. The only Storage billable events are two seeded mock rows.
- **Unit mismatch:** the seeded volumetric rules use `unit: "location"`, but the engine filters on `unit: "cubicFeet"`. A seeded rule can never be picked up.
- **Frequency gating is broken:** `runVolumetricSnapshots` calls `isDue(rule.frequency, rule.customCycleDays)` without the `lastRun` argument, so `lastRun` is always `undefined` and *every* rule is always due.
- `minMonthlyCharge` and `peakSurchargePct` exist **only on Storage rules** (r19, r20) — so the auto-billing engine, which filters `category === "Inbound"`, can never exercise them.

**Impact:** clients are billed for receiving, palletising and putaway, but **never for storage** — the single largest recurring revenue line in a 3PL. Every client has storage rules that silently do nothing.

### D3 — 🔴 EDI 944 is never queued

`workorders.tsx:243` shows the toast *"Container closed - EDI 944 queued for transmission"*. Nothing is queued: no document is written, no collection is touched, no function is called. There is no `emit944` anywhere in the repo.

The `/edi` screen imports `ediLogs` **directly from the mock module** and renders a read-only table. Its **"Sync VAN"** and **"New connection"** buttons have **no `onClick` handler**. The one real outbound emitter, `emit945ForBol()`, writes into an in-memory array only.

**Impact:** the client is told their receipt advice was transmitted when it was not. For a 3PL this is a contractual problem, not just a missing feature.

### D4 — 🟠 No mistake-recovery path (the plan's central promise)

The plan specified five revert actions. **None exist as buttons.** The only backwards path is the Work Order status dropdown in "Edit WO", which is a side-effect of the bidirectional sync, not a designed feature — and per D1 it cannot reach `on_dock`.

There is also no way to un-close a container: once closed (receipt written, inventory created, invoice drafted) there is no reverse action.

### D5 — 🟠 Auto-billing can double-bill the carton receive

`captureBillableEventForInboundReceive` creates a billable event with `reference = shipmentId`. `autoBillContainer` then queries events by the **same** reference and creates a *second* carton event. The idempotency guard requires **all** prior events to be `billed`, which never happens for the capture-created events — so the whole run repeats and the carton receive is billed twice.

Separately, `invoice.number` is derived from the **live invoice count** at run time, so re-running changes the number on the same document.

### D6 — 🟠 Close report lacks the content the plan specified

The receipt is an HTML print view (no PDF library). It has a partial timeline (3 dates), an OSD section that is **always empty on the persisted receipt** (`osdQty`/`osdReason` are hard-coded to `0`/`""` at close), **no pallet summary** and **no billing summary** — the client-facing document does not show the invoice.

### D7 — 🟠 RF gun receives a count and nothing else

`/rf/receiving` captures **only a received unit count**. There is no condition code, no damage/OSD, no photo, no temperature, no lot/serial/expiry capture. The OSD model exists on the web but the RF gun — where most receiving actually happens — cannot use it. The plan's `requirePhotosForDamage` cannot exist at all: **there is no photo capability anywhere in the codebase.**

### D8 — 🟠 Offline queue drops the side effects of the operation it replays

`useOfflineSync` queues 4 operation types. But the queued payloads contain only the primary document change:
- offline **putaway** does not create the inventory batch or increment location occupancy
- offline **move** does not move the inventory batch or adjust occupancy
- offline **pick** does not deduct the batch or add the DROP001 batch
- **pallet creation has no offline branch at all** — it always goes to the network

The online paths do all of these. A warehouse that loses connectivity mid-receipt will end up with pallets on the floor and no inventory.

There is also **no conflict resolution** — last write wins, with no version check, no retry/backoff, no dead-letter and no user-facing "pending sync" indicator.

### D9 — 🟡 RF putaway does not apply the shared validation

`src/lib/putaway-validation.ts` checks location **warehouse** ownership and `location.status`. The RF screen does **not** call it — it only checks client ownership, and its `locations` map does not even capture `warehouseId`. So an RF operator can put away into another warehouse's slot.

### D10 — 🟡 Mark Arrived captures no timestamp

There is no `arrivedAt` on `InboundShipment`. `receivedAt` is written at *close* time, not arrival. The receipt's "Arrival Date" therefore shows the close time, and no dock-in time, seal time, unload start/end or driver signature is ever captured. **Unload duration cannot be measured**, so the productivity metrics the plan's close report timeline implies are not derivable.

### D11 — 🟡 The `exception` container state is unreachable

It appears in the type, the status styles and the Exceptions stat tile, but **no button writes it**. A damaged-ASN container has nowhere to go, so it either gets closed clean or sits in `arrived` forever.

### D12 — 🟡 Dead code and inert controls

- `inboundStatusTransitions` in `inbound.tsx` is declared and never used
- The **"Scan pallet"** button on the Palletization header has **no `onClick`** — it does nothing
- "Sync VAN" and "New connection" on the EDI screen have **no `onClick`**
- The **"AR VISION"** toggle on RF putaway/move renders three text lines; there is no AR runtime
- The `data-integrity.ts` header comment lists 12 checks; the registry has 18
- `buildVolumetricStorageLines`, `enforceMinimum` are imported in `billing.tsx` and never used
- `AuditLogTable` is defined in `billing.tsx` and **never rendered**
- `handleCloseContainer` in `workorders.tsx` was orphaned by the confirmation dialog and removed

### D13 — 🟡 RF receiving index arithmetic is inconsistent

`recordInboundShipment` is called with `line.lineNo` (1-based) while `recordInboundPalletBuild` is called with `lineIdx` (0-based array index). The online path **increments** `receivedQty`; the offline path **sets** it. The same receipt therefore means different things online and offline.

### D14 — 🟡 Field-level audit diff is defined but never written

`BillingAuditLog.changes?: Record<string, { before, after }>` and `buildAuditLogEntry()` exist, but **no caller ever passes `changes`** — the type is aspirational. The only before/after in the system is quantity-level (`qtyBefore`/`qtyAfter`).

Related: **charge rule create/update/delete write no audit entry at all.** Only invoice payment/credit/dispute actions are audited.

---

## 4. What We Built That the Plan Did Not Ask For

Worth recording, because these raise the bar for what "done" means:

| Addition | Why it matters |
|---|---|
| **18-check correlation engine** with 14 one-click repairs | The plan assumed good data. This *detects and heals* bad data. P1–P6, S1–S4, I1–I2, L1–L2, C1, A1–A2, M1. |
| **Client-aware putaway** | The plan's algorithm had no tenant dimension — which is precisely how acme's stock ended up in harborlite's slots at EWR. |
| **Receiving variance model** | Found-on-truck / good / damaged with a separate damage-hold pallet, required reason, and exclusion from sellable inventory. |
| **Close / depart confirmation** | Prevents irreversible actions on incomplete containers. |
| **Master-record enrichment + migration script family** | Six scripts to refresh/repair master and transactional data. |
| **Firestore array-merge discipline** | `dedupeBatches()` + `stripUndefinedDeep()` — the array-merge behaviour caused real duplication and crashes. |
| **Test suite: 173 tests / 18 files** | Every engine has regression cover. |
| **Print/email/CSV client receipt** with AZUX branding, signature blocks, variance section | |

---

## 5. Gap Analysis and Recommendations

### 5.1 Wave 1 — Close the functional gaps (2 weeks) — **do first**

| # | Item | Why now | Size |
|---|---|---|---|
| 1.1 | **Fix the `on_dock` status round trip** (D1) | The dock stage is currently unreachable. Either add `on_dock` to `WorkOrderStatus`, or make the container→WO→container sync non-destructive for the originating transition. | 0.5 d |
| 1.2 | **Make storage billing live** (D2) | Clients have storage rules that do nothing. Wire `startBillingScheduler` to a real trigger (or move it to a Cloud Function), fix the `cubicFeet` vs `location` unit mismatch, fix `isDue` to pass `lastRun`, and add a runtime Storage capture path. | 3 d |
| 1.3 | **Queue a real EDI 944** (D3) | The toast currently tells the client their advice was sent. Either implement an `ediOutbox` collection + emitter, or change the toast to say "Receipt advice **not** transmitted — EDI connection not configured". | 2 d |
| 1.4 | **Stop the double-bill** (D5) | Make the idempotency guard consider only the engine's own `evt-in-*` events, derive the invoice number from a stored sequence rather than a live count, and stop `captureBillableEventForInboundReceive` creating a competing event. | 1.5 d |
| 1.5 | **Apply the shared putaway validator on RF** (D9) | Reuse `validatePutawayTarget` in `/rf/putaway` — it already encodes the warehouse-ownership and status rules. | 0.5 d |
| 1.6 | **Audit charge-rule changes** (D14) | Rate changes are money changes and must be in the audit log. | 1 d |
| 1.7 | **Remove inert controls and dead code** (D12) | "Scan pallet", "Sync VAN", "New connection", the AR Vision stub and the unused imports all read as working features. | 1 d |

**Exit criteria:** every button either works or is removed; a container can be parked on the dock; storage invoices are generated; a client receipt advice is either queued or honestly reported as not sent.

### 5.2 Wave 2 — Mistake recovery, the plan's central promise (2.5 weeks)

This is the largest remaining gap and the one the user feels most.

| # | Item | Detail | Size |
|---|---|---|---|
| 2.1 | **Dedicated revert actions** | Buttons per the original plan: *Revert to Scheduled* (arrived→scheduled), *Pause Unload* (unloading→arrived), *Return to Unload* (putaway→unloading), *Reopen Putaway* (received→putaway, reason required), admin *Re-Open* (closed→received, reason required). Each writes a `REVERT` audit transaction with before/after. | 4 d |
| 2.2 | **Un-close a container** | Admin-only *Re-Open Closed Container*: reverses the close transaction, voids the receipt, reverses the inventory batches and marks the invoice void — with a mandatory reason and a full audit trail. | 3 d |
| 2.3 | **Arrival / unload timestamps** | Add `arrivedAt`, `arrivalDock`, `unloadStartAt`, `unloadEndAt`, `arrivalTemperatureC`, `driverName` to `InboundShipment`. The **Gate Check-In** modal (D10) becomes a real step, not just a status flip. | 3 d |
| 2.4 | **Reopen a pallet build** | "Return to Unload" must void the pallets of that line, restore `receivedQty` and clear the OSD — otherwise the pallets exist with no path back. | 2 d |
| 2.5 | **Reason-code catalogue** | Replace free-text correction reasons with a coded list (Damage, Short-ship, Over-ship, Wrong item, Lot mismatch, Data entry error, System) + free text. Feeds the audit trail and enables OSD analytics. | 1.5 d |

### 5.3 Wave 3 — RF gun completeness (3 weeks)

The RF gun is where most receiving physically happens, and it is currently the weakest part of the system.

| # | Item | Detail | Size |
|---|---|---|---|
| 3.1 | **RF: damage / condition capture** | Condition code, damaged qty, reason code, and *"hold in damage pallet"* on the RF receiving screen — matching the web build dialog so both paths produce the same data. | 4 d |
| 3.2 | **RF: Gate Check-In screen** | Trailer/seal/dock/temperature/photo capture. Closes the D10 gap and enables the arrival timeline. | 3 d |
| 3.3 | **RF: pallet build screen** | Standalone RF pallet build (today it is a step inside RF receiving). | 2 d |
| 3.4 | **RF: Corrections screen** | The plan's correction flow: select container → line → field → new value → reason. Today corrections are web-only. | 3 d |
| 3.5 | **RF: cycle count** | Bring the web `/counting` screen to RF. | 3 d |
| 3.6 | **Fix the offline queue** | Queue the *full* operation (inventory batch + location occupancy + pallet), not just the primary document. Add a pending-sync badge, retry with backoff, and a dead-letter list. | 5 d |
| 3.7 | **RF: putaway dashboard** | Batch mode: put away a run of pallets in one scan session. | 2 d |

### 5.4 Wave 4 — Close report, audit and client experience (2 weeks)

| # | Item | Detail | Size |
|---|---|---|---|
| 4.1 | **Real close report** | Persist the report as a document (PDF or HTML) at close, with the full timeline (schedule → arrival → unload start/end → palletise → putaway → close), the OSD summary, the **pallet summary** (ids, locations, cube, who/when) and the **billing summary** (charge lines + invoice ref). | 4 d |
| 4.2 | **Populate the receipt's OSD** | `saveInboundReceipt` hard-codes `osdQty: 0` / `osdReason: ""`. Carry the real variance. | 0.5 d |
| 4.3 | **Field-level audit diff** | Populate `BillingAuditLog.changes` on every correction (before/after per field). | 2 d |
| 4.4 | **Render the audit log** | `AuditLogTable` exists but is never rendered. Surface it on the invoice preview and in Systems → Masters. | 1 d |
| 4.5 | **Damage photos** | Storage + capture + display on the line, the receipt and the RF gun. Enables `requirePhotosForDamage`. | 4 d |
| 4.6 | **Email the receipt via API** | `mailto:` is not an email. Use a mail provider or an outbound email queue. | 2 d |
| 4.7 | **Exception state** | Make `exception` reachable: an "Raise Exception" action on a container with a reason, and a resolution path. | 1.5 d |

### 5.5 Wave 5 — Analytics & Admin (2 weeks) — the plan's Phase 5, mostly unbuilt

| # | Item | Detail | Size |
|---|---|---|---|
| 5.1 | **Nightly velocity recalculation** | Recompute `velocityMetrics` on every location and `velocity.annualPicks` per SKU from actual pick history. Currently seeded/static. | 3 d |
| 5.2 | **Slotting rule engine (admin)** | Cross-location rules (zone/velocity/weight rules that apply to many locations) rather than rules embedded per location. | 4 d |
| 5.3 | **Reusable pallet build templates** | `palletBuildTemplates` collection + a template picker in the Item Master, so a standard apparel or C-store pallet pattern is reused rather than re-keyed. | 2 d |
| 5.4 | **Putaway suggestion cache** | Optional — computing live is currently fine at this scale. Only worth it if suggestion latency becomes visible. | 1 d |
| 5.5 | **Reports** | Pallet utilisation, location velocity, substitution usage, OSD analysis, labour vs. plan. The plan named these; none exist. | 4 d |
| 5.6 | **Configurable admin parameters** | The plan's §10 table (`allowMixedSkuPallets`, `requirePhotosForDamage`, `osdAcceptanceRequired`, `autoGeneratePalletIds`, `palletMaxHeightIn`, `palletMaxWeightLbs`, `putawayAlgorithm`, `billingTrigger`, `requireReasonForRevert`) — **none of these exist as configuration**. They are hard-coded. | 3 d |
| 5.7 | **Putaway algorithm selection** | `zone_cluster` / `nearest_empty` / `manual` — the engine has no manual mode and no operator preference. | 2 d |

### 5.6 Sequence diagram for Wave 1 (the three red items)

```
D1  Status sync fix
    inbound.tsx  handleInboundStatusTransition
    firestore-data.ts  woStatusMap / mapWoStatusToInboundStatus
    → add "on_dock" to WorkOrderStatus, or make the sync non-destructive
    → test: every inbound status survives the round trip

D2  Storage billing
    billing-scheduler.ts  start it; fix isDue(lastRun); fix unit mismatch
    billing-engine.ts     add a Storage capture path (daily snapshot per pallet)
    billing.tsx           surface accruals + the generated invoice
    → test: a pallet in a location accrues daily storage and appears on the invoice

D3  EDI 944
    edi-data.ts           add emit944ForShipment()
    firestore-data.ts     write to an ediOutbox collection
    edi.tsx               read the outbox; give "Sync VAN" a real handler
    → test: closing a container writes one outbox record; the toast is truthful
```

---

## 6. Decisions Needed From You

| # | Question | Why it blocks |
|---|---|---|
| 1 | Should the **Work Order status vocabulary** gain an `on_dock` state, or should the container↔WO status sync be made **one-directional** (container drives WO, never the reverse)? | Fixing D1. One-directional is simpler and removes a whole class of sync bugs, but loses the WO screen's ability to drive the container. |
| 2 | Is **storage billing** in scope now, or is it deferred to a billing phase? It is the largest revenue line and it is currently non-functional. | Wave 1.2 |
| 3 | Is **EDI 944** a hard customer commitment, or a "best effort when the partner is connected" feature? This decides whether we build a real outbox + VAN integration or a clear "not configured" state. | Wave 1.3 |
| 4 | **Photo capture** — do we need it for compliance, or is the reason code enough? It changes the wave 3/4 sequencing. | Waves 3.1 / 4.5 |
| 5 | Should the **RF gun** be the primary receiving device (then Wave 3 comes before Wave 2), or a secondary device? | Wave order |
| 6 | Do we need **multi-site / multi-tenant warehouse assignment** (a location owned by more than one client), or is client-exclusive correct? | Affects the putaway rules, the location master and the integrity checks. |
| 7 | Which **reason codes** should be standard, and who maintains them? | Wave 2.5, and OSD analytics depend on it. |

---

## 7. Summary of Recommendations

1. **Ship Wave 1 immediately.** Three red items — an unreachable dock state, dead storage billing and a false EDI promise — are the ones that would embarrass us in front of a client. Roughly 9 working days.
2. **Do Wave 2 next.** Mistake recovery was the original plan's central promise and it is entirely absent. The system is currently unforgiving of operator error, which is the opposite of what a 3PL should be.
3. **Treat the RF gun as a first-class citizen, not an accessory.** It is where the work physically happens, and it currently cannot record damage, conditions, lots or photos.
4. **Make the close report a real artifact.** It is the customer-facing document of a receipt and it currently has no pallet detail, no billing detail and always-empty OSD.
5. **Do not build the three unbuilt collections** (`palletBuildTemplates` is worth it, `slottingRules` and `putawaySuggestions` are not) — but **do** build the admin configuration table from §5.5 item 5.6, because hard-coded behaviour is what makes a multi-client 3PL operationally risky.
6. **Keep the current discipline.** Firestore-only persistence, the correlation engine and the 173-test suite are the reason the system is in this good shape. Any Wave 1–5 work should preserve them.

---

*Prepared from a full read of the inbound domain: `src/routes/inbound.tsx`, `workorders.tsx`, `pallets.tsx`, `inventory.tsx`, `masters.tsx`, `billing.tsx`, `slotting.tsx`, `src/routes/rf/*`, and `src/lib/{inbound-data, firestore-data, pallet-data, pallet-build-engine, putaway-engine, putaway-validation, auto-billing, billing-engine, billing-scheduler, data-integrity, allocation-engine, slotting-engine, offline-sync}.ts(x)`. No source files were modified in producing this review.*
