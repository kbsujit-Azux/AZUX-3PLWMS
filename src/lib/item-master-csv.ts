/**
 * ============================================================
 *  MODULE INDEX — Item Master CSV / EDI 832 Import Mapping
 * ============================================================
 *
 *  Purpose: Translate a vendor CSV (or EDI 832 export) into a fully
 *           populated ItemMasterRecord, including the enhanced fields:
 *           GTIN pack hierarchy, apparel attribute matrix, pallet
 *           build intelligence, velocity classification and
 *           substitution rules.
 *
 *  Key exports:
 *    • ITEM_MASTER_CSV_FIELDS   — the column contract (used by the UI)
 *    • ITEM_MASTER_CSV_HEADERS  — example headers for the template
 *    • buildItemFromRow()       — map one CSV row → ItemMasterRecord
 *    • parseItemMasterCsv()     — parse a whole file → records + errors
 *    • ITEM_MASTER_CSV_TEMPLATE — downloadable template
 *
 *  Column mapping is driven by the user's header mapping in the
 *  CsvUploader, so any header naming convention works.
 * ============================================================
 */

import type {
  ItemMasterRecord,
  GTINHierarchy,
  ApparelAttributes,
  PalletBuildConfig,
  VelocityClassification,
  SubstitutionRule,
  PackLevel,
} from "./master-data";

/* ───── Column contract ────────────────────────────────────────────── */

export type ItemMasterCsvField = {
  key: string;
  label: string;
  required?: boolean;
  group: "core" | "pack" | "apparel" | "dimensions" | "pallet" | "velocity" | "compliance";
};

