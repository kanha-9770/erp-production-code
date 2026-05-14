/**
 * Real Estate Team — Seed Script
 * ==============================
 *
 * Wipes the org's existing real-estate dataset and rebuilds a clean
 * 30-agent MLM hierarchy under the configured root user, suitable for
 * demos, screenshots, and dev work on the team / lead / commission UIs.
 *
 * ── Tree shape (30 NEW agents under the existing root) ─────────────────
 *
 *   Root (existing main user)
 *   ├── Team A leader (Aarav Sharma)
 *   │   ├── Sub-leader A1  ┬─ 2 agents
 *   │   ├── Sub-leader A2  ┬─ 2 agents
 *   │   └── Sub-leader A3  ┬─ 2 agents
 *   ├── Team B leader (Diya Sharma)
 *   │   ├── Sub-leader B1  ┬─ 2 agents
 *   │   ├── Sub-leader B2  ┬─ 2 agents
 *   │   └── Sub-leader B3  ┬─ 2 agents
 *   └── Team C leader (Rohan Gupta)
 *       ├── Sub-leader C1  ┬─ 3 agents
 *       ├── Sub-leader C2  ┬─ 3 agents
 *       └── Direct agent (Tara Bhat)  ← reports straight to team leader
 *
 *   Total: 3 leaders + 8 sub-leaders + 18 sub-agents + 1 direct = 30 ✓
 *
 * ── What's safe / what's wiped ─────────────────────────────────────────
 *
 *   WIPED  (only inside the target org):
 *     - CommissionSplit, Transaction
 *     - Withdrawal, ReWalletEntry, ReWallet
 *     - LeadActivity, PropertyViewing, Lead, Buyer, InviteToken
 *     - PropertyImage, Property
 *     - ComplianceDocument, ReraProfile
 *     - AgentRankPromotion, AgentAreaLedger
 *     - AgentProfile (every row, including any previous root profile)
 *     - User rows whose email ends in `@seed.local`   ← only seed users
 *
 *   PRESERVED:
 *     - The Organization itself
 *     - The root user account (email + password untouched)
 *     - Every non-seed User in the org
 *     - All roles, units, role-route grants, modules
 *
 * ── Idempotent ─────────────────────────────────────────────────────────
 *
 * Re-running just re-syncs: the previous 30 seed users + their hierarchy
 * are deleted in dependency order, then recreated identically. No need
 * to wipe the DB by hand between runs.
 *
 * ── Run ────────────────────────────────────────────────────────────────
 *
 *   npm run seed:re-team
 *
 * Override the target via env vars if you ever need a different org:
 *
 *   $env:SEED_ORG_ID="cmxxxxxx"; `
 *   $env:SEED_ROOT_USER_ID="cmyyyyyy"; `
 *   npm run seed:re-team
 *
 * Every seed user logs in with the password printed at the end of the
 * run (default Demo@2025).
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Config — defaults match the org/root the user supplied ──────────────
const ROOT_ORG_ID = process.env.SEED_ORG_ID ?? "cmotuh90k00jcnx0j9j5og0ez";
const ROOT_USER_ID = process.env.SEED_ROOT_USER_ID ?? "cmotufdoz00j7nx0jlx3ocypc";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Demo@2025";
const SEED_EMAIL_DOMAIN = "seed.local";

// Friendly alphabet for sponsor codes — same one the create handler uses.
// 32 chars, no 0/O/1/I/L — easy to read out loud.
const SPONSOR_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ─── The tree definition ─────────────────────────────────────────────────
// `parentIndex: -1` means "child of root". Any other number is an index
// into this same array (the agent referenced must appear EARLIER in the
// list — we rely on the ordering when inserting so the parent already
// exists in the DB when we hit the child).

interface SeedAgent {
  firstName: string;
  lastName: string;
  parentIndex: number;
  tier: "leader" | "sub-leader" | "agent";
  /** Optional override; defaults to a derived service area. */
  city?: string;
}

