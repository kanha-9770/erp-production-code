/**
 * Slab Commission Engine — Plan Designer driven calculation.
 *
 * Replaces the legacy % of sale-price engine when RebmSettings.planEngine = "SLAB".
 *
 * Plans:
 *   Plan 1+2 — Direct income = dealArea × slabRate(agentCumulativeArea)
 *   Plan 3   — Differential override: for each upline node up to 10 levels
 *              DIFF_RATE mode:   earn = (uplineRate − sellerRate) × dealArea × levelFactor
 *              DIFF_FACTOR mode: earn = levelFactor × dealArea (flat ₹/sq.yd per level)
 *   Plan 4   — Designation milestone: check cumulative area after each deal;
 *              grant reward when first crossing a threshold
 *   Plan 5   — Leader guarantee: monthly job credits fixed amount per designation
 *
 * All arithmetic uses Prisma.Decimal (no floating-point) with HALF_EVEN rounding.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { WalletService } from "./wallet-service";

type Tx = Prisma.TransactionClient | PrismaClient;

const ZERO = new Prisma.Decimal(0);
const ROUND = Prisma.Decimal.ROUND_HALF_EVEN;

function dec(v: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (v == null) return ZERO;
  return new Prisma.Decimal(v);
}

function mul(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.times(b).toDecimalPlaces(2, ROUND);
}

function mulRaw(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.times(b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SlabSplit {
  role: "DIRECT" | "OVERRIDE" | "BROKERAGE";
  level: number | null;      // null for DIRECT and BROKERAGE
  agentId: string | null;    // AgentProfile.id (null = brokerage/house)
  userId: string | null;     // User.id (null = brokerage/house)
  amount: Prisma.Decimal;
  rateApplied: Prisma.Decimal; // ₹/sq.yd rate used for this split
  note: string;
}

export interface SlabCalculationResult {
  planId: string;
  planVersion: number;
  dealArea: Prisma.Decimal;
  sellerCumulativeAreaBefore: Prisma.Decimal;
  sellerRate: Prisma.Decimal;
  directIncome: Prisma.Decimal;
  overrideTotal: Prisma.Decimal;
  brokerageAmount: Prisma.Decimal;
  splits: SlabSplit[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan + slab resolution
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedPlan {
  id: string;
  version: number;
  overrideMode: string;
  compressionEnabled: boolean;
  companyResidualPercent: Prisma.Decimal;
  slabs: Array<{ minArea: Prisma.Decimal; maxArea: Prisma.Decimal | null; ratePerUnit: Prisma.Decimal; sortOrder: number }>;
  overrideLevels: Array<{ level: number; factor: Prisma.Decimal }>;
}

async function resolveActivePlan(tx: Tx, organizationId: string): Promise<ResolvedPlan> {
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId },
  });
  if (!settings || settings.planEngine !== "SLAB" || !settings.activePlanId) {
    throw new Error(
      `No active slab plan for org ${organizationId}. Set planEngine=SLAB and choose an active CompPlan in /real-estate/admin/settings.`,
    );
  }

  const plan = await (tx as any).compPlan.findUnique({
    where: { id: settings.activePlanId },
    include: {
      slabs: { orderBy: { sortOrder: "asc" } },
      overrideLevels: { orderBy: { level: "asc" } },
    },
  });

  if (!plan || plan.status !== "ACTIVE") {
    throw new Error(`Active plan ${settings.activePlanId} not found or not in ACTIVE status.`);
  }

  return {
    id: plan.id,
    version: plan.version,
    overrideMode: plan.overrideMode,
    compressionEnabled: plan.compressionEnabled,
    companyResidualPercent: dec(plan.companyResidualPercent),
    slabs: plan.slabs.map((s: any) => ({
      sortOrder: s.sortOrder,
      minArea: dec(s.minArea),
      maxArea: s.maxArea != null ? dec(s.maxArea) : null,
      ratePerUnit: dec(s.ratePerUnit),
    })),
    overrideLevels: plan.overrideLevels.map((l: any) => ({
      level: l.level,
      factor: dec(l.factor),
    })),
  };
}

/**
 * Look up the ₹/sq.yd slab rate for an agent given their cumulative area
 * BEFORE the current deal. The rate is determined by which slab the
 * cumulative area falls into at deal-start (no straddling — whole deal at one rate).
 */
