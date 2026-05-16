/**
 * Real Estate — Comp Plan loader (for the Plan Designer UI)
 * =========================================================
 *
 * Drops the 5-part comp plan from the printed sheet into the DB as a
 * single `CompPlan` row (status DRAFT) + its slabs / overrides /
 * designations / guarantees. The plan then shows up in the existing
 * Plan Designer page (`/real-estate/admin/plan-designer`) where you
 * can review the numbers and activate it manually — this script does
 * **NOT** flip RebmSettings or change the live engine on its own.
 *
 * Idempotent — re-running clears the plan's child rows and re-inserts
 * them, so the plan keeps the same id and the designer link stays
 * stable.
 *
 * Run:  npm run seed:re-comp-plan
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Config — same defaults as the team-seed script ─────────────────────
const ROOT_ORG_ID = process.env.SEED_ORG_ID ?? "cmotuh90k00jcnx0j9j5og0ez";
const ROOT_USER_ID = process.env.SEED_ROOT_USER_ID ?? "cmotufdoz00j7nx0jlx3ocypc";

const PLAN_NAME = "Sales Income Plan (Slabs · Overrides · Designations · Guarantee)";
const PLAN_DESCRIPTION =
  "Five-part compensation plan: area-slab direct income, level-difference " +
  "overrides up to 10 deep, designation milestones with travel rewards, " +
  "and leader monthly guarantees.";
const AREA_UNIT = "SQYD" as const;
const OVERRIDE_MODE: "DIFF_RATE" | "DIFF_FACTOR" = "DIFF_RATE";

// ─── PLAN 1 + 2: slabs (₹ per sq.yd) ────────────────────────────────────

interface SlabSpec {
  sortOrder: number;
  minArea: number;
  maxArea: number | null; // null = "& ABOVE" (last slab)
  ratePerUnit: number;
}

const SLABS: SlabSpec[] = [
  // ─ PLAN 1 — Direct and Difference Sales Income Plan ─
  { sortOrder:  0, minArea:      0, maxArea:    499, ratePerUnit:  500 },
  { sortOrder:  1, minArea:    500, maxArea:    999, ratePerUnit:  600 },
  { sortOrder:  2, minArea:   1000, maxArea:   1999, ratePerUnit:  700 },
  { sortOrder:  3, minArea:   2000, maxArea:   3499, ratePerUnit:  800 },
  { sortOrder:  4, minArea:   3500, maxArea:   4999, ratePerUnit:  900 },
  { sortOrder:  5, minArea:   5000, maxArea:   7499, ratePerUnit: 1000 },
  { sortOrder:  6, minArea:   7500, maxArea:   9999, ratePerUnit: 1100 },
  { sortOrder:  7, minArea:  10000, maxArea:  14999, ratePerUnit: 1200 },
  { sortOrder:  8, minArea:  15000, maxArea:  19999, ratePerUnit: 1300 },
  { sortOrder:  9, minArea:  20000, maxArea:  34999, ratePerUnit: 1400 },
  { sortOrder: 10, minArea:  35000, maxArea:  49999, ratePerUnit: 1450 },
  { sortOrder: 11, minArea:  50000, maxArea:  74999, ratePerUnit: 1500 },
  // ─ PLAN 2 — Direct Sales Income Plan (slab continuation) ─
  { sortOrder: 12, minArea:  75000, maxArea:  99999, ratePerUnit: 1550 },
  { sortOrder: 13, minArea: 100000, maxArea:   null, ratePerUnit: 1600 },
];

// ─── PLAN 3: override ladder ────────────────────────────────────────────
// Stored as MULTIPLIERS (1.00 = 100%, 0.75 = 75%, …) because the slab
// engine does `(uplineRate − sellerRate) × dealArea × factor` directly
// in DIFF_RATE mode. If you actually want flat ₹/sq.yd per level
// instead, switch OVERRIDE_MODE above to "DIFF_FACTOR" and replace the
// decimals here with rupee amounts.
interface OverrideLevelSpec { level: number; factor: number }
const OVERRIDE_LEVELS: OverrideLevelSpec[] = [
  { level:  1, factor: 1.00 }, // 100%
  { level:  2, factor: 0.75 }, // 75%
  { level:  3, factor: 0.50 }, // 50%
  { level:  4, factor: 0.25 }, // 25%
  { level:  5, factor: 0.25 },
  { level:  6, factor: 0.25 },
  { level:  7, factor: 0.25 },
  { level:  8, factor: 0.25 },
  { level:  9, factor: 0.25 },
  { level: 10, factor: 0.25 },
];

// ─── PLAN 4: designations + rewards ─────────────────────────────────────

interface DesignationSpec {
  sortOrder: number;
  minCumulativeArea: number;
  code: string;
  name: string;
  rewardType: "SURPRISE" | "TRAVEL";
  rewardDescription: string;
}

const DESIGNATIONS: DesignationSpec[] = [
  { sortOrder:  0, minCumulativeArea:      0, code: "SP",   name: "Sales Promoter",              rewardType: "SURPRISE", rewardDescription: "Surprise Reward" },
  { sortOrder:  1, minCumulativeArea:    500, code: "SE",   name: "Sales Executive",             rewardType: "SURPRISE", rewardDescription: "Surprise Reward" },
  { sortOrder:  2, minCumulativeArea:   1000, code: "REL",  name: "Real Estate Leader",          rewardType: "TRAVEL",   rewardDescription: "Domestic Tour" },
  { sortOrder:  3, minCumulativeArea:   5000, code: "SREL", name: "Sr. Real Estate Leader",      rewardType: "TRAVEL",   rewardDescription: "Domestic Tour" },
  { sortOrder:  4, minCumulativeArea:  10000, code: "BP",   name: "Business Partner",            rewardType: "TRAVEL",   rewardDescription: "International Tour — Malaysia, Thailand" },
  { sortOrder:  5, minCumulativeArea:  20000, code: "SBP",  name: "Sr. Business Partner",        rewardType: "TRAVEL",   rewardDescription: "International Tour — Hong Kong" },
  { sortOrder:  6, minCumulativeArea:  35000, code: "RBP",  name: "Regional Business Partner",   rewardType: "TRAVEL",   rewardDescription: "International Tour — Dubai" },
  { sortOrder:  7, minCumulativeArea:  50000, code: "NBP",  name: "National Business Partner",   rewardType: "TRAVEL",   rewardDescription: "International Tour — Switzerland" },
  { sortOrder:  8, minCumulativeArea: 100000, code: "HBP",  name: "Head of Business Partner",    rewardType: "TRAVEL",   rewardDescription: "International Tour — Europe" },
  { sortOrder:  9, minCumulativeArea: 250000, code: "VP",   name: "Vice President",              rewardType: "TRAVEL",   rewardDescription: "International Tour — Australia" },
  { sortOrder: 10, minCumulativeArea: 500000, code: "P",    name: "President",                   rewardType: "TRAVEL",   rewardDescription: "International Tour — UK (London)" },
];

// ─── PLAN 5: leader monthly guarantees ──────────────────────────────────

interface GuaranteeSpec { code: string; monthlyAmount: number }
const GUARANTEES: GuaranteeSpec[] = [
  { code: "BP",  monthlyAmount: 21_000 },
  { code: "SBP", monthlyAmount: 25_000 },
  { code: "RBP", monthlyAmount: 29_000 },
  { code: "NBP", monthlyAmount: 35_000 },
  { code: "HBP", monthlyAmount: 35_000 },
  { code: "VP",  monthlyAmount: 35_000 },
  { code: "P",   monthlyAmount: 35_000 },
];

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed] Loading comp plan for org", ROOT_ORG_ID);

  // Pre-flight: org + creator user must exist; we don't auto-create
  // either — that's outside this script's scope.
  const org = await prisma.organization.findUnique({
    where: { id: ROOT_ORG_ID },
    select: { id: true },
  });
  if (!org) {
    throw new Error(`Organization ${ROOT_ORG_ID} not found.`);
  }
  const rootUser = await prisma.user.findUnique({
    where: { id: ROOT_USER_ID },
    select: { id: true },
  });
  if (!rootUser) {
    throw new Error(`Creator user ${ROOT_USER_ID} not found.`);
  }

  // Find-or-create the plan. We keep status DRAFT so admin reviews it
  // in the designer and clicks Activate themselves — the script does
  // not touch RebmSettings.activePlanId.
  let plan = await prisma.compPlan.findFirst({
    where: { organizationId: ROOT_ORG_ID, name: PLAN_NAME },
    select: { id: true },
  });
  if (!plan) {
    plan = await prisma.compPlan.create({
      data: {
        organizationId: ROOT_ORG_ID,
        name: PLAN_NAME,
        description: PLAN_DESCRIPTION,
        version: 1,
        status: "DRAFT",
        areaUnit: AREA_UNIT,
        companyResidualPercent: new Prisma.Decimal(0),
        compressionEnabled: true,
        overrideMode: OVERRIDE_MODE,
        slabCounterScope: "LIFETIME",
        createdById: ROOT_USER_ID,
      },
      select: { id: true },
    });
    console.log("[seed] Created DRAFT plan", plan.id);
  } else {
    console.log("[seed] Reloading data into existing plan", plan.id);
  }

  // Wipe + reinsert children inside one transaction so a partial seed
  // never leaves the plan in an inconsistent state.
  await prisma.$transaction(async (tx) => {
    await tx.compPlanSlab.deleteMany({ where: { planId: plan!.id } });
    await tx.compPlanOverrideLevel.deleteMany({ where: { planId: plan!.id } });
    await tx.compPlanDesignation.deleteMany({ where: { planId: plan!.id } });
    await tx.compPlanGuarantee.deleteMany({ where: { planId: plan!.id } });

    // Keep top-level plan config aligned with this script every run,
    // but leave `status` alone — if the admin already activated it
    // we don't want to silently drop it back to DRAFT.
    await tx.compPlan.update({
      where: { id: plan!.id },
      data: {
        description: PLAN_DESCRIPTION,
        areaUnit: AREA_UNIT,
        overrideMode: OVERRIDE_MODE,
        slabCounterScope: "LIFETIME",
        compressionEnabled: true,
      },
    });

    await tx.compPlanSlab.createMany({
      data: SLABS.map((s) => ({
        planId: plan!.id,
        sortOrder: s.sortOrder,
        minArea: new Prisma.Decimal(s.minArea),
        maxArea: s.maxArea == null ? null : new Prisma.Decimal(s.maxArea),
        ratePerUnit: new Prisma.Decimal(s.ratePerUnit),
      })),
    });

    await tx.compPlanOverrideLevel.createMany({
      data: OVERRIDE_LEVELS.map((o) => ({
        planId: plan!.id,
        level: o.level,
        factor: new Prisma.Decimal(o.factor),
      })),
    });

    await tx.compPlanDesignation.createMany({
      data: DESIGNATIONS.map((d) => ({
        planId: plan!.id,
        sortOrder: d.sortOrder,
        minCumulativeArea: new Prisma.Decimal(d.minCumulativeArea),
        designationCode: d.code,
        designationName: d.name,
        rewardType: d.rewardType,
        rewardDescription: d.rewardDescription,
        rewardCashAmount: null,
      })),
    });

    // Guard against guarantees referencing a code we didn't seed in the
    // designation list — keeps the implicit FK valid even if someone
    // edits the constants and forgets the matching row.
    const validCodes = new Set(DESIGNATIONS.map((d) => d.code));
    const guarantees = GUARANTEES.filter((g) => validCodes.has(g.code));
    if (guarantees.length !== GUARANTEES.length) {
      const dropped = GUARANTEES
        .filter((g) => !validCodes.has(g.code))
        .map((g) => g.code);
      console.warn("[seed]  ⚠  Skipping guarantees with unknown codes:", dropped);
    }
    await tx.compPlanGuarantee.createMany({
      data: guarantees.map((g) => ({
        planId: plan!.id,
        designationCode: g.code,
        monthlyAmount: new Prisma.Decimal(g.monthlyAmount),
        currency: "INR",
      })),
    });
  });

  console.log(
    `[seed] Loaded ${SLABS.length} slabs · ${OVERRIDE_LEVELS.length} override levels · ` +
    `${DESIGNATIONS.length} designations · ${GUARANTEES.length} guarantees`,
  );

  // ── Activate the plan + switch the org's engine to SLAB ────────────────
  // The slab engine reads RebmSettings.{planEngine, activePlanId} on every
  // transaction close; without these two writes the engine silently falls
  // back to the legacy % rule. Doing it here keeps the seed self-contained
  // so end-to-end tests don't have to remember a manual activate step.
  await prisma.$transaction(async (tx) => {
    await tx.compPlan.update({
      where: { id: plan!.id },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        activatedBy: ROOT_USER_ID,
      },
    });

    await tx.rebmSettings.upsert({
      where: { organizationId: ROOT_ORG_ID },
      create: {
        organizationId: ROOT_ORG_ID,
        planEngine: "SLAB",
        activePlanId: plan!.id,
        areaUnit: AREA_UNIT,
        isReraRequired: false,
        holdPeriodDays: 7,
        companyResidualPercent: new Prisma.Decimal(0),
        updatedById: ROOT_USER_ID,
      },
      update: {
        planEngine: "SLAB",
        activePlanId: plan!.id,
        areaUnit: AREA_UNIT,
        updatedById: ROOT_USER_ID,
      },
    });
  });

  console.log("[seed] Plan id :", plan.id);
  console.log("[seed] Status  : ACTIVE — RebmSettings.planEngine = SLAB");
  console.log("[seed] Area unit: SQYD (commission auto-calculated in square yards)");
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
