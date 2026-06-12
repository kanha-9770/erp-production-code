/**
 * Seed / sync Approval Processes from a role-based config — ONE idempotent run.
 *
 * Creates (or updates) approval processes for inventory + purchase, assigns
 * approver stages by ROLE NAME (and/or user email), and grants the per-module
 * "Manage Approval Processes" permission to the chosen admin roles. Safe to
 * re-run in production: processes are matched by (module, submodule, name) and
 * updated in place; permission grants are upserted.
 *
 * Usage:
 *   npx tsx scripts/seed-approval-processes.ts --org "Acme Corp"
 *   npx tsx scripts/seed-approval-processes.ts --orgId <id> --config ./my-approvals.json
 *   npx tsx scripts/seed-approval-processes.ts --org "Acme Corp" --dry
 *
 * Config (JSON) shape — see DEFAULT_CONFIG below for a worked example:
 *   {
 *     "manageRoles": { "inventory": ["Admin"], "purchase": ["Purchase Manager"] },
 *     "processes": [
 *       {
 *         "module": "purchase", "submodule": "po", "name": "PO Approval",
 *         "trigger": "BOTH",
 *         "scope": { "type": "section", "sections": ["Approval"] },
 *         "criteria": { "matchMode": "ALL", "rules": [{ "field": "amount", "op": "gt", "value": "100000" }] },
 *         "stages": [
 *           { "name": "Manager", "mode": "ANY", "roles": ["Purchase Manager"] },
 *           { "name": "Finance", "mode": "ALL", "roles": ["Finance Head"], "users": ["cfo@acme.com"] }
 *         ],
 *         "onApprove": { "setStatus": "APPROVED" }
 *       }
 *     ]
 *   }
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

const MANAGE_PERM: Record<string, { name: string; description: string }> = {
  inventory: {
    name: "MANAGE_INVENTORY_APPROVAL_PROCESS",
    description: "Create, edit, activate and delete inventory approval processes.",
  },
  purchase: {
    name: "MANAGE_PURCHASE_APPROVAL_PROCESS",
    description: "Create, edit, activate and delete purchase approval processes.",
  },
};

type Scope =
  | { type: "record" }
  | { type: "section"; sections: string[] }
  | { type: "fields"; fields: string[] };

interface StageCfg {
  name?: string;
  mode?: "ALL" | "ANY";
  roles?: string[]; // role NAMES
  users?: string[]; // user EMAILS
}
interface ProcessCfg {
  module: "inventory" | "purchase";
  submodule: string;
  name: string;
  description?: string;
  trigger?: "CREATE" | "EDIT" | "BOTH";
  scope?: Scope;
  criteria?: { matchMode?: "ALL" | "ANY"; rules?: Array<{ field: string; op: string; value?: string }> };
  stages: StageCfg[];
  onApprove?: { setStatus?: string; setFields?: Record<string, unknown> } | null;
  onReject?: { setStatus?: string; setFields?: Record<string, unknown> } | null;
  adminUsers?: string[]; // process-admin user EMAILS
  isActive?: boolean;
  sortOrder?: number;
}
interface Config {
  manageRoles?: { inventory?: string[]; purchase?: string[] };
  processes: ProcessCfg[];
}

// A minimal, sensible default so the script does something useful out of the box.
const DEFAULT_CONFIG: Config = {
  manageRoles: { inventory: ["Admin"], purchase: ["Admin"] },
  processes: [
    {
      module: "purchase",
      submodule: "pr",
      name: "Requisition Approval",
      description: "All purchase requisitions are approved by the department head.",
      trigger: "BOTH",
      scope: { type: "record" },
      stages: [{ name: "Department Head", mode: "ANY", roles: ["Department Head", "Admin"] }],
      onApprove: { setStatus: "APPROVED" },
      onReject: { setStatus: "REJECTED" },
    },
    {
      module: "purchase",
      submodule: "po",
      name: "PO Approval (Pricing)",
      description: "Edits to the PO pricing/approval section require sign-off.",
      trigger: "EDIT",
      scope: { type: "section", sections: ["Approval"] },
      stages: [
        { name: "Purchase Manager", mode: "ANY", roles: ["Purchase Manager", "Admin"] },
        { name: "Finance", mode: "ANY", roles: ["Finance Head", "Admin"] },
      ],
      onApprove: { setStatus: "APPROVED" },
    },
    {
      module: "inventory",
      submodule: "store",
      name: "New Store Item Approval",
      description: "New store items are approved before going live.",
      trigger: "CREATE",
      scope: { type: "record" },
      stages: [{ name: "Inventory Manager", mode: "ANY", roles: ["Inventory Manager", "Admin"] }],
      onApprove: { setStatus: "ACTIVE" },
    },
  ],
};

// ── args ──
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry");

async function resolveOrg(): Promise<{ id: string; name: string }> {
  const orgId = arg("--orgId");
  const orgName = arg("--org");
  if (orgId) {
    const o = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } });
    if (!o) throw new Error(`No organization with id ${orgId}`);
    return o;
  }
  if (orgName) {
    const o = await prisma.organization.findFirst({ where: { name: orgName }, select: { id: true, name: true } });
    if (!o) throw new Error(`No organization named "${orgName}"`);
    return o;
  }
  const all = await prisma.organization.findMany({ select: { id: true, name: true }, take: 2 });
  if (all.length === 1) return all[0];
  throw new Error("Specify --org \"<name>\" or --orgId <id> (multiple organizations exist).");
}

async function ensurePermission(organizationId: string, name: string, description: string): Promise<string> {
  const existing = await prisma.permission.findFirst({ where: { name }, select: { id: true, organizationId: true } });
  if (existing) return existing.id; // name is globally unique
  const created = await prisma.permission.create({
    data: { name, description, category: "SPECIAL", resource: "approval", organizationId, isActive: true },
    select: { id: true },
  });
  return created.id;
}

async function grantManage(organizationId: string, module: string, roleNames: string[], roleByName: Map<string, string>) {
  const def = MANAGE_PERM[module];
  if (!def || roleNames.length === 0) return;
  const permissionId = await ensurePermission(organizationId, def.name, def.description);
  for (const roleName of roleNames) {
    const roleId = roleByName.get(roleName.toLowerCase());
    if (!roleId) {
      console.warn(`  ⚠ manage-grant: role "${roleName}" not found — skipped`);
      continue;
    }
    if (DRY) {
      console.log(`  [dry] grant ${def.name} → role "${roleName}"`);
      continue;
    }
    const exists = await prisma.rolePermission.findFirst({
      where: { roleId, permissionId, moduleId: null, formId: null, sectionId: null, pagePath: null },
      select: { id: true },
    });
    if (!exists) await prisma.rolePermission.create({ data: { roleId, permissionId, granted: true } });
    console.log(`  ✓ grant ${def.name} → role "${roleName}"`);
  }
}

function buildStages(stages: StageCfg[], roleByName: Map<string, string>, userByEmail: Map<string, string>) {
  return stages
    .map((s) => {
      const approverRoleIds = (s.roles ?? [])
        .map((r) => {
          const id = roleByName.get(r.toLowerCase());
          if (!id) console.warn(`    ⚠ stage role "${r}" not found — skipped`);
          return id;
        })
        .filter((x): x is string => !!x);
      const approverUserIds = (s.users ?? [])
        .map((e) => {
          const id = userByEmail.get(e.toLowerCase());
          if (!id) console.warn(`    ⚠ stage user "${e}" not found — skipped`);
          return id;
        })
        .filter((x): x is string => !!x);
      return {
        name: s.name,
        mode: s.mode === "ALL" ? "ALL" : "ANY",
        approverUserIds,
        approverRoleIds,
      };
    })
    .filter((s) => s.approverUserIds.length + s.approverRoleIds.length > 0);
}

async function upsertProcess(
  organizationId: string,
  cfg: ProcessCfg,
  roleByName: Map<string, string>,
  userByEmail: Map<string, string>,
) {
  const stages = buildStages(cfg.stages ?? [], roleByName, userByEmail);
  if (stages.length === 0) {
    console.warn(`  ⚠ "${cfg.name}" (${cfg.module}/${cfg.submodule}): no resolvable approvers — skipped`);
    return;
  }
  const criteria = {
    matchMode: cfg.criteria?.matchMode === "ANY" ? "ANY" : "ALL",
    rules: (cfg.criteria?.rules ?? []).filter((r) => r && r.field && r.op),
    ...(cfg.scope && cfg.scope.type !== "record" ? { scope: cfg.scope } : {}),
  };
  const adminUserIds = (cfg.adminUsers ?? [])
    .map((e) => userByEmail.get(e.toLowerCase()))
    .filter((x): x is string => !!x);

  const data = {
    submodule: cfg.submodule,
    name: cfg.name,
    description: cfg.description ?? null,
    isActive: cfg.isActive !== false,
    sortOrder: cfg.sortOrder ?? 0,
    trigger: (cfg.trigger ?? "BOTH") as "CREATE" | "EDIT" | "BOTH",
    criteria: criteria as unknown as Prisma.InputJsonValue,
    stages: stages as unknown as Prisma.InputJsonValue,
    onApprove: (cfg.onApprove ?? Prisma.DbNull) as Prisma.InputJsonValue,
    onReject: (cfg.onReject ?? Prisma.DbNull) as Prisma.InputJsonValue,
    adminUserIds: adminUserIds as unknown as Prisma.InputJsonValue,
  };

  const existing = await prisma.approvalProcess.findFirst({
    where: { organizationId, module: cfg.module, submodule: cfg.submodule, name: cfg.name },
    select: { id: true },
  });

  if (DRY) {
    console.log(`  [dry] ${existing ? "update" : "create"} "${cfg.name}" (${cfg.module}/${cfg.submodule}), ${stages.length} stage(s)`);
    return;
  }
  if (existing) {
    await prisma.approvalProcess.update({ where: { id: existing.id }, data });
    console.log(`  ✓ updated "${cfg.name}" (${cfg.module}/${cfg.submodule})`);
  } else {
    await prisma.approvalProcess.create({ data: { organizationId, module: cfg.module, ...data } });
    console.log(`  ✓ created "${cfg.name}" (${cfg.module}/${cfg.submodule})`);
  }
}

async function main() {
  console.log("=".repeat(64));
  console.log("  Seed / Sync Approval Processes" + (DRY ? "  [DRY RUN]" : ""));
  console.log("=".repeat(64));

  const org = await resolveOrg();
  console.log(`Organization: ${org.name} (${org.id})`);

  const configPath = arg("--config");
  const config: Config = configPath ? JSON.parse(readFileSync(configPath, "utf8")) : DEFAULT_CONFIG;
  console.log(`Config: ${configPath ?? "built-in default"} — ${config.processes.length} process(es)`);

  // Resolve directory once.
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { organizationId: org.id }, select: { id: true, email: true } }),
  ]);
  const roleByName = new Map(roles.map((r) => [r.name.toLowerCase(), r.id]));
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  console.log(`Resolved ${roles.length} role(s), ${users.length} user(s).\n`);

  console.log("Manage-permission grants:");
  await grantManage(org.id, "inventory", config.manageRoles?.inventory ?? [], roleByName);
  await grantManage(org.id, "purchase", config.manageRoles?.purchase ?? [], roleByName);

  console.log("\nApproval processes:");
  for (const cfg of config.processes) {
    await upsertProcess(org.id, cfg, roleByName, userByEmail);
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error("\n✗ Failed:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
