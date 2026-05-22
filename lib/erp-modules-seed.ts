/**
 * Seeding helpers for selected ERP modules.
 *
 * When an org turns on (or off) an ERP module — either at sign-up or via
 * Settings → ERP Modules — we make sure the sidebar is populated:
 *
 *   - Modules WITH a nested blueprint (see lib/default-sidebar-blueprint.ts)
 *     get their full folder tree built as FormModule rows and every listed
 *     static page pinned under the right folder via a PAGE-LEVEL
 *     StaticPageAnchor.
 *   - Modules WITHOUT a blueprint fall back to the original behaviour: a
 *     single top-level FormModule plus one GROUP-LEVEL anchor per owned
 *     static-page group.
 *
 * Idempotency & data safety
 * --------------------------
 *   - FormModules are looked up by (org, parentId, name) and reused, so
 *     re-running never duplicates folders. The top-level folder is also
 *     matched against `legacyLabels` and renamed in place so an org created
 *     before a rename migrates without losing custom forms underneath.
 *   - Page-level anchors are created with `skipDuplicates`, so an admin's
 *     manual re-anchoring of a page (an existing (org, path) row) is preserved
 *     across re-seeds while newly-added blueprint pages still get seeded.
 *   - Group anchors are fully reconciled each run (wiped + recreated) for
 *     non-blueprint modules only — blueprint modules use page anchors instead.
 *   - We never delete FormModule rows; turning a module OFF just stops
 *     re-anchoring its pages.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { ERP_MODULES, type ErpModuleDef } from "./erp-modules";
import type { StaticPageGroup } from "./static-pages";
import {
  getBlueprint,
  BLUEPRINT_MODULE_IDS,
  type ModuleBlueprint,
  type SidebarBlueprintNode,
} from "./default-sidebar-blueprint";

const GROUP_PATH_PREFIX = "group:";
const SEEDED_MODULE_TYPE = "erp_module";

/** Anything we can call `.formModule`, `.staticPageAnchor` etc. on. */
type Db =
  | PrismaClient
  | Prisma.TransactionClient
  | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** A page-level anchor we intend to create: pin `path` under `moduleId`. */
interface PageAnchorPlan {
  path: string;
  moduleId: string;
  sortOrder: number;
}

/**
 * Ensure a FormModule folder exists at (org, parentId, name); reuse it if so.
 * Keeps icon / sortOrder / level / active in sync on every run so blueprint
 * tweaks propagate. Returns the folder id.
 */
