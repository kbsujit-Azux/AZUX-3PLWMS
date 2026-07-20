/**
 * ============================================================
 *  GS1-128 / DataMatrix Barcode Parser
 * ============================================================
 *
 *  Purpose: Parse GS1-128 and DataMatrix barcode strings into
 *           structured fields (GTIN, lot, expiry, serial, etc.)
 *
 *  Features:
 *    - GS1 Application Identifier (AI) parsing
 *    - Fixed-length and variable-length AI support
 *    - Date formatting (YYMMDD → ISO)
 *    - Auto-detection of common AIs
 *
 *  Supported AIs:
 *    00  - SSCC (Serial Shipping Container Code)
 *    01  - GTIN (Global Trade Item Number)
 *    10  - Lot/Batch number
 *    17  - Expiration date (YYMMDD)
 *    21  - Serial number
 *    22  - Secondary GTIN
 *    240  - Additional product identification
 *    241  - Product variant
 *    250  - Secondary serial number
 *    251  - Reference to batch/package
 *    30  - Amount payable - single monetary unit
 *    310x - Net weight (kg) with 3 decimal places
 *    37x  - Number of units contained
 *    392x - Price per unit
 *    393x - Price per unit (alternate)
 *    400x - Customer purchase order number
 *    401x - Consignment lot number
 *    402x - Shipment identification
 *    403  - Routing code
 *    410x - Ship to loc code (US UPC/EAN)
 *    411x - Bill to loc code (US UPC/EAN)
 *    412x - Purchase from loc code (US UPC/EAN)
 *    413x - Ship for, forward to loc code (US UPC/EAN)
 *    414x - Identification of a physical location (US UPC/EAN)
 *    415x - Identification of a physical location (US UPC/EAN)
 *    420x - Ship to postal code
 *    421x - Ship to postal code (alternate)
 *    422x - Country of origin
 *    423  - Country of initial processing
 *    424  - Country of full processing
 *    425x - Country of full processing (alternate)
 *    426x - Country of full processing (alternate 2)
 *    703x - Processor approval number
 *    704x - Processor approval number (alternate)
 *    8001  - Roll products
 *    8002  - Electronic serial number
 *    8003  - Distributed products
 *    8004  - Products
 *    8005  - Price per unit of measure
 *    8006  - Identification of individual product pieces
 *    8007  - Identification of returned items
 *    8008  - Date and time of production
 *    8010  - Rounded weight
 *    8011  - Rounded volume
 *    8012  - Inches
 *    8013  - Centimeters
 *    8017  - Volume
 *    8018  - Volume (alternate)
 *    8019  - Volume (alternate 2)
 *    8020  - Volume (alternate 3)
 *    8100  - Coupon code
 *    8101  - Coupon code (alternate)
 *    8102  - Coupon code (alternate 2)
 *    90xx  - Internal company codes
 * ============================================================
 */

export interface Gs1ParsedFields {
  ai00?: string; // SSCC
  ai01?: string; // GTIN
  ai10?: string; // Lot/Batch
  ai17?: string; // Expiration date
  ai21?: string; // Serial number
  ai22?: string; // Secondary GTIN
  ai240?: string; // Additional product ID
  ai241?: string; // Product variant
  ai250?: string; // Secondary serial
  ai251?: string; // Batch/package reference
  ai30?: string; // Amount payable
  ai310?: string; // Net weight kg
  ai37x?: string; // Units contained
  ai392?: string; // Price per unit
  ai400?: string; // PO number
  ai401?: string; // Consignment lot
  ai402?: string; // Shipment ID
  ai410?: string; // Ship to loc
  ai420?: string; // Ship to postal
  ai422?: string; // Country of origin
  raw: string;
  /** Parsed SKU derived from GTIN if available */
  sku?: string;
  /** Formatted expiration date YYYY-MM-DD */
  expiryDate?: string;
  /** Formatted production date YYYY-MM-DD */
  productionDate?: string;
  /** Unrecognized AIs with their values */
  extraAis: Record<string, string>;
}