/** Full column contract for the Item Master import */
export const ITEM_MASTER_CSV_FIELDS: ItemMasterCsvField[] = [
  // Core
  { key: "sku", label: "Vendor SKU (LIN03)", required: true, group: "core" },
  { key: "upc", label: "UPC / GTIN (LIN05)", required: true, group: "core" },
  { key: "gtin", label: "GTIN-14", group: "core" },
  { key: "itemStyle", label: "Item style", group: "core" },
  { key: "description", label: "Description (PID05)", required: true, group: "core" },
  { key: "uom", label: "Unit of measure", group: "core" },
  { key: "category", label: "Category", group: "core" },

  // Pack hierarchy
  { key: "parentGtin", label: "Parent GTIN", group: "pack" },
  { key: "childGtin", label: "Child GTIN", group: "pack" },
  { key: "packLevel", label: "Pack level (each/inner/master/pallet)", group: "pack" },
  { key: "qtyPerParent", label: "Qty per parent", group: "pack" },
  { key: "caseQty", label: "Case quantity (PO404)", required: true, group: "pack" },
  { key: "innerPackQty", label: "Inner pack qty", group: "pack" },
  { key: "masterPackQty", label: "Master pack qty", group: "pack" },

  // Apparel
  { key: "apparelStyle", label: "Apparel style", group: "apparel" },
  { key: "colorCode", label: "Color code", group: "apparel" },
  { key: "colorName", label: "Color name", group: "apparel" },
  { key: "sizeCode", label: "Size code", group: "apparel" },
  { key: "sizeLengthIn", label: "Size length (in)", group: "apparel" },
  { key: "sizeWidthIn", label: "Size width (in)", group: "apparel" },
  { key: "sizeHeightIn", label: "Size height (in)", group: "apparel" },
  { key: "fit", label: "Fit (regular/slim/relaxed/oversized)", group: "apparel" },
  { key: "fabricPrimary", label: "Fabric primary", group: "apparel" },
  { key: "fabricPct", label: "Fabric percentage", group: "apparel" },
  { key: "fabricCareCode", label: "Fabric care code", group: "apparel" },
  { key: "season", label: "Season", group: "apparel" },
  { key: "gender", label: "Gender", group: "apparel" },

  // Dimensions
  { key: "lengthIn", label: "Case length, in (MEA-LN)", required: true, group: "dimensions" },
  { key: "widthIn", label: "Case width, in (MEA-WD)", required: true, group: "dimensions" },
  { key: "heightIn", label: "Case height, in (MEA-HT)", required: true, group: "dimensions" },
  { key: "weightLbs", label: "Unit weight, lbs (MEA-G)", required: true, group: "dimensions" },
  { key: "caseWeightLbs", label: "Case weight, lbs (MEA-G)", group: "dimensions" },
  { key: "cbmPerCase", label: "CBM per case (MEA-CB)", group: "dimensions" },
  { key: "caseLengthIn", label: "Case length override", group: "dimensions" },
  { key: "caseWidthIn", label: "Case width override", group: "dimensions" },
  { key: "caseHeightIn", label: "Case height override", group: "dimensions" },
  { key: "masterLengthIn", label: "Master length (in)", group: "dimensions" },
  { key: "masterWidthIn", label: "Master width (in)", group: "dimensions" },
  { key: "masterHeightIn", label: "Master height (in)", group: "dimensions" },
  { key: "masterWeightLbs", label: "Master weight (lb)", group: "dimensions" },

  // Pallet build
  { key: "maxPalletHeightIn", label: "Max pallet height (in)", group: "pallet" },
  { key: "maxPalletWeightLbs", label: "Max pallet weight (lb)", group: "pallet" },
  { key: "maxCasesPerLayer", label: "Max cases per layer", group: "pallet" },
  { key: "maxLayers", label: "Max layers per pallet", group: "pallet" },
  { key: "stackability", label: "Stackability", group: "pallet" },
  { key: "maxStackHeightIn", label: "Max stack height (in)", group: "pallet" },
  { key: "palletPattern", label: "Pallet pattern", group: "pallet" },
  { key: "allowMixedSku", label: "Allow mixed SKU (Y/N)", group: "pallet" },
  { key: "mixedSkuStyles", label: "Mixed SKU styles (csv)", group: "pallet" },
  { key: "overhangIn", label: "Overhang (in)", group: "pallet" },
  { key: "palletType", label: "Pallet type", group: "pallet" },

  // Velocity
  { key: "abcClass", label: "ABC class (A/B/C)", group: "velocity" },
  { key: "annualPicks", label: "Annual picks", group: "velocity" },
  { key: "linesPerOrder", label: "Lines per order", group: "velocity" },
  { key: "peakMonths", label: "Peak months (csv)", group: "velocity" },
  { key: "storageClass", label: "Storage class", group: "velocity" },
  { key: "reorderDays", label: "Reorder days", group: "velocity" },

  // Substitutions
  { key: "substituteSku", label: "Substitute SKU", group: "compliance" },
  { key: "substituteType", label: "Substitute type", group: "compliance" },
  { key: "substituteCondition", label: "Substitute condition", group: "compliance" },
  { key: "substituteCostPct", label: "Substitute cost impact %", group: "compliance" },

  // Commercial / compliance
  { key: "unitCost", label: "Unit cost (PRC02)", required: true, group: "compliance" },
  { key: "unitPrice", label: "Unit price (CTP08)", group: "compliance" },
  { key: "nmfc", label: "NMFC commodity code", group: "compliance" },
  { key: "freightClass", label: "Freight class", group: "compliance" },
  { key: "lotControl", label: "Lot control (Y/N)", group: "compliance" },
  { key: "expiryControl", label: "Expiry control (Y/N)", group: "compliance" },
  { key: "serialControl", label: "Serial control (Y/N)", group: "compliance" },
  { key: "shelfLifeDays", label: "Shelf life (days)", group: "compliance" },
  { key: "storageTempMin", label: "Storage temp min (°F)", group: "compliance" },
  { key: "storageTempMax", label: "Storage temp max (°F)", group: "compliance" },
  { key: "hazmat", label: "Hazmat (Y/N)", group: "compliance" },
  { key: "countryOfOrigin", label: "Country of origin", group: "compliance" },
  { key: "harmonizedCode", label: "HS / HTS code", group: "compliance" },
  { key: "brand", label: "Brand", group: "compliance" },
  { key: "manufacturer", label: "Manufacturer", group: "compliance" },
  { key: "manufacturerSku", label: "Manufacturer SKU", group: "compliance" },
];

