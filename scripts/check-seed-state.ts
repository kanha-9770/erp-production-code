/**
 * Inspect the current seed state — splits, beneficiary wallets, eligible
 * transactions for month-end close. Read-only.
 *
 *   npx tsx scripts/check-seed-state.ts
 */

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const ORG = process.env.SEED_ORG_ID ?? "cmotuh90k00jcnx0j9j5og0ez";

async function main() {
  console.log("── Closed seed transactions ─────────────────────────────");
  const splits = await p.commissionSplit.findMany({
    where: { organizationId: ORG, transactionId: { startsWith: "seed_txn_" } },
    include: { transaction: { select: { code: true } } },
  });
  for (const s of splits) {
    if (!s.beneficiaryUserId) continue;
    const u = await p.user.findUnique({
      where: { id: s.beneficiaryUserId },
      select: { email: true, first_name: true, last_name: true },
    });
    console.log(
      `  ${s.transaction.code}  →  ${u?.first_name} ${u?.last_name}  <${u?.email}>  ${s.role}  ₹${s.amount}  [${s.status}]`,
    );
  }

  console.log("\n── Wallets with money on hold ───────────────────────────");
  const wallets = await p.wallet.findMany({
    where: { organizationId: ORG, pendingBalance: { gt: 0 } },
    include: { user: { select: { email: true } } },
    orderBy: { pendingBalance: "desc" },
  });
  for (const w of wallets) {
    console.log(
      `  ${w.user.email}  ·  available=₹${w.availableBalance}  ·  pending=₹${w.pendingBalance}`,
    );
  }

  console.log("\n── Transactions eligible for month-end close ────────────");
  const eligible = await p.transaction.findMany({
    where: {
      organizationId: ORG,
      status: "PENDING",
      documents: { some: { type: { in: ["CONTRACT", "SALE_DEED"] } } },
    },
    select: { code: true, salePrice: true },
  });
  for (const t of eligible) {
    console.log(`  ${t.code}  ·  ₹${t.salePrice}`);
  }
  console.log(`  (${eligible.length} eligible total)`);
}

main().finally(() => p.$disconnect());
