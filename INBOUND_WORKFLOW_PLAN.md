# AZUX 3PL WMS - Inbound Workflow Detailed Plan

## Overview
This document outlines the complete inbound workflow from **Scheduled** → **Close**, including all states, actions, UI requirements, and business rules. Designed for zero-error receiving with easy correction capabilities.

---

## 1. Container State Machine

### States & Transitions
```
SCHEDULED ──(Mark Arrived)──► ARRIVED ──(Start Unload)──► UNLOADING ──(Build Pallets)──► PUTAWAY ──(Complete)──► RECEIVED ──(Final Close + OSD)──► CLOSED
     │                          │             │                  │            │                  │
     ▼                          ▼             ▼                  ▼            ▼                  ▼
  [Revert]                   [Revert]     [Revert]           [Revert]     [Revert]           [Re-Open Admin]
```

### State Definitions
| State | Description | Who Can Edit | Who Can Delete |
|-------|-------------|--------------|----------------|
| **SCHEDULED** | Container scheduled, not yet at dock | ✅ All | ✅ All |
| **ARRIVED** | Trailer at dock, check-in complete | ✅ All | ✅ All |
| **UNLOADING** | Active unload in progress | ✅ All | ❌ No |
| **PUTAWAY** | Pallets built, awaiting location assignment | ✅ All | ❌ No |
| **RECEIVED** | All putaway complete, ready for OSD | ✅ All | ❌ No |
| **CLOSED** | OSD accepted, billing generated | ❌ Admin only | ❌ Admin only |

### Revert Actions (Mistake Recovery)
- **ARRIVED → SCHEDULED**: "Revert to Scheduled" button (clears arrival timestamp)
- **UNLOADING → ARRIVED**: "Pause Unload" button
- **PUTAWAY → UNLOADING**: "Return to Unload" button
- **RECEIVED → PUTAWAY**: "Reopen Putaway" button (requires reason)
- **CLOSED → RECEIVED**: Admin-only "Re-Open" with audit log

---

## 2. UI Button Visibility Rules

### Inbound Screen Buttons by State
| State | Edit Container | Delete Container | Mark Arrived | Revert to Scheduled | Start Unload | Build Pallets | Putaway | Final Close |
|-------|---------------|------------------|--------------|---------------------|--------------|---------------|---------|-------------|
| SCHEDULED | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ARRIVED | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| UNLOADING | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| PUTAWAY | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| RECEIVED | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| CLOSED | ❌ | ❌ | ❌ | ❌ (Admin) | ❌ | ❌ | ❌ | ❌ |

### Work Order Screen Buttons by State
| State | Edit WO | Delete WO | Sync to Inbound |
|-------|---------|-----------|-----------------|
| SCHEDULED | ✅ | ✅ | ✅ |
| ARRIVED | ✅ | ✅ | ✅ |
| UNLOADING | ✅ | ❌ | ✅ |
| PUTAWAY | ✅ | ❌ | ✅ |
| RECEIVED | ✅ | ❌ | ✅ |
| CLOSED | ❌ | ❌ | ❌ |

---

## 3. Detailed Workflow Steps

### Step 1: SCHEDULED → ARRIVED (Gate Check-In)
**Trigger**: "Mark Arrived" button
**Actions**:
- Set `arrivalAt = now()`, `status = "arrived"`
- Auto-populate `yardInDate = now()`
- Create Work Order if not exists (same ID)
- Generate dock assignment suggestion
- Print/Email arrival notification

**UI**: Modal with:
- Dock assignment (dropdown from locationMaster type=DROP/DOCK)
- Trailer/Container verification
- Seal number verification
- Temperature check (if reefer)
- Photos upload (damage documentation)
- Driver check-in signature

**Revert**: "Revert to Scheduled" → clears arrivalAt, yardInDate, status=scheduled

---

### Step 2: ARRIVED → UNLOADING (Start Unload)
**Trigger**: "Start Unload" button
**Actions**:
- Set `status = "unloading"`, `unloadStartAt = now()`
- Initialize unload session (RF gun ready)
- Show line items with expected vs actual