const TREE: SeedAgent[] = [
  // ── Team A ────────────────────────────────────────────────────────────
  { firstName: "Aarav",   lastName: "Sharma",   parentIndex: -1, tier: "leader",     city: "Mumbai"     },
  { firstName: "Vihaan",  lastName: "Patel",    parentIndex:  0, tier: "sub-leader", city: "Mumbai"     },
  { firstName: "Aditya",  lastName: "Verma",    parentIndex:  0, tier: "sub-leader", city: "Mumbai"     },
  { firstName: "Ishaan",  lastName: "Kapoor",   parentIndex:  0, tier: "sub-leader", city: "Pune"       },
  { firstName: "Reyansh", lastName: "Mehta",    parentIndex:  1, tier: "agent",      city: "Mumbai"     },
  { firstName: "Krishna", lastName: "Reddy",    parentIndex:  1, tier: "agent",      city: "Thane"      },
  { firstName: "Arjun",   lastName: "Nair",     parentIndex:  2, tier: "agent",      city: "Mumbai"     },
  { firstName: "Sai",     lastName: "Iyer",     parentIndex:  2, tier: "agent",      city: "Navi Mumbai"},
  { firstName: "Vivaan",  lastName: "Joshi",    parentIndex:  3, tier: "agent",      city: "Pune"       },
  { firstName: "Aryan",   lastName: "Khanna",   parentIndex:  3, tier: "agent",      city: "Pune"       },

  // ── Team B ────────────────────────────────────────────────────────────
  { firstName: "Diya",    lastName: "Sharma",   parentIndex: -1, tier: "leader",     city: "Bengaluru"  },
  { firstName: "Anaya",   lastName: "Bose",     parentIndex: 10, tier: "sub-leader", city: "Bengaluru"  },
  { firstName: "Aanya",   lastName: "Rao",      parentIndex: 10, tier: "sub-leader", city: "Bengaluru"  },
  { firstName: "Myra",    lastName: "Singh",    parentIndex: 10, tier: "sub-leader", city: "Hyderabad"  },
  { firstName: "Saanvi",  lastName: "Mishra",   parentIndex: 11, tier: "agent",      city: "Bengaluru"  },
  { firstName: "Pari",    lastName: "Kulkarni", parentIndex: 11, tier: "agent",      city: "Bengaluru"  },
  { firstName: "Aadhya",  lastName: "Pillai",   parentIndex: 12, tier: "agent",      city: "Bengaluru"  },
  { firstName: "Kiara",   lastName: "Banerjee", parentIndex: 12, tier: "agent",      city: "Mysuru"     },
  { firstName: "Ananya",  lastName: "Chopra",   parentIndex: 13, tier: "agent",      city: "Hyderabad"  },
  { firstName: "Avni",    lastName: "Sinha",    parentIndex: 13, tier: "agent",      city: "Hyderabad"  },

  // ── Team C ────────────────────────────────────────────────────────────
  { firstName: "Rohan",   lastName: "Gupta",    parentIndex: -1, tier: "leader",     city: "Delhi"      },
  { firstName: "Karthik", lastName: "Menon",    parentIndex: 20, tier: "sub-leader", city: "Delhi"      },
  { firstName: "Neel",    lastName: "Desai",    parentIndex: 20, tier: "sub-leader", city: "Gurugram"   },
  { firstName: "Tara",    lastName: "Bhat",     parentIndex: 20, tier: "agent",      city: "Noida"      }, // direct under team leader
  { firstName: "Kabir",   lastName: "Pandey",   parentIndex: 21, tier: "agent",      city: "Delhi"      },
  { firstName: "Aarush",  lastName: "Yadav",    parentIndex: 21, tier: "agent",      city: "Delhi"      },
  { firstName: "Devansh", lastName: "Tiwari",   parentIndex: 21, tier: "agent",      city: "Faridabad"  },
  { firstName: "Riya",    lastName: "Chowdhury",parentIndex: 22, tier: "agent",      city: "Gurugram"   },
  { firstName: "Meera",   lastName: "Saxena",   parentIndex: 22, tier: "agent",      city: "Gurugram"   },
  { firstName: "Naina",   lastName: "Malhotra", parentIndex: 22, tier: "agent",      city: "Noida"      },
];

