/**
 * Shared client-side types for the Real Estate Brokerage module. These mirror
 * the JSON shapes the handlers in lib/api-handlers/real-estate-* return.
 *
 * Decimal columns from Prisma are serialized as numbers on the wire (see the
 * `serializeProperty` / `serializeLead` helpers in those files), so we use
 * `number` here, not `string`.
 */

export type PropertyType =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "LAND"
  | "INDUSTRIAL"
  | "AGRICULTURAL";

export type PropertySubType =
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

export type PropertyStatus =
  | "DRAFT"
  | "AVAILABLE"
  | "UNDER_CONTRACT"
  | "SOLD"
  | "WITHDRAWN"
  | "EXPIRED";

export type PropertyDocumentType =
  | "TITLE_DEED"
  | "NOC"
  | "FLOOR_PLAN"
  | "TAX_RECEIPT"
  | "AGREEMENT"
  | "POSSESSION_LETTER"
  | "OTHER";

export type CommissionTermType = "PERCENTAGE" | "FLAT_FEE";

export interface Property {
  id: string;
  organizationId: string;
  title: string;
  code: string | null;
  description: string | null;
  // Project / unit identifier (form labels these per category — see
  // PROPERTY_UNIT_LABEL in components/real-estate/constants.ts).
  projectName: string | null;
  block: string | null;
  floor: string | null;
  unitNumber: string | null;
  type: PropertyType;
  subType: PropertySubType | null;
  status: PropertyStatus;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  country: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  listingPrice: number;
  currency: string;
  area: number | null;
  areaUnit: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  yearBuilt: number | null;
  features: string[];
  commissionTermType: CommissionTermType;
  commissionPercentage: number | null;
  commissionFlatFee: number | null;
  listedAt: string;
  expectedClosingAt: string | null;
  finalClosingAt: string | null;
  expiresAt: string | null;
  listingAgentId: string;
  minClosingPercent: number | null;
  primaryImageUrl: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count?: { images: number; documents: number; viewings: number };
}

export interface PropertyImage {
  id: string;
  propertyId: string;
  url: string;
  caption: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface PropertyDocument {
  id: string;
  propertyId: string;
  type: PropertyDocumentType;
  name: string;
  url: string;
  verifiedAt: string | null;
  verifiedById: string | null;
  uploadedById: string;
  createdAt: string;
}

export interface PropertyDetail extends Property {
  images: PropertyImage[];
  documents: PropertyDocument[];
  priceHistory: Array<{
    id: string;
    oldPrice: number;
    newPrice: number;
    changedAt: string;
    changedById: string;
    reason: string | null;
  }>;
  viewings: Array<{
    id: string;
    scheduledAt: string;
    status: ViewingStatus;
    lead: { id: string; name: string; phone: string | null };
  }>;
}

// Agents
export type AgentStatus =
  | "PENDING_KYC"
  | "ACTIVE"
  | "SUSPENDED"
  | "TERMINATED";
export type AgentComplianceStatus =
  | "COMPLIANT"
  | "PENDING_KYC"
  | "NON_COMPLIANT";

export interface AgentProfile {
  id: string;
  organizationId: string;
  userId: string;
  employeeId: string | null;
  sponsorId: string | null;
  parentId: string | null;
  sponsorCode: string | null;
  rankId: string | null;
  rankAssignedAt: string | null;
  status: AgentStatus;
  complianceStatus: AgentComplianceStatus;
  licenseNumber: string | null;
  licenseAuthority: string | null;
  licenseIssuedAt: string | null;
  licenseExpiresAt: string | null;
  joinedAt: string;
  suspendedAt: string | null;
  terminatedAt: string | null;
  suspensionReason: string | null;
  specializations: string[];
  serviceAreas: string[];
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
    phone: string | null;
  };
  rank?: { id: string; name: string; code: string; level: number } | null;
  sponsor?: {
    id: string;
    user?: { first_name: string | null; last_name: string | null; email?: string };
  } | null;
  parent?: {
    id: string;
    user?: { first_name: string | null; last_name: string | null; email?: string };
  } | null;
  // Populated by the detail endpoint (`/agents/[id]`) — preview lists.
  recruits?: Array<{
    id: string;
    status: AgentStatus;
    user: { first_name: string | null; last_name: string | null; email: string };
  }>;
  children?: Array<{
    id: string;
    status: AgentStatus;
    user: { first_name: string | null; last_name: string | null; email: string };
  }>;
  promotions?: Array<{
    id: string;
    fromRankId: string | null;
    toRankId: string;
    triggeredBy: string;
    approvedById: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  _count?: { recruits: number; children: number };
}

export interface Rank {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description: string | null;
  level: number;
  minPersonalSales: number | null;
  minTeamSize: number | null;
  minTeamRevenue: number | null;
  evaluationWindowDays: number | null;
  overridePercents: number[];
  rankUpBonus: number | null;
  teamBonusPercent: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { agents: number };
}

export interface AgentTreeNode {
  id: string;
  parentId: string | null;
  sponsorId: string | null;
  sponsorCode: string | null;
  status: AgentStatus;
  complianceStatus: AgentComplianceStatus;
  rankId: string | null;
  rank: { name: string; code: string; level: number } | null;
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
  };
}

