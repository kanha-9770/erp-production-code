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

export interface Lead {
  id: string;
  organizationId: string;
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

export interface TransactionDetail extends Transaction {
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
