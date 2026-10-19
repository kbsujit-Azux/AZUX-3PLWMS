# Item Master & Location Master Enhancement Plan

## Overview
Enhance both masters to support:
1. **Intelligent Pallet Build Recommendations** (dimension/weight/constraint-based)
2. **Directed Putaway Recommendations** (slotting algorithm + velocity)
3. **Apparel Industry Support** (Style/Color/Size/Dim matrix)
4. **GTIN Hierarchy** (Parent/Child with different pack sizes)
5. **Multi-Pack Scenarios** (Inner pack, Master pack, Pallet pack)

---

## Current State Analysis

### ItemMasterRecord (Current - 40 fields)
**Strengths**: Dimensions, weight, caseQty, cbmPerCase, lot/expiry/serial control, temp requirements
**Gaps**: 
- No GTIN hierarchy (parent/child)
- No Style/Color/Size attributes for apparel
- No inner/master pack definitions
- No pallet build constraints (max height, weight, stackability)
- No velocity/ABC classification
- No substitute/alternate SKUs
- No kitting/BOM support

### LocationRecord (Current - 30 fields)
**Strengths**: Type, zone, capacity, pickable, allowedItemStyles, dimensions, temp control
**Gaps**:
- No velocity scoring (auto-calculated)
- No slotting rules/algorithms
- No storage class compatibility matrix
- No zone adjacency/affinity rules
- No putaway priority/sequence

---

## 1. Item Master Enhancements

### 1.1 GTIN Hierarchy (Parent/Child Pack Structure)
```typescript
interface GTINHierarchy {
  /** Parent GTIN (e.g., Case/Inner Pack GTIN-14) */
  parentGtin?: string;
  /** Child GTIN (e.g., Each/Unit GTIN-14) */
  childGtin?: string;
  /** Quantity of child units in parent pack */
  qtyPerParent: number;
  /** Pack level: 'each' | 'inner' | 'master' | 'pallet' */
  packLevel: 'each' | 'inner' | 'master' | 'pallet';
  /** Dimensions at this pack level (inches) */
  packLengthIn?: number;
  packWidthIn?: number;
  packHeightIn?: number;
  /** Weight at this pack level (lbs) */
  packWeightLbs?: number;
  /** Is this the base sellable unit? */
  isBaseUnit: boolean;
}
```

**Two-Pack Scenario Example**:
```
Parent GTIN (Case): 10812345000012  → 24 units/case, 18×12×10 in, 25 lbs
  └─ Child GTIN (Each): 00812345000015  → 1 unit/each, 3×2×1 in, 1 lb
  
Parent GTIN (Master): 20812345000019  → 4 cases/master, 36×24×22 in, 105 lbs
  └─ Child GTIN (Case): 10812345000012  → 24 units/case
```

### 1.2 Apparel Attribute Matrix (Style/Color/Size)
```typescript
interface ApparelAttributes {
  /** Style identifier (e.g., "HOODIE-PULLOVER") */
  style: string;
  /** Color code + name (e.g., "BLK-Black", "NVY-Navy") */
  color: { code: string; name: string };
  /** Size code + dimension overrides */
  size: { 
    code: string;           // S, M, L, XL, 2XL
    lengthIn?: number;      // Override base dimensions
    widthIn?: number;
    heightIn?: number;
    weightLbs?: number;
  };
  /** Fit type: regular, slim, relaxed, oversized */
  fit?: 'regular' | 'slim' | 'relaxed' | 'oversized';
  /** Fabric composition for storage requirements */
  fabric?: { 
    primary: string;        // cotton, polyester, blend
    pct: number;
    careCode?: string;      // wash/dry instructions
  };
  /** Season: Spring, Summer, Fall, Winter, Core */
  season?: string;
  /** Gender: Mens, Womens, Unisex, Kids */
  gender?: string;
}
```

**SKU Pattern**: `{Style}-{Color}-{Size}` → `HOODIE-BLK-M`