// Leads
export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "VIEWING_SCHEDULED"
  | "NEGOTIATING"
  | "CONVERTED"
  | "LOST";

export type LeadScore = "HOT" | "WARM" | "COLD";
export type LeadSource =
  | "WEBSITE"
  | "REFERRAL"
  | "WALK_IN"
  | "PORTAL"
  | "SOCIAL"
  | "CAMPAIGN"
  | "WEBHOOK"
  | "OTHER";

export type LeadActivityType =
  | "CALL"
  | "EMAIL"
  | "MEETING"
  | "VIEWING"
  | "NOTE"
  | "STATUS_CHANGE"
  | "ASSIGNMENT";

export type ViewingStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

/**
 * AGENT   — captured by an individual agent; visible only to them (and
 *           privileged admin/MD). Silent-duplicate detection applies.
 * COMPANY — open pool — every agent sees it; whoever closes wins.
 */
export type LeadOrigin = "AGENT" | "COMPANY";

export interface Lead {
  id: string;
  organizationId: string;
  /** Capture-side origin. Drives visibility + ownership rules. */
  origin: LeadOrigin;
  /**
   * Final owner once the lead converts (= the agent who closed the
   * related transaction). NULL while the lead is unresolved.
   */
  ownerAgentId: string | null;
  /**
   * Internal silent-duplicate pointer. Set on AGENT-origin captures
   * when an earlier lead in the org matches on normalised phone, email,
   * OR perceptual photo hash (Hamming ≤ 10 bits).
   *
   * **Only privileged users (admin/MD) receive this field** — the lead
   * endpoints strip it from regular-agent responses, so it's safe to
   * read but you should expect it to be `undefined` for the typical
   * agent-side caller.
   */
  duplicateOfLeadId?: string | null;
  /** Customer photo URL (Hostinger). Optional. */
  photoUrl?: string | null;
  /**
   * 16-char lowercase hex dHash of `photoUrl`, computed in the browser
   * at capture time. Used server-side as a third duplicate-detection
   * signal so an agent who deliberately mistypes the phone still trips
   * on the photo. Like `duplicateOfLeadId`, this is included in
   * responses but isn't expected to be read by agent-side UIs.
   */
  photoPhash?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredCities: string[];
  propertyTypes: string[];
  bedroomsMin: number | null;
  status: LeadStatus;
  score: LeadScore;
  source: LeadSource;
  sourceDetails: string | null;
  assignedAgentId: string | null;
  assignedAt: string | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  convertedAt: string | null;
  buyerId: string | null;
  lostReason: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { activities: number; viewings: number };
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: LeadActivityType;
  agentId: string;
  occurredAt: string;
  subject: string | null;
  content: string | null;
  outcome: string | null;
  data: Record<string, any> | null;
  createdAt: string;
}

export interface PropertyViewing {
  id: string;
  organizationId: string;
  leadId: string;
  propertyId: string;
  agentId: string;
  scheduledAt: string;
  durationMin: number;
  status: ViewingStatus;
  feedback: string | null;
  outcomeRating: number | null;
  createdAt: string;
  updatedAt: string;
  property?: {
    id: string;
    title: string;
    code: string | null;
    city: string;
    primaryImageUrl: string | null;
  };
  lead?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
}

// ─── Phase 2 — Finance ───────────────────────────────────────────────────────

export type TransactionStatus = "PENDING" | "CLOSED" | "CANCELLED" | "DISPUTED";
export type TransactionDocumentType =
  | "CONTRACT"
  | "SALE_DEED"
  | "PAYMENT_PROOF"
  | "KYC"
  | "OTHER";

export type CommissionSplitRole =
  | "LISTING_AGENT"
  | "SELLING_AGENT"
  | "BROKERAGE"
  | "OVERRIDE"
  | "RANK_BONUS";

export type CommissionStatus = "ON_HOLD" | "RELEASED" | "REVERSED";

