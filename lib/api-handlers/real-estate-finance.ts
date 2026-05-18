/**
 * REBM Phase 2 — Wallet, Ledger, Bank Account, and Withdrawal handlers.
 *
 * BR-3 — available balance is sum of released ledger entries (credits −
 * debits). It cannot go negative without admin-approved override.
 * BR-4 — payouts cannot exceed available − fee.
 * BR-5 — agent must be COMPLIANT to receive releases or initiate payouts.
 * BR-14 — manual ledger adjustments require dual authorization (we only
 *          guard server-side here; the second-admin sign-off lives in the UI
 *          flow / approval workflow integration to come).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import { WalletService } from "@/lib/real-estate/wallet-service";
import {
  calculateCommission,
  releaseDueCommissions,
} from "@/lib/real-estate/commission-engine";
import {
  calculateSlabCommission,
  getAgentCumulativeArea,
  getSlabProgress,
  resolveActivePlan,
  toSquareYards,
} from "@/lib/real-estate/slab-engine";
import {
  encryptAccountNumber,
  decryptAccountNumber,
  maskedLast4,
} from "@/lib/real-estate/bank-crypto";

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  return user as { id: string; email: string; organizationId: string };
}

async function handle(fn: () => Promise<NextResponse>, label: string) {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[FinanceHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json({ error: "Duplicate value" }, { status: 409 });
    if (e?.code === "P2025")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// Given a user, figure out why their on-hold balance is still on hold after
// the auto-release pass has run. The four states map cleanly onto things the
// UI can either explain ("waiting until 12 Jun") or surface as an action
// item ("complete KYC to unlock"). Returns nulls when nothing is on hold.
async function computeHoldDiagnostics(
  userId: string,
  organizationId: string,
): Promise<{
  heldReason: null | "HOLD_PERIOD" | "COMPLIANCE" | "FROZEN";
  nextReleaseAt: string | null;
}> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { isFrozen: true, pendingBalance: true },
  });
  if (!wallet || Number(wallet.pendingBalance) <= 0)
    return { heldReason: null, nextReleaseAt: null };

  if (wallet.isFrozen) {
    return { heldReason: "FROZEN", nextReleaseAt: null };
  }

  const splits = await prisma.commissionSplit.findMany({
    where: {
      organizationId,
      beneficiaryUserId: userId,
      status: "ON_HOLD",
      ledgerEntryId: { not: null },
    },
    include: {
      transaction: { select: { closedAt: true } },
      rule: { select: { holdPeriodDays: true } },
    },
  });
  if (splits.length === 0) return { heldReason: null, nextReleaseAt: null };

  const now = Date.now();
  let earliestDueAt: number | null = null;
  let allPastHold = true;
  for (const s of splits) {
    const holdDays = s.rule?.holdPeriodDays ?? 7;
    const closedAt = s.transaction?.closedAt?.getTime() ?? now;
    const dueAt = closedAt + holdDays * 86_400_000;
    if (dueAt > now) {
      allPastHold = false;
      if (earliestDueAt == null || dueAt < earliestDueAt) earliestDueAt = dueAt;
    }
  }

  if (!allPastHold) {
    return {
      heldReason: "HOLD_PERIOD",
      nextReleaseAt:
        earliestDueAt != null ? new Date(earliestDueAt).toISOString() : null,
    };
  }

  // Past hold for every split — the only thing left blocking release is the
  // compliance gate (BR-5). Either the agent has no AgentProfile, or their
  // status isn't COMPLIANT.
  return { heldReason: "COMPLIANCE", nextReleaseAt: null };
}

function serializeWallet<T extends Record<string, any>>(w: T): any {
  if (!w) return w;
  return {
    ...w,
    availableBalance: Number(w.availableBalance),
    pendingBalance: Number(w.pendingBalance),
    totalCredits: Number(w.totalCredits),
    totalDebits: Number(w.totalDebits),
  };
}

function serializeEntry<T extends Record<string, any>>(e: T): any {
  if (!e) return e;
  return {
    ...e,
    amount: Number(e.amount),
    balanceAfter: Number(e.balanceAfter),
  };
}

function serializeWithdrawal<T extends Record<string, any>>(w: T): any {
  if (!w) return w;
  return {
    ...w,
    amount: Number(w.amount),
    fee: Number(w.fee),
    netAmount: Number(w.netAmount),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const WalletHandlers = {
  // GET /api/real-estate/wallet — current user's wallet
  async getMine(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);

      // Auto-release on read. Any commission whose hold period has elapsed
      // and whose agent is COMPLIANT gets flipped to RELEASED here so that
      // `availableBalance` is always live — agents shouldn't have to wait for
      // an admin to click "Release due" before they see what they earned.
      // Scoped to this user's holds, so it's cheap.
      try {
        await prisma.$transaction(async (tx) => {
          await releaseDueCommissions(tx, auth.organizationId, auth.id, {
            userId: auth.id,
          });
        });
      } catch (e: any) {
        // Don't let a release failure block the wallet read.
        console.warn("[FinanceHandlers] getMine auto-release skipped:", e?.message);
      }

      const wallet = await prisma.wallet.findUnique({
        where: { userId: auth.id },
      });
      // Lazy-create so the page can show zeros for fresh agents.
      const result =
        wallet ??
        (await prisma.wallet.create({
          data: { organizationId: auth.organizationId, userId: auth.id },
        }));

      // After the release pass, anything still ON_HOLD is genuinely blocked.
      // Compute *why* so the UI can tell the user what to do about it.
      const holdInfo = await computeHoldDiagnostics(auth.id, auth.organizationId);

      return NextResponse.json({
        success: true,
        data: {
          ...serializeWallet(result),
          ...holdInfo,
        },
      });
    }, "getMine");
  },

  // GET /api/real-estate/wallet/pending-posting — projection for deals that
  // are CLOSED but whose commissions haven't been posted by admin yet.
  // Shows the caller what they'd earn once admin posts: their estimated
  // share, the cumulative area those deals add (slab engine), and a list of
  // deals so the UI can show a breakdown. Final numbers are authoritative
  // only after posting — this endpoint is a preview.
  async getMyPendingPosting(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);

      // Active engine — slab if comp plan is ACTIVE, legacy otherwise. The
      // preview calc branches the same way `closeTransaction` does.
      const settings = await prisma.rebmSettings.findUnique({
        where: { organizationId: auth.organizationId },
        select: { planEngine: true, activePlanId: true },
      });
      const useSlab =
        settings?.planEngine === "SLAB" && !!settings.activePlanId;

      // CLOSED-unposted deals where I'm involved either as listing/selling
      // agent OR (in slab mode) as a downline whose seller rolls up to me.
      // Cheapest correct filter: pull every CLOSED-unposted deal in the org
      // and let the preview engine tell us which splits land on me. The
      // queue is small in practice (admin posts monthly).
      const deals = await prisma.transaction.findMany({
        where: {
          organizationId: auth.organizationId,
          status: "CLOSED",
          commissionSplits: { none: {} },
        },
        select: {
          id: true,
          code: true,
          salePrice: true,
          currency: true,
          closedAt: true,
          listingAgentId: true,
          sellingAgentId: true,
          property: {
            select: {
              id: true,
              title: true,
              area: true,
              areaUnit: true,
            },
          },
        },
        orderBy: { closedAt: "asc" },
        take: 100,
      });

      type DealProjection = {
        id: string;
        code: string | null;
        propertyTitle: string;
        salePrice: number;
        currency: string;
        closedAt: string | null;
        estimatedShare: number;
        dealAreaSqyd: number;
        isMySale: boolean; // true when I'm the direct seller — affects cumulative area
      };

      const projections: DealProjection[] = [];
      let totalEstimatedShare = 0;
      let pendingAreaForMe = new Prisma.Decimal(0);

      for (const d of deals) {
        let myShare = 0;
        try {
          const calc = useSlab
            ? await calculateSlabCommission(prisma, d.id)
            : await calculateCommission(prisma, d.id);

          const splits = (calc as any).splits as Array<{
            beneficiaryUserId?: string | null;
            userId?: string | null;
            amount: Prisma.Decimal | number | string;
          }>;
          for (const s of splits) {
            const uid = s.beneficiaryUserId ?? s.userId ?? null;
            if (uid === auth.id) myShare += Number(s.amount);
          }
        } catch {
          // Calc failed (e.g., agent profile missing, no rule). Skip — we
          // don't want a single bad deal to wipe the whole projection.
          continue;
        }

        if (myShare <= 0) continue; // not a beneficiary on this deal

        // Slab engine treats sellingAgentId ?? listingAgentId as the direct
        // seller; legacy engine doesn't have a "seller" concept the same
        // way. Treat me as the seller when listing/selling matches.
        const sellerUserId = d.sellingAgentId ?? d.listingAgentId;
        const isMySale = sellerUserId === auth.id;

        let areaSqyd = new Prisma.Decimal(0);
        try {
          areaSqyd = toSquareYards(
            new Prisma.Decimal(d.property.area ?? 0),
            d.property.areaUnit,
          );
        } catch {
          // Unknown unit — skip area on this deal.
        }
        if (isMySale) pendingAreaForMe = pendingAreaForMe.plus(areaSqyd);

        totalEstimatedShare += myShare;
        projections.push({
          id: d.id,
          code: d.code,
          propertyTitle: d.property.title,
          salePrice: Number(d.salePrice),
          currency: d.currency,
          closedAt: d.closedAt?.toISOString() ?? null,
          estimatedShare: myShare,
          dealAreaSqyd: Number(areaSqyd),
          isMySale,
        });
      }

      // Cumulative area (slab only — meaningless under legacy %). Show
      // current personal cumulative + the pending pile so the agent can
      // see where their slab rate is headed once admin posts.
      let cumulativeAreaBefore = 0;
      let cumulativeAreaAfter = 0;
      if (useSlab) {
        try {
          const plan = await resolveActivePlan(prisma, auth.organizationId);
          const profile = await prisma.agentProfile.findUnique({
            where: { userId: auth.id },
            select: { id: true },
          });
          if (profile) {
            const cur = await getAgentCumulativeArea(
              prisma,
              auth.organizationId,
              profile.id,
              plan.id,
              { slabs: plan.slabs },
            );
            cumulativeAreaBefore = Number(cur);
            cumulativeAreaAfter = Number(cur.plus(pendingAreaForMe));
          }
        } catch {
          // No active plan or agent profile — leave cumulative numbers at 0.
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          count: projections.length,
          estimatedCommission: totalEstimatedShare,
          pendingAreaSqyd: Number(pendingAreaForMe),
          cumulativeAreaBefore,
          cumulativeAreaAfter,
          engine: useSlab ? "SLAB" : "LEGACY",
          deals: projections,
        },
      });
    }, "getMyPendingPosting");
  },

  // GET /api/real-estate/my-slab — current user's slab progress / rank
  async getMySlab(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const progress = await getSlabProgress(prisma, auth.organizationId, auth.id);
      return NextResponse.json({ success: true, data: progress });
    }, "getMySlab");
  },

  // GET /api/real-estate/wallet/ledger — current user's ledger entries
  async listMyLedger(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const category = url.searchParams.get("category") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      const wallet = await prisma.wallet.findUnique({ where: { userId: auth.id } });
      if (!wallet)
        return NextResponse.json({
          success: true,
          data: [],
          meta: { total: 0, limit, offset },
        });

      const where: Prisma.LedgerEntryWhereInput = {
        walletId: wallet.id,
        ...(status ? { status: status as any } : {}),
        ...(category ? { category: category as any } : {}),
      };

      const [items, total] = await Promise.all([
        prisma.ledgerEntry.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
        }),
        prisma.ledgerEntry.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items.map(serializeEntry),
        meta: { total, limit, offset },
      });
    }, "listMyLedger");
  },

  // GET /api/real-estate/admin/ledger — admin-wide ledger feed.
  // Powers Point History + Fund Transfer reports.
  async listAllLedger(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const admin = await isUserAdmin(auth.id, auth.organizationId);
      if (!admin)
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const category = url.searchParams.get("category") ?? undefined;
      const userId = url.searchParams.get("userId") ?? undefined;
      const from = url.searchParams.get("from") ?? undefined;
      const to = url.searchParams.get("to") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      const where: Prisma.LedgerEntryWhereInput = {
        organizationId: auth.organizationId,
        ...(status ? { status: status as any } : {}),
        ...(category ? { category: category as any } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
        ...(userId ? { wallet: { userId } } : {}),
      };

      const [items, total] = await Promise.all([
        prisma.ledgerEntry.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
          include: {
            wallet: {
              select: {
                userId: true,
                user: {
                  select: { id: true, email: true, first_name: true, last_name: true, avatar: true },
                },
              },
            },
          },
        }),
        prisma.ledgerEntry.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items.map((e) => ({
          ...serializeEntry(e as any),
          beneficiary: e.wallet?.user ?? null,
        })),
        meta: { total, limit, offset },
      });
    }, "listAllLedger");
  },

  // GET /api/real-estate/wallets — admin overview of all wallets
  async listAll(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const admin = await isUserAdmin(auth.id, auth.organizationId);
      if (!admin)
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );

      const items = await prisma.wallet.findMany({
        where: { organizationId: auth.organizationId },
        include: {
          user: {
            select: { id: true, email: true, first_name: true, last_name: true, avatar: true },
          },
        },
        orderBy: { availableBalance: "desc" },
      });
      return NextResponse.json({
        success: true,
        data: items.map(serializeWallet),
      });
    }, "listAll");
  },

  // POST /api/real-estate/wallet/adjust — admin manual adjustment.
  // BR-14 dual authorization is partially enforced: we require an admin
  // here, and `secondApproverId` must be a different admin. A more rigorous
  // implementation routes through the existing approval workflow engine.
  async adjust(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const admin = await isUserAdmin(auth.id, auth.organizationId);
      if (!admin)
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );

      const body = await request.json();
      const { userId, type, amount, reason, secondApproverId } = body;
      if (!userId || !type || !amount || !reason)
        return NextResponse.json(
          { error: "userId, type, amount, reason required" },
          { status: 400 },
        );
      if (!secondApproverId || secondApproverId === auth.id)
        return NextResponse.json(
          { error: "A different admin must co-sign manual adjustments (BR-14)" },
          { status: 400 },
        );
      const coAdmin = await isUserAdmin(secondApproverId, auth.organizationId);
      if (!coAdmin)
        return NextResponse.json(
          { error: "Second approver must be an admin" },
          { status: 400 },
        );

      const result = await prisma.$transaction(async (tx) => {
        const wallet = await WalletService.ensureWallet(tx, {
          organizationId: auth.organizationId,
          userId,
        });
        return WalletService.addEntry(tx, {
          organizationId: auth.organizationId,
          walletId: wallet.id,
          type: type as "CREDIT" | "DEBIT",
          category: "ADJUSTMENT",
          status: "RELEASED",
          amount,
          description: `Adjustment: ${reason} (co-signed by ${secondApproverId})`,
          createdById: auth.id,
        });
      });

      return NextResponse.json({
        success: true,
        data: {
          entry: serializeEntry(result.entry),
          wallet: serializeWallet(result.wallet),
        },
      });
    }, "adjust");
  },

  // POST /api/real-estate/commissions/release-due
  async releaseDue(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const admin = await isUserAdmin(auth.id, auth.organizationId);
      if (!admin)
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      const out = await prisma.$transaction(async (tx) => {
        return releaseDueCommissions(tx, auth.organizationId, auth.id);
      });
      return NextResponse.json({ success: true, ...out });
    }, "releaseDue");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// BANK ACCOUNT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

function serializeBank<T extends Record<string, any>>(b: T): any {
  if (!b) return b;
  // Never return the encrypted blob to the client.
  const { accountNumberEncrypted: _e, ...rest } = b;
  return rest;
}

export const BankAccountHandlers = {
  // GET /api/real-estate/bank-accounts — current user's accounts
  async listMine(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const items = await prisma.bankAccount.findMany({
        where: { userId: auth.id, organizationId: auth.organizationId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      });
      return NextResponse.json({
        success: true,
        data: items.map(serializeBank),
      });
    }, "listMine");
  },

  // POST /api/real-estate/bank-accounts
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      const { bankName, accountHolderName, accountNumber, ifscOrSwift } = body;
      if (!bankName || !accountHolderName || !accountNumber || !ifscOrSwift)
        return NextResponse.json(
          {
            error:
              "bankName, accountHolderName, accountNumber, ifscOrSwift are required",
          },
          { status: 400 },
        );

      const sanitized = String(accountNumber).replace(/\s+/g, "");
      const account = await prisma.$transaction(async (tx) => {
        // First account is automatically primary.
        const existingCount = await tx.bankAccount.count({
          where: { userId: auth.id },
        });
        const isPrimary = existingCount === 0 || !!body.isPrimary;
        if (isPrimary && existingCount > 0) {
          await tx.bankAccount.updateMany({
            where: { userId: auth.id, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        return tx.bankAccount.create({
          data: {
            organizationId: auth.organizationId,
            userId: auth.id,
            label: body.label || null,
            bankName,
            accountHolderName,
            accountNumberEncrypted: encryptAccountNumber(sanitized),
            accountNumberLast4: maskedLast4(sanitized),
            ifscOrSwift,
            branch: body.branch || null,
            country: body.country || "IN",
            isPrimary,
          },
        });
      });
      return NextResponse.json(
        { success: true, data: serializeBank(account) },
        { status: 201 },
      );
    }, "create");
  },

  // PUT /api/real-estate/bank-accounts/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.bankAccount.findFirst({
        where: { id, userId: auth.id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Prisma.BankAccountUpdateInput = {};
      if (body.label !== undefined) data.label = body.label || null;
      if (body.bankName !== undefined) data.bankName = body.bankName;
      if (body.accountHolderName !== undefined)
        data.accountHolderName = body.accountHolderName;
      if (body.ifscOrSwift !== undefined) data.ifscOrSwift = body.ifscOrSwift;
      if (body.branch !== undefined) data.branch = body.branch || null;

      // Re-encrypting the account number is opt-in via accountNumber field.
      if (body.accountNumber) {
        const sanitized = String(body.accountNumber).replace(/\s+/g, "");
        data.accountNumberEncrypted = encryptAccountNumber(sanitized);
        data.accountNumberLast4 = maskedLast4(sanitized);
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (body.isPrimary === true && !existing.isPrimary) {
          await tx.bankAccount.updateMany({
            where: { userId: auth.id, isPrimary: true },
            data: { isPrimary: false },
          });
          data.isPrimary = true;
        } else if (body.isPrimary === false) {
          data.isPrimary = false;
        }
        return tx.bankAccount.update({ where: { id }, data });
      });
      return NextResponse.json({ success: true, data: serializeBank(updated) });
    }, "update");
  },

  // DELETE /api/real-estate/bank-accounts/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.bankAccount.findFirst({
        where: { id, userId: auth.id, organizationId: auth.organizationId },
        include: { _count: { select: { withdrawals: true } } },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (existing._count.withdrawals > 0)
        return NextResponse.json(
          { error: "Cannot delete: this account is referenced by past withdrawals" },
          { status: 409 },
        );
      await prisma.bankAccount.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },

  // GET /api/real-estate/bank-accounts/[id]/reveal — returns the full account
  // number once. Should be rate-limited and audit-logged in production.
  async reveal(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.bankAccount.findFirst({
        where: { id, userId: auth.id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const decoded = decryptAccountNumber(existing.accountNumberEncrypted);
      return NextResponse.json({ success: true, accountNumber: decoded });
    }, "reveal");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAWAL HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

const MIN_WITHDRAWAL = 100; // INR; configurable later via org settings
const PAYOUT_FEE = 10;       // INR; ditto

export const WithdrawalHandlers = {
  // GET /api/real-estate/withdrawals — admin queue or own list
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const scope = url.searchParams.get("scope") ?? "mine";

      const isAdmin = await isUserAdmin(auth.id, auth.organizationId);
      if (scope === "all" && !isAdmin)
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );

      const where: Prisma.WithdrawalRequestWhereInput = {
        organizationId: auth.organizationId,
        ...(scope === "mine" ? { userId: auth.id } : {}),
        ...(status ? { status: status as any } : {}),
      };

      const items = await prisma.withdrawalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          bankAccount: {
            select: {
              bankName: true,
              accountHolderName: true,
              accountNumberLast4: true,
              ifscOrSwift: true,
            },
          },
          wallet: { select: { availableBalance: true, currency: true } },
        },
      });
      return NextResponse.json({
        success: true,
        data: items.map((w) => ({
          ...serializeWithdrawal(w),
          wallet: w.wallet
            ? {
                ...w.wallet,
                availableBalance: Number(w.wallet.availableBalance),
              }
            : null,
        })),
      });
    }, "list");
  },

  // POST /api/real-estate/withdrawals — agent requests a payout
  async request(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      const { amount, bankAccountId, notes } = body;
      if (!amount || !bankAccountId)
        return NextResponse.json(
          { error: "amount and bankAccountId are required" },
          { status: 400 },
        );

      const amt = new Prisma.Decimal(amount);
      if (amt.lessThan(MIN_WITHDRAWAL))
        return NextResponse.json(
          { error: `Minimum payout is ${MIN_WITHDRAWAL}.` },
          { status: 400 },
        );

      // Compliance & wallet gates (FR-7.3 / BR-5).
      const agent = await prisma.agentProfile.findUnique({
        where: { userId: auth.id },
        select: {
          status: true,
          complianceStatus: true,
          licenseExpiresAt: true,
        },
      });
      if (!agent)
        return NextResponse.json(
          { error: "Only registered agents can request payouts" },
          { status: 403 },
        );
      if (agent.complianceStatus !== "COMPLIANT")
        return NextResponse.json(
          { error: "Agent must be COMPLIANT to request a payout" },
          { status: 403 },
        );
      if (agent.licenseExpiresAt && agent.licenseExpiresAt.getTime() < Date.now())
        return NextResponse.json(
          { error: "License expired — payouts are blocked." },
          { status: 403 },
        );

      const bank = await prisma.bankAccount.findFirst({
        where: { id: bankAccountId, userId: auth.id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!bank)
        return NextResponse.json(
          { error: "Bank account not found" },
          { status: 404 },
        );

      const result = await prisma.$transaction(async (tx) => {
        const wallet = await WalletService.ensureWallet(tx, {
          organizationId: auth.organizationId,
          userId: auth.id,
        });
        if (wallet.isFrozen)
          throw new Error(
            `Wallet is frozen: ${wallet.freezeReason ?? "contact admin"}`,
          );

        const fee = new Prisma.Decimal(PAYOUT_FEE);
        const totalNeeded = amt;
        if (wallet.availableBalance.lessThan(totalNeeded))
          throw new Error(
            `Insufficient available balance (${wallet.availableBalance.toFixed(2)} < ${totalNeeded.toFixed(2)}).`,
          );

        const net = amt.minus(fee);
        if (net.lessThan(0))
          throw new Error(`Fee exceeds amount`);

        const wd = await tx.withdrawalRequest.create({
          data: {
            organizationId: auth.organizationId,
            userId: auth.id,
            walletId: wallet.id,
            bankAccountId,
            amount: amt,
            fee,
            netAmount: net,
            currency: wallet.currency,
            status: "REQUESTED",
            notes: notes || null,
          },
        });

        // Place a hold debit on the wallet so the funds can't be withdrawn
        // twice. The hold is RELEASED status so the available balance drops
        // immediately; on rejection we'll insert a refund credit.
        const { entry } = await WalletService.addEntry(tx, {
          organizationId: auth.organizationId,
          walletId: wallet.id,
          type: "DEBIT",
          category: "WITHDRAWAL",
          status: "RELEASED",
          amount: amt,
          description: `Payout request ${wd.id.slice(0, 8)}`,
          withdrawalId: wd.id,
          createdById: auth.id,
        });

        await tx.withdrawalRequest.update({
          where: { id: wd.id },
          data: { holdLedgerEntryId: entry.id },
        });
        return tx.withdrawalRequest.findUniqueOrThrow({ where: { id: wd.id } });
      });

      return NextResponse.json(
        { success: true, data: serializeWithdrawal(result) },
        { status: 201 },
      );
    }, "request");
  },

  // POST /api/real-estate/withdrawals/[id]/approve
  async approve(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isAdmin = await isUserAdmin(auth.id, auth.organizationId);
      if (!isAdmin)
        return NextResponse.json(
          { error: "Admin / compliance access required" },
          { status: 403 },
        );

      const wd = await prisma.withdrawalRequest.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!wd)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (wd.status !== "REQUESTED")
        return NextResponse.json(
          { error: `Cannot approve a ${wd.status} request` },
          { status: 409 },
        );

      const updated = await prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: auth.id,
          approvedAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, data: serializeWithdrawal(updated) });
    }, "approve");
  },

  // POST /api/real-estate/withdrawals/[id]/reject
  async reject(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isAdmin = await isUserAdmin(auth.id, auth.organizationId);
      if (!isAdmin)
        return NextResponse.json(
          { error: "Admin / compliance access required" },
          { status: 403 },
        );
      const body = await request.json().catch(() => ({}));
      const reason = (body.reason ?? "").trim();
      if (!reason)
        return NextResponse.json(
          { error: "Rejection reason is required" },
          { status: 400 },
        );

      const wd = await prisma.withdrawalRequest.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!wd)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (wd.status === "PAID" || wd.status === "PROCESSING")
        return NextResponse.json(
          { error: `Cannot reject a ${wd.status} request` },
          { status: 409 },
        );

      // Refund the held debit on rejection.
      const updated = await prisma.$transaction(async (tx) => {
        if (wd.holdLedgerEntryId) {
          const original = await tx.ledgerEntry.findUnique({
            where: { id: wd.holdLedgerEntryId },
          });
          if (original && original.status === "RELEASED") {
            await WalletService.addEntry(tx, {
              organizationId: auth.organizationId,
              walletId: wd.walletId,
              type: "CREDIT",
              category: "REFUND",
              status: "RELEASED",
              amount: original.amount,
              description: `Refund: payout rejected — ${reason}`,
              withdrawalId: wd.id,
              reversesEntryId: original.id,
              createdById: auth.id,
            });
            await WalletService.markEntryReversed(tx, original.id);
          }
        }
        return tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            rejectedById: auth.id,
            rejectedAt: new Date(),
            rejectionReason: reason,
          },
        });
      });

      return NextResponse.json({ success: true, data: serializeWithdrawal(updated) });
    }, "reject");
  },

  // POST /api/real-estate/withdrawals/[id]/mark-paid
  async markPaid(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isAdmin = await isUserAdmin(auth.id, auth.organizationId);
      if (!isAdmin)
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );

      const body = await request.json().catch(() => ({}));
      const wd = await prisma.withdrawalRequest.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!wd)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (wd.status !== "APPROVED" && wd.status !== "PROCESSING")
        return NextResponse.json(
          { error: `Cannot mark paid from status ${wd.status}` },
          { status: 409 },
        );

      const updated = await prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: "PAID",
          paidById: auth.id,
          paidAt: new Date(),
          paymentReference: body.reference || null,
        },
      });
      return NextResponse.json({ success: true, data: serializeWithdrawal(updated) });
    }, "markPaid");
  },

  // POST /api/real-estate/withdrawals/[id]/cancel — by the requester, only
  // while still in REQUESTED state.
  async cancel(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const wd = await prisma.withdrawalRequest.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!wd)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (wd.userId !== auth.id)
        return NextResponse.json(
          { error: "Only the requester can cancel" },
          { status: 403 },
        );
      if (wd.status !== "REQUESTED")
        return NextResponse.json(
          { error: `Cannot cancel a ${wd.status} request` },
          { status: 409 },
        );

      const updated = await prisma.$transaction(async (tx) => {
        if (wd.holdLedgerEntryId) {
          const original = await tx.ledgerEntry.findUnique({
            where: { id: wd.holdLedgerEntryId },
          });
          if (original && original.status === "RELEASED") {
            await WalletService.addEntry(tx, {
              organizationId: auth.organizationId,
              walletId: wd.walletId,
              type: "CREDIT",
              category: "REFUND",
              status: "RELEASED",
              amount: original.amount,
              description: `Refund: payout cancelled by requester`,
              withdrawalId: wd.id,
              reversesEntryId: original.id,
              createdById: auth.id,
            });
            await WalletService.markEntryReversed(tx, original.id);
          }
        }
        return tx.withdrawalRequest.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
      });

      return NextResponse.json({ success: true, data: serializeWithdrawal(updated) });
    }, "cancel");
  },
};