### 1.3 Pallet Build Intelligence
```typescript
interface PalletBuildConfig {
  /** Max pallet height (inches) - warehouse default 60" */
  maxPalletHeightIn: number;
  /** Max pallet weight (lbs) - warehouse default 2500 */
  maxPalletWeightLbs: number;
  /** Max cases per layer (auto-calc from dims) */
  maxCasesPerLayer?: number;
  /** Max layers per pallet */
  maxLayers?: number;
  /** Stackability: 'full' | 'limited' | 'non-stackable' | 'crushable' */
  stackability: 'full' | 'limited' | 'non-stackable' | 'crushable';
  /** Max stack height for limited stackability (inches) */
  maxStackHeightIn?: number;
  /** Pallet pattern: 'column' | 'interlock' | 'brick' | 'pinwheel' */
  palletPattern: 'column' | 'interlock' | 'brick' | 'pinwheel';
  /** Allow mixed SKU on pallet */
  allowMixedSku: boolean;
  /** Allowed mixed SKU families (by itemStyle) */
  mixedSkuStyles?: string[];
  /** Overhang allowed (inches) */
  overhangIn?: number;
  /** Pallet type: 'standard_48x40' | 'euro_48x32' | 'half_48x20' | 'custom' */
  palletType: 'standard_48x40' | 'euro_48x32' | 'half_48x20' | 'custom';
  /** Custom pallet dims if type=custom */
  customPalletDimsIn?: { l: number; w: number; h: number };
}
```

### 1.4 Velocity & Slotting Classification
```typescript
interface VelocityClassification {
  /** ABC classification: A (fast), B (medium), C (slow) */
  abcClass: 'A' | 'B' | 'C';
  /** Annual picks per year */
  annualPicks: number;
  /** Lines per order (avg) */
  linesPerOrder: number;
  /** Seasonal peak months (1-12) */
  peakMonths?: number[];
  /** Storage class: 'forward' | 'reserve' | 'bulk' | 'cold' | 'hazmat' */
  storageClass: 'forward' | 'reserve' | 'bulk' | 'cold' | 'hazmat';
  /** Replenishment trigger (days of supply) */
  reorderDays?: number;
}
```

### 1.5 Substitution & Alternates
```typescript
interface SubstitutionRule {
  /** Alternate SKU */
  alternateSku: string;
  /** Type: 'substitute' | 'upgrade' | 'downgrade' | 'equivalent' */
  type: 'substitute' | 'upgrade' | 'downgrade' | 'equivalent';
  /** Priority (1 = first choice) */
  priority: number;
  /** Condition: 'always' | 'stockout' | 'customer_request' */
  condition: 'always' | 'stockout' | 'customer_request';
  /** Cost impact % */
  costImpactPct?: number;
}
```

### 1.6 Complete Enhanced ItemMasterRecord
```typescript
export type ItemMasterRecord = {
  // ─── Core Identity ────────────────────────────────────────────────
  sku: string;
  upc: string;                    // Base UPC/GTIN
  gtin?: string;                  // GS1 GTIN-14
  itemStyle: string;              // Grouping for pallet build
  description: string;
  category: string;
  uom: string;                    // EA, CS, PL, BX
  tenantId: string;
  
  // ─── Pack Hierarchy (NEW) ────────────────────────────────────────
  packHierarchy: GTINHierarchy[]; // Parent/child pack levels
  basePackLevel: 'each' | 'inner' | 'master'; // Which level is stocked
  caseQty: number;                // Units per case (at base pack level)
  innerPackQty?: number;          // Units per inner pack
  masterPackQty?: number;         // Cases per master pack
  
  // ─── Apparel Attributes (NEW) ────────────────────────────────────
  apparelAttrs?: ApparelAttributes; // Null if not apparel
  
  // ─── Dimensions & Weight ─────────────────────────────────────────
  // At base pack level (each)
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
  
  // At case level (derived or override)
  caseLengthIn?: number;
  caseWidthIn?: number;
  caseHeightIn?: number;
  caseWeightLbs: number;
  cbmPerCase: number;
  
  // At master pack level
  masterLengthIn?: number;
  masterWidthIn?: number;
  masterHeightIn?: number;
  masterWeightLbs?: number;
  masterCbm?: number;
  
  // ─── Pallet Build Intelligence (NEW) ─────────────────────────────
  palletBuild: PalletBuildConfig;
  
  // ─── Velocity & Slotting (NEW) ───────────────────────────────────
  velocity?: VelocityClassification;
  
  // ─── Substitutions (NEW) ─────────────────────────────────────────
  substitutions?: SubstitutionRule[];
  
  // ─── Existing Fields ─────────────────────────────────────────────
  unitCost: number;
  unitPrice: number;
  nmfc: string;
  freightClass: string;
  lotControl: boolean;
  expiryControl: boolean;
  serialControl: boolean;
  shelfLifeDays?: number;
  storageTempMin?: number;
  storageTempMax?: number;
  storageTempUnit?: 'F' | 'C';
  hazmat: boolean;
  active: boolean;
  source: 'EDI_832' | 'CSV' | 'MANUAL';
  effectiveAt: string;
  
  // ─── Compliance ──────────────────────────────────────────────────
  gtin?: string;                    // GS1 GTIN-14
  countryOfOrigin?: string;
  harmonizedCode?: string;          // HS/HTS code
  brand?: string;
  manufacturer?: string;
  manufacturerSku?: string;
};
```