export interface Transaction {
  id: string;
  organizationId: string;
  code: string | null;
  propertyId: string;
  buyerId: string | null;
  listingAgentId: string;
  sellingAgentId: string | null;
  salePrice: number;
  currency: string;
  status: TransactionStatus;
  closedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  commissionRuleId: string | null;
  commissionRuleVersion: number | null;
  baseCommission: number | null;
  paymentTerms: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  property?: {
    id: string;
    title: string;
    code: string | null;
    city: string;
    primaryImageUrl: string | null;
    currency: string;
  };
  buyer?: { id: string; name: string; email: string | null; phone: string | null } | null;
  _count?: { commissionSplits: number; documents: number };
}

export interface TransactionDocument {
  id: string;
  transactionId: string;
  type: TransactionDocumentType;
  name: string;
  url: string;
  uploadedById: string;
  createdAt: string;
}

export interface CommissionSplit {
  id: string;
  organizationId: string;
  transactionId: string;
  ruleId: string | null;
  role: CommissionSplitRole;
  level: number | null;
  beneficiaryUserId: string | null;
  percent: number;
  amount: number;
  status: CommissionStatus;
  ledgerEntryId: string | null;
  reversalLedgerEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionAudit {
  id: string;
  transactionId: string;
  ruleId: string | null;
  ruleVersion: number;
  kind: "CALCULATE" | "REVERSE" | "RELEASE";
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  notes: string | null;
  createdById: string;
  createdAt: string;
}

export interface TransactionDetail extends Omit<Transaction, "property"> {
  // Detail endpoint returns the full Property row, not the trimmed list view.
  property: Property | null;
  documents: TransactionDocument[];
  commissionSplits: CommissionSplit[];
  commissionAudits: CommissionAudit[];
}

export interface CommissionRule {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  propertyType: PropertyType | null;
  version: number;
  isActive: boolean;
  listingAgentPercent: number;
  sellingAgentPercent: number;
  brokeragePercent: number;
  overridePercents: number[];
  useRankOverrides: boolean;
  maxOverrideDepth: number;
  defaultBasePercent: number | null;
  holdPeriodDays: number;
  compressionRule: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionPreview {
  baseCommission: number;
  ruleId: string;
  ruleVersion: number;
  splits: Array<{
    role: CommissionSplitRole;
    level: number | null;
    beneficiaryUserId: string | null;
    percent: number;
    amount: number;
  }>;
}

export type LedgerEntryType = "CREDIT" | "DEBIT";
export type LedgerCategory =
  | "COMMISSION"
  | "OVERRIDE"
  | "BONUS"
  | "DESK_FEE"
  | "MARKETING_FEE"
  | "WITHDRAWAL"
  | "REFUND"
  | "ADJUSTMENT"
  | "REVERSAL"
  | "RANK_UP_BONUS";
export type LedgerStatus = "ON_HOLD" | "RELEASED" | "REVERSED";

export interface Wallet {
  id: string;
  organizationId: string;
  userId: string;
  currency: string;
  availableBalance: number;
  pendingBalance: number;
  totalCredits: number;
  totalDebits: number;
  isFrozen: boolean;
  freezeReason: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
  };
}

export interface LedgerEntry {
  id: string;
  organizationId: string;
  walletId: string;
  type: LedgerEntryType;
  category: LedgerCategory;
  status: LedgerStatus;
  amount: number;
  balanceAfter: number;
  currency: string;
  description: string | null;
  transactionId: string | null;
  splitId: string | null;
  withdrawalId: string | null;
  reversesEntryId: string | null;
  releasedAt: string | null;
  createdById: string;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  organizationId: string;
  userId: string;
  label: string | null;
  bankName: string;
  accountHolderName: string;
  accountNumberLast4: string;
  ifscOrSwift: string;
  branch: string | null;
  country: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WithdrawalStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELLED";

export interface WithdrawalRequest {
  id: string;
  organizationId: string;
  walletId: string;
  userId: string;
  bankAccountId: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  status: WithdrawalStatus;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  paidById: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  bankAccount?: {
    bankName: string;
    accountHolderName: string;
    accountNumberLast4: string;
    ifscOrSwift: string;
  };
  wallet?: { availableBalance: number; currency: string };
}

// ─── Phase 3 — Compliance, Reports, Rank promotion ───────────────────────────

export type ComplianceDocumentType =
  | "GOVERNMENT_ID"
  | "REAL_ESTATE_LICENSE"
  | "TAX_FORM"
  | "AGENCY_AGREEMENT"
  | "ADDRESS_PROOF"
  | "OTHER";

export type ComplianceDocumentStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";

export interface ComplianceDocument {
  id: string;
  organizationId: string;
  agentProfileId: string;
  type: ComplianceDocumentType;
  name: string;
  url: string;
  documentNumber: string | null;
  issuedBy: string | null;
  issuedAt: string | null;
  expiryDate: string | null;
  status: ComplianceDocumentStatus;
  rejectionReason: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  uploadedById: string;
  createdAt: string;
  updatedAt: string;
  agentProfile?: {
    id: string;
    user: {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      avatar: string | null;
    };
  };
}

export interface MyComplianceResponse {
  agent: {
    id: string;
    status: AgentStatus;
    complianceStatus: AgentComplianceStatus;
    licenseNumber: string | null;
    licenseAuthority: string | null;
    licenseIssuedAt: string | null;
    licenseExpiresAt: string | null;
  };
  documents: ComplianceDocument[];
  requiredTypes: readonly string[];
}

export interface AgentComplianceDetail {
  id: string;
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
  };
  complianceStatus: AgentComplianceStatus;
  status: AgentStatus;
  licenseExpiresAt: string | null;
  complianceDocuments: ComplianceDocument[];
}

// Reports — typed loosely since each report has a distinct shape. We give
// each its own interface so consumers stay safe.

export interface SalesRegisterRow {
  id: string;
  code: string | null;
  closedAt: string | null;
  property: { id: string; title: string; code: string | null; city: string } | null;
  buyer: { id: string; name: string } | null;
  listingAgentId: string;
  sellingAgentId: string | null;
  salePrice: number;
  baseCommission: number;
  currency: string;
}
export interface SalesRegisterReport {
  rows: SalesRegisterRow[];
  summary: { count: number; totalSales: number; totalCommission: number };
}

export interface CommissionRegisterRow {
  id: string;
  transaction: {
    id: string;
    code: string | null;
    closedAt: string | null;
    property: { title: string; code: string | null } | null;
  } | null;
  role: CommissionSplitRole;
  level: number | null;
  beneficiaryUserId: string | null;
  percent: number;
  amount: number;
  status: CommissionStatus;
  createdAt: string;
}
export interface CommissionRegisterReport {
  rows: CommissionRegisterRow[];
  summary: {
    count: number;
    totalAmount: number;
    onHold: number;
    released: number;
    reversed: number;
  };
}

export interface PayoutRegisterRow {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: WithdrawalStatus;
  bankAccount: {
    bankName: string;
    accountNumberLast4: string;
    accountHolderName: string;
  };
  paidAt: string | null;
  paymentReference: string | null;
  createdAt: string;
}
export interface PayoutRegisterReport {
  rows: PayoutRegisterRow[];
  summary: { count: number; totalRequested: number; totalPaid: number };
}

export interface LeadConversionReport {
  summary: { total: number; converted: number; lost: number; conversionRate: number };
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byScore: Record<string, number>;
}

export interface LeaderboardRow {
  user: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar?: string | null;
  };
  sales: number;
  revenue: number;
  commission: number;
}
export interface LeaderboardReport {
  rows: LeaderboardRow[];
}

