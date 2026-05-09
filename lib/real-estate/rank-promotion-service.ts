/**
 * Rank-promotion service (FR-2.6 / FR-2.7).
 *
 * Evaluates each ACTIVE agent against the criteria of the rank above their
 * current one, and promotes them when criteria are met. Each promotion lands
 * in `RankPromotionLog` so the agent profile timeline shows it.
 *
 * Criteria (any of which can be null = "not required"):
 *   - rank.minPersonalSales: count of CLOSED transactions where the agent is
 *     listing or selling.
 *   - rank.minTeamSize: count of ACTIVE descendants in the MLM tree.
 *   - rank.minTeamRevenue: sum of CLOSED transaction salePrice across the
 *     agent's downline.
 *
 * Window: rank.evaluationWindowDays — null means lifetime, N means the
 * trailing N days (counted against transaction.closedAt).
 *
 * `mode`:
 *   - "AUTO": promote and create RankPromotionLog with triggeredBy=SYSTEM
 *   - "PREVIEW": evaluate without writing — used by the admin page to show
 *     "would promote" candidates
 */

import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;
const ZERO = new Prisma.Decimal(0);

interface AgentCandidate {
  id: string;
  userId: string;
  rankId: string | null;
  currentRankLevel: number;
  currentRankName: string | null;
}

interface RankRow {
  id: string;
  name: string;
  level: number;
  minPersonalSales: number | null;
  minTeamSize: number | null;
  minTeamRevenue: Prisma.Decimal | null;
  evaluationWindowDays: number | null;
  rankUpBonus: Prisma.Decimal | null;
  isActive: boolean;
}

export interface PromotionResult {
  agentId: string;
  userId: string;
  fromRankId: string | null;
  fromRankName: string | null;
  toRankId: string;
  toRankName: string;
  metrics: {
    personalSales: number;
    teamSize: number;
    teamRevenue: number;
  };
  promoted: boolean;
}

// ─── Tree traversal helpers ─────────────────────────────────────────────────

async function getDownlineUserIds(tx: Tx, rootAgentId: string): Promise<string[]> {
  // BFS down the MLM tree (parent edges).
  const all = await tx.agentProfile.findMany({
    select: { id: true, parentId: true, userId: true },
  });
  const childMap = new Map<string | null, typeof all>();
  for (const a of all) {
    const list = childMap.get(a.parentId) ?? [];
    list.push(a);
    childMap.set(a.parentId, list);
  }
  const out: string[] = [];
  const queue: string[] = [rootAgentId];
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const c of childMap.get(cur) ?? []) {
      out.push(c.userId);
      queue.push(c.id);
    }
  }
  return out;
}

async function computeMetrics(
  tx: Tx,
  agent: { id: string; userId: string },
  windowDays: number | null,
): Promise<{ personalSales: number; teamSize: number; teamRevenue: Prisma.Decimal }> {
  const cutoff =
    windowDays != null ? new Date(Date.now() - windowDays * 86400000) : null;

  // Personal sales — agent is listing OR selling on a CLOSED transaction.
  const personalSales = await tx.transaction.count({
    where: {
      status: "CLOSED",
      OR: [{ listingAgentId: agent.userId }, { sellingAgentId: agent.userId }],
      ...(cutoff ? { closedAt: { gte: cutoff } } : {}),
    },
  });

  // Downline user-ids
  const downlineUserIds = await getDownlineUserIds(tx, agent.id);
  const teamSize = downlineUserIds.length;

  let teamRevenue = ZERO;
  if (downlineUserIds.length > 0) {
    const txns = await tx.transaction.findMany({
      where: {
        status: "CLOSED",
        OR: [
          { listingAgentId: { in: downlineUserIds } },
          { sellingAgentId: { in: downlineUserIds } },
        ],
        ...(cutoff ? { closedAt: { gte: cutoff } } : {}),
      },
      select: { salePrice: true },
    });
    for (const t of txns) teamRevenue = teamRevenue.plus(t.salePrice);
  }

  return { personalSales, teamSize, teamRevenue };
}

