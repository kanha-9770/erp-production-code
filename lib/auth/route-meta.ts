import { prisma } from "@/lib/prisma";

export interface RouteMetaResult {
  deniedRoutes: string[];
  allowedRoutes: string[];
  allowedModuleIds: string[];
}

/**
 * Compute the user's route + module access from DB.
 */
export async function computeRouteMeta(
  userId: string,
  organizationId: string | null,
  roleIds: string[]
): Promise<RouteMetaResult> {
  console.log(
    `[route-meta] START user=${userId} org=${organizationId} roleIds=[${roleIds}]`
  );

  if (!organizationId) {
    console.log(`[route-meta] no org → returning empty (all routes open)`);
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

  console.log(
    `[route-meta] found ${dbRoutePermissions.length} RoutePermission records for org=${organizationId}`
  );

  const denied: string[] = [];
  const allowed: string[] = [];

  for (const rp of dbRoutePermissions) {
    // Route exists in DB but no one granted = deny non-admins
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) {
      denied.push(rp.pattern);
      console.log(`[route-meta]   pattern="${rp.pattern}" → DENIED (no access rules granted)`);
      continue;
    }

    // User-level override
    const userEntry = rp.userAccess.find((ua) => ua.userId === userId);
    if (userEntry) {
      if (userEntry.granted) {
        allowed.push(rp.pattern);
        console.log(`[route-meta]   pattern="${rp.pattern}" → ALLOWED (user-level grant)`);
      } else {
        denied.push(rp.pattern);
        console.log(`[route-meta]   pattern="${rp.pattern}" → DENIED (user-level denial)`);
      }
      continue;
    }

    // Role-level check
    const matchingRoleAccess = rp.roleAccess.filter((ra) => roleIds.includes(ra.roleId));
    const hasRoleGrant = matchingRoleAccess.some((ra) => ra.granted);

    if (hasRoleGrant) {
      allowed.push(rp.pattern);
      console.log(
        `[route-meta]   pattern="${rp.pattern}" → ALLOWED (role grant) matchingRoles=${matchingRoleAccess.length}`
      );
    } else {
      denied.push(rp.pattern);
      console.log(
        `[route-meta]   pattern="${rp.pattern}" → DENIED (no role grant) totalRoleAccess=${rp.roleAccess.length} matchingRoles=${matchingRoleAccess.length}`
      );
    }
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

    console.log(
      `[route-meta] found ${roleModulePerms.length} role VIEW module permissions`
    );

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

  console.log(`[route-meta] found ${userModulePerms.length} user module permissions`);

  for (const ump of userModulePerms) {
    if (!ump.moduleId) continue;
    if (ump.canView && ump.granted) {
      allowedModuleIdSet.add(ump.moduleId);
    } else if (!ump.canView || !ump.granted) {
      allowedModuleIdSet.delete(ump.moduleId);
    }
  }

  const allowedModuleIds = [...allowedModuleIdSet];

  console.log(
    `[route-meta] RESULT denied=[${denied}] allowed=[${allowed}] allowedModules=${allowedModuleIds.length}`
  );

  return { deniedRoutes: denied, allowedRoutes: allowed, allowedModuleIds };
}
