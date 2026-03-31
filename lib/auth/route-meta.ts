import { prisma } from "@/lib/prisma";

export interface RouteMetaResult {
  /** Route patterns the user is explicitly DENIED (DB has rules, user has no grant) */
  deniedRoutes: string[];
  /** Route patterns the user is explicitly ALLOWED via DB (overrides hardcoded rules) */
  allowedRoutes: string[];
}

/**
 * Compute the user's route access from DB-stored RoutePermission records.
 *
 * Returns both denied and allowed route patterns. The `allowedRoutes` are
 * important because they let the middleware know that a DB grant overrides
 * any hardcoded rule (e.g. IMPORT_DATA requirement for /settings/import).
 *
 * Policy:
 *  - Routes with NO access rules (empty roleAccess + userAccess) are OPEN
 *  - Routes with access rules → user needs an explicit grant
 *  - User-level access overrides role-level access
 */
export async function computeRouteMeta(
  userId: string,
  organizationId: string | null,
  roleIds: string[]
): Promise<RouteMetaResult> {
  if (!organizationId) return { deniedRoutes: [], allowedRoutes: [] };

  const dbRoutePermissions = await prisma.routePermission.findMany({
    where: { organizationId },
    select: {
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
    // If no access rules exist, the route is open (not restricted yet)
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) {
      continue;
    }

    // User-level override takes priority
    const userEntry = rp.userAccess.find((ua) => ua.userId === userId);
    if (userEntry) {
      if (userEntry.granted) {
        allowed.push(rp.pattern);
      } else {
        denied.push(rp.pattern);
      }
      continue;
    }

    // Check role-level access
    const hasRoleAccess = rp.roleAccess.some(
      (ra) => roleIds.includes(ra.roleId) && ra.granted
    );
    if (hasRoleAccess) {
      allowed.push(rp.pattern);
    } else {
      denied.push(rp.pattern);
    }
  }

  console.log(
    `[route-meta] user=${userId} org=${organizationId} roles=[${roleIds}] allowed=[${allowed}] denied=[${denied}]`
  );

  return { deniedRoutes: denied, allowedRoutes: allowed };
}
