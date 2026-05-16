/**
 * Real Estate Properties — Seed Script
 * ====================================
 *
 * Inserts a varied catalogue of dummy properties so the MLM commission /
 * lead / transaction flows have realistic inventory to act on. Covers every
 * PropertyType + PropertySubType combo, with extra weight on LAND/PLOT
 * since that's the headline use-case the team wants to test.
 *
 * Inventory shape (≈ 35 properties):
 *   LAND          → PLOT × 6, FARM × 2  (residential plots, NA plots,
 *                   gated layouts, corner plots, agri-land, hill plots)
 *   RESIDENTIAL   → APARTMENT × 4, VILLA × 2, HOUSE × 2, TOWNHOUSE × 2,
 *                   STUDIO × 2, PENTHOUSE × 2
 *   COMMERCIAL    → OFFICE × 3, RETAIL × 2, WAREHOUSE × 2, HOTEL × 1
 *   INDUSTRIAL    → WAREHOUSE × 2, OTHER × 1   (factory shed, MIDC unit)
 *   AGRICULTURAL  → FARM × 2
 *
 * Listing agents are spread across whatever AgentProfiles exist in the org
 * (the hierarchy from `seed:re-team`). If only the root agent exists, all
 * properties get listed by them. Run `npm run seed:re-team` first for the
 * most realistic distribution.
 *
 * Idempotent — every row uses a stable `seed_prop_*` ID with upsert
 * semantics. Re-running the script just refreshes the catalogue in place.
 *
 * Run:
 *   npm run seed:re-properties
 *
 * Override targets:
 *   $env:SEED_ORG_ID="..."; $env:SEED_ROOT_USER_ID="..."; npm run seed:re-properties
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const ROOT_ORG_ID = process.env.SEED_ORG_ID ?? "cmotuh90k00jcnx0j9j5og0ez";
const ROOT_USER_ID = process.env.SEED_ROOT_USER_ID ?? "cmotufdoz00j7nx0jlx3ocypc";

// ── Property catalogue ──────────────────────────────────────────────────
// Every entry is rendered into a `re_properties` row; `seedKey` becomes the
// stable ID `seed_prop_<seedKey>` so re-runs are idempotent.

type CommissionTerm =
  | { kind: "PERCENTAGE"; pct: number }
  | { kind: "FLAT_FEE"; flat: number };

interface SeedProperty {
  seedKey: string;
  title: string;
  code: string;
  description: string;
  type:
    | "RESIDENTIAL"
    | "COMMERCIAL"
    | "LAND"
    | "INDUSTRIAL"
    | "AGRICULTURAL";
  subType:
    | "APARTMENT"
    | "VILLA"
    | "HOUSE"
    | "TOWNHOUSE"
    | "STUDIO"
    | "PENTHOUSE"
    | "OFFICE"
    | "RETAIL"
    | "WAREHOUSE"
    | "HOTEL"
    | "PLOT"
    | "FARM"
    | "OTHER";
  status?: "DRAFT" | "AVAILABLE" | "UNDER_CONTRACT" | "SOLD" | "WITHDRAWN" | "EXPIRED";
  addressLine1: string;
  city: string;
  state: string;
  country?: string;
  postalCode: string;
  listingPrice: number;
  area: number;
  areaUnit: "sqyd" | "sqft" | "sqm" | "acre" | "hectare";
  bedrooms?: number;
  bathrooms?: number;
  parkingSpots?: number;
  yearBuilt?: number;
  features: string[];
  commission: CommissionTerm;
  imageSeed: string;
  // Category-specific identifier (FR-1.1+). When omitted, sensible defaults
  // are derived from `code` / `addressLine1` in deriveIdentity() below.
  projectName?: string;
  block?: string;
  floor?: string;
  unitNumber?: string;
}

/**
 * Best-effort derivation of project / unit identifier fields when the
 * catalogue entry didn't supply them. Goal: keep the seed realistic
 * without having to hand-edit every property.
 *   - `unitNumber` → trailing numeric segment of the code (LAND-PUN-001 → "001")
 *   - `projectName` → first comma-separated chunk of `addressLine1`,
 *      with trailing "Plot N", "Tower N" etc. stripped so the name reads
 *      cleanly ("Hinjewadi Phase III").
 *   - `block` / `floor` → null unless the entry sets them explicitly.
 */
function deriveIdentity(p: SeedProperty): {
  projectName: string | null;
  block: string | null;
  floor: string | null;
  unitNumber: string | null;
} {
  const unitNumber =
    p.unitNumber ?? p.code.match(/-(\d{3,})$/)?.[1] ?? null;
  const projectName =
    p.projectName ??
    p.addressLine1
      .split(",")[0]
      .replace(
        /\s*(Plot|Tower|Wing|Survey|Building|Block)\s+[A-Z0-9-]+.*$/i,
        "",
      )
      .trim() ||
    null;
  return {
    projectName,
    block: p.block ?? null,
    floor: p.floor ?? null,
    unitNumber,
  };
}

