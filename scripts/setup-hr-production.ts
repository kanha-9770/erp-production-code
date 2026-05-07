/**
 * HR Module - Production Setup Runner (ALL-IN-ONE)
 * =================================================
 *
 * Bootstraps the COMPLETE HR system in a single command:
 *   - HR modules / forms / sections / 241 fields / lookups / leave types
 *   - Route permissions / role + admin assignment / user permissions
 *   - CRM functions / workflow rules / function bindings
 *   - Recruitment pipeline patches (auto-numbered IDs)
 *   - Appointment Letter -> Employee Master hotfix
 *
 * Reads the consolidated SQL: scripts/hr-complete-setup.sql
 * (which is the four HR scripts merged under one outer transaction).
 *
 * Idempotent. Safe to run on every deploy.
 *
 * Org resolution:
 *   1. HR_ORG_ID env var (if set, must exist)
 *   2. Single organization in the DB -> auto-pick
 *   3. >1 orgs -> error, must specify HR_ORG_ID
 *
 * Admin user resolution:
 *   1. HR_ADMIN_USER_ID env var (if set, must exist)
 *   2. organizations.owner_id of the target org
 *   3. Oldest user belonging to that org
 *   4. None found -> error
 *
 * Usage:
 *   npm run setup:hr
 *   HR_ORG_ID=<orgId> npm run setup:hr
 *   HR_ORG_ID=<orgId> HR_ADMIN_USER_ID=<userId> npm run setup:hr
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = dirname(__filename);

// The SOURCE consolidated SQL file (built from the four HR scripts).
const ALL_IN_ONE_SQL = "hr-complete-setup.sql";

// Literal IDs that the consolidated SQL declares as v_org_id / v_user_id
// (inherited from the dev seed). The runner swaps these for the resolved
// production IDs before execution.
const SOURCE_ORG_ID = "cmojv2bpr000hu700t3jrj0vq";
const SOURCE_USER_ID = "cmojv15ct000cu700xrgwrbe8";

interface Target {
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
}

function banner(text: string): void {
  const line = "=".repeat(72);
  console.log(`\n${line}\n  ${text}\n${line}`);
}

async function resolveTarget(): Promise<Target> {
  const envOrgId = process.env.HR_ORG_ID?.trim();
  const envUserId = process.env.HR_ADMIN_USER_ID?.trim();

  // ── Org ────────────────────────────────────────────────────────────────
  let org;
  if (envOrgId) {
    org = await prisma.organization.findUnique({
      where: { id: envOrgId },
      select: { id: true, name: true, ownerId: true },
    });
    if (!org) {
      throw new Error(
        `HR_ORG_ID="${envOrgId}" does not exist in organizations table. Aborting.`
      );
    }
    console.log(`[setup-hr] Using HR_ORG_ID:        ${org.name} (${org.id})`);
  } else {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, ownerId: true },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    if (orgs.length === 0) {
      throw new Error(
        "No organizations found. Run `npm run create-default-org` first, then re-run this."
      );
    }
    if (orgs.length > 1) {
      const list = await prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });
      throw new Error(
        `Multiple organizations found (${list.length}). Set HR_ORG_ID to disambiguate.\n` +
          list.map((o) => `   - ${o.name}  -> ${o.id}`).join("\n")
      );
    }
    org = orgs[0];
    console.log(`[setup-hr] Auto-resolved org:      ${org.name} (${org.id})`);
  }

  // ── User ───────────────────────────────────────────────────────────────
  let user;
  if (envUserId) {
    user = await prisma.user.findUnique({
      where: { id: envUserId },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new Error(
        `HR_ADMIN_USER_ID="${envUserId}" does not exist in users table. Aborting.`
      );
    }
    console.log(`[setup-hr] Using HR_ADMIN_USER_ID: ${user.email} (${user.id})`);
  } else if (org.ownerId) {
    user = await prisma.user.findUnique({
      where: { id: org.ownerId },
      select: { id: true, email: true },
    });
    if (user) {
      console.log(`[setup-hr] Auto-resolved owner:    ${user.email} (${user.id})`);
    }
  }
  if (!user) {
    user = await prisma.user.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new Error(
        `No users found for org ${org.id}. Set HR_ADMIN_USER_ID env var explicitly.`
      );
    }
    console.log(`[setup-hr] Auto-resolved user:     ${user.email} (${user.id})`);
  }

  return {
    orgId: org.id,
    orgName: org.name,
    userId: user.id,
    userEmail: user.email,
  };
}

/**
 * Loads the consolidated all-in-one SQL, swaps the seed dev IDs for the
 * resolved production IDs, and strips the outer BEGIN; / COMMIT; transaction
 * control (Prisma manages the transaction around $executeRawUnsafe).
 */
