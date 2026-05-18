/**
 * Real Estate Transactions — Seed Script
 * ======================================
 *
 * Creates a realistic mix of buyers and transactions on top of the
 * properties + team seeded by `seed:re-team` and `seed:re-properties`,
 * so the dashboards, wallets, payouts, and month-end close UIs all have
 * something to look at.
 *
 * Inventory (idempotent — re-runs clear the prior seed-txn rows first):
 *   • 6 buyers under `@seed.local`-style emails so they can be cleaned
 *     up by re-running.
 *   • 10 transactions across the seed properties:
 *       - 2 PENDING, no docs           (agent still needs to upload proof)
 *       - 2 PENDING, docs uploaded     (eligible for agent self-close)
 *       - 3 CLOSED, commissions pending posting   (admin queue)
 *       - 3 POSTED                     (wallets already credited ON_HOLD)
 *
 * Closing and posting run through whichever engine is active for the org
 * (slab if comp plan is ACTIVE, legacy % otherwise), so audit log, splits,
 * and wallet projections all stay in sync.
 *
 * Run:
 *   npm run seed:re-transactions
 *
 * Override targets:
 *   $env:SEED_ORG_ID="..."; $env:SEED_ROOT_USER_ID="..."; npm run seed:re-transactions
 */

import { PrismaClient, Prisma } from "@prisma/client";
import {
  markTransactionClosed,
  postCommissions,
} from "../lib/real-estate/commission-engine";

const prisma = new PrismaClient();

const ROOT_ORG_ID =
  process.env.SEED_ORG_ID ?? "cmotuh90k00jcnx0j9j5og0ez";
const ROOT_USER_ID =
  process.env.SEED_ROOT_USER_ID ?? "cmotufdoz00j7nx0jlx3ocypc";

// Stable id prefixes so re-runs are clean.
const BUYER_ID_PREFIX = "seed_buyer_";
const TXN_ID_PREFIX = "seed_txn_";

interface SeedBuyer {
  key: string;
  name: string;
  email: string;
  phone: string;
  city: string;
}

const BUYERS: SeedBuyer[] = [
  { key: "rahul",  name: "Rahul Verma",      email: "rahul.verma@seed.local",      phone: "+91 90000 10001", city: "Mumbai"    },
  { key: "neha",   name: "Neha Sharma",      email: "neha.sharma@seed.local",      phone: "+91 90000 10002", city: "Pune"      },
  { key: "amit",   name: "Amit Bansal",      email: "amit.bansal@seed.local",      phone: "+91 90000 10003", city: "Bengaluru" },
  { key: "priya",  name: "Priya Iyer",       email: "priya.iyer@seed.local",       phone: "+91 90000 10004", city: "Chennai"   },
  { key: "sandeep",name: "Sandeep Khurana",  email: "sandeep.k@seed.local",        phone: "+91 90000 10005", city: "Delhi"     },
  { key: "isha",   name: "Isha Pillai",      email: "isha.pillai@seed.local",      phone: "+91 90000 10006", city: "Hyderabad" },
];

type TxnPlan =
  | { kind: "PENDING_NO_DOCS"; key: string; propertyKey: string; buyerKey: string; salePricePctOfList?: number }
  | { kind: "PENDING_WITH_DOCS"; key: string; propertyKey: string; buyerKey: string; docType: "CONTRACT" | "SALE_DEED"; salePricePctOfList?: number }
  | { kind: "CLOSED_UNPOSTED"; key: string; propertyKey: string; buyerKey: string; salePricePctOfList?: number }
  | { kind: "POSTED"; key: string; propertyKey: string; buyerKey: string; salePricePctOfList?: number };