---

## 2. Location Master Enhancements

### 2.1 Slotting Intelligence
```typescript
interface SlottingRules {
  /** Storage class compatibility: which item storage classes can go here */
  allowedStorageClasses: ('forward' | 'reserve' | 'bulk' | 'cold' | 'hazmat')[];
  /** Required item attributes for this location */
  requiredItemAttrs?: {
    hazmatAllowed?: boolean;
    tempControlled?: boolean;
    tempMin?: number;
    tempMax?: number;
    maxWeightLbs?: number;
    maxDimIn?: { l: number; w: number; h: number };
    abcClass?: ('A' | 'B' | 'C')[];
  };
  /** Adjacent zone affinity (for putaway sequencing) */
  adjacentZones?: string[];
  /** Putaway sequence priority (lower = first) */
  putawayPriority: number;
  /** Replenishment priority */
  replenPriority: number;
  /** Allowed pallet types */
  allowedPalletTypes: ('standard_48x40' | 'euro_48x32' | 'half_48x20')[];
}
```

### 2.2 Dynamic Velocity Scoring
```typescript
interface VelocityMetrics {
  /** Auto-calculated: picks per day (30-day rolling) */
  picksPerDay: number;
  /** Auto-calculated: lines per day */
  linesPerDay: number;
  /** Auto-calculated: cubic velocity (cuft picked/day) */
  cubicVelocity: number;
  /** Last updated timestamp */
  lastCalculated: string;
  /** Manual override flag */
  manualOverride: boolean;
}
```

### 2.3 Zone Adjacency & Travel Distance
```typescript
interface ZoneAdjacency {
  /** Adjacent zones with travel time (seconds) */
  adjacent: { zone: string; travelTimeSec: number }[];
  /** Distance to shipping dock (seconds) */
  toShippingDockSec: number;
  /** Distance to receiving dock (seconds) */
  toReceivingDockSec: number;
}
```

### 2.4 Complete Enhanced LocationRecord
```typescript
export type LocationRecord = {
  // ─── Core Identity ────────────────────────────────────────────────
  id: string;
  warehouseId: string;
  tenantId?: string;
  type: LocationType;              // FLR | DROP | RACK
  zone: string;
  capacityPallets: number;
  occupiedPallets: number;
  pickable: boolean;
  allowedItemStyles: string[] | null;
  notes?: string;
  
  // ─── Dimensions ──────────────────────────────────────────────────
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  cubicFeet?: number;
  
  // ─── Slotting Intelligence (NEW) ─────────────────────────────────
  slottingRules: SlottingRules;
  velocityMetrics?: VelocityMetrics;
  zoneAdjacency?: ZoneAdjacency;
  
  // ─── Existing Enhanced Fields ────────────────────────────────────
  zoneType?: 'forward_pick' | 'reserve' | 'staging' | 'hazmat' | 'cold';
  velocityScore?: number;           // Legacy - replaced by velocityMetrics
  recommendedSku?: string;
  hazmatAllowed?: boolean;
  tempControlled?: boolean;
  tempMin?: number;
  tempMax?: number;
  
  // ─── New Operational Fields ──────────────────────────────────────
  /** Location status */
  status: 'active' | 'maintenance' | 'damaged' | 'quarantine' | 'retired';
  /** Last cycle count date */
  lastCycleCount?: string;
  /** Cycle count frequency (days) */
  cycleCountFreqDays?: number;
  /** Assigned putaway sequence group */
  putawaySequence?: number;
  /** Maximum weight per pallet position (lbs) */
  maxPalletWeightLbs?: number;
  /** Maximum height per pallet (inches) */
  maxPalletHeightIn?: number;
  /** Sprinkler/clearance height (inches) */
  clearanceHeightIn?: number;
};
```

---

## 3. Database Collections (Firestore)