**UI**: Unload Dashboard:
```
┌─────────────────────────────────────────────────────────────┐
│ Container: INB-20261018-7812  │  Status: UNLOADING          │
├─────────────────────────────────────────────────────────────┤
│ Line │ SKU          │ Expected Cartons │ Actual │ Variance │
│ 001  │ ACME-WIDGET  │ 50               │ 48     │ -2       │
│ 002  │ ACME-GADGET  │ 30               │ 30     │ 0        │
├─────────────────────────────────────────────────────────────┤
│ [Pause Unload]  [Complete Unload]  [Record Damage]          │
└─────────────────────────────────────────────────────────────┘
```

**Revert**: "Pause Unload" → status=arrived

---

### Step 3: UNLOADING → PUTAWAY (Build Pallets)
**Trigger**: "Build Pallets" button (after unload complete)
**Actions**:
- For each line item, show pallet build wizard
- Calculate optimal pallet configuration from carton dimensions
- Allow manual override

**UI**: Pallet Build Wizard (per line item)
```
┌─────────────────────────────────────────────────────────────┐
│ Build Pallets for ACME-WIDGET (50 cartons received)         │
├─────────────────────────────────────────────────────────────┤
│ Carton Dimensions: 12×10×8 in  │  Weight: 15 lbs           │
│ Pallet Max: 48×40×60 in        │  Max Weight: 2500 lbs     │
├─────────────────────────────────────────────────────────────┤
│ Auto-Calc: 10 cartons/pallet × 5 pallets = 50 cartons       │
│ ──────────────────────────────────────────────────────────  │
│ Pallets to Build: [ 5 ]  ▼  (editable)                     │
│ Cartons per Pallet: [ 10 ] ▼  (editable)                   │
│ ──────────────────────────────────────────────────────────  │
│ Pallet IDs:  [AUTO]  or  Manual: PAL-001, PAL-002...       │
│ ──────────────────────────────────────────────────────────  │
│ [Generate Pallets]  [Save & Continue]  [Back to Unload]     │
└─────────────────────────────────────────────────────────────┘
```

**Business Rules**:
- Auto-calc from item master dimensions (cbmPerCase, caseQty)
- Respect pallet max height/weight from warehouse config
- Generate sequential pallet IDs: `{containerId}-P{seq}`
- Track: palletId, sku, cartons, qty, location (null), status="built"

**Revert**: "Return to Unload" → pallets marked "void", status=unloading

---

### Step 4: PUTAWAY (Location Assignment)
**Trigger**: "Putaway" button (after pallets built)
**Actions**:
- Show all built pallets awaiting location
- Suggest optimal locations (putaway algorithm)
- Allow manual location entry or RF gun scan

