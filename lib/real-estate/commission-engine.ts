/**
 * Commission engine. The defining feature of the REBM module.
 *
 * Triggered by:
 *   - Transaction status → CLOSED  (calculate)
 *   - Transaction status → CANCELLED  (reverse)
 *   - Manual release after hold period elapses (release)
 *
 * Rules of the road (from the BRD):
 *   FR-5.8 — Decimal arithmetic only. No floating-point.
 *   FR-5.9 — Sum of all splits == base commission, to two decimal places.
 *   FR-5.6 / BR-8 — Compression: skip suspended/terminated upline agents.
 *   FR-5.11 / BR-9 — Rule version frozen on the transaction at calc time.
 *   FR-5.12 — Splits start ON_HOLD; release after hold + compliance pass.
 *   FR-5.13 / BR-7 — Reversal is offsetting entries; never UPDATE/DELETE.
 *
 * Money math: every percent is treated as Decimal(7,4); amounts as Decimal(14,2)
 * with HALF_EVEN rounding (banker's). Pennies left over after split-and-round
 * are absorbed by the BROKERAGE row so the totals always line up.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { WalletService } from "./wallet-service";

type Tx = Prisma.TransactionClient | PrismaClient;

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);
const ROUND = Prisma.Decimal.ROUND_HALF_EVEN;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pct(amount: Prisma.Decimal, percent: Prisma.Decimal): Prisma.Decimal {
  return amount.times(percent).dividedBy(HUNDRED).toDecimalPlaces(2, ROUND);
}

function decFrom(v: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (v == null) return ZERO;
  return new Prisma.Decimal(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule resolution
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedRule {
  id: string;
  version: number;
  listingAgentPercent: Prisma.Decimal;
  sellingAgentPercent: Prisma.Decimal;
  brokeragePercent: Prisma.Decimal;
  overridePercents: Prisma.Decimal[];
  useRankOverrides: boolean;
  maxOverrideDepth: number;
  defaultBasePercent: Prisma.Decimal | null;
  holdPeriodDays: number;
  compressionRule: boolean;
}

async function resolveActiveRule(
  tx: Tx,
  organizationId: string,
  propertyType: string,
): Promise<ResolvedRule> {
  // Prefer a rule scoped to the property type. Fall back to the org-wide rule
  // (propertyType=null). Highest version number wins.
  const rule =
    (await tx.commissionRule.findFirst({
      where: { organizationId, isActive: true, propertyType: propertyType as any },
      orderBy: { version: "desc" },
    })) ??
    (await tx.commissionRule.findFirst({
      where: { organizationId, isActive: true, propertyType: null },
      orderBy: { version: "desc" },
    }));

  if (!rule)
    throw new Error(
      `No active CommissionRule for organization ${organizationId} (property type ${propertyType}). Configure one under /real-estate/admin/commission-rules.`,
    );

  return {
    id: rule.id,
    version: rule.version,
    listingAgentPercent: decFrom(rule.listingAgentPercent),
    sellingAgentPercent: decFrom(rule.sellingAgentPercent),
    brokeragePercent: decFrom(rule.brokeragePercent),
    overridePercents: ((rule.overridePercents as any[]) ?? []).map(decFrom),
    useRankOverrides: rule.useRankOverrides,
    maxOverrideDepth: rule.maxOverrideDepth,
    defaultBasePercent:
      rule.defaultBasePercent != null ? decFrom(rule.defaultBasePercent) : null,
    holdPeriodDays: rule.holdPeriodDays,
    compressionRule: rule.compressionRule,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree walk for overrides (FR-5.4 / FR-5.6)
// ─────────────────────────────────────────────────────────────────────────────

interface UplineHop {
  agentProfileId: string;
  userId: string;
  rankOverridePercents: Prisma.Decimal[];
}

/**
 * Walk up the MLM tree from `userId` (the listing agent), skipping any
 * SUSPENDED or TERMINATED ancestor when compression is on.
 *
 * Returns up to `maxDepth` valid hops. Each hop carries that agent's rank's
 * overridePercents so callers can use them when the rule flips
 * useRankOverrides on.
 */