### New Collections
```
itemMaster/                    (existing - enhanced)
  {sku}/
    packHierarchy[]           // GTIN parent/child
    apparelAttrs              // Style/Color/Size
    palletBuild               // Pallet build config
    velocity                  // ABC, picks/year
    substitutions[]           // Alternate SKUs

locationMaster/               (existing - enhanced)
  {locationId}/
    slottingRules             // Storage class compatibility
    velocityMetrics           // Auto-calculated
    zoneAdjacency             // Travel distances

palletBuildTemplates/         (NEW - reusable templates)
  {templateId}/
    name: string
    config: PalletBuildConfig
    applicableStyles: string[]

slottingRules/                (NEW - rule engine)
  {ruleId}/
    name: string
    condition: SlottingCondition
    action: SlottingAction
    priority: number
    active: boolean

putawaySuggestions/           (NEW - cache for performance)
  {containerId}/
    palletId: string
    sku: string
    suggestedLocations: { locationId: string; score: number; reason: string }[]
    generatedAt: string
```

---

## 4. UI Screens to Add/Modify

### 4.1 Item Master - Enhanced Add/Edit Dialog
**Tabs**:
1. **Core** - SKU, UPC, GTIN, Description, Category, Tenant
2. **Pack Hierarchy** - GTIN tree (parent/child), pack quantities
3. **Apparel** - Style/Color/Size matrix (conditional)
4. **Dimensions** - Each/Case/Master dims & weights
5. **Pallet Build** - Stackability, pattern, max height/weight, pallet type
4. **Velocity** - ABC class, annual picks, storage class
5. **Substitutions** - Alternate SKU rules
6. **Compliance** - NMFC, freight class, HS code, country of origin

### 4.2 Location Master - Enhanced Add/Edit Dialog
**Tabs**:
1. **Core** - ID, Warehouse, Type, Zone, Tenant, Capacity
2. **Dimensions** - L/W/H (ft), cubic ft, clearance
3. **Slotting Rules** - Storage classes, ABC classes, weight/dim limits
4. **Adjacency** - Travel times to adjacent zones, docks
5. **Environment** - Temp control, hazmat, sprinkler
6. **Velocity** - View-only metrics (auto-calculated)

### 4.3 Pallet Build Wizard (Enhanced)
- Auto-recommendation based on item master palletBuild config
- Visual pallet pattern preview (column/interlock/brick)
- Mixed SKU validation
- Weight/height compliance check

### 4.4 Putaway Dashboard (Enhanced)
- Scored location suggestions with reasons
- "Best Fit" vs "Nearest Empty" vs "Zone Cluster" algorithms
- Bulk assign with drag-drop
- RF gun scan flow integration

---

## 5. Algorithms

### 5.1 Pallet Build Recommendation
```
Input: SKU (with palletBuild config), Qty to palletize, Warehouse pallet type
Output: Recommended pallets, cases per layer, layers, pattern

Algorithm:
1. Get pallet dimensions (from type or custom)
2. Get case dimensions (from item master)
3. Calculate cases per layer for each pattern (column, interlock, brick)
4. For each pattern:
   - layers = ceil(qty / casesPerLayer)
   - height = layers * caseHeight
   - weight = qty * caseWeight
   - Check: height <= maxPalletHeightIn, weight <= maxPalletWeightLbs
5. Score patterns: prefer interlock > brick > column for stability
6. Return best valid pattern with pallet count
```

### 5.2 Directed Putaway Recommendation
```
Input: Pallet (sku, qty, dims, weight, storageClass, abcClass)
Output: Ranked location suggestions with scores

Algorithm:
1. Filter locations: pickable, capacity>0, allowedStorageClasses matches
2. For each candidate location, calculate score:
   - Velocity match: A items → forward_pick, C items → reserve (weight: 30%)
   - Zone affinity: Same zone as existing same-SKU inventory (weight: 25%)
   - Travel distance: Nearest to shipping for A, nearest to receiving for putaway (weight: 20%)
   - Space utilization: Best fit (least wasted space) (weight: 15%)
   - Constraints: Weight/dim/hazmat/temp compliance (pass/fail)
3. Rank by score descending
4. Return top 5 with reason codes
```

### 5.3 GTIN Pack Conversion
```
Input: Quantity at any pack level, target pack level
Output: Converted quantity

Algorithm:
1. Build conversion graph from packHierarchy
2. Find path from source pack level to target pack level
3. Multiply/divide by qtyPerParent along path
4. Return converted quantity with unit label
```

---

## 6. CSV/EDI Import Mapping (Extended)