**UI**: Putaway Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│ Putaway - 5 Pallets to Assign                               │
├─────────────────────────────────────────────────────────────┤
│ Pallet ID      │ SKU          │ Qty  │ Suggested Loc │ Act │
│ 7812-P001      │ ACME-WIDGET  │ 100  │ A12-03-B      │ [📷]│
│ 7812-P002      │ ACME-WIDGET  │ 100  │ A12-03-C      │ [📷]│
│ 7812-P003      │ ACME-GADGET  │ 150  │ B05-01-A      │ [📷]│
│ 7812-P004      │ ACME-GADGET  │ 150  │ B05-01-B      │ [📷]│
│ 7812-P005      │ ACME-GADGET  │ 150  │ B05-01-C      │ [📷]│
├─────────────────────────────────────────────────────────────┤
│ [Scan Location]  [Bulk Assign]  [Complete Putaway]         │
└─────────────────────────────────────────────────────────────┘
```

**Putaway Algorithm**:
1. Same SKU → adjacent locations (zone clustering)
2. Heavy items → floor level (FLR)
3. Fast movers → forward pick (DROP)
4. Respect location capacity & type (RACK/FLR/DROP)
5. Avoid mixed SKU in same location (unless configured)

**RF Gun Flow**:
```
[Scan Pallet] → [Scan Location] → [Confirm] → Next Pallet
```

**Revert**: "Reopen Putaway" → clears location, pallet status="built", status=unloading

---

### Step 5: RECEIVED (Putaway Complete)
**Trigger**: "Complete Putaway" (all pallets have locations)
**Actions**:
- Set `status = "received"`, `receivedAt = now()`, `yardLeaveDate = now()`
- Update inventory (add to inventoryItems)
- Generate preliminary OSD report

**UI**: OSD Review Screen
```
┌─────────────────────────────────────────────────────────────┐
│ OSD Report - INB-20261018-7812                              │
├─────────────────────────────────────────────────────────────┤
│ Line │ SKU          │ Expected │ Received │ Var │ Reason   │
│ 001  │ ACME-WIDGET  │ 500      │ 480      │ -20 │ Short    │
│ 002  │ ACME-GADGET  │ 300      │ 300      │ 0   │ OK       │
│ 003  │ ACME-GIZMO   │ 200      │ 205      │ +5  │ Over     │
│ 004  │ ACME-DOOHIC  │ 100      │ 95       │ -5  │ Damaged  │
├─────────────────────────────────────────────────────────────┤
│ Total Cartons Expected: 1100  │  Received: 1080  │ Var: -20 │
│ Total Pallets Built: 22       │  Put Away: 22    │         │
├─────────────────────────────────────────────────────────────┤
│ [Edit Variance]  [Add Damage Note]  [Accept OSD & Close]   │
└─────────────────────────────────────────────────────────────┘
```

**OSD Categories**:
- **Short**: Received < Expected
- **Over**: Received > Expected
- **Damaged**: Units damaged (photos required)
- **Wrong Item**: SKU mismatch
- **Missing Lot**: Lot number missing/mismatch

**Revert**: "Reopen Putaway" (requires reason code)

---

### Step 6: CLOSED (Final Close + Billing)
**Trigger**: "Accept OSD & Close" button
**Actions**:
1. Validate all pallets put away
2. Lock OSD (immutable)
3. Generate Close Report
4. Trigger Auto-Billing
5. Set `status = "closed"`, `closedAt = now()`
6. Send notifications (client, billing, warehouse)

**Close Report Contents**:
```
CONTAINER CLOSE REPORT
═══════════════════════════════════════════════════════
Container: INB-20261018-7812
ASN: ASN-554301 | PO: PO-12345
Client: ACME Corp | Warehouse: ATL1
═══════════════════════════════════════════════════════
Timeline:
  Scheduled: 2026-10-18 08:00
  Arrived:   2026-10-18 09:15 (Dock D03)
  Unload:    2026-10-18 09:30 - 11:45
  Palletize: 2026-10-18 12:00 - 13:15
  Putaway:   2026-10-18 13:30 - 14:45
  Closed:    2026-10-18 15:00
═══════════════════════════════════════════════════════
OSD Summary:
  Lines: 4 | Expected: 1,100 ctns | Received: 1,080 ctns
  Short: 20 ctns | Over: 5 ctns | Damaged: 5 ctns
  Net Variance: -1.36%
═══════════════════════════════════════════════════════
Pallet Summary:
  Built: 22 pallets | Put Away: 22 locations
  Locations Used: A12-03-B/C, B05-01-A/B/C
═══════════════════════════════════════════════════════
Billing Summary:
  Inbound Receiving: 1,080 ctns × $2.50 = $2,700.00
  Palletizing: 22 pallets × $8.00 = $176.00
  Putaway: 22 pallets × $5.00 = $110.00
  Storage (Day 1): 22 pallets × $0.42 = $9.24
  ─────────────────────────────────────────────────────
  SUBTOTAL: $2,995.24
  Tax (8.75%): $262.08
  TOTAL: $3,257.32
