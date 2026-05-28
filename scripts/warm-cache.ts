/**
 * Post-deploy cache warmer CLI.
 *
 * Run with:
 *   npm run warm:cache                  # globals only (~2-5s)
 *   npm run warm:cache -- --all         # globals + every org
 *   npm run warm:cache -- --all --forms # also pre-load every form's structure
 *   npm run warm:cache -- --org=<orgId> # warm a single org
 *   npm run warm:cache -- --quiet       # suppress per-step log lines
 *
 * Wire this into your deploy step (e.g. immediately after `next start` reports
 * ready, or as a Vercel `postdeploy` hook). The script exits non-zero only if
 * an unhandled exception is thrown; partial-success runs still exit 0 with the
 * report's `errors[]` populated so the CI step doesn't block on a single
 * orphaned org. Check the printed report to see what failed.
 */

import { warmCaches } from "@/lib/cache-warmup";
import { prisma } from "@/lib/prisma";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    scope: "globals-only" as "globals-only" | "all",
    includeFormStructures: false,
    organizationIds: undefined as string[] | undefined,
    quiet: false,
  };
  const orgs: string[] = [];
  for (const arg of args) {
    if (arg === "--all") opts.scope = "all";
    else if (arg === "--forms") opts.includeFormStructures = true;
    else if (arg === "--quiet" || arg === "-q") opts.quiet = true;
    else if (arg.startsWith("--org=")) {
      orgs.push(arg.slice("--org=".length));
      opts.scope = "all";
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (orgs.length > 0) opts.organizationIds = orgs;
  return opts;
}

async function main() {
  const opts = parseArgs();
  const log = opts.quiet ? () => {} : (msg: string) => console.log(msg);

  const report = await warmCaches({
    scope: opts.scope,
    includeFormStructures: opts.includeFormStructures,
    organizationIds: opts.organizationIds,
    log,
  });

  // Pretty summary at the end so it's obvious in CI logs whether anything
  // failed without scrolling through every per-step line.
  console.log("");
  console.log("━━━ Cache warmup report ━━━");
  console.log(`  elapsed:  ${report.elapsedMs} ms`);
  console.log(`  scope:    ${opts.scope}`);
  console.log(
    `  redis:    ${Object.entries(report.redisReachable)
      .map(([n, ok]) => `${n}=${ok ? "ok" : "DOWN"}`)
      .join(" ")}`
  );
  console.log(
    `  globals:  fieldTypes=${report.globals.fieldTypes} leaveTypes=${report.globals.leaveTypes} leaveRules=${report.globals.leaveRules} permIds=${report.globals.permissionIds}`
  );
  console.log(`  orgs:     ${report.perOrg.length}`);
  for (const o of report.perOrg) {
    console.log(
      `    - ${o.organizationId}: attendance=${o.attendanceConfig} payroll=${o.payrollConfig} employees=${o.employeeRecords} forms=${o.formStructures}${o.formCount ? `(${o.formCount})` : ""}`
    );
  }
  if (report.errors.length > 0) {
    console.log(`  errors:   ${report.errors.length}`);
    for (const e of report.errors) {
      console.log(`    - [${e.scope}] ${e.message}`);
    }
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((err) => {
    console.error("[warm-cache] fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    // Tear down both Prisma and any Redis clients so node exits cleanly.
    await prisma.$disconnect().catch(() => {});
    // ioredis clients are pinned to globalThis; quit them so the process exits.
    const g = globalThis as any;
    const clients: Map<string, any> | undefined = g.__erpRedisClients;
    if (clients) {
      await Promise.all(
        Array.from(clients.values())
          .filter((c) => c && typeof c.quit === "function")
          .map((c) => c.quit().catch(() => {}))
      );
    }
  });