// 10 deals — `propertyKey` refers to the seedKey on the property (so we
// don't rely on cuid ids). Property keys come from the property-seed file.
const TXN_PLAN: TxnPlan[] = [
  // — PENDING, no docs yet —
  { kind: "PENDING_NO_DOCS",   key: "pending_no_docs_1",  propertyKey: "land_pune_hinjewadi",   buyerKey: "rahul"  },
  { kind: "PENDING_NO_DOCS",   key: "pending_no_docs_2",  propertyKey: "res_andheri_3bhk",      buyerKey: "neha"   },

  // — PENDING, proof uploaded — agent can self-close —
  { kind: "PENDING_WITH_DOCS", key: "pending_proof_1",    propertyKey: "land_thane_ghodbunder", buyerKey: "amit",    docType: "CONTRACT"  },
  { kind: "PENDING_WITH_DOCS", key: "pending_proof_2",    propertyKey: "res_goa_villa",         buyerKey: "priya",   docType: "SALE_DEED" },

  // — CLOSED but commissions not posted yet — admin queue —
  { kind: "CLOSED_UNPOSTED",   key: "closed_pending_1",   propertyKey: "com_bkc_office",        buyerKey: "sandeep" },
  { kind: "CLOSED_UNPOSTED",   key: "closed_pending_2",   propertyKey: "res_bandra_2bhk",       buyerKey: "rahul"   },
  { kind: "CLOSED_UNPOSTED",   key: "closed_pending_3",   propertyKey: "land_hyd_shadnagar",    buyerKey: "isha"    },

  // — POSTED — wallets already credited —
  { kind: "POSTED",            key: "posted_1",           propertyKey: "land_blr_devanahalli",  buyerKey: "neha"    },
  { kind: "POSTED",            key: "posted_2",           propertyKey: "res_blr_whitefield_3bhk", buyerKey: "priya" },
  { kind: "POSTED",            key: "posted_3",           propertyKey: "land_jaipur_ajmer_rd",  buyerKey: "amit"    },
];

async function wipePriorTxnSeed() {
  console.log("[seed-txn] Wiping prior seed transactions + buyers");

  // Transaction cascades to documents + splits via schema. Wallet cascades
  // to ledger entries. We delete by id-prefix so we don't touch any
  // real-world data the user has entered.
  await prisma.transaction.deleteMany({
    where: { organizationId: ROOT_ORG_ID, id: { startsWith: TXN_ID_PREFIX } },
  });
  await prisma.buyer.deleteMany({
    where: { organizationId: ROOT_ORG_ID, id: { startsWith: BUYER_ID_PREFIX } },
  });
  console.log("[seed-txn]  · prior seed txns + buyers removed");
}

async function upsertBuyers(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const b of BUYERS) {
    const id = `${BUYER_ID_PREFIX}${b.key}`;
    await prisma.buyer.upsert({
      where: { id },
      update: {
        name: b.name, email: b.email, phone: b.phone, city: b.city,
        country: "IN",
      },
      create: {
        id,
        organizationId: ROOT_ORG_ID,
        name: b.name, email: b.email, phone: b.phone, city: b.city,
        country: "IN",
        createdById: ROOT_USER_ID,
      },
    });
    out.set(b.key, id);
  }
  console.log(`[seed-txn]  · upserted ${out.size} buyers`);
  return out;
}

async function pickProperty(seedKey: string) {
  const id = `seed_prop_${seedKey}`;
  const prop = await prisma.property.findUnique({
    where: { id },
    select: {
      id: true, status: true, listingPrice: true, currency: true,
      organizationId: true, listingAgentId: true, area: true, areaUnit: true,
    },
  });
  if (!prop)
    throw new Error(
      `Property seed_prop_${seedKey} not found — run seed:re-properties first.`,
    );
  return prop;
}