/** Example headers matching the field order (used to pre-fill the mapping) */
export const ITEM_MASTER_CSV_HEADERS = [
  "sku",
  "upc",
  "gtin",
  "style",
  "description",
  "uom",
  "category",
  "parent_gtin",
  "child_gtin",
  "pack_level",
  "qty_per_parent",
  "case_qty",
  "inner_pack_qty",
  "master_pack_qty",
  "apparel_style",
  "color_code",
  "color_name",
  "size_code",
  "size_length_in",
  "size_width_in",
  "size_height_in",
  "fit",
  "fabric_primary",
  "fabric_pct",
  "fabric_care_code",
  "season",
  "gender",
  "length_in",
  "width_in",
  "height_in",
  "weight_lbs",
  "case_weight_lbs",
  "cbm",
  "case_length_in",
  "case_width_in",
  "case_height_in",
  "master_length_in",
  "master_width_in",
  "master_height_in",
  "master_weight_lbs",
  "max_pallet_height_in",
  "max_pallet_weight_lbs",
  "max_cases_per_layer",
  "max_layers",
  "stackability",
  "max_stack_height_in",
  "pallet_pattern",
  "allow_mixed_sku",
  "mixed_sku_styles",
  "overhang_in",
  "pallet_type",
  "abc_class",
  "annual_picks",
  "lines_per_order",
  "peak_months",
  "storage_class",
  "reorder_days",
  "substitute_sku",
  "substitute_type",
  "substitute_condition",
  "substitute_cost_pct",
  "unit_cost",
  "unit_price",
  "nmfc",
  "freight_class",
  "lot_control",
  "expiry_control",
  "serial_control",
  "shelf_life_days",
  "storage_temp_min",
  "storage_temp_max",
  "hazmat",
  "country_of_origin",
  "harmonized_code",
  "brand",
  "manufacturer",
  "manufacturer_sku",
];

/* ───── Parsing helpers ────────────────────────────────────────────── */

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s === "") return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const bool = (v: string | undefined): boolean | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === "") return undefined;
  return s === "y" || s === "yes" || s === "true" || s === "1";
};

const str = (v: string | undefined): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

const csvList = (v: string | undefined): string[] | undefined => {
  const s = str(v);
  if (!s) return undefined;
  return s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
};

const PACK_LEVELS: PackLevel[] = ["each", "inner", "master", "pallet"];

/* ───── Row → record ───────────────────────────────────────────────── */

export type BuildItemArgs = {
  /** Raw CSV row keyed by the *CSV header* name */
  row: Record<string, string | undefined>;
  /** target field key → CSV header name (user mapping) */
  mapping: Record<string, string>;
  tenantId: string;
  /** Row number for error reporting (1-based, excluding header) */
  rowNumber?: number;
};

export type BuildItemResult = {
  record?: ItemMasterRecord;
  errors: string[];
  warnings: string[];
};

/**
 * Build a complete ItemMasterRecord from a CSV row.
 * Missing optional columns are simply omitted so the Firestore write
 * keeps the document lean.
 */
