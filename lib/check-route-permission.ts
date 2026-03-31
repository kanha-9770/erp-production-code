import { prisma } from "@/lib/prisma";
import { patternToRegex } from "@/lib/route-permissions";

const LOG_PREFIX = "[route-permission]";

/**
 * Server-side route permission checker (authoritative, DB-backed).
 * Used by layouts for real-time permission validation.
 *
 * Single source of truth: DB RoutePermission records configured via the UI.
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
    console.warn(`${LOG_PREFIX} DENIED user=${userId} path=${pathname} reason="user not found"`);
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
      `${LOG_PREFIX} ALLOWED user=${user.email} path=${pathname} reason="admin" roles=[${roleNames}]`
    );
    return { allowed: true, isAdmin: true };
  }

  // 3. Check DB RoutePermission records for this organization
  if (!user.organizationId) {
    console.log(
      `${LOG_PREFIX} ALLOWED user=${user.email} path=${pathname} reason="no organization"`
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

  for (const rp of dbRoutePermissions) {
    const regex = patternToRegex(rp.pattern);
    if (!regex.test(pathname)) continue;

    // Route exists in DB but has no access rules → not restricted yet
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) {
      console.log(
        `${LOG_PREFIX} ALLOWED user=${user.email} path=${pathname} reason="no access rules configured yet" pattern="${rp.pattern}"`
      );
      return { allowed: true, isAdmin: false };
    }

    // User-level access overrides role-level
    const userEntry = rp.userAccess.find((ua) => ua.userId === userId);
    if (userEntry) {
      const verdict = userEntry.granted ? "ALLOWED" : "DENIED";
      console.log(
        `${LOG_PREFIX} ${verdict} user=${user.email} path=${pathname} reason="userAccess" pattern="${rp.pattern}" granted=${userEntry.granted}`
      );
      return { allowed: userEntry.granted, isAdmin: false };
    }

    // Check role-level access
    const hasRoleAccess = rp.roleAccess.some(
      (ra) => roleIds.includes(ra.roleId) && ra.granted
    );
    if (hasRoleAccess) {
      console.log(
        `${LOG_PREFIX} ALLOWED user=${user.email} path=${pathname} reason="roleAccess" pattern="${rp.pattern}" roles=[${roleNames}]`
      );
      return { allowed: true, isAdmin: false };
    }

    // Route is restricted and user has no grant → deny
    console.warn(
      `${LOG_PREFIX} DENIED user=${user.email} path=${pathname} reason="no grant" pattern="${rp.pattern}" roles=[${roleNames}]`
    );
    return { allowed: false, isAdmin: false };
  }

  // No DB rule matched → route is open
  console.log(
    `${LOG_PREFIX} ALLOWED user=${user.email} path=${pathname} reason="no route permission configured (open)"`
  );
  return { allowed: true, isAdmin: false };
}