async function buildTransactions(buyerIdByKey: Map<string, string>) {
  let pendingNoDocs = 0;
  let pendingWithDocs = 0;
  let closedUnposted = 0;
  let posted = 0;
  const errors: Array<{ key: string; phase: string; error: string }> = [];

  for (const plan of TXN_PLAN) {
    const property = await pickProperty(plan.propertyKey);
    const buyerId = buyerIdByKey.get(plan.buyerKey)!;
    const txnId = `${TXN_ID_PREFIX}${plan.key}`;

    const listingPrice = new Prisma.Decimal(property.listingPrice);
    const pct = plan.salePricePctOfList ?? 97; // 3% under list is typical
    const salePrice = listingPrice.times(pct).dividedBy(100);

    const sellingAgentId = await pickSellingAgent(property.listingAgentId);

    // Every txn starts PENDING. We flip the property to UNDER_CONTRACT
    // mirroring what the create-txn handler does in production.
    await prisma.property.update({
      where: { id: property.id },
      data: { status: "UNDER_CONTRACT" },
    });

    await prisma.transaction.create({
      data: {
        id: txnId,
        organizationId: ROOT_ORG_ID,
        code: humanCode(plan.key),
        propertyId: property.id,
        buyerId,
        listingAgentId: property.listingAgentId,
        sellingAgentId,
        salePrice,
        currency: property.currency,
        status: "PENDING",
        createdById: ROOT_USER_ID,
      },
    });

    if (plan.kind === "PENDING_NO_DOCS") {
      pendingNoDocs++;
      console.log(`[seed-txn]  + PENDING (no docs)        ${humanCode(plan.key)} · ${formatINR(salePrice)}`);
      continue;
    }

    // Everyone past this point needs proof.
    const proofDocType =
      plan.kind === "PENDING_WITH_DOCS" ? plan.docType : "CONTRACT";
    await prisma.transactionDocument.create({
      data: {
        transactionId: txnId,
        type: proofDocType,
        name: `${proofDocType.toLowerCase().replace("_", " ")}.pdf`,
        url: `https://example.com/seed/${plan.key}-${proofDocType.toLowerCase()}.pdf`,
        uploadedById: ROOT_USER_ID,
      },
    });

    if (plan.kind === "PENDING_WITH_DOCS") {
      pendingWithDocs++;
      console.log(`[seed-txn]  + PENDING + ${plan.docType.padEnd(10)} ${humanCode(plan.key)} · ${formatINR(salePrice)}`);
      continue;
    }

    // Agent close — flips status to CLOSED, property to SOLD. No splits.
    try {
      await prisma.$transaction(
        async (tx) => markTransactionClosed(tx, txnId, ROOT_USER_ID),
        { maxWait: 5_000, timeout: 15_000 },
      );
    } catch (e: any) {
      errors.push({ key: plan.key, phase: "close", error: e?.message ?? String(e) });
      console.warn(`[seed-txn]  ! Close failed for ${humanCode(plan.key)}: ${e?.message ?? e}`);
      continue;
    }

    if (plan.kind === "CLOSED_UNPOSTED") {
      closedUnposted++;
      console.log(`[seed-txn]  + CLOSED (unposted)       ${humanCode(plan.key)} · ${formatINR(salePrice)}`);
      continue;
    }

    // plan.kind === "POSTED" — admin step. Run the engine on the CLOSED
    // transaction so beneficiary wallets get credited.
    try {
      const result = await prisma.$transaction(
        async (tx) => postCommissions(tx, txnId, ROOT_USER_ID),
        { maxWait: 10_000, timeout: 60_000 },
      );
      posted++;
      console.log(
        `[seed-txn]  + POSTED                  ${humanCode(plan.key)} · base ${formatINR(result.baseCommission)} across ${result.splits.length} splits`,
      );
    } catch (e: any) {
      errors.push({ key: plan.key, phase: "post", error: e?.message ?? String(e) });
      console.warn(`[seed-txn]  ! Post failed for ${humanCode(plan.key)}: ${e?.message ?? e}`);
    }
  }

  return { pendingNoDocs, pendingWithDocs, closedUnposted, posted, errors };
}

// Pick a different agent than the listing agent so some deals get both a
// LISTING and SELLING role (two-sided commissions). Falls back to the same
// agent for solo deals.
async function pickSellingAgent(listingAgentUserId: string): Promise<string | null> {
  const candidates = await prisma.agentProfile.findMany({
    where: {
      organizationId: ROOT_ORG_ID,
      status: "ACTIVE",
      userId: { not: listingAgentUserId },
    },
    select: { userId: true },
    take: 25,
  });
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return pick.userId;
}

function humanCode(key: string): string {
  const yr = new Date().getFullYear();
  return `TXN-${yr}-${key.toUpperCase().replace(/_/g, "-")}`;
}

function formatINR(d: Prisma.Decimal | number): string {
  const n = typeof d === "number" ? d : Number(d);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

async function main() {
  console.log("─".repeat(72));
  console.log("Real Estate Transactions — Seed");
  console.log("─".repeat(72));
  console.log(`  Org id        : ${ROOT_ORG_ID}`);
  console.log(`  Root user id  : ${ROOT_USER_ID}`);
  console.log("─".repeat(72));

  const org = await prisma.organization.findUnique({
    where: { id: ROOT_ORG_ID },
    select: { id: true, name: true },
  });
  if (!org) throw new Error(`Organization ${ROOT_ORG_ID} not found.`);
  console.log(`[seed-txn] Target: "${org.name}"`);

  await wipePriorTxnSeed();
  const buyerIdByKey = await upsertBuyers();
  const summary = await buildTransactions(buyerIdByKey);

  console.log("─".repeat(72));
  console.log("[seed-txn] Done.");
  console.log(`  PENDING (no docs)          : ${summary.pendingNoDocs}`);
  console.log(`  PENDING (proof uploaded)   : ${summary.pendingWithDocs}`);
  console.log(`  CLOSED (awaiting posting)  : ${summary.closedUnposted}`);
  console.log(`  POSTED (wallets credited)  : ${summary.posted}`);
  if (summary.errors.length > 0) {
    console.log(`  Engine errors              : ${summary.errors.length}`);
    for (const e of summary.errors) {
      console.log(`    - [${e.phase}] ${e.key}: ${e.error}`);
    }
  }
  console.log("─".repeat(72));
}

main()
  .catch((e) => {
    console.error("[seed-txn] Failed:", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