if (TREE.length !== 30) {
  throw new Error(`TREE must have exactly 30 entries, got ${TREE.length}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function pickN<T>(source: T[], n: number, seed: number): T[] {
  const out: T[] = [];
  let cursor = seed;
  for (let i = 0; i < n; i++) {
    cursor = (cursor * 9301 + 49297) % 233280;
    out.push(source[cursor % source.length]);
  }
  return out;
}

function makeSponsorCode(seedIndex: number): string {
  // Deterministic — same seedIndex always yields the same code, which
  // makes re-runs idempotent on the InviteToken / referral-lookup side.
  const blocks = [4, 4];
  let out = "";
  let cursor = (seedIndex + 1) * 7919;
  for (const len of blocks) {
    let block = "";
    for (let i = 0; i < len; i++) {
      cursor = (cursor * 1103515245 + 12345) & 0x7fffffff;
      block += SPONSOR_CODE_ALPHABET[cursor % SPONSOR_CODE_ALPHABET.length];
    }
    out += (out ? "-" : "") + block;
  }
  return "RE-" + out;
}

function emailFor(first: string, last: string, index: number): string {
  // Suffix the index so collisions on common first/last combos are impossible.
  return `${first}.${last}.${index + 1}`.toLowerCase() + "@" + SEED_EMAIL_DOMAIN;
}

function mobileFor(index: number): string {
  // Deterministic test number per index, all valid 10-digit prefixed +91.
  // Distinct + recognisable as test data (starts with 990).
  const tail = String(900_00000 + index * 137).padStart(7, "0").slice(-7);
  return `+91 990${tail}`;
}

// ─── Wipe ────────────────────────────────────────────────────────────────

async function wipeExistingData(): Promise<void> {
  console.log("[seed] Wiping existing real-estate data for org", ROOT_ORG_ID);

  // Order matters: child rows first, then parents, with self-FK breakers
  // for AgentProfile. Every where-clause is scoped to ROOT_ORG_ID so other
  // organisations remain untouched even on a shared database.
  //
  // Where Cascade onDelete is defined in the schema we let it do the work
  // instead of issuing redundant deletes:
  //   - Transaction → cascades to TransactionDocument + CommissionSplit
  //   - Wallet      → cascades to LedgerEntry + WithdrawalRequest
  //   - Lead        → cascades to LeadActivity + PropertyViewing
  //   - Property    → cascades to PropertyImage + PropertyDocument + viewings
  //   - AgentProfile→ cascades to ComplianceDocument + AgentReraProfile +
  //                   RankPromotionLog

  await prisma.transaction.deleteMany({ where: { organizationId: ROOT_ORG_ID } });
  console.log("[seed]  · transactions + cascaded splits/documents cleared");

  await prisma.wallet.deleteMany({ where: { organizationId: ROOT_ORG_ID } });
  console.log("[seed]  · wallets + cascaded ledger entries + withdrawals cleared");

  await prisma.lead.deleteMany({ where: { organizationId: ROOT_ORG_ID } });
  await prisma.buyer.deleteMany({ where: { organizationId: ROOT_ORG_ID } });
  await prisma.inviteToken.deleteMany({ where: { organizationId: ROOT_ORG_ID } });
  console.log("[seed]  · leads / buyers / invite tokens cleared");

  await prisma.property.deleteMany({ where: { organizationId: ROOT_ORG_ID } });
  console.log("[seed]  · properties + cascaded images/docs cleared");

  // AgentAreaLedger doesn't cascade off AgentProfile (the FK is by
  // agent.id but no cascade) — delete explicitly.
  await prisma.agentAreaLedger.deleteMany({
    where: { organizationId: ROOT_ORG_ID },
  });
  console.log("[seed]  · agent area ledger cleared");

  // Break the self-FKs before deleting AgentProfile — otherwise Postgres
  // throws on parentId / sponsorId pointing at sibling rows we're about
  // to remove in the same statement. Compliance / RERA / promotion-log
  // cascade off AgentProfile automatically.
  await prisma.agentProfile.updateMany({
    where: { organizationId: ROOT_ORG_ID },
    data: { parentId: null, sponsorId: null },
  });
  await prisma.agentProfile.deleteMany({ where: { organizationId: ROOT_ORG_ID } });
  console.log("[seed]  · agent profiles cleared");

  // Seed-only users (everyone whose email is on @seed.local). The real
  // admin user is identified by ROOT_USER_ID and never has a seed email
  // domain, so they're safe.
  const seedUsers = await prisma.user.findMany({
    where: {
      organizationId: ROOT_ORG_ID,
      email: { endsWith: `@${SEED_EMAIL_DOMAIN}` },
    },
    select: { id: true },
  });
  const seedUserIds = seedUsers.map((u) => u.id);
  if (seedUserIds.length > 0) {
    await prisma.userUnitAssignment.deleteMany({
      where: { userId: { in: seedUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: seedUserIds } } });
    console.log(`[seed]  · removed ${seedUserIds.length} previous seed users`);
  } else {
    console.log("[seed]  · no previous seed users to remove");
  }
}

// ─── Provision the role + unit the agents will live under ───────────────

async function ensureRoleAndUnit(): Promise<{ roleId: string; unitId: string }> {
  // Find-or-create the same "Real Estate Agent" role the onboardAsAgent
  // flow uses, so the seed agents are indistinguishable from real ones.
  let role = await prisma.role.findFirst({
    where: { organizationId: ROOT_ORG_ID, name: "Real Estate Agent" },
    select: { id: true },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: "Real Estate Agent",
        description: "MLM agents — seeded via scripts/seed-real-estate-team.ts",
        organizationId: ROOT_ORG_ID,
        isAdmin: false,
        isActive: true,
        shareDataWithPeers: false,
        level: 0,
      },
      select: { id: true },
    });
  }

  // Same with the Organization Unit.
  let unit = await prisma.organizationUnit.findFirst({
    where: { organizationId: ROOT_ORG_ID, name: "Real Estate" },
    select: { id: true },
  });
  if (!unit) {
    unit = await prisma.organizationUnit.findFirst({
      where: { organizationId: ROOT_ORG_ID },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
  }
  if (!unit) {
    unit = await prisma.organizationUnit.create({
      data: {
        name: "Real Estate",
        description: "Default unit for real-estate MLM agents.",
        organizationId: ROOT_ORG_ID,
        isActive: true,
        level: 0,
      },
      select: { id: true },
    });
  }

  // Route grants — mirrors the patterns onboardAsAgent grants. Idempotent
  // upserts so re-runs don't duplicate.
  const patterns = [
    "/real-estate",
    "/real-estate/**",
    "/real-estate/join/**",
    "/real-estate/onboard",
    "/profile",
    "/profile/**",
  ];
  for (const pattern of patterns) {
    const routePerm = await prisma.routePermission.upsert({
      where: {
        pattern_organizationId: { pattern, organizationId: ROOT_ORG_ID },
      },
      create: {
        pattern,
        organizationId: ROOT_ORG_ID,
        description: "Auto-provisioned by seed-real-estate-team script",
      },
      update: {},
      select: { id: true },
    });
    await prisma.routeRoleAccess.upsert({
      where: {
        routePermissionId_roleId: {
          routePermissionId: routePerm.id,
          roleId: role.id,
        },
      },
      create: { routePermissionId: routePerm.id, roleId: role.id, granted: true },
      update: { granted: true },
    });
  }

  return { roleId: role.id, unitId: unit.id };
}

// ─── Make sure a Real Estate FormModule + group anchor exist ─────────────
// so the seed agents' sidebar has the Real Estate group populated. Mirrors
// what onboardAsAgent does for newly-onboarded referral agents.

async function ensureRealEstateModuleAnchor(): Promise<void> {
  let rebmModule = await prisma.formModule.findFirst({
    where: { organizationId: ROOT_ORG_ID, name: "Real Estate" },
    select: { id: true },
  });
  if (!rebmModule) {
    rebmModule = await prisma.formModule.create({
      data: {
        name: "Real Estate",
        description: "Real-estate brokerage — properties, agents, transactions, and the MLM network.",
        organizationId: ROOT_ORG_ID,
        icon: "building2",
        moduleType: "standard",
        level: 0,
        isActive: true,
      },
      select: { id: true },
    });
  }
  await (prisma as any).staticPageAnchor.upsert({
    where: {
      organizationId_path: {
        organizationId: ROOT_ORG_ID,
        path: "group:Real Estate",
      },
    },
    create: {
      organizationId: ROOT_ORG_ID,
      path: "group:Real Estate",
      moduleId: rebmModule.id,
      sortOrder: 0,
    },
    update: {},
  });
}

// ─── Root user's AgentProfile (the tree's actual root) ───────────────────

async function ensureRootAgent(roleId: string, unitId: string): Promise<string> {
  const root = await prisma.user.findUnique({
    where: { id: ROOT_USER_ID },
    select: { id: true, organizationId: true },
  });
  if (!root) {
    throw new Error(
      `Root user ${ROOT_USER_ID} not found. Set SEED_ROOT_USER_ID to a valid user.`,
    );
  }
  if (root.organizationId !== ROOT_ORG_ID) {
    // Attach the root to the target org if they're not already there.
    await prisma.user.update({
      where: { id: ROOT_USER_ID },
      data: { organizationId: ROOT_ORG_ID },
    });
  }

  // We just wiped every AgentProfile in the org, so we always create the
  // root profile fresh — clean state on each run.
  const rootAgent = await prisma.agentProfile.create({
    data: {
      organizationId: ROOT_ORG_ID,
      userId: ROOT_USER_ID,
      sponsorId: null,
      parentId: null,
      sponsorCode: "RE-ROOT-0001",
      status: "ACTIVE",
      complianceStatus: "COMPLIANT",
      specializations: ["RESIDENTIAL", "COMMERCIAL"],
      serviceAreas: ["Mumbai", "Delhi", "Bengaluru"],
      bio: "Principal broker — top of the org tree.",
    },
    select: { id: true },
  });

  // Make sure the root user is assigned to the Real Estate Agent role
  // (so admin-only seeded data still surfaces in their sidebar when they
  // switch tabs). Idempotent on (userId, unitId).
  await prisma.userUnitAssignment.upsert({
    where: { userId_unitId: { userId: ROOT_USER_ID, unitId } },
    create: { userId: ROOT_USER_ID, unitId, roleId },
    update: { roleId },
  });

  return rootAgent.id;
}

// ─── Seed the 30-agent tree ──────────────────────────────────────────────

async function seedTree(args: {
  roleId: string;
  unitId: string;
  rootAgentId: string;
  hashedPassword: string;
}): Promise<{ usersCreated: number; agentsCreated: number }> {
  const { roleId, unitId, rootAgentId, hashedPassword } = args;

  // Track agent IDs by tree index so we can resolve `parentIndex` to a
  // freshly-minted AgentProfile.id as we go. -1 stays mapped to root.
  const agentIdByIndex = new Map<number, string>();
  agentIdByIndex.set(-1, rootAgentId);

  let usersCreated = 0;
  let agentsCreated = 0;

  for (let i = 0; i < TREE.length; i++) {
    const node = TREE[i];
    const email = emailFor(node.firstName, node.lastName, i);
    const sponsorCode = makeSponsorCode(i);

    // Each tree entry is one User + one AgentProfile. The User row
    // carries the login credentials; the AgentProfile carries the
    // MLM position. We tie them together inside a transaction so a
    // half-created agent never lingers if anything below errors.
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          provider: "EMAIL",
          status: "ACTIVE",
          organizationId: ROOT_ORG_ID,
          email_verified: true,
          first_name: node.firstName,
          last_name: node.lastName,
          mobile: mobileFor(i),
          mobile_verified: true,
          joinDate: new Date(),
        },
        select: { id: true },
      });

      const parentAgentId = agentIdByIndex.get(node.parentIndex);
      if (!parentAgentId) {
        throw new Error(
          `Parent for index ${i} (${node.firstName} ${node.lastName}) ` +
          `not found at parentIndex ${node.parentIndex}`,
        );
      }

      const agent = await tx.agentProfile.create({
        data: {
          organizationId: ROOT_ORG_ID,
          userId: user.id,
          parentId: parentAgentId,
          sponsorId: parentAgentId, // sponsor = parent for seed simplicity
          sponsorCode,
          status: "ACTIVE",
          complianceStatus: "COMPLIANT",
          specializations:
            node.tier === "leader"
              ? ["RESIDENTIAL", "COMMERCIAL"]
              : node.tier === "sub-leader"
                ? ["RESIDENTIAL"]
                : ["RESIDENTIAL"],
          serviceAreas: node.city ? [node.city] : [],
          bio:
            node.tier === "leader"
              ? `Team leader handling ${node.city ?? "the territory"}.`
              : node.tier === "sub-leader"
                ? `Sub-team lead in ${node.city ?? "the territory"}.`
                : `Active agent in ${node.city ?? "the territory"}.`,
          joinedAt: new Date(Date.now() - (TREE.length - i) * 86_400_000),
        },
        select: { id: true },
      });

      // UserUnitAssignment makes the user actually function as a
      // real-estate agent (drives the sidebar filtering + middleware
      // route grants). Idempotent — uniqueness is on (userId, unitId).
      await tx.userUnitAssignment.upsert({
        where: { userId_unitId: { userId: user.id, unitId } },
        create: { userId: user.id, unitId, roleId },
        update: { roleId },
      });

      return { userId: user.id, agentId: agent.id };
    });

    agentIdByIndex.set(i, created.agentId);
    usersCreated += 1;
    agentsCreated += 1;
    console.log(
      `[seed]  + #${(i + 1).toString().padStart(2, "0")}  ${node.tier.padEnd(10)}  ` +
      `${node.firstName} ${node.lastName}   ${email}   ${sponsorCode}`,
    );
  }

  return { usersCreated, agentsCreated };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("─".repeat(72));
  console.log("Real Estate Team — Seed");
  console.log("─".repeat(72));
  console.log("  Org id        :", ROOT_ORG_ID);
  console.log("  Root user id  :", ROOT_USER_ID);
  console.log("  Email domain  : @" + SEED_EMAIL_DOMAIN);
  console.log("  Login password:", SEED_PASSWORD);
  console.log("─".repeat(72));

  // Sanity-check the inputs before doing anything destructive.
  const org = await prisma.organization.findUnique({
    where: { id: ROOT_ORG_ID },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new Error(
      `Organization ${ROOT_ORG_ID} not found. Aborting — won't wipe data ` +
      "from a nonexistent target.",
    );
  }
  const rootUser = await prisma.user.findUnique({
    where: { id: ROOT_USER_ID },
    select: { id: true, email: true },
  });
  if (!rootUser) {
    throw new Error(
      `Root user ${ROOT_USER_ID} not found. Aborting before any writes.`,
    );
  }
  console.log(`[seed] Target: "${org.name}" with root user ${rootUser.email}`);

  await wipeExistingData();
  const { roleId, unitId } = await ensureRoleAndUnit();
  await ensureRealEstateModuleAnchor();
  const rootAgentId = await ensureRootAgent(roleId, unitId);
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 10);

  console.log("[seed] Building tree…");
  const { usersCreated, agentsCreated } = await seedTree({
    roleId,
    unitId,
    rootAgentId,
    hashedPassword,
  });

  console.log("─".repeat(72));
  console.log(
    `[seed] Done. Created ${usersCreated} users + ${agentsCreated} agent profiles.`,
  );
  console.log("  Login as any of them with:");
  console.log("    email   : <first>.<last>.<N>@" + SEED_EMAIL_DOMAIN);
  console.log("              (e.g. aarav.sharma.1@" + SEED_EMAIL_DOMAIN + ")");
  console.log("    password:", SEED_PASSWORD);
  console.log("─".repeat(72));
}

main()
  .catch(async (err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[seed] Prisma error", err.code, err.message);
    } else {
      console.error("[seed] Failed:", err);
    }
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
