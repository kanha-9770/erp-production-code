/**
 * Post-deploy / cold-start cache warmer.
 *
 * Runs every cacheable loader at least once so the first real user request
 * hits a warm Upstash entry instead of paying the Postgres miss. Designed
 * to be idempotent: calling it twice in a row is harmless — the second run
 * just refreshes the TTL on every key.
 *
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   // From CLI (post-deploy hook):
 *   //   npm run warm:cache
 *
 *   // From code (instrumentation, admin endpoint, etc.):
 *   import { warmCaches } from "@/lib/cache-warmup";
 *   await warmCaches({ scope: "globals-only" }); // ~2-5s
 *   await warmCaches({ scope: "all" });          // grows with org count
 *
 * SCOPE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   "globals-only" — caches that don't depend on an org (fastest):
 *     - Field types catalog
 *     - Leave types
 *     - Leave rules
 *     - Permission ID lookups (VIEW / CREATE / EDIT / DELETE / EXPORT)
 *
 *   "all" — globals + every active org's per-org caches:
 *     - Attendance configuration
 *     - Payroll configuration
 *     - Employee records payload
 *     - Form structure for every form belonging to the org (opt-in)
 *
 * NOT WARMED (intentional)
 * ─────────────────────────────────────────────────────────────────────────
 *   - Sessions: per-user, 60s TTL — pointless to pre-warm.
 *   - Per-user permission resolutions: would explode in key count.
 *   - Attendance status: real-time state, deliberately uncached.
 *   - Page anchors: small enough that the first request can populate it
 *     cheaply; warming it requires either importing the route's private
 *     resolver or duplicating it, both of which are worse than the ~10ms
 *     cold cost.
 */

import { prisma } from "@/lib/prisma";
import { buildKey, cacheSet } from "@/lib/cache";
import { redisPing, type Namespace } from "@/lib/redis";
import { getAttendanceConfig } from "@/lib/hr/attendance-config";
import { warmPayrollConfigCache } from "@/lib/utils/payroll-store";
import { getCachedFormStructure } from "@/lib/forms/form-cache";
import {
  LEAVE_TYPES_KEY,
  LEAVE_RULES_KEY,
  LEAVE_TYPES_TTL_S,
  LEAVE_RULES_TTL_S,
} from "@/lib/hr/leave-cache";

// ─────────────────────────────────────────────────────────────────────────────
// Keys + TTLs mirror what the live routes use. Mismatched keys would mean
// we cache to a different key than the read path consults — instant footgun
// — so the constants are duplicated here on purpose and kept identical.
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_TYPES_KEY = buildKey("default", "field-types", "active");
const FIELD_TYPES_TTL_S = 3600;

const EMPLOYEE_RECORDS_TTL_S = 60;
const employeeRecordsKey = (orgId: string) =>
  buildKey("hr", "employee-records", orgId);

const PERM_TTL_S = 5 * 60;
const permissionIdKey = (name: string) =>
  buildKey("auth", "perm-id", name.toUpperCase());

const COMMON_PERMISSION_NAMES = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "EXPORT",
  "IMPORT",
];

// ─────────────────────────────────────────────────────────────────────────────
// Report types
// ─────────────────────────────────────────────────────────────────────────────

type WarmStatus = "ok" | "skipped" | "error";

export interface OrgWarmupResult {
  organizationId: string;
  attendanceConfig: WarmStatus;
  payrollConfig: WarmStatus;
  employeeRecords: WarmStatus;
  formStructures: WarmStatus;
  formCount: number;
}

export interface WarmupReport {
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  redisReachable: Partial<Record<Namespace, boolean>>;
  globals: {
    fieldTypes: WarmStatus;
    leaveTypes: WarmStatus;
    leaveRules: WarmStatus;
    permissionIds: WarmStatus;
  };
  perOrg: OrgWarmupResult[];
  errors: Array<{ scope: string; message: string }>;
}

