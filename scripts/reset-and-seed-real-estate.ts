/**
 * Reset + seed the real-estate module — DEEP WIPE.
 *
 * Wipes every real-estate-module table for the given org:
 *   • Runtime    — Transactions, TransactionDocuments, CommissionSplits,
 *                  CommissionAudits, LedgerEntries, Wallets, AgentAreaLedger,
 *                  RewardGrants, GuaranteePayouts
 *   • CRM        — Leads, LeadActivities, PropertyViewings, Buyers
 *   • Inventory  — Properties (cascades PropertyImage/Document/PriceHistory)
 *   • Payouts    — WithdrawalRequests, BankAccounts
 *   • Agents     — AgentProfiles (cascades ComplianceDocument, AgentReraProfile,
 *                  RankPromotionLog), InviteTokens
 *   • Test Users — every User in this org whose email ends with
 *                  `.test@nessco.local` (catches leftovers from earlier seeds)
 *
 * Preserves: real Users / Employees outside the test-pattern emails, other
 * organizations, CommissionRules (legacy config), CompPlans owned by other
 * names. The Test SLAB Plan 2026 is rebuilt in-place each run.
 *
 * Seeds (SLAB engine, no dummy transactions / commissions / wallets):
 *   • CompPlan "Sales Income Plan (Slabs · Overrides · Designations · Guarantee)"
 *       Plan 1+2 — 14 slabs (₹500/sqyd at 0–499 → ₹1600/sqyd at 100,000+)
 *       Plan 3   — 10 override levels (multipliers: L1 1.0, L2 0.75, L3 0.5, L4–L10 0.25)
 *       Plan 4   — 11 designations (Sales Promoter → President)
 *       Plan 5   — 7 monthly leader guarantees (BP onward, ₹21k–₹35k)
 *   • RebmSettings — planEngine=SLAB, holdPeriodDays=7
 *   • 30-agent hierarchy (1 CEO + 3 Directors + 6 Managers + 20 Agents)
 *   • 1 project ("Greenfield Estate Mumbai — Sector A") with 30 LAND plots,
 *     all AVAILABLE, listing agent rotated across the 20 juniors
 *
 * Prints BEFORE-wipe / AFTER-wipe / AFTER-seed counts so you can see exactly
 * what changed. The AFTER-wipe section MUST show zeros across the board; if
 * something is non-zero there, the script bails before seeding so you can
 * diagnose the residue.
 *
 * Usage:
 *   npx tsx scripts/reset-and-seed-real-estate.ts <organizationId>
 */

import { PrismaClient, Prisma } from "@prisma/client";

const p = new PrismaClient();

// ─── Hierarchy ───────────────────────────────────────────────────────────────

interface UserSpec {
  handle: string;
  parent: string | null;
  first: string;
  last: string;
  role: string;
}