/** Fixed-length GS1 AIs and their expected lengths */
const FIXED_LENGTH_AIS: Record<string, number> = {
  "00": 18,
  "01": 14,
  "02": 14,
  "10": 20,
  "17": 6,
  "21": 20,
  "22": 14,
  "240": 15,
  "241": 4,
  "250": 30,
  "251": 30,
  "30": 10,
  "310": 6,
  "311": 6,
  "312": 6,
  "313": 6,
  "314": 6,
  "315": 6,
  "316": 6,
  "317": 6,
  "320": 6,
  "321": 6,
  "322": 6,
  "323": 6,
  "324": 6,
  "325": 6,
  "326": 6,
  "327": 6,
  "328": 6,
  "329": 6,
  "330": 6,
  "331": 6,
  "332": 6,
  "333": 6,
  "334": 6,
  "335": 6,
  "336": 6,
  "337": 6,
  "340": 6,
  "341": 6,
  "342": 6,
  "343": 6,
  "344": 6,
  "345": 6,
  "346": 6,
  "347": 6,
  "348": 6,
  "349": 6,
  "350": 6,
  "351": 6,
  "352": 6,
  "353": 6,
  "354": 6,
  "355": 6,
  "356": 6,
  "357": 6,
  "360": 6,
  "361": 6,
  "362": 6,
  "363": 6,
  "364": 6,
  "365": 6,
  "366": 6,
  "367": 6,
  "368": 6,
  "369": 6,
  "37x": 8,
  "390": 10,
  "391": 10,
  "392": 10,
  "393": 10,
  "394": 10,
  "395": 10,
  "396": 10,
  "397": 10,
  "400": 30,
  "401": 30,
  "402": 30,
  "403": 30,
  "410": 15,
  "411": 15,
  "412": 15,
  "413": 15,
  "414": 15,
  "415": 15,
  "416": 15,
  "417": 15,
  "418": 15,
  "419": 15,
  "420": 20,
  "421": 20,
  "422": 3,
  "423": 3,
  "424": 3,
  "425": 3,
  "426": 3,
  "427": 3,
  "428": 3,
  "429": 3,
  "430": 20,
  "431": 20,
  "432": 20,
  "433": 20,
  "434": 20,
  "435": 20,
  "436": 20,
  "437": 20,
  "438": 20,
  "440": 25,
  "441": 25,
  "442": 25,
  "443": 25,
  "444": 25,
  "445": 25,
  "446": 25,
  "447": 25,
  "448": 25,
  "449": 25,
  "450": 25,
  "451": 25,
  "452": 25,
  "453": 25,
  "454": 25,
  "455": 25,
  "456": 25,
  "457": 25,
  "458": 25,
  "459": 25,
  "460": 25,
  "461": 25,
  "462": 25,
  "463": 25,
  "464": 25,
  "465": 25,
  "466": 25,
  "467": 25,
  "468": 25,
  "469": 25,
  "470": 25,
  "471": 25,
  "472": 25,
  "473": 25,
  "474": 25,
  "475": 25,
  "476": 25,
  "477": 25,
  "478": 25,
  "479": 25,
  "480": 25,
  "481": 25,
  "482": 25,
  "483": 25,
  "484": 25,
  "485": 25,
  "486": 25,
  "487": 25,
  "488": 25,
  "489": 25,
  "490": 25,
  "491": 25,
  "492": 25,
  "493": 25,
  "494": 25,
  "495": 25,
  "496": 25,
  "497": 25,
  "498": 25,
  "499": 25,
  "500": 20,
  "501": 20,
  "502": 20,
  "503": 20,
  "504": 20,
  "505": 20,
  "506": 20,
  "507": 20,
  "508": 20,
  "509": 20,
  "510": 20,
  "511": 20,
  "512": 20,
  "513": 20,
  "514": 20,
  "515": 20,
  "516": 20,
  "517": 20,
  "518": 20,
  "519": 20,
  "520": 20,
  "521": 20,
  "522": 20,
  "523": 20,
  "524": 20,
  "525": 20,
  "526": 20,
  "527": 20,
  "528": 20,
  "529": 20,
  "530": 20,
  "531": 20,
  "532": 20,
  "533": 20,
  "534": 20,
  "535": 20,
  "536": 20,
  "537": 20,
  "538": 20,
  "539": 20,
  "540": 20,
  "541": 20,
  "542": 20,
  "543": 20,
  "544": 20,
  "545": 20,
  "546": 20,
  "547": 20,
  "548": 20,
  "549": 20,
  "550": 20,
  "551": 20,
  "552": 20,
  "553": 20,
  "554": 20,
  "555": 20,
  "556": 20,
  "557": 20,
  "558": 20,
  "559": 20,
  "560": 20,
  "561": 20,
  "562": 20,
  "563": 20,
  "564": 20,
  "565": 20,
  "566": 20,
  "567": 20,
  "568": 20,
  "569": 20,
  "570": 20,
  "571": 20,
  "572": 20,
  "573": 20,
  "574": 20,
  "575": 20,
  "576": 20,
  "577": 20,
  "578": 20,
  "579": 20,
  "580": 20,
  "581": 20,
  "582": 20,
  "583": 20,
  "584": 20,
  "585": 20,
  "586": 20,
  "587": 20,
  "588": 20,
  "589": 20,
  "590": 20,
  "591": 20,
  "592": 20,
  "593": 20,
  "594": 20,
  "595": 20,
  "596": 20,
  "597": 20,
  "598": 20,
  "599": 20,
  "600": 20,
  "601": 20,
  "602": 20,
  "603": 20,
  "604": 20,
  "605": 20,
  "606": 20,
  "607": 20,
  "608": 20,
  "609": 20,
  "610": 20,
  "611": 20,
  "612": 20,
  "613": 20,
  "614": 20,
  "615": 20,
  "616": 20,
  "617": 20,
  "618": 20,
  "619": 20,
  "620": 20,
  "621": 20,
  "622": 20,
  "623": 20,
  "624": 20,
  "625": 20,
  "626": 20,
  "627": 20,
  "628": 20,
  "629": 20,
  "630": 20,
  "631": 20,
  "632": 20,
  "633": 20,
  "634": 20,
  "635": 20,
  "636": 20,
  "637": 20,
  "638": 20,
  "639": 20,
  "640": 20,
  "641": 20,
  "642": 20,
  "643": 20,
  "644": 20,
  "645": 20,
  "646": 20,
  "647": 20,
  "648": 20,
  "649": 20,
  "650": 20,
  "651": 20,
  "652": 20,
  "653": 20,
  "654": 20,
  "655": 20,
  "656": 20,
  "657": 20,
  "658": 20,
  "659": 20,
  "7001": 16,
  "7002": 16,
  "7003": 16,
  "703": 10,
  "704": 10,
  "8001": 20,
  "8002": 20,
  "8003": 20,
  "8004": 20,
  "8005": 20,
  "8006": 20,
  "8007": 20,
  "8008": 20,
  "8010": 10,
  "8011": 10,
  "8012": 10,
  "8013": 10,
  "8017": 10,
  "8018": 10,
  "8019": 10,
  "8020": 10,
  "8100": 20,
  "8101": 20,
  "8102": 20,
  "90xx": 20,
};

