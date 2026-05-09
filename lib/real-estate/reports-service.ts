/**
 * Reports service (FR-9). Each function reads from existing tables and
 * returns a JSON-serialisable shape ready to render. We keep the wire format
 * the same as the rest of the module: numbers as numbers (Decimals already
 * converted), dates as ISO strings.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

const dec = (v: Prisma.Decimal | null | undefined): number =>
  v == null ? 0 : Number(v);

interface DateRange {
  from?: string; // YYYY-MM-DD or ISO
  to?: string;
}

function parseRange(r: DateRange): { from?: Date; to?: Date } {
  return {
    from: r.from ? new Date(r.from) : undefined,
    to: r.to ? new Date(r.to) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sales Register
// ─────────────────────────────────────────────────────────────────────────────

export async function salesRegister(
  tx: Tx,
  organizationId: string,
  range: DateRange,
) {
  const { from, to } = parseRange(range);
  const txns = await tx.transaction.findMany({
    where: {
      organizationId,
      status: "CLOSED",
      ...(from || to
        ? { closedAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
        : {}),
    },
    orderBy: { closedAt: "desc" },
    include: {
      property: { select: { id: true, title: true, code: true, city: true } },
      buyer: { select: { id: true, name: true } },
    },
  });

  const totalSales = txns.reduce((acc, t) => acc + dec(t.salePrice), 0);
  const totalCommission = txns.reduce(
    (acc, t) => acc + dec(t.baseCommission),
    0,
  );

  return {
    rows: txns.map((t) => ({
      id: t.id,
      code: t.code,
      closedAt: t.closedAt?.toISOString() ?? null,
      property: t.property,
      buyer: t.buyer,
      listingAgentId: t.listingAgentId,
      sellingAgentId: t.sellingAgentId,
      salePrice: dec(t.salePrice),
      baseCommission: dec(t.baseCommission),
      currency: t.currency,
    })),
    summary: {
      count: txns.length,
      totalSales,
      totalCommission,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Commission Register
// ─────────────────────────────────────────────────────────────────────────────

export async function commissionRegister(
  tx: Tx,
  organizationId: string,
  range: DateRange,
  filter: { agentId?: string; status?: string } = {},
) {
  const { from, to } = parseRange(range);
  const splits = await tx.commissionSplit.findMany({
    where: {
      organizationId,
      ...(filter.agentId ? { beneficiaryUserId: filter.agentId } : {}),
      ...(filter.status ? { status: filter.status as any } : {}),
      ...(from || to
        ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      transaction: {
        select: {
          id: true,
          code: true,
          closedAt: true,
          property: { select: { title: true, code: true } },
        },
      },
    },
  });

  const totalAmount = splits.reduce((acc, s) => acc + dec(s.amount), 0);
  const onHold = splits
    .filter((s) => s.status === "ON_HOLD")
    .reduce((acc, s) => acc + dec(s.amount), 0);
  const released = splits
    .filter((s) => s.status === "RELEASED")
    .reduce((acc, s) => acc + dec(s.amount), 0);
  const reversed = splits
    .filter((s) => s.status === "REVERSED")
    .reduce((acc, s) => acc + dec(s.amount), 0);

  return {
    rows: splits.map((s) => ({
      id: s.id,
      transaction: s.transaction
        ? {
            id: s.transaction.id,
            code: s.transaction.code,
            closedAt: s.transaction.closedAt?.toISOString() ?? null,
            property: s.transaction.property,
          }
        : null,
      role: s.role,
      level: s.level,
      beneficiaryUserId: s.beneficiaryUserId,
      percent: dec(s.percent),
      amount: dec(s.amount),
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
    summary: {
      count: splits.length,
      totalAmount,
      onHold,
      released,
      reversed,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Payout Register
// ─────────────────────────────────────────────────────────────────────────────

export async function payoutRegister(
  tx: Tx,
  organizationId: string,
  range: DateRange,
  filter: { status?: string } = {},
) {
  const { from, to } = parseRange(range);
  const items = await tx.withdrawalRequest.findMany({
    where: {
      organizationId,
      ...(filter.status ? { status: filter.status as any } : {}),
      ...(from || to
        ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      bankAccount: {
        select: {
          bankName: true,
          accountNumberLast4: true,
          accountHolderName: true,
        },
      },
    },
  });

  const totalRequested = items.reduce((acc, i) => acc + dec(i.amount), 0);
  const totalPaid = items
    .filter((i) => i.status === "PAID")
    .reduce((acc, i) => acc + dec(i.netAmount), 0);

  return {
    rows: items.map((i) => ({
      id: i.id,
      userId: i.userId,
      amount: dec(i.amount),
      fee: dec(i.fee),
      netAmount: dec(i.netAmount),
      status: i.status,
      bankAccount: i.bankAccount,
      paidAt: i.paidAt?.toISOString() ?? null,
      paymentReference: i.paymentReference,
      createdAt: i.createdAt.toISOString(),
    })),
    summary: {
      count: items.length,
      totalRequested,
      totalPaid,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Lead Conversion Report
// ─────────────────────────────────────────────────────────────────────────────

export async function leadConversionReport(
  tx: Tx,
  organizationId: string,
  range: DateRange,
) {
  const { from, to } = parseRange(range);
  const leads = await tx.lead.findMany({
    where: {
      organizationId,
      ...(from || to
        ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
        : {}),
    },
    select: { status: true, source: true, score: true, convertedAt: true },
  });

  const total = leads.length;
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byScore: Record<string, number> = {};
  let converted = 0;
  let lost = 0;
  for (const l of leads) {
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    byScore[l.score] = (byScore[l.score] ?? 0) + 1;
    if (l.status === "CONVERTED") converted++;
    if (l.status === "LOST") lost++;
  }

  return {
    summary: {
      total,
      converted,
      lost,
      conversionRate: total > 0 ? Number(((converted / total) * 100).toFixed(2)) : 0,
    },
    byStatus,
    bySource,
    byScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Top Agents Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export async function topAgentsLeaderboard(
  tx: Tx,
  organizationId: string,
  range: DateRange,
  topN = 25,
) {
  const { from, to } = parseRange(range);
  const txns = await tx.transaction.findMany({
    where: {
      organizationId,
      status: "CLOSED",
      ...(from || to
        ? { closedAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
        : {}),
    },
    select: {
      listingAgentId: true,
      sellingAgentId: true,
      salePrice: true,
      baseCommission: true,
    },
  });

  // Each txn credits one agent (or two if listing and selling differ). We
  // tally each side.
  const tallies = new Map<
    string,
    { sales: number; revenue: number; commission: number }
  >();
  const bump = (
    userId: string,
    revenue: number,
    commission: number,
  ) => {
    const cur = tallies.get(userId) ?? { sales: 0, revenue: 0, commission: 0 };
    cur.sales += 1;
    cur.revenue += revenue;
    cur.commission += commission;
    tallies.set(userId, cur);
  };
  for (const t of txns) {
    const sale = dec(t.salePrice);
    const comm = dec(t.baseCommission);
    bump(t.listingAgentId, sale, comm);
    if (t.sellingAgentId && t.sellingAgentId !== t.listingAgentId) {
      bump(t.sellingAgentId, sale, comm);
    }
  }

  const userIds = Array.from(tallies.keys());
  const users =
    userIds.length === 0
      ? []
      : await tx.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            avatar: true,
          },
        });
  const userById = new Map(users.map((u) => [u.id, u]));

  const ranked = Array.from(tallies.entries())
    .map(([userId, t]) => ({
      user: userById.get(userId) ?? { id: userId, email: "—" },
      sales: t.sales,
      revenue: t.revenue,
      commission: t.commission,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN);

  return { rows: ranked };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Property Aging Report — properties sitting in inventory the longest
// ─────────────────────────────────────────────────────────────────────────────

export async function propertyAgingReport(
  tx: Tx,
  organizationId: string,
) {
  const props = await tx.property.findMany({
    where: {
      organizationId,
      status: { in: ["AVAILABLE", "UNDER_CONTRACT"] },
    },
    orderBy: { listedAt: "asc" },
    select: {
      id: true,
      title: true,
      code: true,
      city: true,
      listingPrice: true,
      currency: true,
      status: true,
      listedAt: true,
    },
  });

  const now = Date.now();
  return {
    rows: props.map((p) => ({
      id: p.id,
      title: p.title,
      code: p.code,
      city: p.city,
      currency: p.currency,
      listingPrice: dec(p.listingPrice),
      status: p.status,
      listedAt: p.listedAt.toISOString(),
      daysOnMarket: Math.floor((now - p.listedAt.getTime()) / 86400000),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Compliance Status Report
// ─────────────────────────────────────────────────────────────────────────────

export async function complianceStatusReport(
  tx: Tx,
  organizationId: string,
) {
  const agents = await tx.agentProfile.findMany({
    where: { organizationId, status: { not: "TERMINATED" } },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          avatar: true,
        },
      },
      complianceDocuments: {
        select: { type: true, status: true, expiryDate: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const summary = { COMPLIANT: 0, PENDING_KYC: 0, NON_COMPLIANT: 0 };

  const now = Date.now();
  const rows = agents.map((a) => {
    summary[a.complianceStatus]++;
    const expiringSoon = a.complianceDocuments.filter(
      (d) =>
        d.status === "VERIFIED" &&
        d.expiryDate &&
        d.expiryDate.getTime() < now + 30 * 86400000 &&
        d.expiryDate.getTime() >= now,
    ).length;

    return {
      agentId: a.id,
      user: a.user,
      complianceStatus: a.complianceStatus,
      docsTotal: a.complianceDocuments.length,
      docsVerified: a.complianceDocuments.filter((d) => d.status === "VERIFIED").length,
      docsPending: a.complianceDocuments.filter((d) => d.status === "PENDING").length,
      docsRejected: a.complianceDocuments.filter((d) => d.status === "REJECTED").length,
      docsExpiringSoon: expiringSoon,
      licenseExpiresAt: a.licenseExpiresAt?.toISOString() ?? null,
    };
  });

  return { summary, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Tax Statement (per agent, per FY)
// ─────────────────────────────────────────────────────────────────────────────

export async function taxStatement(
  tx: Tx,
  organizationId: string,
  filter: { userId: string; financialYear: number /* e.g. 2025 = FY 2025-26 */ },
) {
  // FY runs Apr 1 → Mar 31 (Indian financial year). Caller can override by
  // passing a `from`/`to` range version of this report later.
  const fyStart = new Date(filter.financialYear, 3, 1); // 0-indexed month: 3 = April
  const fyEnd = new Date(filter.financialYear + 1, 2, 31, 23, 59, 59);

  const splits = await tx.commissionSplit.findMany({
    where: {
      organizationId,
      beneficiaryUserId: filter.userId,
      status: { in: ["RELEASED", "REVERSED"] },
      createdAt: { gte: fyStart, lte: fyEnd },
    },
    include: {
      transaction: {
        select: {
          code: true,
          closedAt: true,
          property: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalEarned = splits
    .filter((s) => s.status === "RELEASED")
    .reduce((acc, s) => acc + dec(s.amount), 0);
  const totalReversed = splits
    .filter((s) => s.status === "REVERSED")
    .reduce((acc, s) => acc + dec(s.amount), 0);

  const user = await tx.user.findUnique({
    where: { id: filter.userId },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
    },
  });

  return {
    user,
    financialYear: filter.financialYear,
    period: {
      from: fyStart.toISOString().slice(0, 10),
      to: fyEnd.toISOString().slice(0, 10),
    },
    summary: {
      grossEarned: totalEarned,
      reversed: totalReversed,
      netEarned: totalEarned - totalReversed,
    },
    rows: splits.map((s) => ({
      id: s.id,
      transactionCode: s.transaction?.code ?? null,
      propertyTitle: s.transaction?.property?.title ?? null,
      role: s.role,
      level: s.level,
      amount: dec(s.amount),
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}