async function walkUpline(
  tx: Tx,
  userId: string,
  maxDepth: number,
  compress: boolean,
): Promise<UplineHop[]> {
  const startAgent = await tx.agentProfile.findUnique({
    where: { userId },
    select: { id: true, parentId: true },
  });
  if (!startAgent) return [];

  const out: UplineHop[] = [];
  let cursor: string | null = startAgent.parentId;
  const seen = new Set<string>();

  while (cursor && out.length < maxDepth) {
    if (seen.has(cursor)) break; // cycle safety
    seen.add(cursor);

    const node = await tx.agentProfile.findUnique({
      where: { id: cursor },
      select: {
        id: true,
        userId: true,
        parentId: true,
        status: true,
        rank: { select: { overridePercents: true } },
      },
    });
    if (!node) break;

    const skipped = compress && (node.status === "SUSPENDED" || node.status === "TERMINATED");
    if (!skipped) {
      out.push({
        agentProfileId: node.id,
        userId: node.userId,
        rankOverridePercents: ((node.rank?.overridePercents as any[]) ?? []).map(decFrom),
      });
    }
    cursor = node.parentId;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — calculate
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculateOptions {
  /** When `true`, no DB writes — return what the splits WOULD be. Used by the
   *  "preview" endpoint and the transaction detail page's pre-close check. */
  dryRun?: boolean;
}

export interface CalculatedSplit {
  role: "LISTING_AGENT" | "SELLING_AGENT" | "BROKERAGE" | "OVERRIDE" | "RANK_BONUS";
  level: number | null;
  beneficiaryUserId: string | null;
  percent: Prisma.Decimal;
  amount: Prisma.Decimal;
}

export interface CalculationResult {
  baseCommission: Prisma.Decimal;
  splits: CalculatedSplit[];
  ruleId: string;
  ruleVersion: number;
}

/**
 * Compute the base commission and full split list for a transaction. Does
 * NOT post ledger entries unless called via `closeTransaction`. Use for
 * previews.
 */
export async function calculateCommission(
  tx: Tx,
  transactionId: string,
  opts: CalculateOptions = {},
): Promise<CalculationResult> {
  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { property: true },
  });

  // Engine selector — when slab plan is active, return a shape-compatible
  // CalculationResult derived from the slab engine so the preview endpoint
  // can render it without branching on engine type.
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId: transaction.organizationId },
    select: { planEngine: true, activePlanId: true },
  });
  if (settings?.planEngine === "SLAB" && settings.activePlanId) {
    const { calculateSlabCommission } = await import("./slab-engine");
    const slabCalc = await calculateSlabCommission(tx, transactionId);
    return {
      ruleId: slabCalc.planId,
      ruleVersion: slabCalc.planVersion,
      baseCommission: slabCalc.directIncome.plus(slabCalc.overrideTotal),
      splits: slabCalc.splits
        .filter((s) => s.userId != null)
        .map((s) => ({
          role: (s.role === "DIRECT" ? "LISTING_AGENT" : s.role) as CalculatedSplit["role"],
          level: s.level,
          beneficiaryUserId: s.userId,
          percent: new Prisma.Decimal(0),
          amount: s.amount,
        })),
    };
  }

  const property = transaction.property;
  const rule = await resolveActiveRule(
    tx,
    transaction.organizationId,
    property.type,
  );

  // Base commission. Property-level overrides take precedence (FR-1.7).
  let base: Prisma.Decimal;
  if (property.commissionTermType === "FLAT_FEE") {
    if (property.commissionFlatFee == null)
      throw new Error("Property has FLAT_FEE term but no commissionFlatFee set");
    base = decFrom(property.commissionFlatFee);
  } else {
    const percent =
      property.commissionPercentage != null
        ? decFrom(property.commissionPercentage)
        : rule.defaultBasePercent;
    if (percent == null)
      throw new Error(
        "No commission percentage on property and rule has no defaultBasePercent",
      );
    base = pct(decFrom(transaction.salePrice), percent);
  }

  // FR-5.3 — splits sum to 100. Validate the rule.
  const splitsTotal = rule.listingAgentPercent
    .plus(rule.sellingAgentPercent)
    .plus(rule.brokeragePercent);
  if (!splitsTotal.equals(HUNDRED))
    throw new Error(
      `Commission rule splits must sum to 100% (got ${splitsTotal.toFixed(4)})`,
    );

  const splits: CalculatedSplit[] = [];
  let allocated = ZERO;

  // Listing agent share
  const listingAmt = pct(base, rule.listingAgentPercent);
  splits.push({
    role: "LISTING_AGENT",
    level: null,
    beneficiaryUserId: transaction.listingAgentId,
    percent: rule.listingAgentPercent,
    amount: listingAmt,
  });
  allocated = allocated.plus(listingAmt);

  // Selling agent share — fall back to listing agent if no separate selling
  // agent (single-agent deal, FR-4.3).
  const sellingUser = transaction.sellingAgentId ?? transaction.listingAgentId;
  const sellingAmt = pct(base, rule.sellingAgentPercent);
  splits.push({
    role: "SELLING_AGENT",
    level: null,
    beneficiaryUserId: sellingUser,
    percent: rule.sellingAgentPercent,
    amount: sellingAmt,
  });
  allocated = allocated.plus(sellingAmt);

  // Brokerage share — used as the override pool too. We track it separately
  // first, then deduct overrides, then write the residual as the BROKERAGE
  // row.
  const brokeragePool = pct(base, rule.brokeragePercent);

  // Overrides — walk the upline of the listing agent (per BRD: overrides are
  // off the brokerage share, not separate). FR-5.4.
  const upline = await walkUpline(
    tx,
    transaction.listingAgentId,
    rule.maxOverrideDepth,
    rule.compressionRule,
  );

  let overridesPaid = ZERO;
  for (let i = 0; i < upline.length; i++) {
    const hop = upline[i];
    // Per-level percent — rule's ladder by default; agent's rank ladder when
    // useRankOverrides is on. Falls back to 0 if the array is shorter than
    // the depth.
    const ladder = rule.useRankOverrides
      ? hop.rankOverridePercents
      : rule.overridePercents;
    const pctAtLevel = ladder[i] ?? ZERO;
    if (pctAtLevel.equals(ZERO)) continue;

    const overrideAmt = pct(base, pctAtLevel);
    splits.push({
      role: "OVERRIDE",
      level: i + 1,
      beneficiaryUserId: hop.userId,
      percent: pctAtLevel,
      amount: overrideAmt,
    });
    overridesPaid = overridesPaid.plus(overrideAmt);
  }

  // Brokerage residual. Anything left in the brokerage pool after overrides
  // is the house's cut. Penny rounding leftovers also land here so the sum
  // always equals base (FR-5.9).
  const brokerageResidualBeforeRounding = brokeragePool.minus(overridesPaid);
  const remaining = base.minus(allocated).minus(overridesPaid);
  const brokerageAmount = remaining; // == brokeragePool − overridesPaid (± 1 paisa)

  splits.push({
    role: "BROKERAGE",
    level: null,
    beneficiaryUserId: null, // house, not a user
    percent: rule.brokeragePercent,
    amount: brokerageAmount,
  });

  // FR-5.9 — final integrity check
  const finalSum = splits.reduce((acc, s) => acc.plus(s.amount), ZERO);
  if (!finalSum.equals(base))
    throw new Error(
      `Internal commission accounting error: splits sum ${finalSum.toFixed(2)} != base ${base.toFixed(2)}`,
    );

  // brokerageResidualBeforeRounding referenced only to keep the comment
  // attached during code review; nothing to do with it at runtime.
  void brokerageResidualBeforeRounding;

  return {
    baseCommission: base,
    splits,
    ruleId: rule.id,
    ruleVersion: rule.version,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — close (calc + ledger writes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically: calculate splits, persist them, write ON_HOLD ledger entries
 * for each beneficiary, stamp the transaction with the rule version, and
 * write the audit record. Returns the persisted result.
 *
 * MUST be invoked inside a Prisma $transaction by the caller, OR you can
 * pass the top-level prisma client and let this function open one. We make
 * the boundary explicit by accepting `tx`.
 */
export async function closeTransaction(
  tx: Tx,
  transactionId: string,
  invokerUserId: string,
) {
  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { property: true },
  });
  if (transaction.status === "CLOSED")
    throw new Error("Transaction already closed");
  if (transaction.status === "CANCELLED")
    throw new Error("Cannot close a cancelled transaction");

  // Engine selector — when this org has switched to the slab plan engine
  // (RebmSettings.planEngine === "SLAB"), hand off to the dedicated slab
  // close. Falls through to the legacy % engine otherwise so orgs that
  // haven't activated a CompPlan keep working unchanged.
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId: transaction.organizationId },
    select: { planEngine: true, activePlanId: true },
  });
  if (settings?.planEngine === "SLAB" && settings.activePlanId) {
    const { closeTransactionSlab } = await import("./slab-engine");
    const slabResult = await closeTransactionSlab(tx, transactionId, invokerUserId);
    // Adapt SlabCalculationResult → CalculationResult so the route handler's
    // response builder (which reads baseCommission / ruleId / ruleVersion /
    // splits) doesn't have to branch on engine.
    const splits: CalculatedSplit[] = slabResult.splits.map((s) => ({
      role:
        s.role === "DIRECT" ? "LISTING_AGENT"
        : s.role === "OVERRIDE" ? "OVERRIDE"
        : "BROKERAGE",
      level: s.level,
      beneficiaryUserId: s.userId,
      percent: new Prisma.Decimal(0),
      amount: s.amount,
    }));
    return {
      ruleId: slabResult.planId,
      ruleVersion: slabResult.planVersion,
      baseCommission: slabResult.directIncome.plus(slabResult.overrideTotal),
      splits,
    };
  }

  // Required documents check (FR-4.8).
  const docs = await tx.transactionDocument.count({
    where: { transactionId, type: { in: ["CONTRACT", "SALE_DEED"] } },
  });
  if (docs === 0)
    throw new Error(
      "Transaction needs a CONTRACT or SALE_DEED document attached before closing.",
    );
  if (transaction.property.status !== "UNDER_CONTRACT")
    throw new Error(
      `Property must be UNDER_CONTRACT to close (currently ${transaction.property.status}).`,
    );

  const calc = await calculateCommission(tx, transactionId);

  // Persist the rule snapshot on the transaction (FR-5.11 / BR-9).
  await tx.transaction.update({
    where: { id: transactionId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      commissionRuleId: calc.ruleId,
      commissionRuleVersion: calc.ruleVersion,
      baseCommission: calc.baseCommission,
    },
  });

  // Move property to SOLD.
  await tx.property.update({
    where: { id: transaction.propertyId },
    data: { status: "SOLD", finalClosingAt: new Date() },
  });

  // Persist the splits + ledger entries. The brokerage row has no beneficiary
  // user (it's the house) — we still create the CommissionSplit row for
  // reporting but do NOT write a ledger entry for it.
  for (const s of calc.splits) {
    if (!s.beneficiaryUserId) {
      await tx.commissionSplit.create({
        data: {
          organizationId: transaction.organizationId,
          transactionId,
          ruleId: calc.ruleId,
          role: s.role,
          level: s.level ?? null,
          beneficiaryUserId: null,
          percent: s.percent,
          amount: s.amount,
          status: "ON_HOLD",
        },
      });
      continue;
    }

    const wallet = await WalletService.ensureWallet(tx, {
      organizationId: transaction.organizationId,
      userId: s.beneficiaryUserId,
      currency: transaction.currency,
    });

    const split = await tx.commissionSplit.create({
      data: {
        organizationId: transaction.organizationId,
        transactionId,
        ruleId: calc.ruleId,
        role: s.role,
        level: s.level ?? null,
        beneficiaryUserId: s.beneficiaryUserId,
        percent: s.percent,
        amount: s.amount,
        status: "ON_HOLD",
      },
    });

    const { entry } = await WalletService.addEntry(tx, {
      organizationId: transaction.organizationId,
      walletId: wallet.id,
      type: "CREDIT",
      category: s.role === "OVERRIDE" ? "OVERRIDE" : "COMMISSION",
      status: "ON_HOLD",
      amount: s.amount,
      description: `${s.role}${s.level ? ` L${s.level}` : ""} • txn ${transaction.code ?? transaction.id.slice(0, 6)}`,
      transactionId,
      splitId: split.id,
      createdById: invokerUserId,
    });

    await tx.commissionSplit.update({
      where: { id: split.id },
      data: { ledgerEntryId: entry.id },
    });
  }

  // Audit
  await tx.commissionAudit.create({
    data: {
      organizationId: transaction.organizationId,
      transactionId,
      ruleId: calc.ruleId,
      ruleVersion: calc.ruleVersion,
      kind: "CALCULATE",
      inputs: {
        salePrice: transaction.salePrice.toString(),
        propertyType: transaction.property.type,
        listingAgentId: transaction.listingAgentId,
        sellingAgentId: transaction.sellingAgentId,
      },
      outputs: {
        baseCommission: calc.baseCommission.toString(),
        splits: calc.splits.map((s) => ({
          role: s.role,
          level: s.level,
          beneficiaryUserId: s.beneficiaryUserId,
          percent: s.percent.toString(),
          amount: s.amount.toString(),
        })),
      },
      createdById: invokerUserId,
    },
  });

  return calc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse on cancel (FR-5.13 / BR-7)