function loadAllInOneSql(target: Target): string {
  const path = resolve(SCRIPTS_DIR, ALL_IN_ONE_SQL);
  let sql = readFileSync(path, "utf8");

  // 1. Replace dev IDs with production IDs (literal string substitution).
  if (target.orgId !== SOURCE_ORG_ID) {
    sql = sql.split(SOURCE_ORG_ID).join(target.orgId);
  }
  if (target.userId !== SOURCE_USER_ID) {
    sql = sql.split(SOURCE_USER_ID).join(target.userId);
  }

  // 2. Strip outer BEGIN; / COMMIT; — Prisma owns the transaction.
  sql = sql.replace(/^[ \t]*BEGIN;[ \t]*$/gm, "-- BEGIN; (handled by Prisma)");
  sql = sql.replace(/^[ \t]*COMMIT;[ \t]*$/gm, "-- COMMIT; (handled by Prisma)");

  return sql;
}

async function main(): Promise<void> {
  banner("HR Module - Production Setup (ALL-IN-ONE)");

  const target = await resolveTarget();
  const sql = loadAllInOneSql(target);
  const lineCount = sql.split("\n").length;

  console.log(`\n[setup-hr] Loaded ${ALL_IN_ONE_SQL} (${lineCount} lines)`);
  console.log(`[setup-hr] Executing as a single transaction...`);

  const startedAt = Date.now();
  try {
    await prisma.$executeRawUnsafe(sql);
    const ms = Date.now() - startedAt;
    console.log(`[setup-hr] ✓ Setup complete (${ms} ms)`);
  } catch (e: any) {
    const ms = Date.now() - startedAt;
    console.error(`[setup-hr] ✗ Setup failed after ${ms} ms`);
    console.error(`           ${e?.message ?? e}`);
    throw e;
  }

  // ── Post-run sanity counts ──────────────────────────────────────────────
  const moduleCount = await prisma.formModule.count({
    where: { organizationId: target.orgId, id: { startsWith: "mod_hr" } },
  });
  const formCount = await prisma.form.count({
    where: { module: { organizationId: target.orgId }, id: { startsWith: "form_hr_" } },
  });
  const fieldCount = await prisma.formField.count({
    where: {
      section: { form: { module: { organizationId: target.orgId } } },
      id: { startsWith: "fld_" },
    },
  });
  const userPermCount = await prisma.userPermission.count({
    where: {
      userId: target.userId,
      OR: [{ id: { startsWith: "up_hr_" } }, { id: { startsWith: "up_form_" } }],
    },
  });

  banner("HR Module - Setup Complete");
  console.log(`  Organization:        ${target.orgName} (${target.orgId})`);
  console.log(`  Admin user:          ${target.userEmail} (${target.userId})`);
  console.log(`  HR modules:          ${moduleCount}`);
  console.log(`  HR forms:            ${formCount}`);
  console.log(`  HR fields:           ${fieldCount}`);
  console.log(`  HR user permissions: ${userPermCount}`);
  console.log("");
  console.log(`  Re-run "npm run setup:hr" on every deploy — it is idempotent.`);
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n[setup-hr] FAILED:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
