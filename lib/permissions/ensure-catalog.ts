/**
 * Ensure the action-catalog's Permission rows exist for an org.
 *
 * Extracted from /api/action-permissions so the Approvals page AND the role
 * templates apply endpoint share ONE implementation (a named permission must be
 * created identically no matter which surface grants it).
 */

import { prisma } from "@/lib/prisma";
import { ALL_ACTION_PERMISSIONS } from "@/lib/permissions/action-catalog";

/**
 * Ensure a Permission row exists for every catalogued action in this org.
 * Returns a name → permissionId map (omitting any name whose globally-unique
 * row is owned by a different org — can't be managed here).
 *
 * Batched (3 queries total, not 1-2 per catalog entry): with ~60 catalogued
 * permissions and ~1.3s DB round-trips, per-entry queries are unusable.
 */
export async function ensureCatalogPermissions(
  organizationId: string,
): Promise<Map<string, string>> {
  const allNames = ALL_ACTION_PERMISSIONS.map((def) => def.name);

  // One read: which catalogued names already exist (any org — name is globally
  // unique, so a row owned by another org makes that name unmanageable here).
  const existing = await prisma.permission.findMany({
    where: { name: { in: allNames } },
    select: { id: true, name: true, organizationId: true },
  });
  const existingNames = new Set(existing.map((p) => p.name));

  // One write: create all missing rows. skipDuplicates absorbs races — if
  // another request (any org) created a name in between, the insert no-ops.
  const missing = ALL_ACTION_PERMISSIONS.filter((def) => !existingNames.has(def.name));
  if (missing.length > 0) {
    await prisma.permission.createMany({
      data: missing.map((def) => ({
        name: def.name,
        description: def.description,
        category: "SPECIAL",
        resource: def.module,
        organizationId,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  // One re-read to collect ids of the rows this org owns.
  const map = new Map<string, string>();
  const rows = missing.length
    ? await prisma.permission.findMany({
        where: { name: { in: allNames } },
        select: { id: true, name: true, organizationId: true },
      })
    : existing;
  for (const row of rows) {
    if (row.organizationId === organizationId) map.set(row.name, row.id);
  }
  return map;
}