/**
 * Parses a GS1-128 or DataMatrix barcode string into structured fields.
 *
 * @param raw - The raw barcode string, typically starting with FNC1 or just the data
 * @returns Parsed fields with AI mappings
 */
export function parseGs1Barcode(raw: string): Gs1ParsedFields {
  const result: Gs1ParsedFields = {
    raw,
    extraAis: {},
  };

  // Strip FNC1 and other control characters
  let data = raw.replace(/[\u0001-\u001F\u007F]/g, "").trim();

  if (!data) return result;

  let i = 0;
  while (i < data.length) {
    // Find the next AI (should be numeric)
    const remaining = data.slice(i);
    const aiMatch = remaining.match(/^(\d+)/);
    if (!aiMatch) {
      i++;
      continue;
    }

    const ai = aiMatch[1];
    let valueLength: number | undefined;

    // Check for fixed-length AI
    if (FIXED_LENGTH_AIS[ai]) {
      valueLength = FIXED_LENGTH_AIS[ai];
    } else if (ai.startsWith("37")) {
      valueLength = 8;
    } else if (ai.startsWith("39")) {
      valueLength = 10;
    } else if (ai.startsWith("40")) {
      valueLength = 30;
    } else if (ai.startsWith("41")) {
      valueLength = 15;
    } else if (ai.startsWith("42")) {
      valueLength = 20;
    } else if (ai.startsWith("43")) {
      valueLength = 3;
    } else if (ai.startsWith("44")) {
      valueLength = 25;
    } else if (ai.startsWith("45")) {
      valueLength = 25;
    } else if (ai.startsWith("46")) {
      valueLength = 25;
    } else if (ai.startsWith("47")) {
      valueLength = 25;
    } else if (ai.startsWith("48")) {
      valueLength = 25;
    } else if (ai.startsWith("49")) {
      valueLength = 25;
    } else if (ai.startsWith("50")) {
      valueLength = 20;
    } else if (ai.startsWith("51")) {
      valueLength = 20;
    } else if (ai.startsWith("52")) {
      valueLength = 20;
    } else if (ai.startsWith("53")) {
      valueLength = 20;
    } else if (ai.startsWith("54")) {
      valueLength = 20;
    } else if (ai.startsWith("55")) {
      valueLength = 20;
    } else if (ai.startsWith("56")) {
      valueLength = 20;
    } else if (ai.startsWith("57")) {
      valueLength = 20;
    } else if (ai.startsWith("58")) {
      valueLength = 20;
    } else if (ai.startsWith("59")) {
      valueLength = 20;
    } else if (ai.startsWith("60")) {
      valueLength = 20;
    } else if (ai.startsWith("61")) {
      valueLength = 20;
    } else if (ai.startsWith("62")) {
      valueLength = 20;
    } else if (ai.startsWith("63")) {
      valueLength = 20;
    } else if (ai.startsWith("64")) {
      valueLength = 20;
    } else if (ai.startsWith("65")) {
      valueLength = 20;
    } else if (ai.startsWith("66")) {
      valueLength = 20;
    } else if (ai.startsWith("67")) {
      valueLength = 20;
    } else if (ai.startsWith("68")) {
      valueLength = 20;
    } else if (ai.startsWith("69")) {
      valueLength = 20;
    } else if (ai.startsWith("70")) {
      valueLength = 10;
    } else if (ai.startsWith("80")) {
      valueLength = 20;
    } else if (ai.startsWith("90")) {
      valueLength = 20;
    }

    if (valueLength === undefined) {
      // Variable-length AI - read until next AI or end
      const nextAiMatch = remaining.slice(ai.length).match(/^(\d{2,4})/);
      if (nextAiMatch) {
        const nextAiStart = remaining.slice(ai.length).indexOf(nextAiMatch[1]);
        valueLength = nextAiStart >= 0 ? nextAiStart : remaining.length - ai.length;
      } else {
        valueLength = remaining.length - ai.length;
      }
    }

    const value = data.slice(i + ai.length, i + ai.length + valueLength);

    // Map AI to result fields
    switch (ai) {
      case "00":
        result.ai00 = value;
        break;
      case "01":
        result.ai01 = value;
        break;
      case "10":
        result.ai10 = value;
        break;
      case "17":
        result.ai17 = value;
        break;
      case "21":
        result.ai21 = value;
        break;
      case "22":
        result.ai22 = value;
        break;
      case "240":
        result.ai240 = value;
        break;
      case "241":
        result.ai241 = value;
        break;
      case "250":
        result.ai250 = value;
        break;
      case "251":
        result.ai251 = value;
        break;
      case "30":
        result.ai30 = value;
        break;
      case "310":
        result.ai310 = value;
        break;
      case "37":
        result.ai37x = value;
        break;
      case "392":
        result.ai392 = value;
        break;
      case "400":
        result.ai400 = value;
        break;
      case "401":
        result.ai401 = value;
        break;
      case "402":
        result.ai402 = value;
        break;
      case "410":
        result.ai410 = value;
        break;
      case "420":
        result.ai420 = value;
        break;
      case "422":
        result.ai422 = value;
        break;
      default:
        result.extraAis[ai] = value;
    }

    i += ai.length + valueLength;
  }

  // Derive SKU from GTIN (AI 01) if available
  if (result.ai01) {
    result.sku = deriveSkuFromGtin(result.ai01);
  }

  // Format expiration date (YYMMDD → YYYY-MM-DD)
  if (result.ai17 && result.ai17.length === 6) {
    const yy = result.ai17.slice(0, 2);
    const mm = result.ai17.slice(2, 4);
    const dd = result.ai17.slice(4, 6);
    const year = parseInt(yy, 10) < 70 ? `20${yy}` : `19${yy}`;
    result.expiryDate = `${year}-${mm}-${dd}`;
  }

  return result;
}

