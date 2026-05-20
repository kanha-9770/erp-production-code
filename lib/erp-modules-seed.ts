/**
 * Seeding helpers for selected ERP modules.
 *
 * When an org turns on (or off) an ERP module — either at sign-up or via
 * Settings → ERP Modules — we need to make sure:
 *
 *   1. A top-level `FormModule` exists for that module so the sidebar has a
 *      node to anchor static pages under.
 *   2. A group-level `StaticPageAnchor` row exists for each static-page
 *      group the module owns, pointing the group at that FormModule.
 *
 * Without (1) the sidebar tree has nothing to attach the static pages to.
 * Without (2) the static-page-anchors resolution returns "hidden" for every
 * page. Both are required for an out-of-the-box sidebar to look populated.
 *
 * Cleanup: turning a module OFF removes its group anchors. We DO NOT delete
 * the FormModule rows — admins may have created custom forms under them and
 * we'd be destroying user data. Re-enabling the module simply re-anchors.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { ERP_MODULES, type ErpModuleDef } from "./erp-modules";
import type { StaticPageGroup } from "./static-pages";

const GROUP_PATH_PREFIX = "group:";
const SEEDED_MODULE_TYPE = "erp_module";

/** Anything we can call `.formModule`, `.staticPageAnchor` etc. on. */
type Db =
  | PrismaClient
  | Prisma.TransactionClient
  | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Ensure a FormModule exists for each selected ERP module, and that every
 * owned static-page group is anchored to it. Returns the resulting map of
 * ERP module id → FormModule id so callers can persist it elsewhere if
 * needed.
 *
 * Idempotent: safe to call repeatedly. Existing FormModules with a matching
 * `(organizationId, moduleType, name)` are reused.
 */
export async function ensureErpModuleSidebar(
  db: Db,
  organizationId: string,
  selectedModules: string[]
): Promise<Record<string, string>> {
  const selected = new Set(selectedModules);
  const moduleIdByErpId: Record<string, string> = {};

  // 1) Ensure a FormModule per selected ERP module. We look it up by
  //    (org, moduleType=erp_module, name) so re-runs don't duplicate.
  let sortBase = 0;
  for (const m of ERP_MODULES) {
    if (!selected.has(m.id)) continue;

    const existing = await (db as PrismaClient).formModule.findFirst({
      where: {
        organizationId,
        moduleType: SEEDED_MODULE_TYPE,
        name: m.label,
      },
      select: { id: true },
    });

    const fm = existing
      ? existing
      : await (db as PrismaClient).formModule.create({
          data: {
            organizationId,
            name: m.label,
            description: m.description,
            icon: m.icon,
            moduleType: SEEDED_MODULE_TYPE,
            isActive: true,
            sortOrder: sortBase,
          },
          select: { id: true },
        });
    moduleIdByErpId[m.id] = fm.id;
    sortBase += 10;
  }

  // 2) Reconcile group anchors. The cleanest path is: wipe seeded group
  //    anchors for THIS org, then recreate just the active ones. Page-level
  //    overrides (paths that don't start with "group:") are left alone.
  await (db as PrismaClient).staticPageAnchor.deleteMany({
    where: {
      organizationId,
      path: { startsWith: GROUP_PATH_PREFIX },
    },
  });

  const groupRows: Array<{
    organizationId: string;
    path: string;
    moduleId: string;
    sortOrder: number;
  }> = [];
  let groupSort = 0;
  for (const m of ERP_MODULES) {
    if (!selected.has(m.id)) continue;
    const moduleId = moduleIdByErpId[m.id];
    if (!moduleId) continue;
    for (const g of m.groups as StaticPageGroup[]) {
      groupRows.push({
        organizationId,
        path: `${GROUP_PATH_PREFIX}${g}`,
        moduleId,
        sortOrder: groupSort,
      });
      groupSort += 1;
    }
  }

  if (groupRows.length > 0) {
    await (db as PrismaClient).staticPageAnchor.createMany({
      data: groupRows,
      skipDuplicates: true,
    });
  }

  return moduleIdByErpId;
}

/** Catalog re-export so callers don't need a second import. */
export function getErpModuleDef(id: string): ErpModuleDef | undefined {
  return ERP_MODULES.find((m) => m.id === id);
}
