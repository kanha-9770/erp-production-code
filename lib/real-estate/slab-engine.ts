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

// ─── Unit conversion → sq.yd ────────────────────────────────────────────────
// All slab math is in square yards. Multipliers below are the exact / standard
// conversions; sqft uses 1/9 as a rational fraction so 9 sqft → exactly 1 sqyd
// with no floating drift.
const SQYD_PER_UNIT: Record<string, Prisma.Decimal> = {
  sqyd:    new Prisma.Decimal(1),
  sqft:    new Prisma.Decimal(1).dividedBy(9),
  sqm:     new Prisma.Decimal("1.19599"),
  acre:    new Prisma.Decimal(4840),
  hectare: new Prisma.Decimal("11959.9"),
};

export function toSquareYards(
  area: Prisma.Decimal,
  unit: string | null | undefined,
): Prisma.Decimal {
  const key = (unit ?? "sqyd").toLowerCase();
  const mult = SQYD_PER_UNIT[key];
  if (!mult) {
    throw new Error(
      `Unknown areaUnit "${unit}". Use one of: ${Object.keys(SQYD_PER_UNIT).join(", ")}.`,
    );
  }
  return area.times(mult).toDecimalPlaces(2, ROUND);
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

export async function resolveActivePlan(tx: Tx, organizationId: string): Promise<ResolvedPlan> {
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

export async function getAgentCumulativeArea(
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

/**
 * Effective cumulative area for slab determination = personal + entire downline.
 *
 * This is the "group volume" the agent has produced. Team area is read from
 * the recursive descendant CTE used by getTeamAreaTotals. A junior with no
 * downline gets `personal` only, so their slab still tracks their own work;
 * a leader gets their downline's production rolled in so their slab upgrades
 * as the team produces.
 *
 * Used everywhere a slab rate is looked up: seller direct income, upline
 * override differentials, designation milestones, and the dashboard ladder.
 */
async function getEffectiveCumulativeArea(
  tx: Tx,
  organizationId: string,
  agentId: string,
  planId: string,
): Promise<Prisma.Decimal> {
  const [personal, team] = await Promise.all([
    getAgentCumulativeArea(tx, organizationId, agentId, planId, { slabs: [] }),
    getTeamAreaTotals(tx, organizationId, agentId),
  ]);
  return personal.plus(new Prisma.Decimal(team.area));
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
  dealArea: Prisma.Decimal,
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
      // Effective = upline.personal + upline.team_before + this deal's area
      // (the just-closing deal isn't in the ledger yet, but it's downline
      // production for this upline so it counts toward their effective slab).
      const effective = (
        await getEffectiveCumulativeArea(tx, organizationId, node.id, plan.id)
      ).plus(dealArea);
      const rate = lookupSlabRate(plan, effective);
      out.push({ agentId: node.id, userId: node.userId, cumulativeArea: effective, slabRate: rate });
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

  // Derive deal area in sq.yd from the property's stored area + unit.
  // sqyd is the canonical unit for the slab engine — every other unit is
  // converted on the way in so admins can keep listing in whatever local
  // unit makes sense for the deal (acre for farms, sqft for apartments).
  const dealArea = toSquareYards(dec(txn.property.area ?? 0), txn.property.areaUnit);
  if (dealArea.lte(ZERO)) {
    throw new Error(
      `Property ${txn.property.id} has no area set. Add area + areaUnit before closing.`,
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

  // Plan 1+2 — direct income for the seller.
  //
  // Slab rate is determined by EFFECTIVE cumulative area after this deal:
  // personal sales + entire downline production. For a junior with no
  // downline this is simply their personal cumulative; for a leader it
  // rolls up the whole subtree (group-volume MLM model). The whole deal
  // is credited at the slab the seller sits on once this deal lands.
  //
  // Trade-off vs. pre-deal lookup: this is more agent-favorable (no "I just
  // missed the threshold by 1 sq.yd" sting) but a single deal can push a
  // beginner straight onto a high slab. The override math below diffs against
  // this same post-deal rate, so the upline differential stays consistent.
  const sellerCumAreaBefore = await getAgentCumulativeArea(
    tx, txn.organizationId, sellerAgent.id, plan.id, plan,
  );
  const sellerTeamBefore = await getTeamAreaTotals(
    tx, txn.organizationId, sellerAgent.id,
  );
  // Effective = (personal_before + dealArea) + sellerDownlineArea.
  // The seller's own deal isn't in the ledger yet so we add dealArea manually;
  // the team CTE excludes the seller themselves so no double-count.
  const sellerEffectiveAfter = sellerCumAreaBefore
    .plus(dealArea)
    .plus(new Prisma.Decimal(sellerTeamBefore.area));
  const sellerRate = lookupSlabRate(plan, sellerEffectiveAfter);
  const directIncome = mul(dealArea, sellerRate);

  const splits: SlabSplit[] = [];
  splits.push({
    role: "DIRECT",
    level: null,
    agentId: sellerAgent.id,
    userId: sellerUserId,
    amount: directIncome,
    rateApplied: sellerRate,
    note: `Direct income @ ₹${sellerRate.toFixed(2)}/unit × ${dealArea.toFixed(2)} units (slab after deal)`,
  });

  // Plan 3 — differential overrides up the upline chain. Walk only as deep
  // as the plan's overrideLevels actually go; if the admin configured 3
  // levels we don't waste round-trips on 7 more. If the plan configures
  // levels up to L15, we walk to L15 — no hardcoded cap. Empty config = no
  // override walk at all.
  const maxDepth = plan.overrideLevels.length
    ? Math.max(...plan.overrideLevels.map((l) => l.level))
    : 0;
  const upline = maxDepth
    ? await walkUplineWithRates(
        tx, txn.organizationId, sellerUserId, plan, maxDepth, dealArea,
      )
    : [];

  let overrideTotal = ZERO;
  let prevRate = sellerRate; // cascade: each level computes diff against the level below

  for (let i = 0; i < upline.length; i++) {
    const node = upline[i];
    const levelConfig = plan.overrideLevels.find((l) => l.level === i + 1);
    if (!levelConfig) {
      // No config for this depth — still advance prevRate so subsequent
      // levels diff against the most recent upline rate seen, matching
      // simulatePlan's cascade behaviour.
      prevRate = node.slabRate;
      continue;
    }

    let overrideAmt: Prisma.Decimal;
    let noteSuffix = "";

    if (plan.overrideMode === "DIFF_FACTOR") {
      // Factor is a flat ₹/sq.yd absolute amount regardless of rate difference
      overrideAmt = mul(dealArea, levelConfig.factor);
    } else {
      // DIFF_RATE: differential = (uplineRate − prevRate) × dealArea × factor.
      //
      // In a low-volume / fresh org, uplines often sit on the same slab as
      // the seller (their downline volume hasn't pushed them higher yet), so
      // the differential collapses to zero and they'd otherwise earn nothing
      // on every deal — including the "Awaiting commission posting" preview
      // an upline sees on their wallet page. Fall back to the flat factor
      // (₹/sq.yd × dealArea) so every configured upline level always earns
      // something. Once the team is large enough that uplines sit on higher
      // slabs, the differential takes over and rewards the rate gap.
      const rateDiff = node.slabRate.minus(prevRate);
      if (rateDiff.gt(ZERO)) {
        overrideAmt = mulRaw(rateDiff, dealArea).times(levelConfig.factor)
          .toDecimalPlaces(2, ROUND);
      } else {
        overrideAmt = mul(dealArea, levelConfig.factor);
        noteSuffix = " (flat floor)";
      }
    }

    // Always advance prevRate (matches simulatePlan) — even when this level
    // is skipped because of a non-positive override, the next level's diff
    // should be against this level's rate.
    if (overrideAmt.lte(ZERO)) {
      prevRate = node.slabRate;
      continue;
    }

    splits.push({
      role: "OVERRIDE",
      level: i + 1,
      agentId: node.agentId,
      userId: node.userId,
      amount: overrideAmt,
      rateApplied: node.slabRate,
      note: `Override L${i + 1} @ factor ${levelConfig.factor.toFixed(4)} × ${dealArea.toFixed(2)} units${noteSuffix}`,
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
  opts: { mode?: "close-and-post" | "post-only" } = {},
) {
  const mode = opts.mode ?? "close-and-post";

  // Exclusive row lock — see commission-engine.closeTransaction for the
  // full rationale. Without this, two admins clicking "Post commissions"
  // simultaneously both pass the splits-empty check on the same snapshot
  // and write duplicate splits + ledger entries.
  await (tx as any).$queryRaw`SELECT id FROM re_transactions WHERE id = ${transactionId} FOR UPDATE`;

  const txn = await (tx as any).transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { property: true },
  });

  // Status guards differ between agent-close (PENDING → CLOSED) and
  // admin-post (CLOSED, splits still empty → write splits).
  if (mode === "close-and-post") {
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
  } else {
    if (txn.status !== "CLOSED") {
      throw new Error(
        `Commissions can only be posted on a CLOSED transaction (currently ${txn.status}).`,
      );
    }
    const existing = await (tx as any).commissionSplit.count({
      where: { transactionId },
    });
    if (existing > 0)
      throw new Error("Commissions have already been posted for this transaction.");
  }

  const calc = await calculateSlabCommission(tx, transactionId);
  const plan = await resolveActivePlan(tx, txn.organizationId);

  // Stamp baseCommission on the transaction. In close-and-post mode we also
  // flip status / property; in post-only mode the deal is already CLOSED so
  // we just record the computed amount.
  if (mode === "close-and-post") {
    await (tx as any).transaction.update({
      where: { id: transactionId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        baseCommission: calc.directIncome.plus(calc.overrideTotal),
      },
    });
    await (tx as any).property.update({
      where: { id: txn.propertyId },
      data: { status: "SOLD", finalClosingAt: new Date() },
    });
  } else {
    await (tx as any).transaction.update({
      where: { id: transactionId },
      data: { baseCommission: calc.directIncome.plus(calc.overrideTotal) },
    });
  }

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

      // Plan 4 — designation milestones use effective area (personal + team).
      // The seller's own new ledger row is now committed above, so getEffective
      // sees the up-to-date personal cumulative; team CTE walks downline.
      const effectiveAfter = await getEffectiveCumulativeArea(
        tx, txn.organizationId, split.agentId, plan.id,
      );
      await checkAndGrantDesignationMilestones(
        tx,
        txn.organizationId,
        split.agentId,
        plan.id,
        effectiveAfter,
        invokerUserId,
      );
    }

    // Plan 4 — uplines' effective area also just moved (downline sale rolled
    // up into their team total). Re-check their milestones so a leader gets
    // rank rewards when their group volume crosses a threshold.
    if (split.role === "OVERRIDE" && split.agentId) {
      const uplineEffective = await getEffectiveCumulativeArea(
        tx, txn.organizationId, split.agentId, plan.id,
      );
      await checkAndGrantDesignationMilestones(
        tx,
        txn.organizationId,
        split.agentId,
        plan.id,
        uplineEffective,
        invokerUserId,
      );
    }
  }

  // Audit entry
  //
  // CommissionAudit.ruleId has a FK to CommissionRule (the legacy %-engine
  // table). Slab audits reference a CompPlan instead — there's no FK for
  // that — so leave ruleId NULL and stash the plan reference in `inputs`
  // (planId, planVersion, engine="SLAB"). All audit consumers we own read
  // from `inputs` for slab rows, so nothing is lost.
  await (tx as any).commissionAudit.create({
    data: {
      organizationId: txn.organizationId,
      transactionId,
      ruleId: null,
      ruleVersion: plan.version,
      kind: "CALCULATE",
      inputs: {
        engine: "SLAB",
        planId: plan.id,
        planVersion: plan.version,
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

  // Revoke designation milestones whose threshold is no longer met. The area
  // ledger has just had this deal's rows flipped to isReversed=true, so
  // getEffectiveCumulativeArea recomputes the *new* (smaller) effective area
  // for every agent whose subtree included the reversed deal. Walk every
  // unique agent who has a RewardGrant for this org/plan; if their current
  // effective area is now below `triggeredByArea`, mark the grant CANCELLED
  // and (for CASH rewards previously credited) write an offsetting DEBIT so
  // the bonus money flows back out. Without this, a fake/cancelled deal could
  // permanently promote a senior + leave their ₹X cash bonus standing.
  await revokeUnsupportedDesignations(tx, txn.organizationId, invokerUserId, reason);

  // Audit — same reasoning as the close path: ruleId NULL for slab audits,
  // plan reference stays in `inputs`. txn.commissionRuleId is also kept null
  // for slab closes, so we don't accidentally point at a non-existent rule.
  await (tx as any).commissionAudit.create({
    data: {
      organizationId: txn.organizationId,
      transactionId,
      ruleId: txn.commissionRuleId ?? null,
      ruleVersion: txn.commissionRuleVersion ?? 0,
      kind: "REVERSAL",
      inputs: { engine: "SLAB", reason, invokerUserId },
      outputs: { reversedSplits: txn.commissionSplits.length },
      createdById: invokerUserId,
    },
  });
}

// Revoke any PENDING / FULFILLED designation grants whose triggering area
// threshold is no longer met by the agent's current effective area. Called
// after reversing a deal so a now-unsupported promotion + its cash bonus
// roll back. Idempotent — already-CANCELLED grants are skipped.
async function revokeUnsupportedDesignations(
  tx: Tx,
  organizationId: string,
  invokerUserId: string,
  reason: string,
): Promise<void> {
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId },
    select: { activePlanId: true },
  });
  if (!settings?.activePlanId) return;
  const planId: string = settings.activePlanId;

  // Only consider grants for the active plan — historical grants on retired
  // plans aren't ours to claw back automatically.
  const grants = await (tx as any).rewardGrant.findMany({
    where: { organizationId, planId, status: { in: ["PENDING", "FULFILLED"] } },
    select: {
      id: true,
      agentId: true,
      designationCode: true,
      designationName: true,
      rewardType: true,
      rewardCashAmount: true,
      triggeredByArea: true,
    },
  });
  if (grants.length === 0) return;

  // Cache per-agent effective area so we don't recompute it for every grant
  // an agent holds.
  const effectiveByAgent = new Map<string, Prisma.Decimal>();

  for (const g of grants) {
    let effective = effectiveByAgent.get(g.agentId);
    if (effective === undefined) {
      effective = await getEffectiveCumulativeArea(
        tx,
        organizationId,
        g.agentId,
        planId,
      );
      effectiveByAgent.set(g.agentId, effective);
    }
    if (effective.gte(dec(g.triggeredByArea))) continue; // still earned, leave alone

    // Threshold no longer met — cancel the grant.
    await (tx as any).rewardGrant.update({
      where: { id: g.id },
      data: {
        status: "CANCELLED",
        notes: `Auto-cancelled: effective area dropped below ${dec(g.triggeredByArea).toFixed(2)} after deal reversal — ${reason}`,
      },
    });

    // For cash rewards, the RELEASED bonus was credited to the agent's
    // wallet at grant time. Write an offsetting DEBIT so the balance
    // reflects the loss of the designation. Non-cash (trophy / certificate)
    // grants have no ledger impact.
    if (g.rewardType === "CASH" && g.rewardCashAmount) {
      const agent = await (tx as any).agentProfile.findUnique({
        where: { id: g.agentId },
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
          type: "DEBIT",
          category: "REVERSAL",
          status: "RELEASED",
          amount: dec(g.rewardCashAmount),
          description: `Reversal of designation reward: ${g.designationName} (${g.designationCode}) — ${reason}`,
          createdById: invokerUserId,
        });
      }
    }
  }
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

  // Designation milestones use effective (personal + team) area, matching
  // the slab engine — a leader earns their rank from group volume.
  const cumArea = await getEffectiveCumulativeArea(tx, organizationId, agentId, planId);

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
    const node = uplineRates[i];
    if (!levelConfig) {
      prevRate = node.rate;
      continue;
    }

    let amt: Prisma.Decimal;

    if (plan.overrideMode === "DIFF_FACTOR") {
      amt = mul(dealArea, levelConfig.factor);
    } else {
      // Match the engine: when DIFF_RATE produces no positive diff, fall
      // back to a flat-factor floor so every configured upline level still
      // earns. Keeps the plan-designer preview in lockstep with what
      // calculateSlabCommission will produce at post time.
      const diff = node.rate.minus(prevRate);
      if (diff.gt(ZERO)) {
        amt = mulRaw(diff, dealArea).times(levelConfig.factor).toDecimalPlaces(2, ROUND);
      } else {
        amt = mul(dealArea, levelConfig.factor);
      }
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

// ─────────────────────────────────────────────────────────────────────────────
// Slab progress (read-only) — what an agent sees on their own dashboard
// ─────────────────────────────────────────────────────────────────────────────

export interface SlabProgress {
  enabled: boolean;            // false when the org isn't on SLAB engine yet
  planName: string | null;
  areaUnit: string;            // "SQYD" by default

  // PERSONAL — area the agent has sold themselves. Displayed alongside the
  // team total so the breakdown stays transparent.
  cumulativeArea: number;       // total area sold by THIS agent (personal)
  totalDirectIncome: number;    // sum of all direct income they earned
  dealsCount: number;           // number of personal closed deals

  // TEAM — personal + entire downline. THIS is the value that drives the
  // slab rate (group-volume MLM model). currentSlab/nextSlab/ladder below
  // are computed off this number, matching what the commission engine uses.
  teamCumulativeArea: number;     // personal + sum(downline.cumulativeArea)
  teamDirectIncome: number;       // personal income + downline's direct income
  teamDealsCount: number;         // personal + downline deal count
  downlineAgentCount: number;     // size of subtree (excluding self)

  currentSlab: {
    sortOrder: number;
    minArea: number;
    maxArea: number | null;
    ratePerUnit: number;
  } | null;
  nextSlab: {
    sortOrder: number;
    minArea: number;
    maxArea: number | null;
    ratePerUnit: number;
    areaToReach: number;        // sqyd still needed to upgrade
  } | null;

  // Every slab on the plan — the UI uses this to draw the full ladder with
  // a "you are here" marker.
  ladder: Array<{
    sortOrder: number;
    minArea: number;
    maxArea: number | null;
    ratePerUnit: number;
    isCurrent: boolean;
    isCleared: boolean;         // cumulativeArea >= minArea
  }>;

  // Designation milestones — earned + next unlocked threshold
  currentDesignation: {
    code: string;
    name: string;
    rewardDescription: string;
  } | null;
  nextDesignation: {
    code: string;
    name: string;
    minCumulativeArea: number;
    areaToReach: number;
    rewardDescription: string;
  } | null;
  designations: Array<{
    code: string;
    name: string;
    minCumulativeArea: number;
    rewardType: string;
    rewardDescription: string;
    achieved: boolean;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team volume — sum of cumulative area across the agent's entire downline.
//
// Used by getEffectiveCumulativeArea: effective = personal + team. The slab
// engine reads effective area to look up rates, so leaders' slabs upgrade as
// the downline produces (group-volume MLM model). A junior with no downline
// gets team=0, so their slab still tracks personal sales only.
//
// Note on override differentials: when two uplines sit at the same top slab
// because both have large group volumes, their (uplineRate − sellerRate)
// differential compresses to zero — that's expected compression, the highest
// upline with a rate advantage earns the override.
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamAreaTotals {
  area: number;          // sq.yd — sum of dealArea across all descendants
  dealsCount: number;    // # of closed deals in the downline
  directIncome: number;  // sum of directIncome paid to descendants
  agentCount: number;    // size of the downline subtree (excluding self)
}

/**
 * Returns aggregated area-ledger totals for every descendant of `agentId`
 * (excluding the agent themselves). Uses a Postgres recursive CTE — runs as
 * a single round-trip regardless of tree depth.
 *
 * Includes both ACTIVE and inactive descendants — the user wants to see
 * everything their tree has historically produced. Filtering by status is
 * the caller's job if they need a different view.
 */
export async function getTeamAreaTotals(
  tx: Tx,
  organizationId: string,
  agentId: string,
): Promise<TeamAreaTotals> {
  const rows: Array<{
    total_area: string; deals_count: string; total_income: string; agent_count: string;
  }> = await (tx as any).$queryRaw(Prisma.sql`
    WITH RECURSIVE downline AS (
      SELECT id
        FROM re_agent_profiles
       WHERE parent_id = ${agentId}
         AND organization_id = ${organizationId}
      UNION
      SELECT child.id
        FROM re_agent_profiles child
        JOIN downline d ON child.parent_id = d.id
       WHERE child.organization_id = ${organizationId}
    )
    SELECT
      COALESCE(SUM(l.deal_area),     0)::text AS total_area,
      COALESCE(SUM(l.direct_income), 0)::text AS total_income,
      COALESCE(COUNT(l.id),          0)::text AS deals_count,
      (SELECT COUNT(*) FROM downline)::text   AS agent_count
    FROM re_agent_area_ledger l
   WHERE l.agent_id IN (SELECT id FROM downline)
     AND l.organization_id = ${organizationId}
     AND l.is_reversed = false;
  `);

  // queryRaw returns numeric values as strings for Decimal columns — parse
  // through Decimal so we don't introduce floating-point drift.
  const r = rows[0] ?? { total_area: "0", deals_count: "0", total_income: "0", agent_count: "0" };
  return {
    area: dec(r.total_area).toNumber(),
    dealsCount: Number(r.deals_count) || 0,
    directIncome: dec(r.total_income).toNumber(),
    agentCount: Number(r.agent_count) || 0,
  };
}

/**
 * Returns a snapshot of one agent's progress through the active slab plan.
 * Pure read — safe to call from any GET handler without a transaction.
 *
 * `userId` is preferred over agentId because every agent-facing page already
 * has the User in hand from the auth helper.
 */
export async function getSlabProgress(
  tx: Tx,
  organizationId: string,
  userId: string,
): Promise<SlabProgress> {
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId },
    select: { planEngine: true, activePlanId: true, areaUnit: true },
  });

  // Empty-but-valid response when slab engine isn't on — keeps the UI from
  // having to special-case the "no plan yet" state.
  const emptyResponse: SlabProgress = {
    enabled: false,
    planName: null,
    areaUnit: settings?.areaUnit ?? "SQYD",
    cumulativeArea: 0,
    totalDirectIncome: 0,
    dealsCount: 0,
    teamCumulativeArea: 0,
    teamDirectIncome: 0,
    teamDealsCount: 0,
    downlineAgentCount: 0,
    currentSlab: null,
    nextSlab: null,
    ladder: [],
    currentDesignation: null,
    nextDesignation: null,
    designations: [],
  };

  if (settings?.planEngine !== "SLAB" || !settings.activePlanId) {
    return emptyResponse;
  }

  const plan = await (tx as any).compPlan.findUnique({
    where: { id: settings.activePlanId },
    include: {
      slabs: { orderBy: { sortOrder: "asc" } },
      designations: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!plan || plan.status !== "ACTIVE") return emptyResponse;

  const agent = await (tx as any).agentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  // A user without an AgentProfile (e.g. plain admin) gets the "no progress"
  // shape — UI hides the card.
  if (!agent) return { ...emptyResponse, enabled: true, planName: plan.name };

  // Pull the latest area-ledger row for personal cumulative; aggregate the
  // personal direct-income + deal count; in parallel, recursive-walk the
  // downline for team volume. Three queries, one round-trip-batch.
  const [last, agg, team] = await Promise.all([
    (tx as any).agentAreaLedger.findFirst({
      where: { organizationId, agentId: agent.id, planId: plan.id, isReversed: false },
      orderBy: { createdAt: "desc" },
      select: { cumulativeArea: true },
    }),
    (tx as any).agentAreaLedger.aggregate({
      where: { organizationId, agentId: agent.id, planId: plan.id, isReversed: false },
      _sum: { directIncome: true },
      _count: { _all: true },
    }),
    getTeamAreaTotals(tx, organizationId, agent.id),
  ]);

  const cumulative = last ? dec(last.cumulativeArea) : ZERO;
  const totalDirectIncome = agg._sum.directIncome ? dec(agg._sum.directIncome) : ZERO;
  const dealsCount = agg._count._all ?? 0;

  // Team totals roll up personal + downline. The user wanted this so a leader
  // who hasn't personally closed anything still sees their team's production.
  const teamCumulativeArea = cumulative.toNumber() + team.area;
  const teamDirectIncome = totalDirectIncome.toNumber() + team.directIncome;
  const teamDealsCount = dealsCount + team.dealsCount;

  // Effective area drives the slab. Personal + entire downline production —
  // this is the same value the commission engine uses to look up the seller's
  // and uplines' rates, so the dashboard ladder matches what the engine pays.
  const effective = dec(teamCumulativeArea);

  const slabs = plan.slabs as Array<{ sortOrder: number; minArea: any; maxArea: any | null; ratePerUnit: any }>;

  const ladder = slabs.map((s) => {
    const min = dec(s.minArea);
    const max = s.maxArea != null ? dec(s.maxArea) : null;
    const isCurrent =
      effective.gte(min) && (max === null || effective.lt(max));
    return {
      sortOrder: s.sortOrder,
      minArea: min.toNumber(),
      maxArea: max ? max.toNumber() : null,
      ratePerUnit: dec(s.ratePerUnit).toNumber(),
      isCurrent,
      isCleared: effective.gte(min),
    };
  });

  const currentSlab = ladder.find((s) => s.isCurrent) ?? null;
  // The next slab is the first one not yet cleared. If the agent is on the
  // very last (open-ended) slab, there is no "next" — keep it null.
  const nextSlabRaw = ladder.find((s) => !s.isCleared) ?? null;
  const nextSlab = nextSlabRaw
    ? {
        sortOrder: nextSlabRaw.sortOrder,
        minArea: nextSlabRaw.minArea,
        maxArea: nextSlabRaw.maxArea,
        ratePerUnit: nextSlabRaw.ratePerUnit,
        areaToReach: Math.max(0, nextSlabRaw.minArea - effective.toNumber()),
      }
    : null;

  const designations = (plan.designations as Array<any>).map((d) => {
    const min = dec(d.minCumulativeArea);
    return {
      code: d.designationCode,
      name: d.designationName,
      minCumulativeArea: min.toNumber(),
      rewardType: d.rewardType,
      rewardDescription: d.rewardDescription,
      achieved: effective.gte(min),
    };
  });
  const achievedDesignations = designations.filter((d) => d.achieved);
  const currentDesignation = achievedDesignations.length
    ? {
        code: achievedDesignations[achievedDesignations.length - 1].code,
        name: achievedDesignations[achievedDesignations.length - 1].name,
        rewardDescription: achievedDesignations[achievedDesignations.length - 1].rewardDescription,
      }
    : null;
  const nextDesignationRaw = designations.find((d) => !d.achieved) ?? null;
  const nextDesignation = nextDesignationRaw
    ? {
        code: nextDesignationRaw.code,
        name: nextDesignationRaw.name,
        minCumulativeArea: nextDesignationRaw.minCumulativeArea,
        areaToReach: Math.max(0, nextDesignationRaw.minCumulativeArea - effective.toNumber()),
        rewardDescription: nextDesignationRaw.rewardDescription,
      }
    : null;

  return {
    enabled: true,
    planName: plan.name,
    areaUnit: plan.areaUnit ?? "SQYD",
    cumulativeArea: cumulative.toNumber(),
    totalDirectIncome: totalDirectIncome.toNumber(),
    dealsCount,
    teamCumulativeArea,
    teamDirectIncome,
    teamDealsCount,
    downlineAgentCount: team.agentCount,
    currentSlab,
    nextSlab,
    ladder,
    currentDesignation,
    nextDesignation,
    designations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slab history — for the agent profile page so admins (and the agent
// themselves) can see every deal, the slab they were on for it, and every
// upgrade event in order.
// ─────────────────────────────────────────────────────────────────────────────

export interface SlabHistoryDealRow {
  ledgerId: string;
  transactionId: string;
  transactionCode: string | null;
  closedAt: string | null;
  dealArea: number;         // sq.yd
  cumulativeArea: number;   // after this deal
  rateApplied: number;      // ₹/sq.yd at deal time
  directIncome: number;     // ₹ direct earned on this deal
  propertyTitle: string | null;
  propertyCode: string | null;
}

export interface SlabUpgradeEvent {
  at: string;
  triggeredByLedgerId: string;
  triggeredByTransactionId: string;
  fromSlab: { sortOrder: number; minArea: number; maxArea: number | null; ratePerUnit: number };
  toSlab:   { sortOrder: number; minArea: number; maxArea: number | null; ratePerUnit: number };
}

export interface SlabHistoryDesignationEvent {
  at: string;
  triggeredByLedgerId: string | null;
  code: string;
  name: string;
  rewardType: string;
  rewardDescription: string;
  minCumulativeArea: number;
}

export interface OverrideEarningRow {
  splitId: string;
  transactionId: string;
  transactionCode: string | null;
  closedAt: string | null;
  level: number | null;
  amount: number;
  status: string;
  fromAgentName: string | null;     // who closed the sale that fed this override
  propertyTitle: string | null;
}

export interface AgentSlabHistory {
  progress: SlabProgress;                        // same snapshot used in MyWallet card
  deals: SlabHistoryDealRow[];                   // every closed deal (chronological)
  slabUpgrades: SlabUpgradeEvent[];              // derived events
  designationUnlocks: SlabHistoryDesignationEvent[];
  overrides: {
    rows: OverrideEarningRow[];
    totalAmount: number;
  };
}

/**
 * Returns a complete slab history for one agent (by userId). Includes:
 *   - current progress snapshot
 *   - every deal in the area ledger
 *   - synthesized slab-upgrade events (when consecutive ledger rows cross
 *     a slab boundary)
 *   - designation unlock events (from RewardGrant)
 *   - override earnings this agent received from downline deals
 *
 * Pure read; safe outside a $transaction.
 */
export async function getAgentSlabHistory(
  tx: Tx,
  organizationId: string,
  userId: string,
): Promise<AgentSlabHistory> {
  const progress = await getSlabProgress(tx, organizationId, userId);

  const agent = await (tx as any).agentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!progress.enabled || !agent) {
    return {
      progress,
      deals: [],
      slabUpgrades: [],
      designationUnlocks: [],
      overrides: { rows: [], totalAmount: 0 },
    };
  }

  // Resolve the active plan once so we can map ledger rows → slab boundaries.
  const settings = await (tx as any).rebmSettings.findUnique({
    where: { organizationId },
    select: { activePlanId: true },
  });
  const plan = settings?.activePlanId
    ? await (tx as any).compPlan.findUnique({
        where: { id: settings.activePlanId },
        include: { slabs: { orderBy: { sortOrder: "asc" } } },
      })
    : null;

  const resolvedSlabs: ResolvedPlan["slabs"] =
    plan?.slabs.map((s: any) => ({
      sortOrder: s.sortOrder,
      minArea: dec(s.minArea),
      maxArea: s.maxArea != null ? dec(s.maxArea) : null,
      ratePerUnit: dec(s.ratePerUnit),
    })) ?? [];

  const slabAt = (cumulative: Prisma.Decimal) => {
    for (const s of resolvedSlabs) {
      if (cumulative.gte(s.minArea) && (s.maxArea === null || cumulative.lt(s.maxArea))) return s;
    }
    return resolvedSlabs[resolvedSlabs.length - 1] ?? null;
  };

  // ── Pull every area-ledger row joined to its transaction + property ──
  const ledger = await (tx as any).agentAreaLedger.findMany({
    where: { organizationId, agentId: agent.id, isReversed: false },
    orderBy: { createdAt: "asc" },
    include: {
      transaction: {
        select: {
          id: true, code: true, closedAt: true,
          property: { select: { title: true, code: true } },
        },
      },
    },
  });

  const deals: SlabHistoryDealRow[] = ledger.map((row: any) => ({
    ledgerId: row.id,
    transactionId: row.transactionId,
    transactionCode: row.transaction?.code ?? null,
    closedAt: row.transaction?.closedAt?.toISOString() ?? row.createdAt.toISOString(),
    dealArea: dec(row.dealArea).toNumber(),
    cumulativeArea: dec(row.cumulativeArea).toNumber(),
    rateApplied: dec(row.rateApplied).toNumber(),
    directIncome: dec(row.directIncome).toNumber(),
    propertyTitle: row.transaction?.property?.title ?? null,
    propertyCode: row.transaction?.property?.code ?? null,
  }));

  // ── Derive upgrade events by walking ledger and watching slab changes ─
  const slabUpgrades: SlabUpgradeEvent[] = [];
  let lastCum = ZERO;
  let lastSlab = slabAt(lastCum);
  for (const row of ledger) {
    const before = lastCum;
    const after = dec(row.cumulativeArea);
    const beforeSlab = slabAt(before);
    const afterSlab = slabAt(after);
    if (
      beforeSlab && afterSlab && beforeSlab.sortOrder !== afterSlab.sortOrder
    ) {
      slabUpgrades.push({
        at: row.createdAt.toISOString(),
        triggeredByLedgerId: row.id,
        triggeredByTransactionId: row.transactionId,
        fromSlab: {
          sortOrder: beforeSlab.sortOrder,
          minArea: beforeSlab.minArea.toNumber(),
          maxArea: beforeSlab.maxArea ? beforeSlab.maxArea.toNumber() : null,
          ratePerUnit: beforeSlab.ratePerUnit.toNumber(),
        },
        toSlab: {
          sortOrder: afterSlab.sortOrder,
          minArea: afterSlab.minArea.toNumber(),
          maxArea: afterSlab.maxArea ? afterSlab.maxArea.toNumber() : null,
          ratePerUnit: afterSlab.ratePerUnit.toNumber(),
        },
      });
    }
    lastCum = after;
    lastSlab = afterSlab;
  }

  // ── Designation unlocks (one per RewardGrant) ──
  const grants = settings?.activePlanId
    ? await (tx as any).rewardGrant.findMany({
        where: { organizationId, agentId: agent.id, planId: settings.activePlanId },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const designationUnlocks: SlabHistoryDesignationEvent[] = grants.map((g: any) => ({
    at: g.createdAt.toISOString(),
    triggeredByLedgerId: null,
    code: g.designationCode,
    name: g.designationName,
    rewardType: g.rewardType,
    rewardDescription: g.rewardDescription ?? "",
    minCumulativeArea: dec(g.triggeredByArea).toNumber(),
  }));

  // ── Override earnings — splits where this agent was the beneficiary at
  // OVERRIDE role. Sum total and list rows for transparency.
  const overrideSplits = await (tx as any).commissionSplit.findMany({
    where: {
      organizationId,
      beneficiaryUserId: userId,
      role: "OVERRIDE",
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      transaction: {
        select: {
          id: true, code: true, closedAt: true,
          listingAgentId: true, sellingAgentId: true,
          property: { select: { title: true } },
        },
      },
    },
  });

  // Resolve names for the downline agent who closed each deal (best effort —
  // empty when the user has been deleted).
  const downlineUserIds = Array.from(
    new Set(
      overrideSplits
        .map((s: any) => s.transaction?.sellingAgentId ?? s.transaction?.listingAgentId)
        .filter(Boolean),
    ),
  );
  const downlineUsers = downlineUserIds.length
    ? await (tx as any).user.findMany({
        where: { id: { in: downlineUserIds } },
        select: { id: true, first_name: true, last_name: true, email: true },
      })
    : [];
  const userById = new Map<string, any>(downlineUsers.map((u: any) => [u.id, u]));

  const overrideRows: OverrideEarningRow[] = overrideSplits.map((s: any) => {
    const fromUserId = s.transaction?.sellingAgentId ?? s.transaction?.listingAgentId;
    const u = fromUserId ? userById.get(fromUserId) : null;
    return {
      splitId: s.id,
      transactionId: s.transactionId,
      transactionCode: s.transaction?.code ?? null,
      closedAt: s.transaction?.closedAt?.toISOString() ?? null,
      level: s.level,
      amount: dec(s.amount).toNumber(),
      status: s.status,
      fromAgentName: u
        ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email
        : null,
      propertyTitle: s.transaction?.property?.title ?? null,
    };
  });
  const overrideTotal = overrideRows.reduce((a, r) => a + r.amount, 0);

  return {
    progress,
    deals,
    slabUpgrades,
    designationUnlocks,
    overrides: { rows: overrideRows, totalAmount: overrideTotal },
  };
}