export function buildItemFromRow(args: BuildItemArgs): BuildItemResult {
  const { row, mapping, tenantId } = args;
  const errors: string[] = [];
  const warnings: string[] = [];

  /** Read a target field from the row using the user mapping */
  const get = (key: string): string | undefined => {
    const header = mapping[key];
    if (!header) return undefined;
    return row[header];
  };

  const sku = str(get("sku"));
  const upc = str(get("upc"));
  const description = str(get("description"));

  if (!sku) errors.push("sku is required");
  if (!upc) errors.push("upc is required");
  if (!description) errors.push("description is required");
  if (!sku || !upc || !description) return { errors, warnings };

  /* Core */
  const gtin = str(get("gtin")) ?? (upc.length === 12 ? `0${upc}` : upc);
  const itemStyle = str(get("itemStyle")) ?? sku.split("-")[1] ?? sku;
  const uom = str(get("uom")) ?? "EA";
  const category = str(get("category")) ?? "General";

  /* Pack hierarchy */
  const caseQty = num(get("caseQty")) ?? 1;
  const innerPackQty = num(get("innerPackQty")) ?? 1;
  const masterPackQty = num(get("masterPackQty"));
  const packLevelRaw = (str(get("packLevel")) ?? "each").toLowerCase() as PackLevel;
  const packLevel: PackLevel = PACK_LEVELS.includes(packLevelRaw) ? packLevelRaw : "each";
  const qtyPerParent = num(get("qtyPerParent")) ?? caseQty;
  const parentGtin = str(get("parentGtin"));
  const childGtin = str(get("childGtin"));

  const packHierarchy: GTINHierarchy[] = [];
  // Base unit level
  packHierarchy.push({
    parentGtin: undefined,
    childGtin: childGtin ?? gtin,
    qtyPerParent: 1,
    packLevel: "each",
    isBaseUnit: true,
  });
  // Case / inner level
  packHierarchy.push({
    parentGtin: childGtin ?? gtin,
    childGtin: parentGtin,
    qtyPerParent: qtyPerParent,
    packLevel: packLevel === "each" ? "inner" : packLevel,
    packLengthIn: num(get("caseLengthIn")) ?? num(get("lengthIn")),
    packWidthIn: num(get("caseWidthIn")) ?? num(get("widthIn")),
    packHeightIn: num(get("caseHeightIn")) ?? num(get("heightIn")),
    packWeightLbs: num(get("caseWeightLbs")),
    isBaseUnit: false,
  });
  // Master level (only when a master pack is defined)
  if (masterPackQty) {
    packHierarchy.push({
      parentGtin: parentGtin,
      childGtin: undefined,
      qtyPerParent: masterPackQty,
      packLevel: "master",
      packLengthIn: num(get("masterLengthIn")),
      packWidthIn: num(get("masterWidthIn")),
      packHeightIn: num(get("masterHeightIn")),
      packWeightLbs: num(get("masterWeightLbs")),
      isBaseUnit: false,
    });
  }

  /* Dimensions */
  const lengthIn = num(get("lengthIn")) ?? 0;
  const widthIn = num(get("widthIn")) ?? 0;
  const heightIn = num(get("heightIn")) ?? 0;
  const weightLbs = num(get("weightLbs")) ?? 0;
  const caseLengthIn = num(get("caseLengthIn")) ?? lengthIn;
  const caseWidthIn = num(get("caseWidthIn")) ?? widthIn;
  const caseHeightIn = num(get("caseHeightIn")) ?? heightIn;
  const caseWeightLbs = num(get("caseWeightLbs")) ?? weightLbs * caseQty;
  const cbmPerCase =
    num(get("cbmPerCase")) ??
    +(caseLengthIn * caseWidthIn * caseHeightIn * 0.000016387064).toFixed(6);
  const masterLengthIn = num(get("masterLengthIn"));
  const masterWidthIn = num(get("masterWidthIn"));
  const masterHeightIn = num(get("masterHeightIn"));
  const masterWeightLbs = num(get("masterWeightLbs"));
  const masterCbm =
    masterLengthIn && masterWidthIn && masterHeightIn
      ? +(masterLengthIn * masterWidthIn * masterHeightIn * 0.000016387064).toFixed(6)
      : undefined;

  /* Pallet build */
  const stackabilityRaw = (str(get("stackability")) ?? "full").toLowerCase();
  const stackability = (["full", "limited", "non-stackable", "crushable"] as const).includes(
    stackabilityRaw as never,
  )
    ? (stackabilityRaw as PalletBuildConfig["stackability"])
    : "full";
  const patternRaw = (str(get("palletPattern")) ?? "interlock").toLowerCase();
  const palletPattern = (["column", "interlock", "brick", "pinwheel"] as const).includes(
    patternRaw as never,
  )
    ? (patternRaw as PalletBuildConfig["palletPattern"])
    : "interlock";
  const palletTypeRaw = (str(get("palletType")) ?? "standard_48x40").toLowerCase();
  const palletType = (["standard_48x40", "euro_48x32", "half_48x20", "custom"] as const).includes(
    palletTypeRaw as never,
  )
    ? (palletTypeRaw as PalletBuildConfig["palletType"])
    : "standard_48x40";

  const palletBuild: PalletBuildConfig = {
    maxPalletHeightIn: num(get("maxPalletHeightIn")) ?? 60,
    maxPalletWeightLbs: num(get("maxPalletWeightLbs")) ?? 2500,
    maxCasesPerLayer: num(get("maxCasesPerLayer")),
    maxLayers: num(get("maxLayers")),
    stackability,
    maxStackHeightIn: num(get("maxStackHeightIn")),
    palletPattern,
    allowMixedSku: bool(get("allowMixedSku")) ?? false,
    mixedSkuStyles: csvList(get("mixedSkuStyles")),
    overhangIn: num(get("overhangIn")),
    palletType,
  };

  /* Velocity */
  const abcRaw = (str(get("abcClass")) ?? "B").toUpperCase();
  const abcClass = (["A", "B", "C"] as const).includes(abcRaw as never)
    ? (abcRaw as VelocityClassification["abcClass"])
    : "B";
  const storageRaw = (str(get("storageClass")) ?? "reserve").toLowerCase();
  const storageClass = (["forward", "reserve", "bulk", "cold", "hazmat"] as const).includes(
    storageRaw as never,
  )
    ? (storageRaw as VelocityClassification["storageClass"])
    : "reserve";

  const velocity: VelocityClassification = {
    abcClass,
    annualPicks: num(get("annualPicks")) ?? 500,
    linesPerOrder: num(get("linesPerOrder")) ?? 3,
    peakMonths: csvList(get("peakMonths"))
      ?.map(Number)
      .filter((n) => Number.isFinite(n)),
    storageClass,
    reorderDays: num(get("reorderDays")),
  };

  /* Substitutions */
  const substitutions: SubstitutionRule[] = [];
  const substituteSku = str(get("substituteSku"));
  if (substituteSku) {
    const subTypeRaw = (str(get("substituteType")) ?? "substitute").toLowerCase();
    const subType = (["substitute", "upgrade", "downgrade", "equivalent"] as const).includes(
      subTypeRaw as never,
    )
      ? (subTypeRaw as SubstitutionRule["type"])
      : "substitute";
    const subCondRaw = (str(get("substituteCondition")) ?? "stockout").toLowerCase();
    const subCondition = (["always", "stockout", "customer_request"] as const).includes(
      subCondRaw as never,
    )
      ? (subCondRaw as SubstitutionRule["condition"])
      : "stockout";
    substitutions.push({
      alternateSku: substituteSku,
      type: subType,
      priority: 1,
      condition: subCondition,
      costImpactPct: num(get("substituteCostPct")),
    });
  }

  /* Apparel */
  const apparelStyle = str(get("apparelStyle"));
  let apparelAttrs: ApparelAttributes | undefined;
  if (apparelStyle || str(get("colorCode")) || str(get("sizeCode"))) {
    const fabricPrimary = str(get("fabricPrimary"));
    apparelAttrs = {
      style: apparelStyle ?? "",
      color: {
        code: str(get("colorCode")) ?? "",
        name: str(get("colorName")) ?? "",
      },
      size: {
        code: str(get("sizeCode")) ?? "",
        lengthIn: num(get("sizeLengthIn")),
        widthIn: num(get("sizeWidthIn")),
        heightIn: num(get("sizeHeightIn")),
      },
      fit: (str(get("fit")) ?? "regular") as ApparelAttributes["fit"],
      fabric: fabricPrimary
        ? {
            primary: fabricPrimary,
            pct: num(get("fabricPct")) ?? 100,
            careCode: str(get("fabricCareCode")),
          }
        : undefined,
      season: str(get("season")),
      gender: str(get("gender")),
    };
  }

  /* Compliance */
  const unitCost = num(get("unitCost"));
  if (unitCost === undefined) errors.push("unit cost is required");
  if (errors.length) return { errors, warnings };

  const record: ItemMasterRecord = {
    sku: sku!,
    upc: upc!,
    gtin,
    itemStyle,
    description: description!,
    category,
    uom,
    tenantId,
    packHierarchy,
    basePackLevel: "each",
    caseQty,
    innerPackQty,
    masterPackQty,
    apparelAttrs,
    lengthIn,
    widthIn,
    heightIn,
    weightLbs,
    caseLengthIn,
    caseWidthIn,
    caseHeightIn,
    caseWeightLbs,
    cbmPerCase,
    masterLengthIn,
    masterWidthIn,
    masterHeightIn,
    masterWeightLbs,
    masterCbm,
    palletBuild,
    velocity,
    substitutions: substitutions.length ? substitutions : undefined,
    unitCost: unitCost!,
    unitPrice: num(get("unitPrice")) ?? 0,
    nmfc: str(get("nmfc")) ?? "009300",
    freightClass: (str(get("freightClass")) ?? "100") as ItemMasterRecord["freightClass"],
    lotControl: bool(get("lotControl")) ?? false,
    expiryControl: bool(get("expiryControl")) ?? false,
    serialControl: bool(get("serialControl")) ?? false,
    shelfLifeDays: num(get("shelfLifeDays")),
    storageTempMin: num(get("storageTempMin")),
    storageTempMax: num(get("storageTempMax")),
    storageTempUnit: "F",
    hazmat: bool(get("hazmat")) ?? false,
    active: true,
    source: "CSV",
    effectiveAt: new Date().toISOString(),
    countryOfOrigin: str(get("countryOfOrigin")) ?? "US",
    harmonizedCode: str(get("harmonizedCode")),
    brand: str(get("brand")),
    manufacturer: str(get("manufacturer")),
    manufacturerSku: str(get("manufacturerSku")),
  };

  if (!apparelAttrs && (category || "").toLowerCase() === "apparel") {
    warnings.push("Category is Apparel but no style/color/size columns were mapped.");
  }
  if (record.caseWeightLbs > 300) {
    warnings.push(`Case weight ${record.caseWeightLbs} lb is unusually heavy — check dimensions.`);
  }

  return { record, errors, warnings };
}

