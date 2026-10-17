# WorkOrder & Inbound Integration Implementation Plan

## Overview
Comprehensive changes to synchronize WorkOrder and Inbound screens, implement status workflow, EDI 944 generation, and automated billing.

## Phase 1: Data Model Updates

### 1.1 Update WorkOrder Type (`src/lib/inbound-data.ts`)
- Add editable fields: `vessel`, `voyageNumber`, `arrivalDate`, `departureDate`, `yardInDate`, `yardLeaveDate`
- Add `units` field (may be calculated from lines)

### 1.2 Update InboundShipment Type
- Ensure `workOrderId` is properly linked

## Phase 2: Bidirectional Sync

### 2.1 Sync Logic (`src/lib/firestore-data.ts`)
- Create `syncWorkOrderToInbound(workOrderId)` function
- Create `syncInboundToWorkOrder(inboundId)` function
- Use Firestore transactions for atomic updates

## Phase 3: Status Workflow

### 3.1 Updated Status Pipeline
```
Scheduled → Arrived → Work In Progress → Closed
```

### 3.2 Status Transitions
- Scheduled → Arrived: Gate appointment confirmed
- Arrived → Work In Progress: Unloading started (pallets being built)
- Work In Progress → Closed: All pallets built and putaway complete

## Phase 4: UI Updates

### 4.1 WorkOrder Screen Enhancements (`src/routes/workorders.tsx`)
- Add editable fields form
- Add status transition buttons
- Add carton calculation display

### 4.2 Inbound Screen Updates (`src/routes/inbound.tsx`)
- Show WorkOrder status in ShipmentCard
- Sync field changes bidirectionally

## Phase 5: EDI 944 Generation

### 5.1 Create EDI 944 Generator (`src/lib/edi-generator.ts`)
- Generate receipt advice document
- Include header info and line details
- Queue for transmission to trading partner

## Phase 6: Billing Automation

### 6.1 Charge Rules Enhancement
- Pallet charges
- Carton charges
- OSD (Out of Spec) charges

### 6.2 Create Invoice (`src/lib/billing-data.ts`)
- Auto-generate on container close
- Include carrier rate lookup

## Phase 7: Close Confirmation

### 7.1 Close Screen (`src/routes/close-confirmation.tsx`)
- Show expected vs received comparison
- Display reports (carton report, pallet report)
- Show billed amount summary
- OSD verification checklist

## Implementation Order
1. Data model updates
2. Status workflow
3. Sync mechanism
4. UI enhancements
5. EDI generation
6. Billing
7. Close confirmation

## Testing Requirements
- Unit tests for calculate functions
- Integration tests for sync
- End-to-end tests for status transitions