const CATALOGUE: SeedProperty[] = [
  // ─── LAND / PLOT (8) ────────────────────────────────────────────────────
  {
    seedKey: "land_pune_hinjewadi",
    title: "Residential Plot, Hinjewadi Phase III",
    code: "LAND-PUN-001",
    description:
      "556 sq.yd residential plot inside a gated layout, 30 min from Pune airport. Clear title, NA-converted, immediate possession.",
    type: "LAND", subType: "PLOT",
    addressLine1: "Hinjewadi Phase III, Plot 142",
    city: "Pune", state: "Maharashtra", postalCode: "411057",
    listingPrice: 12_000_000, area: 556, areaUnit: "sqyd",
    features: ["gated-layout", "corner-plot", "NA-converted", "boundary-wall"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "puneplot",
  },
  {
    seedKey: "land_thane_ghodbunder",
    title: "NA Plot, Thane Ghodbunder",
    code: "LAND-THA-002",
    description:
      "889 sq.yd NA plot facing the main road. Suitable for low-rise residential development. All approvals in place.",
    type: "LAND", subType: "PLOT",
    addressLine1: "Ghodbunder Road, Survey 142",
    city: "Thane", state: "Maharashtra", postalCode: "400615",
    listingPrice: 18_000_000, area: 889, areaUnit: "sqyd",
    features: ["main-road", "NA-converted", "development-ready"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "thaneplot",
  },
  {
    seedKey: "land_blr_devanahalli",
    title: "Investment Plot, Devanahalli (near BIA)",
    code: "LAND-BLR-003",
    description:
      "30 × 40 ft (133 sq.yd) plot in a BMRDA-approved layout, 12 km from Bengaluru International Airport. High-appreciation pocket.",
    type: "LAND", subType: "PLOT",
    addressLine1: "BMRDA Layout, Devanahalli",
    city: "Bengaluru", state: "Karnataka", postalCode: "562110",
    listingPrice: 4_500_000, area: 133, areaUnit: "sqyd",
    features: ["BMRDA-approved", "30x40", "near-airport", "appreciation-zone"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "blrdevanahalli",
  },
  {
    seedKey: "land_hyd_shadnagar",
    title: "HMDA Plot, Shadnagar",
    code: "LAND-HYD-004",
    description:
      "200 sq.yd HMDA-approved residential plot in Shadnagar growth corridor. Clear title, immediate registration.",
    type: "LAND", subType: "PLOT",
    addressLine1: "Shadnagar Layout, Survey 88",
    city: "Hyderabad", state: "Telangana", postalCode: "509216",
    listingPrice: 3_200_000, area: 200, areaUnit: "sqyd",
    features: ["HMDA-approved", "clear-title", "growth-corridor"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "hydplot",
  },
  {
    seedKey: "land_jaipur_ajmer_rd",
    title: "Commercial Plot, Ajmer Road",
    code: "LAND-JAI-005",
    description:
      "Corner commercial plot of 500 sq.yd on Ajmer Road, Jaipur. JDA-approved, 40 ft frontage, ideal for showroom or hotel.",
    type: "LAND", subType: "PLOT",
    addressLine1: "Ajmer Road, near Mansarovar",
    city: "Jaipur", state: "Rajasthan", postalCode: "302020",
    listingPrice: 22_500_000, area: 500, areaUnit: "sqyd",
    features: ["corner-plot", "JDA-approved", "commercial-zone", "highway-frontage"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "jaipurplot",
  },
  {
    seedKey: "land_ncr_yamuna_expy",
    title: "Yamuna Expressway Plot, Sector 22D",
    code: "LAND-NCR-006",
    description:
      "359 sq.yd YEIDA plot on Yamuna Expressway, near upcoming Jewar International Airport. Allotment letter ready.",
    type: "LAND", subType: "PLOT",
    addressLine1: "YEIDA Sector 22D, Plot 47",
    city: "Greater Noida", state: "Uttar Pradesh", postalCode: "203207",
    listingPrice: 9_800_000, area: 359, areaUnit: "sqyd",
    features: ["YEIDA", "near-jewar-airport", "expressway-access"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "yamunaplot",
  },
  {
    seedKey: "land_lonavala_farm",
    title: "Hilltop Farmhouse Land, Lonavala",
    code: "LAND-LON-007",
    description: "2-acre farmhouse plot with mountain view and existing borewell. Privately gated, scenic Pavna lake nearby.",
    type: "LAND", subType: "FARM",
    addressLine1: "Pavna Lake Road",
    city: "Lonavala", state: "Maharashtra", postalCode: "410401",
    listingPrice: 32_000_000, area: 2, areaUnit: "acre",
    features: ["mountain-view", "borewell", "lake-nearby", "gated"],
    commission: { kind: "PERCENTAGE", pct: 3 },
    imageSeed: "lonavalafarm",
  },
  {
    seedKey: "land_nashik_vineyard",
    title: "Vineyard Land Parcel, Nashik",
    code: "LAND-NSK-008",
    description: "5-acre fertile parcel in Nashik wine country. Drip irrigation set up. Suitable for vineyard or weekend farm.",
    type: "LAND", subType: "FARM",
    addressLine1: "Dindori Road, Survey 56",
    city: "Nashik", state: "Maharashtra", postalCode: "422202",
    listingPrice: 18_500_000, area: 5, areaUnit: "acre",
    features: ["fertile-soil", "drip-irrigation", "wine-country"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "nashikvineyard",
  },

  // ─── RESIDENTIAL — APARTMENT (4) ────────────────────────────────────────
  {
    seedKey: "res_andheri_3bhk",
    title: "3 BHK Sea-facing Apartment, Andheri West",
    code: "RES-AND-001",
    description: "Spacious 3 BHK apartment with sea-facing balcony. Park view from master bedroom. RERA-registered.",
    type: "RESIDENTIAL", subType: "APARTMENT",
    addressLine1: "Plot 7, Lokhandwala Complex",
    city: "Mumbai", state: "Maharashtra", postalCode: "400053",
    listingPrice: 25_000_000, area: 1450, areaUnit: "sqft",
    bedrooms: 3, bathrooms: 3, parkingSpots: 2, yearBuilt: 2018,
    features: ["pool", "gym", "gated", "power-backup", "clubhouse", "RERA"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "andheri3bhk",
    projectName: "Lokhandwala Greens", block: "Tower B", floor: "12", unitNumber: "1203",
  },
  {
    seedKey: "res_bandra_2bhk",
    title: "2 BHK Apartment, Bandra West",
    code: "RES-BAN-002",
    description: "Renovated 2 BHK in Pali Hill area with hill view. Ready to move in.",
    type: "RESIDENTIAL", subType: "APARTMENT", status: "UNDER_CONTRACT",
    addressLine1: "Pali Hill, Building 14",
    city: "Mumbai", state: "Maharashtra", postalCode: "400050",
    listingPrice: 32_000_000, area: 1100, areaUnit: "sqft",
    bedrooms: 2, bathrooms: 2, parkingSpots: 1, yearBuilt: 2019,
    features: ["renovated", "hill-view", "gated"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "bandra2bhk",
    projectName: "Pali Hill Residency", block: "Wing A", floor: "7", unitNumber: "704",
  },
  {
    seedKey: "res_blr_whitefield_3bhk",
    title: "3 BHK in Prestige Lakeside, Whitefield",
    code: "RES-BLR-003",
    description: "Lake-facing 3 BHK in Prestige Lakeside Habitat. Tennis court, swimming pool, 24x7 security.",
    type: "RESIDENTIAL", subType: "APARTMENT",
    addressLine1: "Whitefield-Sarjapur Road",
    city: "Bengaluru", state: "Karnataka", postalCode: "560066",
    listingPrice: 21_500_000, area: 1820, areaUnit: "sqft",
    bedrooms: 3, bathrooms: 3, parkingSpots: 2, yearBuilt: 2017,
    features: ["lake-view", "tennis", "pool", "clubhouse", "kids-play-area"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "blrwhitefield",
    projectName: "Prestige Lakeside Habitat", block: "Tower 4", floor: "9", unitNumber: "904",
  },
  {
    seedKey: "res_gurgaon_dlf",
    title: "4 BHK in DLF Camellias, Sector 42",
    code: "RES-GUR-004",
    description: "Luxury 4 BHK in DLF Camellias on Golf Course Road. Skyline views, designer kitchen, marble flooring.",
    type: "RESIDENTIAL", subType: "APARTMENT",
    addressLine1: "Golf Course Road, Sector 42",
    city: "Gurugram", state: "Haryana", postalCode: "122002",
    listingPrice: 145_000_000, area: 7200, areaUnit: "sqft",
    bedrooms: 4, bathrooms: 5, parkingSpots: 3, yearBuilt: 2019,
    features: ["golf-view", "concierge", "spa", "valet", "smart-home"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "gurgaondlf",
    projectName: "DLF Camellias", block: "Tower 9", floor: "22", unitNumber: "2201",
  },

  // ─── RESIDENTIAL — VILLA / HOUSE / TOWNHOUSE / STUDIO / PENTHOUSE ───────
  {
    seedKey: "res_goa_villa",
    title: "Sea-facing Villa, Anjuna Goa",
    code: "RES-GOA-005",
    description: "Luxury 5 BHK villa in Anjuna with private pool and 6,500 sqft built-up area.",
    type: "RESIDENTIAL", subType: "VILLA",
    addressLine1: "Anjuna Beach Road",
    city: "North Goa", state: "Goa", postalCode: "403509",
    listingPrice: 80_000_000, area: 6500, areaUnit: "sqft",
    bedrooms: 5, bathrooms: 6, parkingSpots: 4, yearBuilt: 2020,
    features: ["pool", "sea-view", "private-garden", "staff-quarters", "wine-cellar"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "goavilla",
  },
  {
    seedKey: "res_blr_villa",
    title: "4 BHK Villa, Sarjapur",
    code: "RES-BLR-006",
    description: "Independent 4 BHK villa in a gated community of 80 villas. Clubhouse, pool, kids' play.",
    type: "RESIDENTIAL", subType: "VILLA",
    addressLine1: "Sarjapur Road, Prestige Glenwood",
    city: "Bengaluru", state: "Karnataka", postalCode: "562125",
    listingPrice: 55_000_000, area: 3800, areaUnit: "sqft",
    bedrooms: 4, bathrooms: 5, parkingSpots: 2, yearBuilt: 2021,
    features: ["clubhouse", "pool", "gated", "park"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "blrvilla",
  },
  {
    seedKey: "res_chennai_house",
    title: "Independent House, T. Nagar",
    code: "RES-CHE-007",
    description: "3-storey independent house, 4 BHK, in the heart of T. Nagar. Walking distance to Pondy Bazaar.",
    type: "RESIDENTIAL", subType: "HOUSE",
    addressLine1: "Burkit Road, T. Nagar",
    city: "Chennai", state: "Tamil Nadu", postalCode: "600017",
    listingPrice: 42_000_000, area: 2400, areaUnit: "sqft",
    bedrooms: 4, bathrooms: 4, parkingSpots: 2, yearBuilt: 2010,
    features: ["independent", "city-centre", "borewell"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "chennaihouse",
  },
  {
    seedKey: "res_jaipur_house",
    title: "Heritage Haveli, Jaipur Old City",
    code: "RES-JAI-008",
    description: "Restored 5 BHK haveli with traditional jharokhas and central courtyard. Walking distance to Hawa Mahal.",
    type: "RESIDENTIAL", subType: "HOUSE",
    addressLine1: "Brahmpuri, near Hawa Mahal",
    city: "Jaipur", state: "Rajasthan", postalCode: "302002",
    listingPrice: 38_000_000, area: 3200, areaUnit: "sqft",
    bedrooms: 5, bathrooms: 4, parkingSpots: 2, yearBuilt: 1925,
    features: ["heritage", "courtyard", "restored", "old-city"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "jaipurhaveli",
  },
  {
    seedKey: "res_goregaon_townhouse",
    title: "4 BHK Townhouse, Aarey Goregaon",
    code: "RES-GOR-009",
    description: "Independent 4 BHK townhouse with private garden. Gated complex of 24 units.",
    type: "RESIDENTIAL", subType: "TOWNHOUSE",
    addressLine1: "Aarey Colony Road",
    city: "Mumbai", state: "Maharashtra", postalCode: "400065",
    listingPrice: 35_000_000, area: 2400, areaUnit: "sqft",
    bedrooms: 4, bathrooms: 4, parkingSpots: 2, yearBuilt: 2014,
    features: ["garden", "gated", "power-backup"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "goregaontownhouse",
  },
  {
    seedKey: "res_pune_townhouse",
    title: "Row House, Baner",
    code: "RES-PUN-010",
    description: "3 BHK row house in a gated layout in Baner. Terrace garden and 2-car parking.",
    type: "RESIDENTIAL", subType: "TOWNHOUSE",
    addressLine1: "Baner Pashan Link Road",
    city: "Pune", state: "Maharashtra", postalCode: "411045",
    listingPrice: 19_500_000, area: 1800, areaUnit: "sqft",
    bedrooms: 3, bathrooms: 3, parkingSpots: 2, yearBuilt: 2018,
    features: ["terrace-garden", "gated", "row-house"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "punerowhouse",
  },
  {
    seedKey: "res_powai_studio",
    title: "Furnished Studio, Hiranandani Powai",
    code: "RES-POW-011",
    description: "Compact furnished studio near Hiranandani Gardens. Ideal for working professionals.",
    type: "RESIDENTIAL", subType: "STUDIO",
    addressLine1: "Hiranandani Gardens, Tower 4",
    city: "Mumbai", state: "Maharashtra", postalCode: "400076",
    listingPrice: 8_500_000, area: 480, areaUnit: "sqft",
    bedrooms: 1, bathrooms: 1, parkingSpots: 1, yearBuilt: 2015,
    features: ["furnished", "gym", "pool", "metro-access"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "powaistudio",
    projectName: "Hiranandani Gardens", block: "Tower 4", floor: "8", unitNumber: "812",
  },
  {
    seedKey: "res_blr_studio",
    title: "Co-living Studio, Koramangala",
    code: "RES-BLR-012",
    description: "Designer studio in a managed co-living building. Includes housekeeping and high-speed Wi-Fi.",
    type: "RESIDENTIAL", subType: "STUDIO",
    addressLine1: "5th Block, Koramangala",
    city: "Bengaluru", state: "Karnataka", postalCode: "560095",
    listingPrice: 6_900_000, area: 420, areaUnit: "sqft",
    bedrooms: 1, bathrooms: 1, parkingSpots: 1, yearBuilt: 2022,
    features: ["managed", "wifi", "housekeeping", "central"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "blrstudio",
  },
  {
    seedKey: "res_worli_penthouse",
    title: "Luxury Penthouse, Worli Sea Face",
    code: "RES-WOR-013",
    description: "Duplex penthouse with private terrace and unobstructed sea view. Private lift access.",
    type: "RESIDENTIAL", subType: "PENTHOUSE",
    addressLine1: "Worli Sea Face, Tower B",
    city: "Mumbai", state: "Maharashtra", postalCode: "400018",
    listingPrice: 150_000_000, area: 5500, areaUnit: "sqft",
    bedrooms: 4, bathrooms: 5, parkingSpots: 4, yearBuilt: 2021,
    features: ["sea-view", "terrace", "jacuzzi", "private-lift", "smart-home"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "worlipenthouse",
    projectName: "Worli Sea Crest", block: "Tower B", floor: "Duplex 38-39", unitNumber: "PH-3801",
  },
  {
    seedKey: "res_delhi_penthouse",
    title: "Penthouse, Vasant Vihar",
    code: "RES-DEL-014",
    description: "Top-floor 5 BHK penthouse with wraparound terrace overlooking the Ridge.",
    type: "RESIDENTIAL", subType: "PENTHOUSE",
    addressLine1: "Vasant Vihar, Block C",
    city: "New Delhi", state: "Delhi", postalCode: "110057",
    listingPrice: 125_000_000, area: 5800, areaUnit: "sqft",
    bedrooms: 5, bathrooms: 6, parkingSpots: 3, yearBuilt: 2017,
    features: ["wraparound-terrace", "private-lift", "smart-home", "designer"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "delhipenthouse",
  },

  // ─── COMMERCIAL — OFFICE / RETAIL / WAREHOUSE / HOTEL ───────────────────
  {
    seedKey: "com_bkc_office",
    title: "Grade-A Office, BKC",
    code: "COM-BKC-001",
    description: "4,500 sqft Grade-A office in Bandra-Kurla Complex Block G. Bare-shell, ready for fit-out.",
    type: "COMMERCIAL", subType: "OFFICE", status: "UNDER_CONTRACT",
    addressLine1: "BKC Block G, Plot 32",
    city: "Mumbai", state: "Maharashtra", postalCode: "400051",
    listingPrice: 120_000_000, area: 4500, areaUnit: "sqft",
    bathrooms: 4, parkingSpots: 8, yearBuilt: 2019,
    features: ["air-conditioned", "fire-safety", "backup-power", "cafeteria"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "bkcoffice",
    projectName: "BKC Capital", block: "Block G", floor: "14", unitNumber: "1401",
  },
  {
    seedKey: "com_blr_office",
    title: "Tech Park Office, Outer Ring Road",
    code: "COM-BLR-002",
    description: "12,000 sqft fitted-out office in Cessna Business Park. 200 workstations, 4 cabins, 2 conference rooms.",
    type: "COMMERCIAL", subType: "OFFICE",
    addressLine1: "Cessna Business Park, ORR",
    city: "Bengaluru", state: "Karnataka", postalCode: "560103",
    listingPrice: 220_000_000, area: 12000, areaUnit: "sqft",
    bathrooms: 6, parkingSpots: 30, yearBuilt: 2018,
    features: ["fitted-out", "tech-park", "metro-nearby", "food-court"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "blroffice",
  },
  {
    seedKey: "com_pune_office",
    title: "Coworking Floor, Hinjewadi",
    code: "COM-PUN-003",
    description: "Entire 8,500 sqft floor leased to a coworking operator. Stable rental yield.",
    type: "COMMERCIAL", subType: "OFFICE",
    addressLine1: "EON IT Park, Hinjewadi Phase II",
    city: "Pune", state: "Maharashtra", postalCode: "411057",
    listingPrice: 95_000_000, area: 8500, areaUnit: "sqft",
    bathrooms: 4, parkingSpots: 18, yearBuilt: 2016,
    features: ["leased", "rental-yield", "tech-park"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "puneoffice",
  },
  {
    seedKey: "com_bandra_retail",
    title: "High-Street Retail, Linking Road",
    code: "COM-BAN-004",
    description: "600 sqft high-street retail on Linking Road. Frontage 18 feet, glass façade.",
    type: "COMMERCIAL", subType: "RETAIL",
    addressLine1: "Linking Road, near Holy Family",
    city: "Mumbai", state: "Maharashtra", postalCode: "400050",
    listingPrice: 20_000_000, area: 600, areaUnit: "sqft",
    bathrooms: 1, parkingSpots: 0, yearBuilt: 2010,
    features: ["street-front", "heavy-footfall", "glass-facade"],
    commission: { kind: "FLAT_FEE", flat: 250_000 },
    imageSeed: "bandraretail",
  },
  {
    seedKey: "com_blr_retail",
    title: "Mall Anchor Store, Phoenix Marketcity",
    code: "COM-BLR-005",
    description: "2,400 sqft anchor-store unit on the ground floor of Phoenix Marketcity. Fitted out.",
    type: "COMMERCIAL", subType: "RETAIL",
    addressLine1: "Whitefield Main Road",
    city: "Bengaluru", state: "Karnataka", postalCode: "560048",
    listingPrice: 65_000_000, area: 2400, areaUnit: "sqft",
    bathrooms: 2, parkingSpots: 2, yearBuilt: 2014,
    features: ["mall", "anchor-store", "high-footfall"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "blrretail",
    projectName: "Phoenix Marketcity", block: "East Wing", floor: "Ground", unitNumber: "G-12",
  },
  {
    seedKey: "com_bhiwandi_warehouse",
    title: "Logistics Warehouse, Bhiwandi MIDC",
    code: "COM-BHI-006",
    description: "15,000 sqft warehouse with truck-friendly access and 24x7 security.",
    type: "COMMERCIAL", subType: "WAREHOUSE",
    addressLine1: "Padgha MIDC Phase II",
    city: "Bhiwandi", state: "Maharashtra", postalCode: "421302",
    listingPrice: 30_000_000, area: 15000, areaUnit: "sqft",
    bathrooms: 2, parkingSpots: 6, yearBuilt: 2017,
    features: ["truck-bay", "cctv", "loading-dock", "fire-safety"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "bhiwandi",
  },
  {
    seedKey: "com_ncr_warehouse",
    title: "Cold Storage Warehouse, Manesar",
    code: "COM-NCR-007",
    description: "20,000 sqft cold-storage warehouse with multi-temperature zones. NHAI access.",
    type: "COMMERCIAL", subType: "WAREHOUSE",
    addressLine1: "IMT Manesar, Sector 8",
    city: "Manesar", state: "Haryana", postalCode: "122051",
    listingPrice: 85_000_000, area: 20000, areaUnit: "sqft",
    bathrooms: 4, parkingSpots: 10, yearBuilt: 2020,
    features: ["cold-storage", "multi-temp-zones", "NHAI-access", "24x7"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "ncrcoldstorage",
  },
  {
    seedKey: "com_udaipur_hotel",
    title: "Boutique Hotel, Lake Pichola",
    code: "COM-UDA-008",
    description: "32-key boutique hotel overlooking Lake Pichola. Operational asset with 70% occupancy.",
    type: "COMMERCIAL", subType: "HOTEL",
    addressLine1: "Hanuman Ghat, Lake Pichola",
    city: "Udaipur", state: "Rajasthan", postalCode: "313001",
    listingPrice: 320_000_000, area: 18000, areaUnit: "sqft",
    bedrooms: 32, bathrooms: 32, parkingSpots: 12, yearBuilt: 2012,
    features: ["lake-view", "operational", "32-keys", "rooftop-restaurant"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "udaipurhotel",
  },

  // ─── INDUSTRIAL ─────────────────────────────────────────────────────────
  {
    seedKey: "ind_pune_chakan",
    title: "Industrial Shed, Chakan MIDC",
    code: "IND-PUN-001",
    description: "25,000 sqft industrial shed with 32 ft clear height in Chakan MIDC. Power load: 500 KVA sanctioned.",
    type: "INDUSTRIAL", subType: "WAREHOUSE",
    addressLine1: "Chakan MIDC Phase III, Plot G-12",
    city: "Pune", state: "Maharashtra", postalCode: "410501",
    listingPrice: 95_000_000, area: 25000, areaUnit: "sqft",
    parkingSpots: 8, yearBuilt: 2015,
    features: ["MIDC", "32ft-clear-height", "500KVA", "EOT-crane"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "chakanshed",
  },
  {
    seedKey: "ind_baddi_factory",
    title: "Pharma Factory, Baddi HP",
    code: "IND-HP-002",
    description: "18,000 sqft pharma manufacturing facility with WHO-GMP layout. Water + power tied up.",
    type: "INDUSTRIAL", subType: "OTHER",
    addressLine1: "Industrial Area, Baddi",
    city: "Baddi", state: "Himachal Pradesh", postalCode: "173205",
    listingPrice: 145_000_000, area: 18000, areaUnit: "sqft",
    parkingSpots: 12, yearBuilt: 2014,
    features: ["pharma-grade", "GMP-layout", "tax-zone", "ETP"],
    commission: { kind: "PERCENTAGE", pct: 2.5 },
    imageSeed: "baddifactory",
  },
  {
    seedKey: "ind_chennai_oragadam",
    title: "Auto-Component Unit, Oragadam",
    code: "IND-CHE-003",
    description: "30,000 sqft built-up unit in Oragadam auto cluster. 800 KVA, EOT crane, fire NOC in place.",
    type: "INDUSTRIAL", subType: "WAREHOUSE",
    addressLine1: "Oragadam Auto Cluster",
    city: "Chennai", state: "Tamil Nadu", postalCode: "602105",
    listingPrice: 165_000_000, area: 30000, areaUnit: "sqft",
    parkingSpots: 15, yearBuilt: 2016,
    features: ["auto-cluster", "EOT-crane", "800KVA", "fire-NOC"],
    commission: { kind: "PERCENTAGE", pct: 2 },
    imageSeed: "oragadam",
  },

  // ─── AGRICULTURAL ───────────────────────────────────────────────────────
  {
    seedKey: "agri_lonavala_farmhouse",
    title: "Hilltop Farmhouse, Lonavala",
    code: "AGR-LON-001",
    description: "2-acre farmhouse with private pool and orchard. Ready to occupy.",
    type: "AGRICULTURAL", subType: "FARM",
    addressLine1: "Pavna Lake Road",
    city: "Lonavala", state: "Maharashtra", postalCode: "410401",
    listingPrice: 45_000_000, area: 2, areaUnit: "acre",
    bedrooms: 4, bathrooms: 4, parkingSpots: 6, yearBuilt: 2016,
    features: ["pool", "orchard", "mountain-view", "caretaker-quarters"],
    commission: { kind: "PERCENTAGE", pct: 3 },
    imageSeed: "lonavalafarmhouse",
  },
  {
    seedKey: "agri_alibaug_farm",
    title: "Coconut Farm, Alibaug",
    code: "AGR-ALI-002",
    description: "3.5-acre productive coconut farm with farmhouse and 2 borewells. 45 mins from Mumbai by speedboat.",
    type: "AGRICULTURAL", subType: "FARM",
    addressLine1: "Awas Beach Road",
    city: "Alibaug", state: "Maharashtra", postalCode: "402201",
    listingPrice: 62_000_000, area: 3.5, areaUnit: "acre",
    bedrooms: 3, bathrooms: 3, parkingSpots: 4, yearBuilt: 2018,
    features: ["coconut-farm", "borewells", "near-beach", "farmhouse"],
    commission: { kind: "PERCENTAGE", pct: 3 },
    imageSeed: "alibaugfarm",
  },
];

// ─── Listing-agent allocation ───────────────────────────────────────────
// Spread the catalogue across whatever AgentProfiles exist in the org so
// the MLM commission engine has multi-agent activity to operate on. Falls
// back to the root user if no agents have been seeded yet.

async function pickListingAgents(): Promise<string[]> {
  const agents = await prisma.agentProfile.findMany({
    where: { organizationId: ROOT_ORG_ID },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  const userIds = agents.map((a) => a.userId).filter(Boolean);
  if (userIds.length === 0) {
    console.log(
      "[seed]  · No AgentProfiles found — every property will be listed by ROOT_USER_ID. " +
        "Run `npm run seed:re-team` first for a multi-agent distribution.",
    );
    return [ROOT_USER_ID];
  }
  console.log(`[seed]  · Distributing properties across ${userIds.length} listing agents`);
  return userIds;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed] Seeding ${CATALOGUE.length} properties for org ${ROOT_ORG_ID}`);

  const listingAgents = await pickListingAgents();

  // Sanity: bail early if the org doesn't exist — prevents creating
  // dangling rows that the app can't find.
  const orgExists = await prisma.organization.findUnique({
    where: { id: ROOT_ORG_ID },
    select: { id: true },
  });
  if (!orgExists) {
    throw new Error(
      `Organization ${ROOT_ORG_ID} not found. Set SEED_ORG_ID or run the org bootstrap first.`,
    );
  }

  let created = 0;
  let updated = 0;

  for (let i = 0; i < CATALOGUE.length; i++) {
    const p = CATALOGUE[i];
    const id = `seed_prop_${p.seedKey}`;
    const listingAgentId = listingAgents[i % listingAgents.length];
    const imageUrl = `https://picsum.photos/seed/${p.imageSeed}/1200/800`;

    const identity = deriveIdentity(p);

    const data: Prisma.PropertyUncheckedCreateInput = {
      id,
      organizationId: ROOT_ORG_ID,
      title: p.title,
      code: p.code,
      description: p.description,
      projectName: identity.projectName,
      block: identity.block,
      floor: identity.floor,
      unitNumber: identity.unitNumber,
      type: p.type,
      subType: p.subType,
      status: p.status ?? "AVAILABLE",
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
      country: p.country ?? "India",
      postalCode: p.postalCode,
      listingPrice: new Prisma.Decimal(p.listingPrice),
      currency: "INR",
      area: new Prisma.Decimal(p.area),
      areaUnit: p.areaUnit,
      bedrooms: p.bedrooms ?? null,
      bathrooms: p.bathrooms ?? null,
      parkingSpots: p.parkingSpots ?? null,
      yearBuilt: p.yearBuilt ?? null,
      features: p.features as unknown as Prisma.InputJsonValue,
      commissionTermType: p.commission.kind,
      commissionPercentage:
        p.commission.kind === "PERCENTAGE" ? new Prisma.Decimal(p.commission.pct) : null,
      commissionFlatFee:
        p.commission.kind === "FLAT_FEE" ? new Prisma.Decimal(p.commission.flat) : null,
      listingAgentId,
      primaryImageUrl: imageUrl,
      createdById: ROOT_USER_ID,
    };

    const existing = await prisma.property.findUnique({ where: { id }, select: { id: true } });
    await prisma.property.upsert({
      where: { id },
      create: data,
      update: {
        title: data.title,
        description: data.description,
        projectName: data.projectName,
        block: data.block,
        floor: data.floor,
        unitNumber: data.unitNumber,
        type: data.type,
        subType: data.subType,
        status: data.status,
        addressLine1: data.addressLine1,
        city: data.city,
        state: data.state,
        country: data.country,
        postalCode: data.postalCode,
        listingPrice: data.listingPrice,
        area: data.area,
        areaUnit: data.areaUnit,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        parkingSpots: data.parkingSpots,
        yearBuilt: data.yearBuilt,
        features: data.features,
        commissionTermType: data.commissionTermType,
        commissionPercentage: data.commissionPercentage,
        commissionFlatFee: data.commissionFlatFee,
        listingAgentId: data.listingAgentId,
        primaryImageUrl: data.primaryImageUrl,
      },
    });

    // Refresh the primary image row so list pages don't show a broken thumb.
    await prisma.propertyImage.deleteMany({ where: { propertyId: id } });
    await prisma.propertyImage.createMany({
      data: [
        { propertyId: id, url: imageUrl, caption: `${p.title} — exterior`, isPrimary: true, sortOrder: 0 },
        { propertyId: id, url: `https://picsum.photos/seed/${p.imageSeed}-2/1200/800`, caption: `${p.title} — view 2`, isPrimary: false, sortOrder: 1 },
        { propertyId: id, url: `https://picsum.photos/seed/${p.imageSeed}-3/1200/800`, caption: `${p.title} — view 3`, isPrimary: false, sortOrder: 2 },
      ],
    });

    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  // ── Summary by category ─────────────────────────────────────────────
  const summary = CATALOGUE.reduce<Record<string, number>>((acc, p) => {
    const k = `${p.type}/${p.subType}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  console.log("");
  console.log(`[seed] Done. ${created} created, ${updated} refreshed.`);
  console.log("[seed] Category breakdown:");
  for (const [k, v] of Object.entries(summary).sort()) {
    console.log(`  · ${k.padEnd(28)} ${v}`);
  }
  console.log("");
  console.log(`[seed] Listing agents used: ${listingAgents.length}`);
  console.log("[seed] Open the Real Estate module to see the new inventory.");
}

main()
  .catch((err) => {
    console.error("[seed] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