/* ───── File parsing ───────────────────────────────────────────────── */

export type ParseItemMasterResult = {
  records: ItemMasterRecord[];
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; field: string; message: string }>;
};

/**
 * Parse a CSV text into Item Master records.
 * `rowFactory` converts a PapaParse row into a plain object.
 */
export function parseItemMasterCsv(
  rows: Array<Record<string, string>>,
  mapping: Record<string, string>,
  tenantId: string,
): ParseItemMasterResult {
  const records: ItemMasterRecord[] = [];
  const errors: ParseItemMasterResult["errors"] = [];
  const warnings: ParseItemMasterResult["warnings"] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // +1 for header, +1 for 1-based
    const result = buildItemFromRow({ row, mapping, tenantId, rowNumber });
    if (result.errors.length) {
      for (const e of result.errors) {
        errors.push({ row: rowNumber, field: "row", message: e });
      }
      return;
    }
    if (result.record) records.push(result.record);
    for (const w of result.warnings) {
      warnings.push({ row: rowNumber, field: "row", message: w });
    }
  });

  return { records, errors, warnings };
}

/* ───── Downloadable template ──────────────────────────────────────── */

export const ITEM_MASTER_CSV_TEMPLATE = [
  ITEM_MASTER_CSV_HEADERS.join(","),
  [
    "ACM-DEMO-001",
    "081234500099",
    "0081234500099",
    "DEMO-1",
    "Demo Item, Blue",
    "EA",
    "General",
    "1081234500096",
    "0081234500099",
    "inner",
    "24",
    "24",
    "1",
    "",
    "",
    "BLK",
    "Black",
    "M",
    "28",
    "22",
    "2",
    "regular",
    "cotton",
    "80",
    "Machine wash cold",
    "Core",
    "Unisex",
    "22",
    "16",
    "14",
    "1.2",
    "27.8",
    "0.010667",
    "22",
    "16",
    "14",
    "24",
    "22",
    "16",
    "60",
    "60",
    "2500",
    "",
    "",
    "full",
    "",
    "brick",
    "N",
    "",
    "",
    "standard_48x40",
    "A",
    "15000",
    "3",
    "9,10,11,12",
    "forward",
    "5",
    "ACM-DEMO-002",
    "substitute",
    "stockout",
    "0",
    "18.50",
    "49.99",
    "049880",
    "125",
    "N",
    "N",
    "N",
    "",
    "",
    "",
    "N",
    "US",
    "6110.20.2020",
    "Acme",
    "Acme Mfg",
    "DEMO-001",
  ].join(","),
].join("\n");