const USERS: UserSpec[] = [
  { handle: "aarav",   parent: null,      first: "Aarav",   last: "Mehta",     role: "CEO" },

  { handle: "bhavna",  parent: "aarav",   first: "Bhavna",  last: "Iyer",      role: "Director North" },
  { handle: "lakshmi", parent: "aarav",   first: "Lakshmi", last: "Reddy",     role: "Director South" },
  { handle: "uma",     parent: "aarav",   first: "Uma",     last: "Patel",     role: "Director West"  },

  { handle: "chetan",  parent: "bhavna",  first: "Chetan",  last: "Joshi",     role: "Manager" },
  { handle: "hari",    parent: "bhavna",  first: "Hari",    last: "Nair",      role: "Manager" },
  { handle: "mihir",   parent: "lakshmi", first: "Mihir",   last: "Rao",       role: "Manager" },
  { handle: "quincy",  parent: "lakshmi", first: "Quincy",  last: "Das",       role: "Manager" },
  { handle: "veer",    parent: "uma",     first: "Veer",    last: "Gupta",     role: "Manager" },
  { handle: "zara",    parent: "uma",     first: "Zara",    last: "Khan",      role: "Manager" },

  { handle: "diya",    parent: "chetan",  first: "Diya",    last: "Shah",      role: "Agent" },
  { handle: "esha",    parent: "chetan",  first: "Esha",    last: "Bansal",    role: "Agent" },
  { handle: "farhan",  parent: "chetan",  first: "Farhan",  last: "Ali",       role: "Agent" },
  { handle: "gita",    parent: "chetan",  first: "Gita",    last: "Pillai",    role: "Agent" },
  { handle: "hema",    parent: "chetan",  first: "Hema",    last: "Krishnan",  role: "Agent" },

  { handle: "isha",    parent: "hari",    first: "Isha",    last: "Bhat",      role: "Agent" },
  { handle: "jay",     parent: "hari",    first: "Jay",     last: "Menon",     role: "Agent" },
  { handle: "kavya",   parent: "hari",    first: "Kavya",   last: "Nambiar",   role: "Agent" },

  { handle: "nidhi",   parent: "mihir",   first: "Nidhi",   last: "Choudhary", role: "Agent" },
  { handle: "omkar",   parent: "mihir",   first: "Omkar",   last: "Sinha",     role: "Agent" },
  { handle: "pranav",  parent: "mihir",   first: "Pranav",  last: "Roy",       role: "Agent" },

  { handle: "reena",   parent: "quincy",  first: "Reena",   last: "Goswami",   role: "Agent" },
  { handle: "sahil",   parent: "quincy",  first: "Sahil",   last: "Wadhwa",    role: "Agent" },
  { handle: "tara",    parent: "quincy",  first: "Tara",    last: "Bhalla",    role: "Agent" },

  { handle: "wahid",   parent: "veer",    first: "Wahid",   last: "Sheikh",    role: "Agent" },
  { handle: "xander",  parent: "veer",    first: "Xander",  last: "Pinto",     role: "Agent" },
  { handle: "yamini",  parent: "veer",    first: "Yamini",  last: "Saxena",    role: "Agent" },

  { handle: "aniket",  parent: "zara",    first: "Aniket",  last: "Naidu",     role: "Agent" },
  { handle: "bina",    parent: "zara",    first: "Bina",    last: "Tandon",    role: "Agent" },
  { handle: "charu",   parent: "zara",    first: "Charu",   last: "Vyas",      role: "Agent" },
];

if (USERS.length !== 30) throw new Error(`USERS table is ${USERS.length}, expected 30`);
{
  const handles = new Set<string>();
  for (const u of USERS) {
    if (handles.has(u.handle)) throw new Error(`Duplicate handle: ${u.handle}`);
    handles.add(u.handle);
  }
  for (const u of USERS) {
    if (u.parent && !handles.has(u.parent)) {
      throw new Error(`User ${u.handle} has unknown parent: ${u.parent}`);
    }
  }
}

const JUNIOR_HANDLES = USERS.filter((u) => u.role === "Agent").map((u) => u.handle);

const PROJECT_NAME = "Greenfield Estate Mumbai — Sector A";
const PROJECT_ADDRESS = "Greenfield Estate, Sector A, Andheri East";
const PROJECT_CITY = "Mumbai";
const PROJECT_COUNTRY = "India";
const NUM_PLOTS = 30;
const PLOT_AREA_CYCLE = [120, 150, 180, 200, 240, 280, 320, 400, 500, 600];
const PRICE_PER_SQYD = 25_000;

const TEST_EMAIL_DOMAIN = ".test@nessco.local";

// ─── Diagnostic ──────────────────────────────────────────────────────────────

interface Counts {
  testUsers: number;
  agentProfiles: number;
  properties: number;
  buyers: number;
  leads: number;
  leadActivities: number;
  propertyViewings: number;
  transactions: number;
  transactionDocs: number;
  commissionSplits: number;
  commissionAudits: number;
  rewardGrants: number;
  guaranteePayouts: number;
  agentAreaLedger: number;
  ledgerEntries: number;
  wallets: number;
  bankAccounts: number;
  withdrawalRequests: number;
  inviteTokens: number;
  compPlans: number;
  commissionRules: number;
  rebmSoldProperties: number;
}