function meetsCriteria(
  rank: RankRow,
  metrics: { personalSales: number; teamSize: number; teamRevenue: Prisma.Decimal },
): boolean {
  if (rank.minPersonalSales != null && metrics.personalSales < rank.minPersonalSales)
    return false;
  if (rank.minTeamSize != null && metrics.teamSize < rank.minTeamSize) return false;
  if (rank.minTeamRevenue != null && metrics.teamRevenue.lessThan(rank.minTeamRevenue))
    return false;
  return true;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function evaluatePromotions(
  tx: Tx,
  organizationId: string,
  mode: "AUTO" | "PREVIEW",
  invokerUserId: string,
): Promise<PromotionResult[]> {
  // Active ranks ordered by level so we know the "next" rank.
  const ranks = await tx.rank.findMany({
    where: { organizationId, isActive: true },
    orderBy: { level: "asc" },
  });
  if (ranks.length === 0) return [];

  // Map level → next rank
  const sorted = [...ranks].sort((a, b) => a.level - b.level);
  const nextRankByLevel = new Map<number, RankRow>();
  for (let i = 0; i < sorted.length - 1; i++) {
    nextRankByLevel.set(sorted[i].level, {
      id: sorted[i + 1].id,
      name: sorted[i + 1].name,
      level: sorted[i + 1].level,
      minPersonalSales: sorted[i + 1].minPersonalSales,
      minTeamSize: sorted[i + 1].minTeamSize,
      minTeamRevenue: sorted[i + 1].minTeamRevenue ?? null,
      evaluationWindowDays: sorted[i + 1].evaluationWindowDays,
      rankUpBonus: sorted[i + 1].rankUpBonus ?? null,
      isActive: sorted[i + 1].isActive,
    });
  }

  const agents = await tx.agentProfile.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { rank: true },
  });

  const candidates: AgentCandidate[] = agents.map((a) => ({
    id: a.id,
    userId: a.userId,
    rankId: a.rankId,
    currentRankLevel: a.rank?.level ?? -1,
    currentRankName: a.rank?.name ?? null,
  }));

  const results: PromotionResult[] = [];

  for (const c of candidates) {
    const next = nextRankByLevel.get(c.currentRankLevel);
    // No agents can be promoted further than the top rank.
    if (!next) continue;

    const metrics = await computeMetrics(
      tx,
      { id: c.id, userId: c.userId },
      next.evaluationWindowDays,
    );

    const qualifies = meetsCriteria(next, metrics);
    if (!qualifies) continue;

    const result: PromotionResult = {
      agentId: c.id,
      userId: c.userId,
      fromRankId: c.rankId,
      fromRankName: c.currentRankName,
      toRankId: next.id,
      toRankName: next.name,
      metrics: {
        personalSales: metrics.personalSales,
        teamSize: metrics.teamSize,
        teamRevenue: Number(metrics.teamRevenue),
      },
      promoted: false,
    };

    if (mode === "AUTO") {
      await tx.agentProfile.update({
        where: { id: c.id },
        data: {
          rankId: next.id,
          rankAssignedAt: new Date(),
        },
      });
      await tx.rankPromotionLog.create({
        data: {
          agentId: c.id,
          fromRankId: c.rankId,
          toRankId: next.id,
          triggeredBy: "SYSTEM",
          reason: `Auto-promotion: sales=${metrics.personalSales}, team=${metrics.teamSize}, revenue=${metrics.teamRevenue.toFixed(2)}`,
        },
      });

      // Rank-up bonus to wallet (if configured) — credited as RELEASED so it
      // shows up in available balance immediately.
      if (next.rankUpBonus && next.rankUpBonus.greaterThan(ZERO)) {
        // Lazy-import to avoid a circular dep at module-init time.
        const { WalletService } = await import("./wallet-service");
        const wallet = await WalletService.ensureWallet(tx, {
          organizationId,
          userId: c.userId,
        });
        await WalletService.addEntry(tx, {
          organizationId,
          walletId: wallet.id,
          type: "CREDIT",
          category: "RANK_UP_BONUS",
          status: "RELEASED",
          amount: next.rankUpBonus,
          description: `Rank-up bonus: ${c.currentRankName ?? "—"} → ${next.name}`,
          createdById: invokerUserId,
        });
      }

      result.promoted = true;
    }

    results.push(result);
  }

  return results;
}
