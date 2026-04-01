import { prisma } from "@/lib/prisma";
import { patternToRegex } from "@/lib/route-permissions";

/**
 * Routes that are always accessible to any logged-in user.
 */
const ALWAYS_OPEN_ROUTES = new Set([
  "/",
  "/profile",
  "/profile/security",
  "/profile/update-profile",
  "/chatbot",
  "/settings",
  "/settings/permission",
  "/settings/permission/roles",
  "/settings/permission/route",
]);

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

  // Collect all matching patterns — check ALL of them so a specific grant
  // (e.g. "/admin/modules") is not shadowed by a broad deny ("/admin/**").
  let hasAnyMatch = false;
  let bestAllowed = false;

  for (const rp of dbRoutePermissions) {
    const regex = patternToRegex(rp.pattern);
    if (!regex.test(pathname)) continue;

    hasAnyMatch = true;

    console.log(
      `[check-route-perm] MATCHED pattern="${rp.pattern}" roleAccess=${rp.roleAccess.length} userAccess=${rp.userAccess.length}`
    );

    // Route exists in DB but no access rules configured yet
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) {
      if (ALWAYS_OPEN_ROUTES.has(pathname)) {
        console.log(
          `[check-route-perm] ALLOWED user=${user.email} path=${pathname} reason="always-open route" pattern="${rp.pattern}"`
        );
        bestAllowed = true;
      }
      continue;
    }

    // User-level override (most specific — if found, it wins)
    const userEntry = rp.userAccess.find((ua) => ua.userId === userId);
    if (userEntry) {
      console.log(
        `[check-route-perm] ${userEntry.granted ? "ALLOWED" : "DENIED"} user=${user.email} path=${pathname} reason="userAccess" granted=${userEntry.granted} pattern="${rp.pattern}"`
      );
      if (userEntry.granted) bestAllowed = true;
      continue;
    }

    // Role-level check
    const matchingRoles = rp.roleAccess.filter((ra) => roleIds.includes(ra.roleId));
    const hasRoleAccess = matchingRoles.some((ra) => ra.granted);

    console.log(
      `[check-route-perm] roleCheck: pattern="${rp.pattern}" totalRoleAccess=${rp.roleAccess.length} matchingUserRoles=${matchingRoles.length} hasGrant=${hasRoleAccess} userRoleIds=[${roleIds}]`
    );

    if (hasRoleAccess) {
      bestAllowed = true;
    }
  }

  if (hasAnyMatch) {
    console.log(
      `[check-route-perm] ${bestAllowed ? "ALLOWED" : "DENIED"} user=${user.email} path=${pathname} reason="${bestAllowed ? "grant found across matching patterns" : "no grant for user's roles in any matching pattern"}"`
    );
    return { allowed: bestAllowed, isAdmin: false };
  }

  // No DB rule matched → open
  console.log(
    `[check-route-perm] ALLOWED user=${user.email} path=${pathname} reason="no route permission configured (open)"`
  );
  return { allowed: true, isAdmin: false };
}