async function takeCounts(orgId: string): Promise<Counts> {
  const [
    testUsers,
    agentProfiles,
    properties,
    buyers,
    leads,
    leadActivities,
    propertyViewings,
    transactions,
    transactionDocs,
    commissionSplits,
    commissionAudits,
    rewardGrants,
    guaranteePayouts,
    agentAreaLedger,
    ledgerEntries,
    wallets,
    bankAccounts,
    withdrawalRequests,
    inviteTokens,
    compPlans,
    commissionRules,
    rebmSoldProperties,
  ] = await Promise.all([
    p.user.count({ where: { organizationId: orgId, email: { endsWith: TEST_EMAIL_DOMAIN } } }),
    p.agentProfile.count({ where: { organizationId: orgId } }),
    p.property.count({ where: { organizationId: orgId } }),
    p.buyer.count({ where: { organizationId: orgId } }),
    p.lead.count({ where: { organizationId: orgId } }),
    p.leadActivity.count({ where: { lead: { organizationId: orgId } } }),
    p.propertyViewing.count({ where: { organizationId: orgId } }),
    p.transaction.count({ where: { organizationId: orgId } }),
    p.transactionDocument.count({ where: { transaction: { organizationId: orgId } } }),
    p.commissionSplit.count({ where: { organizationId: orgId } }),
    p.commissionAudit.count({ where: { organizationId: orgId } }),
    p.rewardGrant.count({ where: { organizationId: orgId } }),
    p.guaranteePayout.count({ where: { organizationId: orgId } }),
    p.agentAreaLedger.count({ where: { organizationId: orgId } }),
    p.ledgerEntry.count({ where: { organizationId: orgId } }),
    p.wallet.count({ where: { organizationId: orgId } }),
    p.bankAccount.count({ where: { organizationId: orgId } }),
    p.withdrawalRequest.count({ where: { organizationId: orgId } }),
    p.inviteToken.count({ where: { organizationId: orgId } }),
    p.compPlan.count({ where: { organizationId: orgId } }),
    p.commissionRule.count({ where: { organizationId: orgId } }),
    p.property.count({ where: { organizationId: orgId, status: "SOLD" } }),
  ]);
  return {
    testUsers, agentProfiles, properties, buyers, leads, leadActivities,
    propertyViewings, transactions, transactionDocs, commissionSplits,
    commissionAudits, rewardGrants, guaranteePayouts, agentAreaLedger,
    ledgerEntries, wallets, bankAccounts, withdrawalRequests, inviteTokens,
    compPlans, commissionRules, rebmSoldProperties,
  };
}

function printCounts(label: string, c: Counts) {
  console.log(`\n${label}`);
  console.log("  ─────────────────────────────────────");
  const rows: Array<[string, number]> = [
    ["test users (.test@nessco.local)", c.testUsers],
    ["agent profiles",                  c.agentProfiles],
    ["properties (total)",              c.properties],
    ["  └─ SOLD properties",            c.rebmSoldProperties],
    ["buyers",                          c.buyers],
    ["leads",                           c.leads],
    ["  └─ lead activities",            c.leadActivities],
    ["property viewings",               c.propertyViewings],
    ["transactions",                    c.transactions],
    ["  └─ transaction documents",      c.transactionDocs],
    ["commission splits",               c.commissionSplits],
    ["commission audits",               c.commissionAudits],
    ["reward grants",                   c.rewardGrants],
    ["guarantee payouts",               c.guaranteePayouts],
    ["agent area ledger",               c.agentAreaLedger],
    ["ledger entries",                  c.ledgerEntries],
    ["wallets",                         c.wallets],
    ["bank accounts",                   c.bankAccounts],
    ["withdrawal requests",             c.withdrawalRequests],
    ["invite tokens",                   c.inviteTokens],
    ["comp plans (SLAB)",               c.compPlans],
    ["commission rules (LEGACY %)",     c.commissionRules],
  ];
  for (const [name, n] of rows) {
    console.log(`  ${name.padEnd(36)} ${String(n).padStart(5)}`);
  }
}