═══════════════════════════════════════════════════════
[Download PDF]  [Email to Client]  [View in Billing]
```

---

## 4. Auto-Billing Engine (Configuration-Driven)

### Billing Configuration Structure
```typescript
interface BillingRuleConfig {
  id: string;
  clientId: string;
  category: 'Inbound' | 'Storage' | 'Outbound' | 'ValueAdded';
  triggers: {
    event: 'container_received' | 'pallet_built' | 'putaway_complete' | 'storage_daily';
    conditions?: { sku?: string; warehouseId?: string; minCartons?: number };
  };
  calculation: {
    type: 'per_carton' | 'per_pallet' | 'per_cuft_month' | 'flat' | 'tiered';
    rate: number;
    ratePerCuFt?: number;
    tiers?: { minQty: number; maxQty: number | null; rate: number }[];
    minMonthlyCharge?: number;
    peakSurchargePct?: number;
    peakMonths?: number[];
  };
  billingFrequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
}
```

### Auto-Billing on Container Close
```typescript
async function generateContainerBilling(containerId: string): Promise<Invoice> {
  const container = await getInboundShipment(containerId);
  const workOrder = await getWorkOrder(container.workOrderId);
  const config = await getBillingConfig(container.tenantId);
  
  const lines: InvoiceLine[] = [];
  
  // 1. Receiving charge (per carton received)
  const receivingRule = config.find(r => r.triggers.event === 'container_received' && r.category === 'Inbound');
  if (receivingRule) {
    lines.push({
      description: `Inbound Receiving - ${container.ediRef}`,
      quantity: workOrder.totalCartonsReceived,
      rate: receivingRule.calculation.rate,
      total: workOrder.totalCartonsReceived * receivingRule.calculation.rate,
    });
  }
  
  // 2. Palletizing charge (per pallet built)
  const palletRule = config.find(r => r.triggers.event === 'pallet_built');
  if (palletRule) {
    lines.push({
      description: `Palletizing - ${container.ediRef}`,
      quantity: workOrder.totalPalletsBuilt,
      rate: palletRule.calculation.rate,
      total: workOrder.totalPalletsBuilt * palletRule.calculation.rate,
    });
  }
  
  // 3. Putaway charge (per pallet put away)
  const putawayRule = config.find(r => r.triggers.event === 'putaway_complete');
  if (putawayRule) {
    lines.push({
      description: `Putaway - ${container.ediRef}`,
      quantity: workOrder.totalPalletsPutAway,
      rate: putawayRule.calculation.rate,
      total: workOrder.totalPalletsPutAway * putawayRule.calculation.rate,
    });
  }
  
  // 4. Storage (Day 1 pro-rated)
  const storageRule = config.find(r => r.triggers.event === 'storage_daily' && r.category === 'Storage');
  if (storageRule && storageRule.calculation.type === 'per_cuft_month') {
    const cuft = workOrder.totalCuFt;
    const dailyRate = (storageRule.calculation.ratePerCuFt || 0) / 30;
    lines.push({
      description: `Storage (Day 1) - ${container.ediRef}`,
      quantity: cuft,
      rate: dailyRate,
      total: cuft * dailyRate,
    });
  }
  
  return createInvoice({ clientId: container.tenantId, lines, source: 'auto' });
}
```

---

## 5. Correction/Edit Capabilities (Zero-Error Design)

### Edit Points by Stage
| Stage | What Can Be Corrected | How |
|-------|----------------------|-----|
| **Scheduled** | All header fields, line quantities | Edit Container dialog |
| **Arrived** | Dock, seal, temperature, photos | Edit Container / Edit WO |
| **Unloading** | Actual quantities per line | Unload dashboard inline edit |
| **Pallet Build** | Pallet count, cartons/pallet, pallet IDs | Reopen pallet wizard |
| **Putaway** | Location assignments | Drag-drop or scan new location |
| **Received** | OSD quantities, damage notes | OSD review screen |
| **Closed** | **Admin only** - Re-open with audit trail | Admin "Re-Open" with reason |

### Audit Trail Requirements
Every correction logs:
- Field changed
- Old value → New value
- User ID + timestamp
- Reason code (required for post-received changes)
- Auto-notify: supervisor, client contact (configurable)

### RF Gun Correction Flow
```
[Menu] → [Corrections] → [Select Container] → [Select Line] → 
[Enter Corrected Qty] → [Select Reason] → [Confirm] → [Sync to WMS]
```

---

## 6. RF Gun Integration Points

### Required RF Gun Screens
| Screen | Trigger | Key Fields |
|--------|---------|------------|
| **Gate Check-In** | Arrival | Trailer, Seal, Dock, Temp, Photos |
| **Unload Scan** | Per carton/pallet | Location, SKU, Qty, Condition |
| **Pallet Build** | Per pallet | Pallet ID, SKU, Cartons, Weight |
| **Putaway Scan** | Per pallet | Pallet ID, Location, Confirm |
| **Cycle Count** | Ad-hoc | Location, SKU, Expected vs Actual |
| **Corrections** | Any time | Container, Line, Field, New Value, Reason |

---

## 7. Database Schema Additions

### New Collections/Fields
```typescript
// InboundShipment additions
interface InboundShipment {
  // ... existing
  unloadStartAt?: string;
  unloadEndAt?: string;
  palletsBuilt?: number;
  totalCartonsReceived?: number;
  osdAcceptedAt?: string;
  osdAcceptedBy?: string;
  closeReportUrl?: string;
  invoiceId?: string;
}