export function lookupSlabRate(
  plan: ResolvedPlan,
  cumulativeAreaBefore: Prisma.Decimal,
): Prisma.Decimal {
  for (const slab of plan.slabs) {
    const inRange =
      cumulativeAreaBefore.gte(slab.minArea) &&
      (slab.maxArea === null || cumulativeAreaBefore.lt(slab.maxArea));
    if (inRange) return slab.ratePerUnit;
  }
  // Fallback: return the last slab rate if beyond all bounds
  if (plan.slabs.length > 0) return plan.slabs[plan.slabs.length - 1].ratePerUnit;
  throw new Error("Plan has no slabs configured.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent area ledger — cumulative area per agent
// ─────────────────────────────────────────────────────────────────────────────

async function getAgentCumulativeArea(
  tx: Tx,
  organizationId: string,
  agentId: string,
  planId: string,
  plan: { slabs: ResolvedPlan["slabs"] },
): Promise<Prisma.Decimal> {
  const last = await (tx as any).agentAreaLedger.findFirst({
    where: { organizationId, agentId, planId, isReversed: false },
    orderBy: { createdAt: "desc" },
    select: { cumulativeArea: true },
  });
  return last ? dec(last.cumulativeArea) : ZERO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upline walk (same pattern as legacy engine, extended with rate lookup)
// ─────────────────────────────────────────────────────────────────────────────

interface UplineNode {
  agentId: string;
  userId: string;
  cumulativeArea: Prisma.Decimal;
  slabRate: Prisma.Decimal;
}

async function walkUplineWithRates(
  tx: Tx,
  organizationId: string,
  startUserId: string,
  plan: ResolvedPlan,
  maxDepth: number,
): Promise<UplineNode[]> {
  const startAgent = await (tx as any).agentProfile.findUnique({
    where: { userId: startUserId },
    select: { id: true, parentId: true },
  });
  if (!startAgent) return [];

  const out: UplineNode[] = [];
  let cursor: string | null = startAgent.parentId;
  const seen = new Set<string>();

  while (cursor && out.length < maxDepth) {
    if (seen.has(cursor)) break;
    seen.add(cursor);

    const node = await (tx as any).agentProfile.findUnique({
      where: { id: cursor },
      select: { id: true, userId: true, parentId: true, status: true },
    });
    if (!node) break;

    const skipped =
      plan.compressionEnabled &&
      (node.status === "SUSPENDED" || node.status === "TERMINATED");

    if (!skipped) {
      const cumArea = await getAgentCumulativeArea(tx, organizationId, node.id, plan.id, plan);
      const rate = lookupSlabRate(plan, cumArea);
      out.push({ agentId: node.id, userId: node.userId, cumulativeArea: cumArea, slabRate: rate });
    }
    cursor = node.parentId;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core calculation (no DB writes — pure math)
// ─────────────────────────────────────────────────────────────────────────────

export async function calculateSlabCommission(
  tx: Tx,
  transactionId: string,
): Promise<SlabCalculationResult> {
  const txn = await (tx as any).transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { property: true },
  });

  const plan = await resolveActivePlan(tx, txn.organizationId);

  // Derive deal area from property. Property must have areaSqyd set.
  const dealArea = dec(txn.property.areaSqyd ?? txn.property.areaSqft ?? 0);
  if (dealArea.lte(ZERO)) {
    throw new Error(
      `Property ${txn.property.id} has no area (areaSqyd/areaSqft). Set it before closing.`,
    );
  }

  // Selling agent is the one earning direct income (Plan 1+2).
  const sellerUserId = txn.sellingAgentId ?? txn.listingAgentId;
  const sellerAgent = await (tx as any).agentProfile.findUnique({
    where: { userId: sellerUserId },
    select: { id: true, parentId: true },
  });
  if (!sellerAgent) throw new Error(`Agent profile not found for user ${sellerUserId}`);

  // RERA gate — check settings
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId: txn.organizationId },
  });
  if (settings?.isReraRequired) {
    for (const uid of [txn.listingAgentId, txn.sellingAgentId].filter(Boolean)) {
      const agent = await (tx as any).agentProfile.findUnique({
        where: { userId: uid },
        include: { reraProfile: true },
      });
      if (!agent?.reraProfile?.reraVerifiedAt) {
        throw new Error(
          `Agent (userId ${uid}) must have a verified RERA registration before closing a transaction. ` +
          `Admin can waive this requirement in /real-estate/admin/settings.`,
        );
      }
    }
  }

  // Plan 1+2 — direct income for the seller
  const sellerCumAreaBefore = await getAgentCumulativeArea(
    tx, txn.organizationId, sellerAgent.id, plan.id, plan,
  );
  const sellerRate = lookupSlabRate(plan, sellerCumAreaBefore);
  const directIncome = mul(dealArea, sellerRate);

  const splits: SlabSplit[] = [];
  splits.push({
    role: "DIRECT",
    level: null,
    agentId: sellerAgent.id,
    userId: sellerUserId,
    amount: directIncome,
    rateApplied: sellerRate,
    note: `Direct income @ ₹${sellerRate.toFixed(2)}/unit × ${dealArea.toFixed(2)} units`,
  });

  // Plan 3 — differential overrides up the upline chain (max 10 levels)
  const upline = await walkUplineWithRates(
    tx, txn.organizationId, sellerUserId, plan, 10,
  );

  let overrideTotal = ZERO;
  let prevRate = sellerRate; // cascade: each level computes diff against the level below

  for (let i = 0; i < upline.length; i++) {
    const node = upline[i];
    const levelConfig = plan.overrideLevels.find((l) => l.level === i + 1);
    if (!levelConfig) continue; // no config for this depth

    let overrideAmt: Prisma.Decimal;

    if (plan.overrideMode === "DIFF_FACTOR") {
      // Factor is a flat ₹/sq.yd absolute amount regardless of rate difference
      overrideAmt = mul(dealArea, levelConfig.factor);
    } else {
      // DIFF_RATE: differential = (uplineRate − prevRate) × dealArea × factor
      const rateDiff = node.slabRate.minus(prevRate);
      if (rateDiff.lte(ZERO)) {
        // No differential earned if upline is at same or lower slab
        continue;
      }
      overrideAmt = mulRaw(rateDiff, dealArea).times(levelConfig.factor)
        .toDecimalPlaces(2, ROUND);
    }

    if (overrideAmt.lte(ZERO)) continue;

    splits.push({
      role: "OVERRIDE",
      level: i + 1,
      agentId: node.agentId,
      userId: node.userId,
      amount: overrideAmt,
      rateApplied: node.slabRate,
      note: `Override L${i + 1} @ factor ${levelConfig.factor.toFixed(4)} × ${dealArea.toFixed(2)} units`,
    });
    overrideTotal = overrideTotal.plus(overrideAmt);
    prevRate = node.slabRate; // next level diffs against this level's rate
  }

  // Brokerage residual (company keeps this)
  const totalPaid = directIncome.plus(overrideTotal);
  let brokerageAmount = ZERO;
  if (plan.companyResidualPercent.gt(ZERO)) {
    // If company wants a fixed % on top of plan payouts, add it
    const totalBase = mul(dealArea, sellerRate); // conceptual base
    brokerageAmount = totalBase
      .times(plan.companyResidualPercent)
      .dividedBy(100)
      .toDecimalPlaces(2, ROUND);
  }

  if (brokerageAmount.gt(ZERO)) {
    splits.push({
      role: "BROKERAGE",
      level: null,
      agentId: null,
      userId: null,
      amount: brokerageAmount,
      rateApplied: ZERO,
      note: `Company residual ${plan.companyResidualPercent.toFixed(4)}%`,
    });
  }

  return {
    planId: plan.id,
    planVersion: plan.version,
    dealArea,
    sellerCumulativeAreaBefore: sellerCumAreaBefore,
    sellerRate,
    directIncome,
    overrideTotal,
    brokerageAmount,
    splits,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Close transaction (calc + area ledger + wallet entries + designations)
// ─────────────────────────────────────────────────────────────────────────────

export async function closeTransactionSlab(
  tx: Tx,
  transactionId: string,
  invokerUserId: string,
) {
  const txn = await (tx as any).transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { property: true },
  });

  if (txn.status === "CLOSED") throw new Error("Transaction already closed");
  if (txn.status === "CANCELLED") throw new Error("Cannot close a cancelled transaction");

  const docs = await (tx as any).transactionDocument.count({
    where: { transactionId, type: { in: ["CONTRACT", "SALE_DEED"] } },
  });
  if (docs === 0) {
    throw new Error("Transaction needs a CONTRACT or SALE_DEED document before closing.");
  }
  if (txn.property.status !== "UNDER_CONTRACT") {
    throw new Error(`Property must be UNDER_CONTRACT to close (currently ${txn.property.status}).`);
  }

  const calc = await calculateSlabCommission(tx, transactionId);
  const plan = await resolveActivePlan(tx, txn.organizationId);

  // Stamp transaction as closed
  await (tx as any).transaction.update({
    where: { id: transactionId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      baseCommission: calc.directIncome.plus(calc.overrideTotal),
    },
  });

  // Move property to SOLD
  await (tx as any).property.update({
    where: { id: txn.propertyId },
    data: { status: "SOLD", finalClosingAt: new Date() },
  });

  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId: txn.organizationId },
  });
  const holdDays = settings?.holdPeriodDays ?? 7;

  // Write splits + area ledger + wallet entries
  for (const split of calc.splits) {
    if (split.role === "BROKERAGE") {
      // Record brokerage split for reporting but no wallet entry
      await (tx as any).commissionSplit.create({
        data: {
          organizationId: txn.organizationId,
          transactionId,
          role: "BROKERAGE",
          level: null,
          beneficiaryUserId: null,
          percent: plan.companyResidualPercent,
          amount: split.amount,
          status: "ON_HOLD",
        },
      });
      continue;
    }

    const wallet = await WalletService.ensureWallet(tx, {
      organizationId: txn.organizationId,
      userId: split.userId!,
      currency: txn.currency,
    });

    const splitRow = await (tx as any).commissionSplit.create({
      data: {
        organizationId: txn.organizationId,
        transactionId,
        role: split.role === "DIRECT" ? "LISTING_AGENT" : "OVERRIDE",
        level: split.level ?? null,
        beneficiaryUserId: split.userId,
        percent: ZERO,  // slab plans don't use percent — amount is primary
        amount: split.amount,
        status: "ON_HOLD",
      },
    });

    const { entry } = await WalletService.addEntry(tx, {
      organizationId: txn.organizationId,
      walletId: wallet.id,
      type: "CREDIT",
      category: split.role === "DIRECT" ? "COMMISSION" : "OVERRIDE",
      status: "ON_HOLD",
      amount: split.amount,
      description: split.note,
      transactionId,
      splitId: splitRow.id,
      createdById: invokerUserId,
    });

    await (tx as any).commissionSplit.update({
      where: { id: splitRow.id },
      data: { ledgerEntryId: entry.id },
    });

    // Area ledger entry — only for DIRECT splits (the seller)
    if (split.role === "DIRECT" && split.agentId) {
      const newCumArea = calc.sellerCumulativeAreaBefore.plus(calc.dealArea);
      await (tx as any).agentAreaLedger.create({
        data: {
          organizationId: txn.organizationId,
          agentId: split.agentId,
          planId: plan.id,
          transactionId,
          dealArea: calc.dealArea,
          cumulativeArea: newCumArea,
          rateApplied: calc.sellerRate,
          directIncome: calc.directIncome,
        },
      });

      // Plan 4 — check designation milestones
      await checkAndGrantDesignationMilestones(
        tx,
        txn.organizationId,
        split.agentId,
        plan.id,
        newCumArea,
        invokerUserId,
      );
    }
  }

  // Audit entry
  await (tx as any).commissionAudit.create({
    data: {
      organizationId: txn.organizationId,
      transactionId,
      ruleId: plan.id, // reuse ruleId field to store planId for the slab engine
      ruleVersion: plan.version,
      kind: "CALCULATE",
      inputs: {
        engine: "SLAB",
        dealArea: calc.dealArea.toString(),
        sellerCumulativeAreaBefore: calc.sellerCumulativeAreaBefore.toString(),
        sellerRate: calc.sellerRate.toString(),
        listingAgentId: txn.listingAgentId,
        sellingAgentId: txn.sellingAgentId,
      },
      outputs: {
        directIncome: calc.directIncome.toString(),
        overrideTotal: calc.overrideTotal.toString(),
        brokerageAmount: calc.brokerageAmount.toString(),
        splits: calc.splits.map((s) => ({
          role: s.role,
          level: s.level,
          userId: s.userId,
          amount: s.amount.toString(),
          rateApplied: s.rateApplied.toString(),
        })),
      },
      createdById: invokerUserId,
    },
  });

  return calc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse slab transaction (offsetting entries, append-only)