### Item Master CSV Columns (Extended)
| Column | Field | Required | Notes |
|--------|-------|----------|-------|
| SKU | sku | ✅ | |
| UPC | upc | ✅ | Base GTIN |
| GTIN | gtin | | GS1-14 |
| Parent GTIN | packHierarchy[].parentGtin | | For hierarchy |
| Child GTIN | packHierarchy[].childGtin | | For hierarchy |
| Pack Level | packHierarchy[].packLevel | | each/inner/master/pallet |
| Qty Per Parent | packHierarchy[].qtyPerParent | | |
| Style | apparelAttrs.style | | Apparel only |
| Color Code | apparelAttrs.color.code | | Apparel only |
| Color Name | apparelAttrs.color.name | | Apparel only |
| Size Code | apparelAttrs.size.code | | Apparel only |
| Size Length | apparelAttrs.size.lengthIn | | Override |
| Size Width | apparelAttrs.size.widthIn | | Override |
| Size Height | apparelAttrs.size.heightIn | | Override |
| Fit | apparelAttrs.fit | | regular/slim/relaxed/oversized |
| Case Qty | caseQty | ✅ | Units per case |
| Inner Pack Qty | innerPackQty | | Units per inner |
| Master Pack Qty | masterPackQty | | Cases per master |
| Length (in) | lengthIn | ✅ | Each dims |
| Width (in) | widthIn | ✅ | |
| Height (in) | heightIn | ✅ | |
| Weight (lbs) | weightLbs | ✅ | Each weight |
| Case Length | caseLengthIn | | Case dims |
| Case Width | caseWidthIn | | |
| Case Height | caseHeightIn | | |
| Case Weight | caseWeightLbs | | |
| Max Pallet Height | palletBuild.maxPalletHeightIn | | Default 60 |
| Max Pallet Weight | palletBuild.maxPalletWeightLbs | | Default 2500 |
| Stackability | palletBuild.stackability | | full/limited/non-stackable/crushable |
| Pallet Pattern | palletBuild.palletPattern | | column/interlock/brick/pinwheel |
| Allow Mixed SKU | palletBuild.allowMixedSku | | true/false |
| ABC Class | velocity.abcClass | | A/B/C |
| Annual Picks | velocity.annualPicks | | |
| Storage Class | velocity.storageClass | | forward/reserve/bulk/cold/hazmat |
| Substitute SKU | substitutions[].alternateSku | | |
| Sub Type | substitutions[].type | | substitute/upgrade/downgrade/equivalent |

---

## 7. Implementation Phases

### Phase 1: Core Data Model (Week 1)
- [ ] Extend ItemMasterRecord with packHierarchy, apparelAttrs, palletBuild, velocity, substitutions
- [ ] Extend LocationRecord with slottingRules, velocityMetrics, zoneAdjacency
- [ ] Update Firestore CRUD (addItemToMaster, updateItemInMaster, etc.)
- [ ] Migration script for existing data

### Phase 2: UI Dialogs (Week 1-2)
- [ ] Enhanced Item Master Add/Edit dialog (6 tabs)
- [ ] Enhanced Location Master Add/Edit dialog (6 tabs)
- [ ] GTIN hierarchy visual editor
- [ ] Apparel attribute matrix editor

### Phase 3: Intelligence Engine (Week 2)
- [ ] PalletBuildEngine class with pattern calculations
- [ ] PutawayEngine with scoring algorithm
- [ ] GTIN conversion utilities
- [ ] Unit tests for all algorithms

### Phase 4: Integration (Week 2-3)
- [ ] Pallet Build Wizard uses PalletBuildEngine
- [ ] Putaway Dashboard uses PutawayEngine
- [ ] CSV import maps new columns
- [ ] RF Gun screens use new fields

### Phase 5: Analytics & Admin (Week 3)
- [ ] Velocity recalculation job (nightly)
- [ ] Slotting rule engine UI
- [ ] Putaway suggestion cache
- [ ] Reports: pallet utilization, location velocity, substitution usage

---

## 8. Backward Compatibility

- All new fields optional with sensible defaults
- Existing CSV imports work (new columns ignored)
- Existing UI still functional (progressive enhancement)
- Migration: populate new fields from existing data where possible

---

## 9. Approval Items

Before implementation, confirm:
- [ ] GTIN hierarchy depth needed (2-level or 3-level: each/inner/master/pallet)
- [ ] Apparel attributes: any additional (fabric, care, season)?
- [ ] Pallet patterns: need custom pattern builder or 4 presets sufficient?
- [ ] Velocity recalculation frequency: nightly / weekly / manual?
- [ ] Substitution rules: customer-facing or internal only?
- [ ] Slotting rules: rule engine UI or config-only?
- [ ] CSV template: provide updated template for customer onboarding?

---

**File**: `ITEM_LOCATION_MASTER_ENHANCEMENT_PLAN.md` — review and we'll prioritize implementation phases.