/**
 * Wallet / ledger service. Append-only writes (FR-6.2 / NFR-7) plus a
 * recompute of the wallet's denormalised balance fields inside the same
 * transaction so concurrent writes can't desync them.
 *
 * IMPORTANT: this module is the only place that should INSERT into
 * `re_ledger_entries` or UPDATE `re_wallets` balances. The commission engine,
 * payout handlers, and admin adjustments all go through here.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

const ZERO = new Prisma.Decimal(0);

// Sign of a ledger entry against the wallet's balance.
function sign(type: "CREDIT" | "DEBIT"): 1 | -1 {
  return type === "CREDIT" ? 1 : -1;
}

export interface CreateLedgerEntryInput {
  organizationId: string;
  walletId: string;
  type: "CREDIT" | "DEBIT";
  category:
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
  status?: "ON_HOLD" | "RELEASED" | "REVERSED";
  amount: Prisma.Decimal | number | string;
  description?: string | null;
  transactionId?: string | null;
  splitId?: string | null;
  withdrawalId?: string | null;
  reversesEntryId?: string | null;
  createdById: string;
}

export const WalletService = {
  /**
   * Get-or-create a Wallet for the given user. Wallets are lazy: we create
   * one on the first ledger write so users without commissions never own a
   * row. Safe to call inside an outer transaction.
   */
  async ensureWallet(
    tx: Tx,
    args: { organizationId: string; userId: string; currency?: string },
  ) {
    const existing = await tx.wallet.findUnique({ where: { userId: args.userId } });
    if (existing) return existing;

    return tx.wallet.create({
      data: {
        organizationId: args.organizationId,
        userId: args.userId,
        currency: args.currency ?? "INR",
      },
    });
  },

  /**
   * Append a ledger entry and recompute the wallet's balance fields.
   * Always positive `amount`; `type` decides whether it adds or subtracts.
   *
   * Status semantics:
   *   - ON_HOLD: pendingBalance updated; availableBalance untouched
   *   - RELEASED: availableBalance updated; pendingBalance untouched
   *   - REVERSED: a status used by reversals' OFFSETTING entries (which are
   *     themselves typically RELEASED). Application code generally does not
   *     create entries with status=REVERSED — it inserts a new RELEASED
   *     offsetting entry and then flips the *original* entry's status to
   *     REVERSED via `markEntryReversed` to keep history clean.
   */
  async addEntry(tx: Tx, input: CreateLedgerEntryInput) {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: input.walletId } });

    const dec = new Prisma.Decimal(input.amount);
    if (dec.lessThanOrEqualTo(ZERO))
      throw new Error("Ledger amount must be > 0; use type=DEBIT for outflows");

    const status = input.status ?? "RELEASED";
    const s = sign(input.type);
    const delta = dec.times(s);

    let availableDelta = ZERO;
    let pendingDelta = ZERO;
    if (status === "ON_HOLD") pendingDelta = delta;
    else if (status === "RELEASED") availableDelta = delta;
    // REVERSED entries don't directly move balances (the offsetting entry does).

    const newAvailable = wallet.availableBalance.plus(availableDelta);
    const newPending = wallet.pendingBalance.plus(pendingDelta);

    // FR-6 / BR-3 — available balance can go negative only with an admin
    // ADJUSTMENT override. We don't enforce that here so reversals can take
    // a wallet negative; callers (e.g. payout) must guard before calling.

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: newAvailable,
        pendingBalance: newPending,
        totalCredits:
          input.type === "CREDIT" && status !== "REVERSED"
            ? wallet.totalCredits.plus(dec)
            : wallet.totalCredits,
        totalDebits:
          input.type === "DEBIT" && status !== "REVERSED"
            ? wallet.totalDebits.plus(dec)
            : wallet.totalDebits,
      },
    });

    const entry = await tx.ledgerEntry.create({
      data: {
        organizationId: input.organizationId,
        walletId: wallet.id,
        type: input.type,
        category: input.category,
        status,
        amount: dec,
        balanceAfter: status === "RELEASED" ? newAvailable : wallet.availableBalance,
        currency: wallet.currency,
        description: input.description ?? null,
        transactionId: input.transactionId ?? null,
        splitId: input.splitId ?? null,
        withdrawalId: input.withdrawalId ?? null,
        reversesEntryId: input.reversesEntryId ?? null,
        releasedAt: status === "RELEASED" ? new Date() : null,
        createdById: input.createdById,
      },
    });

    return { entry, wallet: updatedWallet };
  },

  /**
   * Move an existing ON_HOLD entry to RELEASED. Used by the hold-period
   * release job and by the manual release endpoint. Idempotent: returns the
   * entry unchanged if it's already RELEASED.
   */
  async releaseEntry(tx: Tx, entryId: string) {
    const entry = await tx.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
    if (entry.status === "RELEASED") return entry;
    if (entry.status === "REVERSED")
      throw new Error("Cannot release a reversed entry");

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: entry.walletId } });
    const dec = entry.amount;
    const s = sign(entry.type);
    const delta = dec.times(s);

    const newAvailable = wallet.availableBalance.plus(delta);
    const newPending = wallet.pendingBalance.minus(delta);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { availableBalance: newAvailable, pendingBalance: newPending },
    });

    return tx.ledgerEntry.update({
      where: { id: entryId },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        balanceAfter: newAvailable,
      },
    });
  },

  /**
   * Flip an existing entry's status to REVERSED. The caller has already
   * inserted an offsetting RELEASED entry via `addEntry`. This is purely a
   * book-keeping mark — it doesn't touch wallet balances (the offset did).
   */
  async markEntryReversed(tx: Tx, entryId: string) {
    return tx.ledgerEntry.update({
      where: { id: entryId },
      data: { status: "REVERSED" },
    });
  },

  /**
   * Recompute a wallet's balances by walking its ledger from scratch. Use
   * this only as a recovery tool — every normal write keeps the balance in
   * sync atomically.
   */
  async reconcile(tx: Tx, walletId: string) {
    const entries = await tx.ledgerEntry.findMany({
      where: { walletId },
      select: { type: true, status: true, amount: true },
    });

    let available = ZERO;
    let pending = ZERO;
    let totalCredits = ZERO;
    let totalDebits = ZERO;

    for (const e of entries) {
      const s = sign(e.type);
      const delta = (e.amount as Prisma.Decimal).times(s);
      if (e.status === "ON_HOLD") pending = pending.plus(delta);
      else if (e.status === "RELEASED") available = available.plus(delta);
      // REVERSED: ignored
      if (e.status !== "REVERSED") {
        if (e.type === "CREDIT") totalCredits = totalCredits.plus(e.amount as Prisma.Decimal);
        else totalDebits = totalDebits.plus(e.amount as Prisma.Decimal);
      }
    }

    return tx.wallet.update({
      where: { id: walletId },
      data: {
        availableBalance: available,
        pendingBalance: pending,
        totalCredits,
        totalDebits,
      },
    });
  },
};

export type WalletServiceType = typeof WalletService;