export interface PropertyAgingRow {
  id: string;
  title: string;
  code: string | null;
  city: string;
  currency: string;
  listingPrice: number;
  status: PropertyStatus;
  listedAt: string;
  daysOnMarket: number;
}
export interface PropertyAgingReport {
  rows: PropertyAgingRow[];
}

export interface ComplianceStatusRow {
  agentId: string;
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
  };
  complianceStatus: AgentComplianceStatus;
  docsTotal: number;
  docsVerified: number;
  docsPending: number;
  docsRejected: number;
  docsExpiringSoon: number;
  licenseExpiresAt: string | null;
}
export interface ComplianceStatusReport {
  summary: { COMPLIANT: number; PENDING_KYC: number; NON_COMPLIANT: number };
  rows: ComplianceStatusRow[];
}

export interface TaxStatementRow {
  id: string;
  transactionCode: string | null;
  propertyTitle: string | null;
  role: CommissionSplitRole;
  level: number | null;
  amount: number;
  status: CommissionStatus;
  createdAt: string;
}
export interface TaxStatementReport {
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  financialYear: number;
  period: { from: string; to: string };
  summary: { grossEarned: number; reversed: number; netEarned: number };
  rows: TaxStatementRow[];
}

export interface PromotionResult {
  agentId: string;
  userId: string;
  fromRankId: string | null;
  fromRankName: string | null;
  toRankId: string;
  toRankName: string;
  metrics: { personalSales: number; teamSize: number; teamRevenue: number };
  promoted: boolean;
}