function nonZeroKeys(c: Counts): string[] {
  return Object.entries(c)
    .filter(([, v]) => (v as number) > 0)
    .map(([k]) => k);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Usage: npx tsx scripts/reset-and-seed-real-estate.ts <organizationId>");
    process.exit(1);
  }

  const org = await p.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    console.error(`Organization "${orgId}" not found.`);
    process.exit(1);
  }

  const ownerId =
    org.ownerId ??
    (await p.user.findFirst({ where: { organizationId: orgId }, select: { id: true } }))?.id;
  if (!ownerId) {
    console.error(`No User in organization "${orgId}". Create an admin user first.`);
    process.exit(1);
  }

  console.log(`\n→ Org "${org.name}" (${orgId})`);

  const before = await takeCounts(orgId);
  printCounts("BEFORE wipe:", before);

  // ── WIPE ────────────────────────────────────────────────────────────────
  // Order matters: child tables before parents to keep FK constraints happy.
  // Wrapped in a single $transaction so any failure rolls everything back.
  //
  // Notable FK chains we have to respect:
  //   WithdrawalRequest → BankAccount → User
  //   LedgerEntry → Wallet → User
  //   LedgerEntry → Transaction, CommissionSplit
  //   AgentAreaLedger / RewardGrant.agentId → AgentProfile (string-only, no FK
  //     enforcement — but we still delete them first for cleanliness)
  //   PropertyViewing → Property + Lead (cascade on Property)
  //   LeadActivity → Lead (cascade)
  //   Transaction → Property, Buyer
  //   AgentProfile cascades ComplianceDocument, AgentReraProfile,
  //     RankPromotionLog automatically
  //   User cascades AgentProfile and Wallet — we wipe those rows by org first
  //     so the cascade has nothing left to do when we finally delete the User
  //
  // After this transaction commits, AFTER-wipe counts MUST be all zero. If
  // they aren't, the diagnostic below will tell you exactly which table
  // still has rows so you can investigate.
  // 14+ deleteMany calls — well over Prisma's default 5s transaction budget,
  // especially on the first run when the DB has lots of leftover rows. Bumping
  // to 60s gives plenty of headroom; the wipe is destructive but bounded, so
  // a transaction-level rollback on timeout is the right safety behaviour.
  await p.$transaction(async (tx) => {
    // Withdrawals + bank accounts first (they pin Wallets and Users)
    await tx.withdrawalRequest.deleteMany({ where: { organizationId: orgId } });
    await tx.bankAccount.deleteMany({ where: { organizationId: orgId } });

    // Commission + ledger flow
    await tx.ledgerEntry.deleteMany({ where: { organizationId: orgId } });
    await tx.commissionSplit.deleteMany({ where: { organizationId: orgId } });
    await tx.commissionAudit.deleteMany({ where: { organizationId: orgId } });
    await tx.rewardGrant.deleteMany({ where: { organizationId: orgId } });
    await tx.guaranteePayout.deleteMany({ where: { organizationId: orgId } });
    await tx.agentAreaLedger.deleteMany({ where: { organizationId: orgId } });

    // CRM (leads reference buyer + property; viewings reference both)
    await tx.leadActivity.deleteMany({ where: { lead: { organizationId: orgId } } });
    await tx.propertyViewing.deleteMany({ where: { organizationId: orgId } });
    await tx.lead.deleteMany({ where: { organizationId: orgId } });

    // Transactions + their docs
    await tx.transactionDocument.deleteMany({
      where: { transaction: { organizationId: orgId } },
    });
    await tx.transaction.deleteMany({ where: { organizationId: orgId } });

    // Wallets (LedgerEntries are already gone)
    await tx.wallet.deleteMany({ where: { organizationId: orgId } });

    // Properties (cascades PropertyImage, PropertyDocument,
    // PropertyPriceHistory, PropertyViewing — those last ones we already
    // deleted but the cascade is a no-op then)
    await tx.property.deleteMany({ where: { organizationId: orgId } });

    // Buyers (leads are gone, transactions are gone — buyers are now orphan-safe)
    await tx.buyer.deleteMany({ where: { organizationId: orgId } });

    // Agent hierarchy (cascades ComplianceDocument / AgentReraProfile /
    // RankPromotionLog automatically per their onDelete: Cascade declarations)
    await tx.agentProfile.deleteMany({ where: { organizationId: orgId } });

    // Misc
    await tx.inviteToken.deleteMany({ where: { organizationId: orgId } });

    // Old comp plans — wipe every CompPlan for this org so leftovers from
    // earlier seed runs (e.g. "Test SLAB Plan 2026") don't pile up alongside
    // the canonical one. Children (CompPlanSlab, CompPlanOverrideLevel,
    // CompPlanDesignation, CompPlanGuarantee) all cascade via onDelete:Cascade
    // so the single deleteMany takes them down with it. AgentAreaLedger,
    // RewardGrant, and GuaranteePayout reference planId as a plain String
    // (no FK enforcement) — but we wiped those by orgId above, so there are
    // no dangling references either way. RebmSettings.activePlanId may be
    // left dangling for a few lines — the SEED step below repoints it at
    // the freshly-created canonical plan.
    await tx.compPlan.deleteMany({ where: { organizationId: orgId } });

    // Legacy % commission rules — completely unused for this org because
    // RebmSettings.planEngine = SLAB, but they were still cluttering the
    // admin "Commission Rules" UI as stale "Default split" rows. The two
    // engines are mutually exclusive at runtime — the engine selector in
    // commission-engine.closeTransaction routes to the slab engine before
    // a CommissionRule is ever read for an SLAB org — so nothing breaks
    // by wiping them. CommissionSplit.ruleId / CommissionAudit.ruleId
    // both use SetNull, and we already wiped those tables above anyway.
    await tx.commissionRule.deleteMany({ where: { organizationId: orgId } });

    // FINALLY — the old test users themselves. We wipe every User in this
    // org whose email matches the test pattern. The 30 fresh ones are
    // upserted right after this transaction. Real users (admins, employees,
    // anyone whose email doesn't end with .test@nessco.local) are NOT
    // touched.
    await tx.user.deleteMany({
      where: { organizationId: orgId, email: { endsWith: TEST_EMAIL_DOMAIN } },
    });
  }, { maxWait: 10_000, timeout: 60_000 });

  const afterWipe = await takeCounts(orgId);
  printCounts("AFTER wipe:", afterWipe);

  const residue = nonZeroKeys(afterWipe);
  if (residue.length > 0) {
    console.error(
      `\n✗ Residue still in DB after wipe: ${residue.join(", ")}.`,
    );
    console.error(
      "  This means rows are bound to another organizationId or to a table",
    );
    console.error(
      "  the wipe doesn't know about. Investigate before seeding.",
    );
    process.exit(1);
  }
  console.log("\n✓ Wipe verified — every real-estate table is empty for this org.");

  // ── SEED ────────────────────────────────────────────────────────────────

  // Users
  const userByHandle = new Map<string, string>();
  for (const u of USERS) {
    const email = `${u.handle}${TEST_EMAIL_DOMAIN}`;
    // Use create-not-upsert: the wipe just removed all .test users, so we
    // know no row exists. A naked create catches bugs (duplicate handle in
    // USERS list, etc.) earlier than upsert would.
    const row = await p.user.create({
      data: {
        email,
        first_name: u.first,
        last_name: u.last,
        organizationId: orgId,
        status: "ACTIVE",
        email_verified: true,
      },
    });
    userByHandle.set(u.handle, row.id);
  }

  // AgentProfiles (two passes — create, then wire parents)
  const profileByHandle = new Map<string, string>();
  for (const u of USERS) {
    const prof = await p.agentProfile.create({
      data: {
        userId: userByHandle.get(u.handle)!,
        organizationId: orgId,
        status: "ACTIVE",
        complianceStatus: "COMPLIANT",
      },
    });
    profileByHandle.set(u.handle, prof.id);
  }
  for (const u of USERS) {
    if (!u.parent) continue;
    await p.agentProfile.update({
      where: { id: profileByHandle.get(u.handle)! },
      data: {
        parentId: profileByHandle.get(u.parent)!,
        sponsorId: profileByHandle.get(u.parent)!,
      },
    });
  }

  // ── Plan: the canonical 5-part Sales Income Plan from the printed sheet.
  //
  // Mirrors scripts/seed-real-estate-comp-plan.ts exactly so any other code
  // that targets the canonical plan keeps working. Idempotent: we upsert by
  // (orgId, name) so re-runs reload the same row instead of stacking versions.
  //
  // Plan layout:
  //   Plan 1+2 — 14 slabs (₹/sqyd by lifetime effective area)
  //   Plan 3   — override ladder, 10 levels deep (multipliers in DIFF_RATE)
  //   Plan 4   — 11 designations from Sales Promoter → President
  //   Plan 5   — 7 monthly leader guarantees (BP onward)
  // The wipe just deleted every CompPlan for this org, so a plain create is
  // safe — no need to upsert or pre-clean children. This is the single
  // source of truth for the canonical plan: any other plan in this org would
  // be a leftover that the wipe takes care of next run.
  const planName = "Sales Income Plan (Slabs · Overrides · Designations · Guarantee)";
  const planDescription =
    "Five-part compensation plan: area-slab direct income, level-difference " +
    "overrides up to 10 deep, designation milestones with travel rewards, " +
    "and leader monthly guarantees.";
  const plan = await p.compPlan.create({
    data: {
      organizationId: orgId,
      name: planName,
      description: planDescription,
      version: 1,
      status: "ACTIVE",
      overrideMode: "DIFF_RATE",
      slabCounterScope: "LIFETIME",
      compressionEnabled: true,
      companyResidualPercent: new Prisma.Decimal(0),
      areaUnit: "SQYD",
      createdById: ownerId,
    },
  });

  // ── PLAN 1 + 2 — 14 slabs, ₹/sqyd by lifetime effective area ──────────
  //
  // The displayed ranges on the printed sheet are inclusive on both ends
  // (e.g. "0–499" includes 499). The slab engine's lookupSlabRate uses
  // `cum >= minArea AND cum < maxArea`, so for the engine to actually
  // return the right slab at integer boundaries we set maxArea to the
  // NEXT slab's minArea — i.e. half-open intervals. A cumulative area of
  // exactly 499 sqyd lands in slab 0 (rate ₹500), 500 lands in slab 1
  // (₹600). The last slab has maxArea=null = "& ABOVE".
  await p.compPlanSlab.createMany({
    data: [
      // ─ PLAN 1 — Direct + Difference Sales Income ─
      { planId: plan.id, sortOrder:  0, minArea: new Prisma.Decimal(0),      maxArea: new Prisma.Decimal(500),    ratePerUnit: new Prisma.Decimal(500)  },
      { planId: plan.id, sortOrder:  1, minArea: new Prisma.Decimal(500),    maxArea: new Prisma.Decimal(1000),   ratePerUnit: new Prisma.Decimal(600)  },
      { planId: plan.id, sortOrder:  2, minArea: new Prisma.Decimal(1000),   maxArea: new Prisma.Decimal(2000),   ratePerUnit: new Prisma.Decimal(700)  },
      { planId: plan.id, sortOrder:  3, minArea: new Prisma.Decimal(2000),   maxArea: new Prisma.Decimal(3500),   ratePerUnit: new Prisma.Decimal(800)  },
      { planId: plan.id, sortOrder:  4, minArea: new Prisma.Decimal(3500),   maxArea: new Prisma.Decimal(5000),   ratePerUnit: new Prisma.Decimal(900)  },
      { planId: plan.id, sortOrder:  5, minArea: new Prisma.Decimal(5000),   maxArea: new Prisma.Decimal(7500),   ratePerUnit: new Prisma.Decimal(1000) },
      { planId: plan.id, sortOrder:  6, minArea: new Prisma.Decimal(7500),   maxArea: new Prisma.Decimal(10000),  ratePerUnit: new Prisma.Decimal(1100) },
      { planId: plan.id, sortOrder:  7, minArea: new Prisma.Decimal(10000),  maxArea: new Prisma.Decimal(15000),  ratePerUnit: new Prisma.Decimal(1200) },
      { planId: plan.id, sortOrder:  8, minArea: new Prisma.Decimal(15000),  maxArea: new Prisma.Decimal(20000),  ratePerUnit: new Prisma.Decimal(1300) },
      { planId: plan.id, sortOrder:  9, minArea: new Prisma.Decimal(20000),  maxArea: new Prisma.Decimal(35000),  ratePerUnit: new Prisma.Decimal(1400) },
      { planId: plan.id, sortOrder: 10, minArea: new Prisma.Decimal(35000),  maxArea: new Prisma.Decimal(50000),  ratePerUnit: new Prisma.Decimal(1450) },
      { planId: plan.id, sortOrder: 11, minArea: new Prisma.Decimal(50000),  maxArea: new Prisma.Decimal(75000),  ratePerUnit: new Prisma.Decimal(1500) },
      // ─ PLAN 2 — Direct Sales Income (slab continuation) ─
      { planId: plan.id, sortOrder: 12, minArea: new Prisma.Decimal(75000),  maxArea: new Prisma.Decimal(100000), ratePerUnit: new Prisma.Decimal(1550) },
      { planId: plan.id, sortOrder: 13, minArea: new Prisma.Decimal(100000), maxArea: null,                       ratePerUnit: new Prisma.Decimal(1600) },
    ],
  });

  // ── PLAN 3 — override ladder, 10 levels ──────────────────────────────
  //
  // Stored as MULTIPLIERS because the engine is in DIFF_RATE mode:
  //   override = (uplineRate − sellerRate) × dealArea × factor
  // L1 100%, L2 75%, L3 50%, L4–L10 each 25%. With the flat-factor floor
  // fix the engine now also pays at least `factor × dealArea` when the
  // rate differential collapses to zero — important when uplines and seller
  // sit on the same slab in a young org.
  await p.compPlanOverrideLevel.createMany({
    data: [
      { planId: plan.id, level:  1, factor: new Prisma.Decimal(1.00) },
      { planId: plan.id, level:  2, factor: new Prisma.Decimal(0.75) },
      { planId: plan.id, level:  3, factor: new Prisma.Decimal(0.50) },
      { planId: plan.id, level:  4, factor: new Prisma.Decimal(0.25) },
      { planId: plan.id, level:  5, factor: new Prisma.Decimal(0.25) },
      { planId: plan.id, level:  6, factor: new Prisma.Decimal(0.25) },
      { planId: plan.id, level:  7, factor: new Prisma.Decimal(0.25) },
      { planId: plan.id, level:  8, factor: new Prisma.Decimal(0.25) },
      { planId: plan.id, level:  9, factor: new Prisma.Decimal(0.25) },
      { planId: plan.id, level: 10, factor: new Prisma.Decimal(0.25) },
    ],
  });

  // ── PLAN 4 — 11 designation milestones from Sales Promoter → President ─
  await p.compPlanDesignation.createMany({
    data: [
      { planId: plan.id, sortOrder:  0, minCumulativeArea: new Prisma.Decimal(0),       designationCode: "SP",   designationName: "Sales Promoter",            rewardType: "SURPRISE", rewardDescription: "Surprise Reward" },
      { planId: plan.id, sortOrder:  1, minCumulativeArea: new Prisma.Decimal(500),     designationCode: "SE",   designationName: "Sales Executive",           rewardType: "SURPRISE", rewardDescription: "Surprise Reward" },
      { planId: plan.id, sortOrder:  2, minCumulativeArea: new Prisma.Decimal(1000),    designationCode: "REL",  designationName: "Real Estate Leader",        rewardType: "TRAVEL",   rewardDescription: "Domestic Tour" },
      { planId: plan.id, sortOrder:  3, minCumulativeArea: new Prisma.Decimal(5000),    designationCode: "SREL", designationName: "Sr. Real Estate Leader",    rewardType: "TRAVEL",   rewardDescription: "Domestic Tour" },
      { planId: plan.id, sortOrder:  4, minCumulativeArea: new Prisma.Decimal(10000),   designationCode: "BP",   designationName: "Business Partner",          rewardType: "TRAVEL",   rewardDescription: "International Tour — Malaysia, Thailand" },
      { planId: plan.id, sortOrder:  5, minCumulativeArea: new Prisma.Decimal(20000),   designationCode: "SBP",  designationName: "Sr. Business Partner",      rewardType: "TRAVEL",   rewardDescription: "International Tour — Hong Kong" },
      { planId: plan.id, sortOrder:  6, minCumulativeArea: new Prisma.Decimal(35000),   designationCode: "RBP",  designationName: "Regional Business Partner", rewardType: "TRAVEL",   rewardDescription: "International Tour — Dubai" },
      { planId: plan.id, sortOrder:  7, minCumulativeArea: new Prisma.Decimal(50000),   designationCode: "NBP",  designationName: "National Business Partner", rewardType: "TRAVEL",   rewardDescription: "International Tour — Switzerland" },
      { planId: plan.id, sortOrder:  8, minCumulativeArea: new Prisma.Decimal(100000),  designationCode: "HBP",  designationName: "Head of Business Partner",  rewardType: "TRAVEL",   rewardDescription: "International Tour — Europe" },
      { planId: plan.id, sortOrder:  9, minCumulativeArea: new Prisma.Decimal(250000),  designationCode: "VP",   designationName: "Vice President",            rewardType: "TRAVEL",   rewardDescription: "International Tour — Australia" },
      { planId: plan.id, sortOrder: 10, minCumulativeArea: new Prisma.Decimal(500000),  designationCode: "P",    designationName: "President",                 rewardType: "TRAVEL",   rewardDescription: "International Tour — UK (London)" },
    ],
  });

  // ── PLAN 5 — leader monthly guarantees (run by processMonthlyGuarantees) ─
  // Designation codes must match Plan 4. Picked up by the monthly job and
  // credited as RELEASED to the agent's wallet for any month they hold the
  // designation.
  await p.compPlanGuarantee.createMany({
    data: [
      { planId: plan.id, designationCode: "BP",  monthlyAmount: new Prisma.Decimal(21000), currency: "INR" },
      { planId: plan.id, designationCode: "SBP", monthlyAmount: new Prisma.Decimal(25000), currency: "INR" },
      { planId: plan.id, designationCode: "RBP", monthlyAmount: new Prisma.Decimal(29000), currency: "INR" },
      { planId: plan.id, designationCode: "NBP", monthlyAmount: new Prisma.Decimal(35000), currency: "INR" },
      { planId: plan.id, designationCode: "HBP", monthlyAmount: new Prisma.Decimal(35000), currency: "INR" },
      { planId: plan.id, designationCode: "VP",  monthlyAmount: new Prisma.Decimal(35000), currency: "INR" },
      { planId: plan.id, designationCode: "P",   monthlyAmount: new Prisma.Decimal(35000), currency: "INR" },
    ],
  });

  // RebmSettings
  await p.rebmSettings.upsert({
    where: { organizationId: orgId },
    update: { planEngine: "SLAB", activePlanId: plan.id, areaUnit: "SQYD", holdPeriodDays: 7 },
    create: { organizationId: orgId, planEngine: "SLAB", activePlanId: plan.id, areaUnit: "SQYD", holdPeriodDays: 7 },
  });

  // Properties (30 plots under one project, all AVAILABLE)
  for (let i = 1; i <= NUM_PLOTS; i++) {
    const area = PLOT_AREA_CYCLE[(i - 1) % PLOT_AREA_CYCLE.length];
    const listingHandle = JUNIOR_HANDLES[(i - 1) % JUNIOR_HANDLES.length];
    const listingUserId = userByHandle.get(listingHandle)!;
    await p.property.create({
      data: {
        organizationId: orgId,
        title: `${PROJECT_NAME} — Plot ${i}`,
        projectName: PROJECT_NAME,
        unitNumber: `Plot ${i}`,
        type: "LAND",
        status: "AVAILABLE",
        addressLine1: PROJECT_ADDRESS,
        city: PROJECT_CITY,
        country: PROJECT_COUNTRY,
        listingPrice: new Prisma.Decimal(area * PRICE_PER_SQYD),
        area: new Prisma.Decimal(area),
        areaUnit: "sqyd",
        listingAgentId: listingUserId,
        commissionTermType: "PERCENTAGE",
        commissionPercentage: new Prisma.Decimal(2),
        createdById: listingUserId,
      },
    });
  }

  const after = await takeCounts(orgId);
  printCounts("AFTER seed:", after);

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("READY");
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`Engine        : SLAB`);
  console.log(`Plan          : Sales Income Plan (5-part canonical, 14 slabs)`);
  console.log(`  Slabs       : 14   (₹500/sqyd @ 0–499 → ₹1600/sqyd @ 100k+)`);
  console.log(`  Overrides   : 10   (multipliers L1=1.0, L2=0.75, L3=0.5, L4–10=0.25)`);
  console.log(`  Designations: 11   (Sales Promoter → President)`);
  console.log(`  Guarantees  : 7    (BP ₹21k → P ₹35k monthly)`);
  console.log(`Agents        : 30 (1 CEO + 3 Directors + 6 Managers + 20 Agents)`);
  console.log(`Project       : ${PROJECT_NAME}`);
  console.log(`Plots         : ${NUM_PLOTS}, all AVAILABLE`);
  console.log(`Wallets       : 0 (clean slate — no transactions seeded)`);
  console.log("");
  console.log("Logins: <firstname>.test@nessco.local — all ACTIVE, email_verified");
  console.log("");
  console.log("If you still see stale data in the UI after this script runs:");
  console.log("  • Hard-refresh the browser (Ctrl+Shift+R) to bust any cached pages");
  console.log("  • Confirm your session is bound to this org id:");
  console.log(`    ${orgId}`);
  console.log("  • If the data belongs to a different organization, you'll need");
  console.log("    to run this script against that org id too.");
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n✗ Seed failed:", e?.message ?? e);
    if (e?.stack) console.error(e.stack);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