export interface WarmupOptions {
  /** Which caches to warm. Default: "globals-only". */
  scope?: "globals-only" | "all";
  /** Limit per-org warmup to this set. Useful for tests / single-tenant deploys. */
  organizationIds?: string[];
  /** Optional logger (e.g., console.log). Defaults to silent. */
  log?: (message: string) => void;
  /** When true, also warm form structure for each active form. Off by default
   *  because a busy org can have hundreds of forms; opt in deliberately. */
  includeFormStructures?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function warmCaches(opts: WarmupOptions = {}): Promise<WarmupReport> {
  const scope = opts.scope ?? "globals-only";
  const log = opts.log ?? (() => {});
  const t0 = Date.now();
  const startedAt = new Date(t0).toISOString();
  const errors: WarmupReport["errors"] = [];

  log(`[warmup] starting scope=${scope}`);

  // Step 1: probe each Upstash namespace so a misconfigured URL surfaces in
  // the report instead of silently no-op'ing every subsequent cache write.
  const redisReachable = await pingAllNamespaces();
  log(
    `[warmup] redis: ${Object.entries(redisReachable)
      .map(([n, ok]) => `${n}=${ok ? "ok" : "DOWN"}`)
      .join(" ")}`
  );

  // Step 2: warm the globals (small, fixed cost). They touch independent
  // tables and independent keys — safe to run in parallel.
  const globals = await warmGlobals(log, errors);

  // Step 3: optionally walk every org. Orgs run sequentially because they
  // share Postgres's small connection pool (connection_limit=10); fanning
  // out 50 orgs in parallel would saturate it for no real gain.
  const perOrg: OrgWarmupResult[] = [];
  if (scope === "all") {
    const orgIds = opts.organizationIds ?? (await listActiveOrgIds(errors));
    log(`[warmup] per-org: ${orgIds.length} organization(s)`);
    for (const orgId of orgIds) {
      perOrg.push(
        await warmOrg(orgId, opts.includeFormStructures === true, errors, log)
      );
    }
  }

  const t1 = Date.now();
  const report: WarmupReport = {
    startedAt,
    finishedAt: new Date(t1).toISOString(),
    elapsedMs: t1 - t0,
    redisReachable,
    globals,
    perOrg,
    errors,
  };

  log(`[warmup] done in ${report.elapsedMs}ms (errors: ${errors.length})`);
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step helpers
// ─────────────────────────────────────────────────────────────────────────────

async function pingAllNamespaces(): Promise<Partial<Record<Namespace, boolean>>> {
  const namespaces: Namespace[] = [
    "default",
    "auth",
    "forms",
    "hr",
    "lookup",
    "workflow",
  ];
  const entries = await Promise.all(
    namespaces.map(async (ns) => [ns, await redisPing(ns)] as const)
  );
  return Object.fromEntries(entries) as Partial<Record<Namespace, boolean>>;
}

async function warmGlobals(
  log: (msg: string) => void,
  errors: WarmupReport["errors"]
): Promise<WarmupReport["globals"]> {
  // All four globals touch independent tables — fan out so the slowest one
  // sets the wall-clock cost, not the sum.
  const [fieldTypes, leaveTypes, leaveRules, permissionIds] = await Promise.all([
    safeWarm("field-types", errors, async () => {
      const data = await prisma.fieldType.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });
      await cacheSet("default", FIELD_TYPES_KEY, data, FIELD_TYPES_TTL_S);
    }),

    safeWarm("leave-types", errors, async () => {
      const data = await prisma.leaveType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      await cacheSet("hr", LEAVE_TYPES_KEY, data, LEAVE_TYPES_TTL_S);
    }),

    safeWarm("leave-rules", errors, async () => {
      const data = await prisma.leaveType.findMany({
        include: { leaveRules: true },
        orderBy: { name: "asc" },
      });
      await cacheSet("hr", LEAVE_RULES_KEY, data, LEAVE_RULES_TTL_S);
    }),

    safeWarm("perm-ids", errors, async () => {
      const rows = await prisma.permission.findMany({
        where: { name: { in: COMMON_PERMISSION_NAMES } },
        select: { id: true, name: true },
      });
      const byName = new Map(rows.map((r) => [r.name.toUpperCase(), r.id]));
      await Promise.all(
        COMMON_PERMISSION_NAMES.map((name) =>
          cacheSet(
            "auth",
            permissionIdKey(name),
            { id: byName.get(name) ?? null },
            PERM_TTL_S
          )
        )
      );
    }),
  ]);

  log(
    `[warmup] globals: fieldTypes=${fieldTypes} leaveTypes=${leaveTypes} leaveRules=${leaveRules} permIds=${permissionIds}`
  );

  return { fieldTypes, leaveTypes, leaveRules, permissionIds };
}

async function warmOrg(
  organizationId: string,
  includeFormStructures: boolean,
  errors: WarmupReport["errors"],
  log: (msg: string) => void
): Promise<OrgWarmupResult> {
  // Attendance config & payroll config both call into their public read fns,
  // which use `cached()` under the hood — so the warmer writes to exactly
  // the keys the live routes consult.
  const attendanceConfig = await safeWarm(
    `org:${organizationId}:attendance-config`,
    errors,
    () => getAttendanceConfig(organizationId).then(() => undefined)
  );

  const payrollConfig = await safeWarm(
    `org:${organizationId}:payroll-config`,
    errors,
    () => warmPayrollConfigCache(organizationId)
  );

  // Employee records payload — calls the public builder if exported.
  const employeeRecords = await safeWarm(
    `org:${organizationId}:employee-records`,
    errors,
    async () => {
      const mod = await import("@/app/api/employee-records/route");
      const builder = (mod as any).buildEmployeeRecordsPayload as
        | ((orgId: string) => Promise<unknown>)
        | undefined;
      if (!builder) return; // helper not exported on this branch — skip
      const payload = await builder(organizationId);
      await cacheSet(
        "hr",
        employeeRecordsKey(organizationId),
        payload,
        EMPLOYEE_RECORDS_TTL_S
      );
    }
  );

  let formStructures: WarmStatus = "skipped";
  let formCount = 0;
  if (includeFormStructures) {
    formStructures = await safeWarm(
      `org:${organizationId}:form-structures`,
      errors,
      async () => {
        const forms = await prisma.form.findMany({
          where: { module: { organizationId } },
          select: { id: true },
        });
        formCount = forms.length;
        for (const f of forms) {
          await getCachedFormStructure(f.id);
        }
      }
    );
  }

  log(
    `[warmup] org ${organizationId}: attendance=${attendanceConfig} payroll=${payrollConfig} employees=${employeeRecords} forms=${formStructures}${formCount ? `(${formCount})` : ""}`
  );

  return {
    organizationId,
    attendanceConfig,
    payrollConfig,
    employeeRecords,
    formStructures,
    formCount,
  };
}

async function listActiveOrgIds(
  errors: WarmupReport["errors"]
): Promise<string[]> {
  try {
    const rows = await prisma.organization.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  } catch (err) {
    errors.push({ scope: "list-orgs", message: errorMessage(err) });
    return [];
  }
}

async function safeWarm(
  scope: string,
  errors: WarmupReport["errors"],
  fn: () => Promise<void>
): Promise<WarmStatus> {
  try {
    await fn();
    return "ok";
  } catch (err) {
    errors.push({ scope, message: errorMessage(err) });
    return "error";
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