/**
 * Derives a SKU from a GTIN/UPC by removing check digit and padding.
 * This is a simple heuristic - real implementation would map GTIN to SKU
 * via item master lookup.
 */
function deriveSkuFromGtin(gtin: string): string | undefined {
  if (!gtin || gtin.length < 10) return undefined;
  // For 14-digit GTIN: remove check digit and format
  if (gtin.length === 14) {
    const base = gtin.slice(1, 13);
    return base;
  }
  // For 12-digit UPC: return as-is
  if (gtin.length === 12) {
    return gtin;
  }
  // For 13-digit EAN: return as-is
  if (gtin.length === 13) {
    return gtin;
  }
  return gtin;
}

/**
 * Format GS1 date (YYMMDD) to ISO date string
 */
export function formatGs1Date(yymmdd: string): string {
  if (!yymmdd || yymmdd.length !== 6) return yymmdd;
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const year = parseInt(yy, 10) < 70 ? `20${yy}` : `19${yy}`;
  return `${year}-${mm}-${dd}`;
}

/**
 * Check if a string looks like a GS1 barcode (starts with application identifiers)
 */
export function isLikelyGs1(code: string): boolean {
  // GS1 barcodes typically start with (01) for GTIN or (00) for SSCC
  // or contain multiple AI patterns
  if (!code || code.length < 8) return false;
  const clean = code.replace(/[\u0001-\u001F\u007F]/g, "").trim();
  return /^\(?01\)?/.test(clean) || /^\(?00\)?/.test(clean) || /\(\d{2,4}/.test(clean);
}
