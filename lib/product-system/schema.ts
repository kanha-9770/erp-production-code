/**
 * Static field schema + seed master data for the Product Master System.
 *
 * One rich entity — a machine product — captured across the section groups from
 * the source sheet (section names match the sheet's group headers verbatim):
 * Product Identification Details, Internal Details, Product Size Limit, Product
 * Dimensional Data, Product Financial Data, Sales Data, Service Data, Technical
 * Details (Nessco), Technical Details (OEM), Software Input.
 *
 * The Nessco and OEM technical blocks repeat the same labels (Operating Voltage,
 * Phase, loads, air flow/pressure, manuals…). They get distinct `key`s (OEM ones
 * are `oem`-prefixed) so both sets persist independently on one record.
 */

import type {
  FieldDef,
  MasterType,
  StatusOption,
  SubmoduleSchema,
  ProductSubmoduleKey,
} from "./types";

// ── Seed master dropdowns ───────────────────────────────────────────────────

function opts(values: string[]): MasterType["options"] {
  return values.map((value, i) => ({
    id: `prodseed-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    value,
    active: true,
    sortOrder: i,
  }));
}

export const SEED_MASTERS: MasterType[] = [
  {
    key: "product_category",
    label: "Product Category",
    description: "Machine product line / category.",
    icon: "layers",
    usedBy: ["product"],
    system: true,
    options: opts([
      "Paper Cup Machine",
      "Paper Glass Machine",
      "Paper Bowl Machine",
      "Paper Bag Machine",
      "Paper Straw Machine",
      "Flexo Printing Machine",
      "Die Cutting Machine",
      "Lamination Machine",
      "Roll Slitting Machine",
    ]),
  },
  {
    key: "variant",
    label: "Variant",
    description: "Product variant / trim level.",
    icon: "git-branch",
    usedBy: ["product"],
    system: true,
    options: opts(["Standard", "Premium", "High Speed", "Economy", "Custom"]),
  },
  {
    key: "uom_speed",
    label: "Speed UoM",
    description: "Unit of measure for machine speed.",
    icon: "gauge",
    usedBy: ["product"],
    system: true,
    options: opts(["Pieces/min", "Pieces/hour", "Cups/min", "Meters/min", "Strokes/min"]),
  },
  {
    key: "sales_channel",
    label: "Sales Channel",
    description: "Route to market.",
    icon: "store",
    usedBy: ["product"],
    system: true,
    options: opts(["DOMESTIC", "EXPORT", "BOTH"]),
  },
  {
    key: "flow_uom",
    label: "Air Flow UoM",
    description: "Unit of measure for air flow rate.",
    icon: "wind",
    usedBy: ["product"],
    options: opts(["CFM", "m3/hr", "m3/s", "l/min", "m3/min"]),
  },
  {
    key: "pressure_uom",
    label: "Air Pressure UoM",
    description: "Unit of measure for air pressure.",
    icon: "gauge",
    usedBy: ["product"],
    options: opts(["bar", "Mpa", "N/m2"]),
  },
];

// ── Status & inline select option sets ──────────────────────────────────────

const PRODUCT_STATUS: StatusOption[] = [
  { value: "ACTIVE", label: "Active", variant: "default" },
  { value: "INACTIVE", label: "Inactive", variant: "secondary" },
  { value: "CLEARANCE", label: "Clearance", variant: "outline" },
  { value: "IN_PROGRESS", label: "In Progress", variant: "outline" },
  { value: "OLD_PRODUCT_DEMAND", label: "Old Product - Based on Demand", variant: "destructive" },
];

const DISPLAY_OPTS = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];
// World currencies (code → symbol), de-duplicated by code from the supplied
// list. Stored value is the ISO code; the dropdown shows "CODE - Symbol".
const CURRENCY_OPTS = [
  { value: "RUB", label: "RUB - ₽" },
  { value: "AFN", label: "AFN - Afs" },
  { value: "EUR", label: "EUR - €" },
  { value: "ALL", label: "ALL - Lek" },
  { value: "GBP", label: "GBP - £" },
  { value: "DZD", label: "DZD - DA" },
  { value: "AOA", label: "AOA - Kz" },
  { value: "XCD", label: "XCD - $" },
  { value: "ARS", label: "ARS - $" },
  { value: "AMD", label: "AMD - ֏" },
  { value: "AWG", label: "AWG - ƒ" },
  { value: "AUD", label: "AUD - $" },
  { value: "AZN", label: "AZN - ₼" },
  { value: "BSD", label: "BSD - $" },
  { value: "BHD", label: "BHD - BD" },
  { value: "BDT", label: "BDT - ৳" },
  { value: "BBD", label: "BBD - $" },
  { value: "BYN", label: "BYN - Rbls" },
  { value: "BZD", label: "BZD - $" },
  { value: "XOF", label: "XOF - Fr" },
  { value: "BMD", label: "BMD - $" },
  { value: "BTN", label: "BTN - Nu" },
  { value: "BOB", label: "BOB - Bs" },
  { value: "USD", label: "USD - $" },
  { value: "BAM", label: "BAM - KM" },
  { value: "BWP", label: "BWP - P" },
  { value: "BRL", label: "BRL - R$" },
  { value: "BND", label: "BND - $" },
  { value: "SGD", label: "SGD - $" },
  { value: "BGN", label: "BGN - Lev" },
  { value: "BIF", label: "BIF - Fr" },
  { value: "KHR", label: "KHR - CR" },
  { value: "XAF", label: "XAF - Fr" },
  { value: "CAD", label: "CAD - $" },
  { value: "CVE", label: "CVE - $" },
  { value: "KYD", label: "KYD - $" },
  { value: "CLP", label: "CLP - $" },
  { value: "CNY", label: "CNY - ¥" },
  { value: "COP", label: "COP - $" },
  { value: "KMF", label: "KMF - Fr" },
  { value: "CDF", label: "CDF - Fr" },
  { value: "NZD", label: "NZD - $" },
  { value: "CRC", label: "CRC - ₡" },
  { value: "CUP", label: "CUP - $" },
  { value: "ANG", label: "ANG - ƒ" },
  { value: "CZK", label: "CZK - Kč" },
  { value: "DKK", label: "DKK - kr" },
  { value: "DJF", label: "DJF - Fr" },
  { value: "DOP", label: "DOP - $" },
  { value: "EGP", label: "EGP - LE" },
  { value: "SZL", label: "SZL - E" },
  { value: "ZAR", label: "ZAR - R" },
  { value: "ETB", label: "ETB - Br" },
  { value: "FJD", label: "FJD - $" },
  { value: "XPF", label: "XPF - Fr" },
  { value: "GMD", label: "GMD - D" },
  { value: "GEL", label: "GEL - ₾" },
  { value: "GHS", label: "GHS - ₵" },
  { value: "GTQ", label: "GTQ - Q" },
  { value: "GNF", label: "GNF - Fr" },
  { value: "GYD", label: "GYD - $" },
  { value: "HTG", label: "HTG - G" },
  { value: "HNL", label: "HNL - L" },
  { value: "HKD", label: "HKD - $" },
  { value: "HUF", label: "HUF - Ft" },
  { value: "ISK", label: "ISK - kr" },
  { value: "IDR", label: "IDR - Rp" },
  { value: "IRR", label: "IRR - Rls" },
  { value: "IQD", label: "IQD - ID" },
  { value: "ILS", label: "ILS - ₪" },
  { value: "JMD", label: "JMD - $" },
  { value: "JPY", label: "JPY - ¥" },
  { value: "JOD", label: "JOD - JD" },
  { value: "KZT", label: "KZT - ₸" },
  { value: "KES", label: "KES - Shs" },
  { value: "KRW", label: "KRW - ₩" },
  { value: "KWD", label: "KWD - KD" },
  { value: "KGS", label: "KGS - som" },
  { value: "LAK", label: "LAK - ₭" },
  { value: "LBP", label: "LBP - LL" },
  { value: "LSL", label: "LSL - M" },
  { value: "LRD", label: "LRD - $" },
  { value: "LYD", label: "LYD - LD" },
  { value: "CHF", label: "CHF - Fr" },
  { value: "MOP", label: "MOP - MOP$" },
  { value: "MGA", label: "MGA - Ar" },
  { value: "MWK", label: "MWK - K" },
  { value: "MYR", label: "MYR - RM" },
  { value: "MVR", label: "MVR - Rf" },
  { value: "MRU", label: "MRU - UM" },
  { value: "MUR", label: "MUR - Rs" },
  { value: "MXN", label: "MXN - $" },
  { value: "MDL", label: "MDL - Lei" },
  { value: "MAD", label: "MAD - DH" },
  { value: "MZN", label: "MZN - Mt" },
  { value: "MMK", label: "MMK - Ks" },
  { value: "NAD", label: "NAD - $" },
  { value: "NPR", label: "NPR - Rs" },
  { value: "NIO", label: "NIO - C$" },
  { value: "NGN", label: "NGN - ₦" },
  { value: "MKD", label: "MKD - DEN" },
  { value: "TRY", label: "TRY - ₺" },
  { value: "NOK", label: "NOK - kr" },
  { value: "OMR", label: "OMR - RO" },
  { value: "PKR", label: "PKR - Rs" },
  { value: "PAB", label: "PAB - B/" },
  { value: "PGK", label: "PGK - K" },
  { value: "PYG", label: "PYG - ₲" },
  { value: "PEN", label: "PEN - S/" },
  { value: "PHP", label: "PHP - ₱" },
  { value: "PLN", label: "PLN - zł" },
  { value: "QAR", label: "QAR - QR" },
  { value: "RON", label: "RON - Lei" },
  { value: "RWF", label: "RWF - Fr" },
  { value: "SAR", label: "SAR - Rls" },
  { value: "RSD", label: "RSD - DIN" },
  { value: "SCR", label: "SCR - Rs" },
  { value: "SBD", label: "SBD - $" },
  { value: "SOS", label: "SOS - Shs" },
  { value: "LKR", label: "LKR - Rs" },
  { value: "SDG", label: "SDG - LS" },
  { value: "SRD", label: "SRD - $" },
  { value: "SEK", label: "SEK - kr" },
  { value: "TWD", label: "TWD - $" },
  { value: "TJS", label: "TJS - SM" },
  { value: "TZS", label: "TZS - Shs" },
  { value: "THB", label: "THB - ฿" },
  { value: "TOP", label: "TOP - T$" },
  { value: "TTD", label: "TTD - $" },
  { value: "TND", label: "TND - DT" },
  { value: "TMT", label: "TMT - m" },
  { value: "UGX", label: "UGX - Shs" },
  { value: "UAH", label: "UAH - ₴" },
  { value: "AED", label: "AED - Dhs" },
  { value: "UYU", label: "UYU - $" },
  { value: "UZS", label: "UZS - soum" },
  { value: "VES", label: "VES - Bs.S" },
  { value: "VND", label: "VND - ₫" },
  { value: "YER", label: "YER - Rls" },
  { value: "ZMW", label: "ZMW - K" },
];
const PHASE_OPTS = [
  { value: "3P", label: "3P" },
  { value: "1P", label: "1P" },
];

// ── The Product schema ──────────────────────────────────────────────────────

export const PRODUCT_SCHEMA: SubmoduleSchema = {
  key: "product",
  label: "Product Master",
  shortLabel: "Products",
  icon: "package",
  recordNoun: "product",
  route: "products",
  codePrefix: "PRD",
  statusKey: "status",
  fields: [
    // ── Product Identification Details ──────────────────────────────────────
    { key: "docNo", label: "Product ID", type: "text", section: "Product Identification Details", required: true, inTable: true, pinned: true, width: 130 },
    { key: "productCategory", label: "Product Category", type: "master", master: "product_category", section: "Product Identification Details", required: true, inTable: true, width: 180 },
    { key: "productName", label: "Product Name", type: "text", section: "Product Identification Details", required: true, inTable: true, pinned: true, width: 220 },
    { key: "nesscoModelNo", label: "Nessco Model No.", type: "text", section: "Product Identification Details", inTable: true, width: 150 },
    { key: "variant", label: "Variant", type: "master", master: "variant", section: "Product Identification Details", inTable: true, width: 130 },
    { key: "modelPrefix", label: "Model Prefix", type: "text", section: "Product Identification Details", inTable: true, defaultHidden: true, width: 120 },
    { key: "status", label: "Product Status", type: "status", statusOptions: PRODUCT_STATUS, defaultValue: "ACTIVE", section: "Product Identification Details", inTable: true, width: 140 },
    { key: "hsnCode", label: "HSN Code", type: "text", section: "Product Identification Details", inTable: true, defaultHidden: true, width: 120 },

    // ── Internal Details ────────────────────────────────────────────────────
    { key: "machineSpeed", label: "Machine Speed", type: "number", section: "Internal Details", defaultValue: 0, inTable: true, width: 130, align: "right" },
    { key: "stableSpeed", label: "Stable Speed", type: "number", section: "Internal Details", defaultValue: 0, inTable: true, defaultHidden: true, width: 130, align: "right" },
    { key: "uomSpeed", label: "Speed UoM", type: "master", master: "uom_speed", section: "Internal Details", inTable: true, defaultHidden: true, width: 120 },
    // Bare machine weight (no packaging). Distinct from `productWeightKgs`
    // below, which is the packed/shipping weight in the Dimensional section.
    { key: "weightKg", label: "Weight", type: "number", unit: "kg", section: "Internal Details", defaultValue: 0, inTable: true, defaultHidden: true, width: 110, align: "right" },
    { key: "powerKw", label: "Power", type: "number", unit: "kW", section: "Internal Details", defaultValue: 0, inTable: true, defaultHidden: true, width: 110, align: "right" },
    { key: "p1Dimension", label: "P1 Dimension", type: "number", unit: "mm", section: "Internal Details", defaultValue: 0, width: 120, align: "right" },
    { key: "p2Dimension", label: "P2 Dimension", type: "number", unit: "mm", section: "Internal Details", defaultValue: 0, width: 120, align: "right" },
    { key: "p3Dimension", label: "P3 Dimension", type: "number", unit: "mm", section: "Internal Details", defaultValue: 0, width: 120, align: "right" },
    { key: "machineImage", label: "Machine Image", type: "media", section: "Internal Details", inTable: true, width: 120 },
    { key: "websiteDisplayStatus", label: "Website Display Status", type: "select", options: DISPLAY_OPTS, defaultValue: "NO", section: "Internal Details", inTable: true, defaultHidden: true, width: 150 },
    { key: "internalRemark", label: "Remark", type: "textarea", section: "Internal Details" },

    // ── Product Size Limit ──────────────────────────────────────────────────
    { key: "bottomDiaMin", label: "Bottom Dia Min", type: "number", unit: "mm", section: "Product Size Limit", defaultValue: 0, width: 130, align: "right" },
    { key: "bottomDiaMax", label: "Bottom Dia Max", type: "number", unit: "mm", section: "Product Size Limit", defaultValue: 0, width: 130, align: "right" },
    { key: "topDiaMin", label: "Top Dia Min", type: "number", unit: "mm", section: "Product Size Limit", defaultValue: 0, width: 130, align: "right" },
    { key: "topDiaMax", label: "Top Dia Max", type: "number", unit: "mm", section: "Product Size Limit", defaultValue: 0, width: 130, align: "right" },
    { key: "heightMin", label: "Height Min", type: "number", unit: "mm", section: "Product Size Limit", defaultValue: 0, width: 120, align: "right" },
    { key: "heightMax", label: "Height Max", type: "number", unit: "mm", section: "Product Size Limit", defaultValue: 0, width: 120, align: "right" },
    { key: "knurlingDepthMax", label: "Knurling Depth Max", type: "number", unit: "mm", section: "Product Size Limit", defaultValue: 0, width: 150, align: "right" },
    { key: "otherSpecifications", label: "Other Specifications", type: "textarea", section: "Product Size Limit" },
    { key: "overallSpecifications", label: "Overall Specifications", type: "textarea", section: "Product Size Limit" },

    // ── Product Dimensional Data (weight + packaging + dispatch) ─────────────
    // Packed / shipping weight (machine + packaging) — cf. `weightKg` above.
    { key: "productWeightKgs", label: "Product Weight", type: "number", unit: "kg", section: "Product Dimensional Data", defaultValue: 0, width: 120, align: "right" },
    { key: "noOfPackages", label: "No. of Packages", type: "number", section: "Product Dimensional Data", defaultValue: 0, width: 120, align: "right" },
    { key: "package1", label: "Package 1 (L×W×H)", type: "text", unit: "mm³", section: "Product Dimensional Data", placeholder: "L x W x H", width: 150 },
    { key: "package2", label: "Package 2 (L×W×H)", type: "text", unit: "mm³", section: "Product Dimensional Data", placeholder: "L x W x H", width: 150 },
    { key: "package3", label: "Package 3 (L×W×H)", type: "text", unit: "mm³", section: "Product Dimensional Data", placeholder: "L x W x H", width: 150 },
    { key: "package4", label: "Package 4 (L×W×H)", type: "text", unit: "mm³", section: "Product Dimensional Data", placeholder: "L x W x H", width: 150 },
    { key: "dispatchP1", label: "Dispatch P1 (L×W×H)", type: "text", unit: "mm³", section: "Product Dimensional Data", placeholder: "L x W x H", width: 150 },
    { key: "dispatchP2", label: "Dispatch P2 (L×W×H)", type: "text", unit: "mm³", section: "Product Dimensional Data", placeholder: "L x W x H", width: 150 },
    { key: "dispatchP3", label: "Dispatch P3 (L×W×H)", type: "text", unit: "mm³", section: "Product Dimensional Data", placeholder: "L x W x H", width: 150 },

    // ── Product Financial Data ──────────────────────────────────────────────
    { key: "domesticPriceMin", label: "Domestic Price (Min)", type: "currency", section: "Product Financial Data", defaultValue: 0, width: 150, align: "right" },
    { key: "domesticPriceMax", label: "Domestic Price (Max)", type: "currency", section: "Product Financial Data", defaultValue: 0, width: 150, align: "right" },
    { key: "domesticPriceAvg", label: "Domestic Price (Avg)", type: "currency", section: "Product Financial Data", defaultValue: 0, inTable: true, width: 150, align: "right" },
    { key: "domesticPricingRemarks", label: "Domestic Pricing Remarks", type: "textarea", section: "Product Financial Data" },
    { key: "exportPriceMin", label: "Export Price (Min)", type: "currency", section: "Product Financial Data", defaultValue: 0, width: 150, align: "right" },
    { key: "exportPriceMax", label: "Export Price (Max)", type: "currency", section: "Product Financial Data", defaultValue: 0, width: 150, align: "right" },
    { key: "exportPriceAvg", label: "Export Price (Avg)", type: "currency", section: "Product Financial Data", defaultValue: 0, inTable: true, defaultHidden: true, width: 150, align: "right" },
    { key: "exportPricingRemarks", label: "Export Pricing Remarks", type: "textarea", section: "Product Financial Data" },
    { key: "currency", label: "Currency", type: "select", options: CURRENCY_OPTS, defaultValue: "USD", section: "Product Financial Data", inTable: true, defaultHidden: true, width: 110 },

    // ── Sales Data ──────────────────────────────────────────────────────────
    { key: "salesChannel", label: "Sales Channel", type: "master", master: "sales_channel", section: "Sales Data", inTable: true, defaultHidden: true, width: 150 },
    { key: "catalogueDomestic", label: "Product Catalogue (Domestic)", type: "url", section: "Sales Data" },
    { key: "catalogueExport", label: "Product Catalogue (Export)", type: "url", section: "Sales Data" },
    { key: "onePageFlyer", label: "Product 1-Page Flyer", type: "url", section: "Sales Data" },
    { key: "nesscoVideo", label: "Nessco Video", type: "url", section: "Sales Data" },
    { key: "youtubeLink", label: "YouTube Link", type: "url", section: "Sales Data" },
    { key: "allProductVideo", label: "All Product Video", type: "url", section: "Sales Data" },
    { key: "defaultAddOns", label: "Default Add-Ons", type: "textarea", section: "Sales Data" },
    { key: "extraAddOns", label: "Extra Add-Ons", type: "textarea", section: "Sales Data" },
    { key: "faqSheetLink", label: "Product FAQ Sheet Link", type: "url", section: "Sales Data" },

    // ── Service Data ────────────────────────────────────────────────────────
    { key: "packagingItemList", label: "Packaging Item List", type: "textarea", section: "Service Data" },
    { key: "preRequisiteInstallation", label: "Pre-Requisite Item Detail for Installation", type: "textarea", section: "Service Data" },
    { key: "operationsManual", label: "Operations Manual", type: "url", section: "Service Data" },
    { key: "electricalDiagram", label: "Electrical Diagram", type: "url", section: "Service Data" },
    { key: "toolBoxItems", label: "Tool Box Items", type: "textarea", section: "Service Data" },
    { key: "freeSpares", label: "Free Spares", type: "textarea", section: "Service Data" },
    { key: "payableSpareDomestic", label: "Payable Spares (Domestic)", type: "textarea", section: "Service Data" },
    { key: "payableSparesExport", label: "Payable Spares (Export)", type: "textarea", section: "Service Data" },

    // ── Technical Details (Nessco) ──────────────────────────────────────────
    { key: "topViewLayoutFile", label: "Product Top View Layout File", type: "url", section: "Technical Details (Nessco)" },
    { key: "operatingVoltage", label: "Operating Voltage", type: "text", section: "Technical Details (Nessco)", placeholder: "e.g. 415V", width: 130 },
    { key: "phaseRequirement", label: "Phase Requirement", type: "select", options: PHASE_OPTS, section: "Technical Details (Nessco)", width: 140 },
    { key: "startingLoadKw", label: "Starting Load", type: "number", unit: "kW", section: "Technical Details (Nessco)", defaultValue: 0, width: 120, align: "right" },
    { key: "runningLoadKw", label: "Running Load", type: "number", unit: "kW", section: "Technical Details (Nessco)", defaultValue: 0, width: 120, align: "right" },
    { key: "stabilizerLoadKva", label: "Stabilizer Load", type: "number", unit: "KVA", section: "Technical Details (Nessco)", defaultValue: 0, width: 130, align: "right" },
    { key: "airFlowRate", label: "Air Flow Rate Required", type: "number", section: "Technical Details (Nessco)", defaultValue: 0, width: 150, align: "right" },
    { key: "airFlowUom", label: "Air Flow Rate (UoM)", type: "master", master: "flow_uom", section: "Technical Details (Nessco)", width: 130 },
    { key: "airPressure", label: "Air Pressure Required", type: "number", section: "Technical Details (Nessco)", defaultValue: 0, width: 150, align: "right" },
    { key: "airPressureUom", label: "Air Pressure (UoM)", type: "master", master: "pressure_uom", section: "Technical Details (Nessco)", width: 130 },
    { key: "workingDimBasic", label: "Working Dimension — Basic Machine (L×B×H)", type: "text", unit: "ft", section: "Technical Details (Nessco)", placeholder: "L x B x H" },
    { key: "workingDimTop", label: "Working Dimension — Top Model (L×B×H)", type: "text", unit: "ft", section: "Technical Details (Nessco)", placeholder: "L x B x H" },
    { key: "technicalRemarks", label: "Technical Remarks", type: "textarea", section: "Technical Details (Nessco)" },

    // ── Technical Details (OEM) ─────────────────────────────────────────────
    { key: "oemCode", label: "OEM Code", type: "text", section: "Technical Details (OEM)", inTable: true, defaultHidden: true, width: 120 },
    { key: "oemModelNo", label: "OEM Model No.", type: "text", section: "Technical Details (OEM)", inTable: true, defaultHidden: true, width: 140 },
    { key: "productRawDescription", label: "Product Raw Description", type: "textarea", section: "Technical Details (OEM)" },
    { key: "oemTopViewLayoutFile", label: "Product Top View Layout File (OEM)", type: "url", section: "Technical Details (OEM)" },
    { key: "oemOperatingVoltage", label: "Operating Voltage (OEM)", type: "text", section: "Technical Details (OEM)", placeholder: "e.g. 415V", width: 130 },
    { key: "oemPhaseRequirement", label: "Phase Requirement (OEM)", type: "select", options: PHASE_OPTS, section: "Technical Details (OEM)", width: 140 },
    { key: "oemStartingLoadKw", label: "Starting Load (OEM)", type: "number", unit: "kW", section: "Technical Details (OEM)", defaultValue: 0, width: 130, align: "right" },
    { key: "oemRunningLoadKw", label: "Running Load (OEM)", type: "number", unit: "kW", section: "Technical Details (OEM)", defaultValue: 0, width: 130, align: "right" },
    { key: "oemStabilizerLoadKva", label: "Stabilizer Load (OEM)", type: "number", unit: "KVA", section: "Technical Details (OEM)", defaultValue: 0, width: 140, align: "right" },
    { key: "oemAirFlowRate", label: "Air Flow Rate Required (OEM)", type: "number", section: "Technical Details (OEM)", defaultValue: 0, width: 160, align: "right" },
    { key: "oemAirFlowUom", label: "Air Flow Rate UoM (OEM)", type: "master", master: "flow_uom", section: "Technical Details (OEM)", width: 150 },
    { key: "oemAirPressure", label: "Air Pressure Required (OEM)", type: "number", section: "Technical Details (OEM)", defaultValue: 0, width: 160, align: "right" },
    { key: "oemAirPressureUom", label: "Air Pressure UoM (OEM)", type: "master", master: "pressure_uom", section: "Technical Details (OEM)", width: 150 },
    { key: "oemPreRequisiteInstallation", label: "OEM Pre-Requisite Item Detail for Installation", type: "textarea", section: "Technical Details (OEM)" },
    { key: "oemOperationManual", label: "OEM Operation Manual", type: "url", section: "Technical Details (OEM)" },
    { key: "oemElectricalDiagram", label: "OEM Electrical Diagram", type: "url", section: "Technical Details (OEM)" },
    { key: "oemToolBoxItems", label: "OEM Tool Box Items", type: "textarea", section: "Technical Details (OEM)" },
    { key: "oemSpares", label: "OEM Spares", type: "textarea", section: "Technical Details (OEM)" },
    { key: "internalTeamFaq", label: "Internal Team FAQ", type: "url", section: "Technical Details (OEM)" },
    { key: "technicalAssemblyDrawingsFolder", label: "Technical Assembly Drawings (Folder Link)", type: "url", section: "Technical Details (OEM)" },
    { key: "technicalInternalRemarks", label: "Technical Internal Remarks", type: "textarea", section: "Technical Details (OEM)" },
    { key: "oemRemarks", label: "OEM Remarks", type: "textarea", section: "Technical Details (OEM)" },

    // ── Software Input ──────────────────────────────────────────────────────
    // The sheet's "Software Input" group — free-text staging columns the
    // software team fills (kept as text, separate from the authoritative
    // technical fields above; format is intentionally unconstrained).
    { key: "swSpeed", label: "Speed", type: "text", section: "Software Input", width: 120 },
    { key: "swPowerDetails", label: "Power Details", type: "text", section: "Software Input", width: 140 },
    { key: "swPressureRequirements", label: "Pressure Requirements", type: "text", section: "Software Input", width: 150 },
    { key: "swPackageDimension", label: "Package Dimension", type: "text", section: "Software Input", width: 150 },
    { key: "routes", label: "Routes", type: "text", section: "Software Input", width: 120 },
    { key: "isr", label: "ISR", type: "text", section: "Software Input", width: 120 },
  ],
};

export const SUBMODULE_SCHEMAS: Record<ProductSubmoduleKey, SubmoduleSchema> = {
  product: PRODUCT_SCHEMA,
};

export const SUBMODULE_ORDER: ProductSubmoduleKey[] = ["product"];

export function getSchema(key: ProductSubmoduleKey): SubmoduleSchema {
  return SUBMODULE_SCHEMAS[key];
}