async function ensureFolder(
  db: Db,
  args: {
    organizationId: string;
    name: string;
    parentId: string | null;
    sortOrder: number;
    level: number;
    icon?: string;
    description?: string;
  },
): Promise<string> {
  const { organizationId, name, parentId, sortOrder, level, icon, description } =
    args;

  const existing = await (db as PrismaClient).formModule.findFirst({
    // parentId null vs a value both work — Prisma treats `null` as IS NULL.
    where: { organizationId, name, parentId: parentId ?? null },
    select: { id: true },
  });

  if (existing) {
    await (db as PrismaClient).formModule.update({
      where: { id: existing.id },
      data: {
        moduleType: SEEDED_MODULE_TYPE,
        isActive: true,
        sortOrder,
        level,
        ...(icon !== undefined ? { icon } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
    return existing.id;
  }

  const created = await (db as PrismaClient).formModule.create({
    data: {
      organizationId,
      name,
      parentId: parentId ?? undefined,
      moduleType: SEEDED_MODULE_TYPE,
      isActive: true,
      sortOrder,
      level,
      icon,
      description,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Ensure the top-level module folder exists, migrating any legacy-named folder
 * in place (rename) so we never strand the custom forms an admin built under
 * the old name. Returns the folder id.
 */
async function ensureTopFolder(
  db: Db,
  organizationId: string,
  bp: ModuleBlueprint,
  sortOrder: number,
): Promise<string> {
  const candidateNames = [bp.topLabel, ...(bp.legacyLabels ?? [])];

  const existing = await (db as PrismaClient).formModule.findFirst({
    where: {
      organizationId,
      moduleType: SEEDED_MODULE_TYPE,
      parentId: null,
      name: { in: candidateNames },
    },
    select: { id: true, name: true },
  });

  if (existing) {
    await (db as PrismaClient).formModule.update({
      where: { id: existing.id },
      data: {
        name: bp.topLabel,
        icon: bp.topIcon,
        description: bp.topDescription,
        isActive: true,
        sortOrder,
        level: 0,
      },
    });
    return existing.id;
  }

  const created = await (db as PrismaClient).formModule.create({
    data: {
      organizationId,
      name: bp.topLabel,
      description: bp.topDescription,
      icon: bp.topIcon,
      moduleType: SEEDED_MODULE_TYPE,
      isActive: true,
      sortOrder,
      level: 0,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Recursively build the folder tree under `parentId`, collecting the page
 * anchors to create. `anchorSeq` is a mutable counter so anchor sortOrder is
 * globally increasing (final leaf order is still re-derived by the anchor
 * resolver from the static-page registry).
 */
async function seedTree(
  db: Db,
  organizationId: string,
  nodes: SidebarBlueprintNode[],
  parentId: string,
  level: number,
  anchors: PageAnchorPlan[],
  anchorSeq: { n: number },
): Promise<void> {
  let order = 0;
  for (const node of nodes) {
    const folderId = await ensureFolder(db, {
      organizationId,
      name: node.name,
      parentId,
      sortOrder: order,
      level,
      icon: node.icon,
    });
    order += 1;

    for (const path of node.pages ?? []) {
      anchors.push({ path, moduleId: folderId, sortOrder: anchorSeq.n++ });
    }

    if (node.children && node.children.length > 0) {
      await seedTree(
        db,
        organizationId,
        node.children,
        folderId,
        level + 1,
        anchors,
        anchorSeq,
      );
    }
  }
}

/**
 * Ensure a FormModule exists for each selected ERP module, build any nested
 * blueprint folders, and anchor static pages so the sidebar is populated out
 * of the box.
 *
 * Returns the map of ERP module id → top-level FormModule id.
 *
 * Idempotent: safe to call repeatedly (org creation, settings toggle, backfill).
 */
export async function ensureErpModuleSidebar(
  db: Db,
  organizationId: string,
  selectedModules: string[],
): Promise<Record<string, string>> {
  const selected = new Set(selectedModules);
  const moduleIdByErpId: Record<string, string> = {};
  const pageAnchors: PageAnchorPlan[] = [];
  const anchorSeq = { n: 0 };

  // Walk the catalog in its declared order so top-level folder sortOrder is
  // stable across runs.
  let topSort = 0;
  for (const m of ERP_MODULES) {
    if (!selected.has(m.id)) continue;

    const bp = getBlueprint(m.id);
    if (bp) {
      // Blueprint module: full nested tree + page-level anchors.
      const topId = await ensureTopFolder(db, organizationId, bp, topSort);
      moduleIdByErpId[m.id] = topId;

      for (const path of bp.topPages ?? []) {
        pageAnchors.push({ path, moduleId: topId, sortOrder: anchorSeq.n++ });
      }
      await seedTree(
        db,
        organizationId,
        bp.tree,
        topId,
        1,
        pageAnchors,
        anchorSeq,
      );
    } else {
      // Non-blueprint module: single top folder, group anchors added below.
      const existing = await (db as PrismaClient).formModule.findFirst({
        where: {
          organizationId,
          moduleType: SEEDED_MODULE_TYPE,
          name: m.label,
          parentId: null,
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
              sortOrder: topSort,
              level: 0,
            },
            select: { id: true },
          });
      moduleIdByErpId[m.id] = fm.id;
    }

    topSort += 10;
  }

  // ── Group anchors (non-blueprint modules only) ──────────────────────────
  // Wipe every group anchor for the org, then recreate only the ones owned by
  // selected NON-blueprint modules. Blueprint modules express their pages as
  // page-level anchors (created below), which take priority over group anchors
  // in the resolver — so we must NOT also leave group anchors for them.
  await (db as PrismaClient).staticPageAnchor.deleteMany({
    where: { organizationId, path: { startsWith: GROUP_PATH_PREFIX } },
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
    if (BLUEPRINT_MODULE_IDS.has(m.id)) continue; // handled via page anchors
    const moduleId = moduleIdByErpId[m.id];
    if (!moduleId) continue;
    for (const g of m.groups as StaticPageGroup[]) {
      groupRows.push({
        organizationId,
        path: `${GROUP_PATH_PREFIX}${g}`,
        moduleId,
        sortOrder: groupSort++,
      });
    }
  }
  if (groupRows.length > 0) {
    await (db as PrismaClient).staticPageAnchor.createMany({
      data: groupRows,
      skipDuplicates: true,
    });
  }

  // ── Page anchors (blueprint modules) ────────────────────────────────────
  // skipDuplicates preserves any (org, path) row an admin already customised
  // while still seeding brand-new blueprint pages.
  if (pageAnchors.length > 0) {
    await (db as PrismaClient).staticPageAnchor.createMany({
      data: pageAnchors.map((a) => ({
        organizationId,
        path: a.path,
        moduleId: a.moduleId,
        sortOrder: a.sortOrder,
      })),
      skipDuplicates: true,
    });
  }

  return moduleIdByErpId;
}

/** Catalog re-export so callers don't need a second import. */
export function getErpModuleDef(id: string): ErpModuleDef | undefined {
  return ERP_MODULES.find((m) => m.id === id);
}