// Pallet tracking
interface PalletRecord {
  id: string;           // INB-20261018-7812-P001
  containerId: string;  // INB-20261018-7812
  sku: string;
  cartons: number;
  qty: number;
  weightLbs: number;
  locationId: string | null;
  status: 'built' | 'putaway' | 'void';
  builtAt: string;
  builtBy: string;
  putAwayAt?: string;
  putAwayBy?: string;
}

// OSD Record
interface OSDRecord {
  id: string;
  containerId: string;
  lineNo: number;
  sku: string;
  expected: number;
  received: number;
  variance: number;
  reason: 'short' | 'over' | 'damaged' | 'wrong_item' | 'lot_mismatch';
  notes: string;
  photos: string[];
  recordedAt: string;
  recordedBy: string;
  acceptedAt?: string;
  acceptedBy?: string;
}

// Billing Config
interface BillingConfig {
  id: string;
  clientId: string;
  rules: BillingRuleConfig[];
  version: number;
  effectiveDate: string;
  createdBy: string;
}
```

---

## 8. Implementation Priority

### Phase 1: Core State Machine (Week 1)
- [ ] Add revert buttons (ARRIVED→SCHEDULED, UNLOADING→ARRIVED, PUTAWAY→UNLOADING)
- [ ] Update button visibility rules in Inbound & WorkOrder screens
- [ ] Add audit trail logging for all state changes

### Phase 2: Pallet Build Wizard (Week 2)
- [ ] PalletBuildWizard component
- [ ] Auto-calc from item master dimensions
- [ ] PalletRecord collection in Firestore
- [ ] Pallet ID generation

### Phase 3: Putaway Dashboard (Week 2-3)
- [ ] Putaway dashboard with suggested locations
- [ ] RF gun putaway flow
- [ ] Location assignment persistence
- [ ] Bulk assign capability

### Phase 4: OSD & Close Report (Week 3)
- [ ] OSD review screen with variance editing
- [ ] Damage photo upload
- [ ] Close report PDF generation
- [ ] CloseReport collection

### Phase 5: Auto-Billing Engine (Week 3-4)
- [ ] BillingConfig collection + UI
- [ ] generateContainerBilling() function
- [ ] Invoice creation on close
- [ ] Configuration-driven rules engine

### Phase 6: RF Gun Screens (Week 4)
- [ ] Check-In, Unload, Pallet Build, Putaway, Corrections
- [ ] Offline sync capability

---

## 9. Testing Scenarios

### Happy Path
1. CSV upload → Scheduled → Arrived → Unloading → Build Pallets → Putaway → Received → Close
2. Verify billing generated correctly
3. Verify close report downloads

### Error Recovery
1. Mark Arrived → Revert to Scheduled → Re-arrive
2. Start Unload → Pause → Resume
3. Build Pallets → Return to Unload → Rebuild
4. Putaway → Reopen → Re-assign locations
5. Close → Admin Re-open → Correct OSD → Re-close

### Edge Cases
- Partial unload (some lines complete, others not)
- Mixed pallets (multiple SKUs per pallet - config option)
- Over-receipt (OSD over)
- Damaged goods (photos, disposition)
- Wrong SKU received
- Lot/serial number tracking

---

## 10. Configuration Parameters (Admin Configurable)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `allowMixedSkuPallets` | false | Allow multiple SKUs on one pallet |
| `requirePhotosForDamage` | true | Force photo upload for damaged goods |
| `osdAcceptanceRequired` | true | Must accept OSD before close |
| `autoGeneratePalletIds` | true | Sequential `{container}-P{seq}` |
| `palletMaxHeightIn` | 60 | Max pallet height for auto-calc |
| `palletMaxWeightLbs` | 2500 | Max pallet weight for auto-calc |
| `putawayAlgorithm` | 'zone_cluster' | zone_cluster / nearest_empty / manual |
| `billingTrigger` | 'on_close' | on_close / on_received / manual |
| `requireReasonForRevert` | true | Force reason code for post-arrival reverts |

---

## 11. Approval Checklist

Before implementation begins, confirm:
- [ ] State machine matches your operational flow
- [ ] Revert permissions align with your org structure
- [ ] Pallet build logic matches your warehouse standards
- [ ] Putaway algorithm preferences
- [ ] OSD categories cover your damage/shortage types
- [ ] Billing rules structure supports your rate cards
- [ ] RF gun workflow matches your device capabilities
- [ ] Audit trail meets compliance requirements

---

**Next Steps**: Review this plan, provide feedback on priorities, and we'll start with Phase 1 implementation.