// ─────────────────────────────────────────────────────────────────────────────

export async function reverseTransactionSlab(
  tx: Tx,
  transactionId: string,
  invokerUserId: string,
  reason: string,
) {
  const txn = await (tx as any).transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: {
      commissionSplits: true,
    },
  });

  if (txn.status !== "CLOSED") {
    throw new Error(`Can only reverse CLOSED transactions (status: ${txn.status})`);
  }

  // Reverse area ledger entries for this transaction
  await (tx as any).agentAreaLedger.updateMany({
    where: { transactionId, isReversed: false },
    data: { isReversed: true, reversedAt: new Date() },
  });

  // Reverse wallet entries and mark splits REVERSED
  for (const split of txn.commissionSplits) {
    if (!split.ledgerEntryId || !split.beneficiaryUserId) continue;

    const entry = await (tx as any).ledgerEntry.findUnique({
      where: { id: split.ledgerEntryId },
      include: { wallet: true },
    });
    if (!entry || entry.status === "REVERSED") continue;

    // Write offsetting debit entry
    await WalletService.addEntry(tx, {
      organizationId: txn.organizationId,
      walletId: entry.walletId,
      type: "DEBIT",
      category: "REVERSAL",
      status: entry.status as any,
      amount: entry.amount,
      description: `Reversal of split ${split.id} — ${reason}`,
      transactionId,
      reversesEntryId: split.ledgerEntryId,
      createdById: invokerUserId,
    });

    await WalletService.markEntryReversed(tx, split.ledgerEntryId);
    await (tx as any).commissionSplit.update({
      where: { id: split.id },
      data: { status: "REVERSED" },
    });
  }

  await (tx as any).transaction.update({
    where: { id: transactionId },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
  });

  await (tx as any).property.update({
    where: { id: txn.propertyId },
    data: { status: "AVAILABLE" },
  });

  // Audit
  await (tx as any).commissionAudit.create({
    data: {
      organizationId: txn.organizationId,
      transactionId,
      ruleId: txn.commissionRuleId ?? "SLAB",
      ruleVersion: txn.commissionRuleVersion ?? 0,
      kind: "REVERSAL",
      inputs: { reason, invokerUserId },
      outputs: { reversedSplits: txn.commissionSplits.length },
      createdById: invokerUserId,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan 4 — designation milestone check
// ─────────────────────────────────────────────────────────────────────────────

async function checkAndGrantDesignationMilestones(
  tx: Tx,
  organizationId: string,
  agentId: string,
  planId: string,
  newCumulativeArea: Prisma.Decimal,
  invokerUserId: string,
) {
  const plan = await (tx as any).compPlan.findUnique({
    where: { id: planId },
    include: {
      designations: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!plan) return;

  // Find all designations the agent has already been granted
  const existing = await (tx as any).rewardGrant.findMany({
    where: { organizationId, agentId, planId },
    select: { designationCode: true },
  });
  const grantedCodes = new Set(existing.map((g: any) => g.designationCode));

  for (const des of plan.designations) {
    if (grantedCodes.has(des.designationCode)) continue;
    if (newCumulativeArea.gte(dec(des.minCumulativeArea))) {
      await (tx as any).rewardGrant.create({
        data: {
          organizationId,
          agentId,
          planId,
          designationCode: des.designationCode,
          designationName: des.designationName,
          rewardType: des.rewardType,
          rewardDescription: des.rewardDescription,
          rewardCashAmount: des.rewardCashAmount,
          status: des.rewardType === "CASH" ? "PENDING" : "PENDING",
          triggeredByArea: newCumulativeArea,
        },
      });

      // If cash reward, credit wallet immediately as RELEASED
      if (des.rewardType === "CASH" && des.rewardCashAmount) {
        const agent = await (tx as any).agentProfile.findUnique({
          where: { id: agentId },
          select: { userId: true },
        });
        if (agent) {
          const wallet = await WalletService.ensureWallet(tx, {
            organizationId,
            userId: agent.userId,
          });
          await WalletService.addEntry(tx, {
            organizationId,
            walletId: wallet.id,
            type: "CREDIT",
            category: "RANK_UP_BONUS",
            status: "RELEASED",
            amount: dec(des.rewardCashAmount),
            description: `Designation reward: ${des.designationName} (${des.designationCode})`,
            createdById: invokerUserId,
          });
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan 4 — get current designation for an agent
// ─────────────────────────────────────────────────────────────────────────────

export async function getAgentDesignation(
  tx: Tx,
  organizationId: string,
  agentId: string,
  planId: string,
): Promise<{ designationCode: string; designationName: string } | null> {
  const plan = await (tx as any).compPlan.findUnique({
    where: { id: planId },
    include: { designations: { orderBy: { sortOrder: "desc" } } },
  });
  if (!plan) return null;

  const cumArea = await getAgentCumulativeArea(tx, organizationId, agentId, planId, plan);

  for (const des of plan.designations) {
    if (cumArea.gte(dec(des.minCumulativeArea))) {
      return { designationCode: des.designationCode, designationName: des.designationName };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan 5 — monthly leader guarantee job
// ─────────────────────────────────────────────────────────────────────────────

export async function processMonthlyGuarantees(
  tx: Tx,
  organizationId: string,
  year: number,
  month: number,
  invokerUserId: string,
): Promise<{ processed: number; skipped: number }> {
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId },
  });
  if (!settings?.activePlanId) return { processed: 0, skipped: 0 };

  const plan = await (tx as any).compPlan.findUnique({
    where: { id: settings.activePlanId },
    include: {
      guarantees: true,
      designations: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!plan || plan.status !== "ACTIVE") return { processed: 0, skipped: 0 };

  // Build a map: designationCode → monthly amount
  const guaranteeMap = new Map<string, Prisma.Decimal>(
    plan.guarantees.map((g: any) => [g.designationCode, dec(g.monthlyAmount)]),
  );
  if (guaranteeMap.size === 0) return { processed: 0, skipped: 0 };

  // Get all ACTIVE agents in this org
  const agents = await (tx as any).agentProfile.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, userId: true },
  });

  let processed = 0;
  let skipped = 0;

  for (const agent of agents) {
    const designation = await getAgentDesignation(tx, organizationId, agent.id, plan.id);
    if (!designation) { skipped++; continue; }

    const amount = guaranteeMap.get(designation.designationCode);
    if (!amount || amount.lte(ZERO)) { skipped++; continue; }

    // Idempotent — skip if already paid for this period
    const existing = await (tx as any).guaranteePayout.findUnique({
      where: {
        organizationId_agentId_planId_periodYear_periodMonth: {
          organizationId,
          agentId: agent.id,
          planId: plan.id,
          periodYear: year,
          periodMonth: month,
        },
      },
    });
    if (existing) { skipped++; continue; }

    const wallet = await WalletService.ensureWallet(tx, {
      organizationId,
      userId: agent.userId,
    });
    const { entry } = await WalletService.addEntry(tx, {
      organizationId,
      walletId: wallet.id,
      type: "CREDIT",
      category: "COMMISSION",
      status: "RELEASED",
      amount,
      description: `Leader Guarantee — ${designation.designationName} — ${year}/${String(month).padStart(2, "0")}`,
      createdById: invokerUserId,
    });

    await (tx as any).guaranteePayout.create({
      data: {
        organizationId,
        agentId: agent.id,
        planId: plan.id,
        designationCode: designation.designationCode,
        periodYear: year,
        periodMonth: month,
        amount,
        ledgerEntryId: entry.id,
      },
    });
    processed++;
  }

  return { processed, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulate — dry-run for plan designer preview
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulateInput {
  dealArea: number;
  sellerCumulativeAreaBefore: number;
  uplineRates?: number[]; // cumulative areas for each upline level (index 0 = L1)
}

export interface SimulateOutput {
  sellerRate: number;
  directIncome: number;
  overrides: Array<{ level: number; rate: number; factor: number; amount: number }>;
  overrideTotal: number;
  brokerageAmount: number;
  total: number;
}

/**
 * Pure in-memory simulation — no DB access. Used by plan-designer preview.
 */
export function simulatePlan(
  plan: ResolvedPlan,
  input: SimulateInput,
): SimulateOutput {
  const dealArea = dec(input.dealArea);
  const sellerCumArea = dec(input.sellerCumulativeAreaBefore);
  const sellerRate = lookupSlabRate(plan, sellerCumArea);
  const directIncome = mul(dealArea, sellerRate);

  const uplineRates = (input.uplineRates ?? []).map((cumArea, i) => ({
    level: i + 1,
    rate: lookupSlabRate(plan, dec(cumArea)),
  }));

  const overrides: SimulateOutput["overrides"] = [];
  let overrideTotal = ZERO;
  let prevRate = sellerRate;

  for (let i = 0; i < uplineRates.length; i++) {
    const levelConfig = plan.overrideLevels.find((l) => l.level === i + 1);
    if (!levelConfig) continue;

    const node = uplineRates[i];
    let amt: Prisma.Decimal;

    if (plan.overrideMode === "DIFF_FACTOR") {
      amt = mul(dealArea, levelConfig.factor);
    } else {
      const diff = node.rate.minus(prevRate);
      if (diff.lte(ZERO)) { prevRate = node.rate; continue; }
      amt = mulRaw(diff, dealArea).times(levelConfig.factor).toDecimalPlaces(2, ROUND);
    }

    if (amt.lte(ZERO)) { prevRate = node.rate; continue; }

    overrides.push({
      level: node.level,
      rate: node.rate.toNumber(),
      factor: levelConfig.factor.toNumber(),
      amount: amt.toNumber(),
    });
    overrideTotal = overrideTotal.plus(amt);
    prevRate = node.rate;
  }

  const brokerageAmount = plan.companyResidualPercent.gt(ZERO)
    ? mul(directIncome, plan.companyResidualPercent).dividedBy(100).toDecimalPlaces(2, ROUND)
    : ZERO;

  return {
    sellerRate: sellerRate.toNumber(),
    directIncome: directIncome.toNumber(),
    overrides,
    overrideTotal: overrideTotal.toNumber(),
    brokerageAmount: brokerageAmount.toNumber(),
    total: directIncome.plus(overrideTotal).plus(brokerageAmount).toNumber(),
  };
}