// ─────────────────────────────────────────────────────────────────────────────

export async function reverseTransaction(
  tx: Tx,
  transactionId: string,
  invokerUserId: string,
  reason: string,
) {
  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { property: true, commissionSplits: { include: { rule: true } } },
  });
  if (transaction.status !== "CLOSED")
    throw new Error(
      `Only CLOSED transactions can be reversed (currently ${transaction.status}).`,
    );

  for (const split of transaction.commissionSplits) {
    if (!split.beneficiaryUserId || !split.ledgerEntryId) continue;
    if (split.status === "REVERSED") continue;

    const original = await tx.ledgerEntry.findUnique({
      where: { id: split.ledgerEntryId },
    });
    if (!original) continue;

    const wallet = await WalletService.ensureWallet(tx, {
      organizationId: transaction.organizationId,
      userId: split.beneficiaryUserId,
    });

    // Insert an offsetting DEBIT (RELEASED whether or not the original was
    // released — the offset always lands in the same bucket the original
    // affected). When the original was ON_HOLD we offset against pending
    // instead.
    const offsetStatus = original.status === "ON_HOLD" ? "ON_HOLD" : "RELEASED";

    const { entry } = await WalletService.addEntry(tx, {
      organizationId: transaction.organizationId,
      walletId: wallet.id,
      type: original.type === "CREDIT" ? "DEBIT" : "CREDIT",
      category: "REVERSAL",
      status: offsetStatus,
      amount: original.amount,
      description: `Reversal of ${original.id} — ${reason}`,
      transactionId,
      splitId: split.id,
      reversesEntryId: original.id,
      createdById: invokerUserId,
    });

    await WalletService.markEntryReversed(tx, original.id);

    await tx.commissionSplit.update({
      where: { id: split.id },
      data: { status: "REVERSED", reversalLedgerEntryId: entry.id },
    });
  }

  await tx.transaction.update({
    where: { id: transactionId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: reason,
    },
  });

  // Property goes back to AVAILABLE so it can re-list (FR-1.2 transition).
  await tx.property.update({
    where: { id: transaction.propertyId },
    data: { status: "AVAILABLE", finalClosingAt: null },
  });

  await tx.commissionAudit.create({
    data: {
      organizationId: transaction.organizationId,
      transactionId,
      ruleId: transaction.commissionRuleId,
      ruleVersion: transaction.commissionRuleVersion ?? 0,
      kind: "REVERSE",
      inputs: { reason },
      outputs: { splitsReversed: transaction.commissionSplits.length },
      notes: reason,
      createdById: invokerUserId,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Release ON_HOLD splits (FR-5.12)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Release commissions for transactions whose hold period elapsed AND whose
 * beneficiary agent is still COMPLIANT (FR-5.12 / BR-5). Returns the count
 * released.
 *
 * Designed to be called as a scheduled job (`/api/real-estate/commissions/release-due`)
 * but also callable from a manual admin action.
 */
export async function releaseDueCommissions(
  tx: Tx,
  organizationId: string,
  invokerUserId: string,
): Promise<{ released: number }> {
  // Find on-hold splits older than the rule's holdPeriodDays. We do this in
  // one query by joining splits → transaction → rule.
  const candidates = await tx.commissionSplit.findMany({
    where: {
      organizationId,
      status: "ON_HOLD",
      beneficiaryUserId: { not: null },
      ledgerEntryId: { not: null },
    },
    include: {
      transaction: { select: { closedAt: true } },
      rule: { select: { holdPeriodDays: true } },
    },
  });

  const now = Date.now();
  let released = 0;

  for (const split of candidates) {
    const holdDays = split.rule?.holdPeriodDays ?? 7;
    const closedAt = split.transaction?.closedAt;
    if (!closedAt) continue;
    const elapsed = (now - closedAt.getTime()) / 86400000;
    if (elapsed < holdDays) continue;

    // BR-5 — beneficiary must be COMPLIANT.
    const agent = await tx.agentProfile.findUnique({
      where: { userId: split.beneficiaryUserId! },
      select: { complianceStatus: true, status: true },
    });
    if (!agent || agent.complianceStatus !== "COMPLIANT") continue;
    if (agent.status === "TERMINATED") continue;

    await WalletService.releaseEntry(tx, split.ledgerEntryId!);
    await tx.commissionSplit.update({
      where: { id: split.id },
      data: { status: "RELEASED" },
    });
    released++;
  }

  return { released };
}
