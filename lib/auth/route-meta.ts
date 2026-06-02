import { prisma } from "@/lib/prisma";
import { isUserAdmin } from "@/lib/api-helpers";
import { resolveRouteAccess } from "@/lib/route-permissions";

export interface RouteMetaResult {
  deniedRoutes: string[];
  allowedRoutes: string[];
  allowedModuleIds: string[];
}

/**
 * Server-side counterpart to `useRouteAccess.isPermitted` — whitelist mode:
 * returns true ONLY when the path is explicitly granted (admin always wins).
 *
 * Used by static-page API routes (e.g. /api/attendance/team) so a user that
 * has been given role-level access via Settings → Permission can hit the
 * endpoint without being admin AND without being on the attendance-approver
 * role list. Open-by-default would let everyone hit admin endpoints; the
 * admin-or-explicit-grant gate is the safe middle ground.
 */
export async function userHasRouteAccess(
  userId: string,
  organizationId: string | null,
  path: string,
): Promise<boolean> {
  if (!userId) return false;
  if (await isUserAdmin(userId, organizationId)) return true;
  if (!organizationId) return false;

  // Resolve every role assigned to this user — same source the login flow
  // uses when it computes auth-meta. Kept in lockstep with computeRouteMeta
  // so the server gate cannot disagree with the client UI.
  const roleRows = await prisma.userUnitAssignment.findMany({
    where: { userId, user: { organizationId } },
    select: { roleId: true },
  });
  const roleIds = Array.from(new Set(roleRows.map((r) => r.roleId)));

  const meta = await computeRouteMeta(userId, organizationId, roleIds);
  return resolveRouteAccess(path, meta.allowedRoutes, meta.deniedRoutes) === true;
}

/**
 * Compute the user's route + module access from DB.
 *
 * Every route in the RoutePermission table is evaluated:
 *  - If the route has no access rules → it is NOT added to either list (open by default)
 *  - User-level override takes highest priority
 *  - Then role-level check
 *  - Granted → allowedRoutes, not granted → deniedRoutes
 *
 * The consumer (middleware / client guard) uses specificity-based matching
 * via resolveRouteAccess() so a specific deny (e.g. /profile/update-profile)
 * always wins over a general allow (e.g. /profile).
 */
export async function computeRouteMeta(
  userId: string,
  organizationId: string | null,
  roleIds: string[]
): Promise<RouteMetaResult> {
  if (!organizationId) {
    return { deniedRoutes: [], allowedRoutes: [], allowedModuleIds: [] };
  }

  // ── 1. Static route permissions ────────────────────────────────────────────
  const dbRoutePermissions = await prisma.routePermission.findMany({
    where: { organizationId },
    select: {
      id: true,
      pattern: true,
      roleAccess: {
        select: { roleId: true, granted: true },
      },
      userAccess: {
        select: { userId: true, granted: true },
      },
    },
  });

  const denied: string[] = [];
  const allowed: string[] = [];

  for (const rp of dbRoutePermissions) {
    // Route exists in DB but no access rules configured yet — open by default.
    // Don't add to either list so it stays unrestricted.
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) continue;

    // User-level override (most specific — if found, it wins)
    const userEntry = rp.userAccess.find((ua) => ua.userId === userId);
    if (userEntry) {
      (userEntry.granted ? allowed : denied).push(rp.pattern);
      continue;
    }

    // Role-level check
    const matchingRoleAccess = rp.roleAccess.filter((ra) => roleIds.includes(ra.roleId));
    const hasRoleGrant = matchingRoleAccess.some((ra) => ra.granted);
    (hasRoleGrant ? allowed : denied).push(rp.pattern);
  }

  // ── 2. Module-level VIEW access ────────────────────────────────────────────
  const allowedModuleIdSet = new Set<string>();

  if (roleIds.length > 0) {
    const roleModulePerms = await prisma.rolePermission.findMany({
      where: {
        roleId: { in: roleIds },
        granted: true,
        moduleId: { not: null },
        permission: { name: "VIEW" },
      },
      select: { moduleId: true, roleId: true },
    });

    for (const rmp of roleModulePerms) {
      if (rmp.moduleId) allowedModuleIdSet.add(rmp.moduleId);
    }
  }

  // User-level module permissions
  const userModulePerms = await prisma.userPermission.findMany({
    where: {
      userId,
      isActive: true,
      moduleId: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { moduleId: true, canView: true, granted: true },
  });

  for (const ump of userModulePerms) {
    if (!ump.moduleId) continue;
    if (ump.canView && ump.granted) {
      allowedModuleIdSet.add(ump.moduleId);
    } else if (!ump.canView || !ump.granted) {
      allowedModuleIdSet.delete(ump.moduleId);
    }
  }

  const allowedModuleIds = [...allowedModuleIdSet];

  return { deniedRoutes: denied, allowedRoutes: allowed, allowedModuleIds };
}
