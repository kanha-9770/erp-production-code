import { prisma } from "@/lib/prisma";
import { patternToRegex } from "@/lib/route-permissions";

/**
 * Server-side route permission checker (authoritative, DB-backed).
 * Used by layouts for real-time permission validation.
 *
 * Policy:
 *  1. Admin → always allowed
 *  2. Route has DB permission with access rules → user needs explicit grant
 *  3. Route has DB permission but no access rules yet → open (not restricted)
 *  4. Route has no DB permission record → open by default
 */
export async function checkRoutePermission(
  userId: string,
  pathname: string
): Promise<{ allowed: boolean; isAdmin: boolean }> {
  console.log(`[check-route-perm] START user=${userId} path=${pathname}`);

  // 1. Get user info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      organizationId: true,
      unitAssignments: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              isAdmin: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    console.warn(`[check-route-perm] DENIED user=${userId} path=${pathname} reason="user not found"`);
    return { allowed: false, isAdmin: false };
  }

  const roleNames = user.unitAssignments.map((ua) => ua.role.name);
  const roleIds = user.unitAssignments.map((ua) => ua.role.id);

  // 2. Admin bypasses everything
  const isAdmin = user.unitAssignments.some(
    (ua) => ua.role.isAdmin || ua.role.name.toUpperCase() === "ADMIN"
  );

  if (isAdmin) {
    console.log(
      `[check-route-perm] ALLOWED user=${user.email} path=${pathname} reason="admin" roles=[${roleNames}]`
    );
    return { allowed: true, isAdmin: true };
  }

  // 3. Check DB RoutePermission records
  if (!user.organizationId) {
    console.log(
      `[check-route-perm] ALLOWED user=${user.email} path=${pathname} reason="no organization (open)"`
    );
    return { allowed: true, isAdmin: false };
  }

  const dbRoutePermissions = await prisma.routePermission.findMany({
    where: { organizationId: user.organizationId },
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

  console.log(
    `[check-route-perm] user=${user.email} path=${pathname} roles=[${roleNames}] roleIds=[${roleIds}] dbRoutes=${dbRoutePermissions.length}`
  );

  for (const rp of dbRoutePermissions) {
    const regex = patternToRegex(rp.pattern);
    if (!regex.test(pathname)) continue;

    console.log(
      `[check-route-perm] MATCHED pattern="${rp.pattern}" roleAccess=${rp.roleAccess.length} userAccess=${rp.userAccess.length}`
    );

    // Route exists in DB but no roles/users granted = deny non-admins
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) {
      console.warn(
        `[check-route-perm] DENIED user=${user.email} path=${pathname} reason="route registered but no access rules granted" pattern="${rp.pattern}"`
      );
      return { allowed: false, isAdmin: false };
    }

    // User-level override
    const userEntry = rp.userAccess.find((ua) => ua.userId === userId);
    if (userEntry) {
      console.log(
        `[check-route-perm] ${userEntry.granted ? "ALLOWED" : "DENIED"} user=${user.email} path=${pathname} reason="userAccess" granted=${userEntry.granted}`
      );
      return { allowed: userEntry.granted, isAdmin: false };
    }

    // Role-level check
    const matchingRoles = rp.roleAccess.filter((ra) => roleIds.includes(ra.roleId));
    const hasRoleAccess = matchingRoles.some((ra) => ra.granted);

    console.log(
      `[check-route-perm] roleCheck: totalRoleAccess=${rp.roleAccess.length} matchingUserRoles=${matchingRoles.length} hasGrant=${hasRoleAccess} roleAccessDetails=${JSON.stringify(rp.roleAccess)} userRoleIds=[${roleIds}]`
    );

    if (hasRoleAccess) {
      console.log(
        `[check-route-perm] ALLOWED user=${user.email} path=${pathname} reason="roleAccess" pattern="${rp.pattern}"`
      );
      return { allowed: true, isAdmin: false };
    }

    console.warn(
      `[check-route-perm] DENIED user=${user.email} path=${pathname} reason="no grant for user's roles" pattern="${rp.pattern}"`
    );
    return { allowed: false, isAdmin: false };
  }

  // No DB rule matched → open
  console.log(
    `[check-route-perm] ALLOWED user=${user.email} path=${pathname} reason="no route permission configured (open)"`
  );
  return { allowed: true, isAdmin: false };
}
