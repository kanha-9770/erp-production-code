import { prisma } from "@/lib/prisma";
import { patternToRegex, patternSpecificity } from "@/lib/route-permissions";

/**
 * Server-side route permission checker (authoritative, DB-backed).
 * Used by RouteGuardServer for real-time permission validation.
 *
 * Uses specificity-based matching so a specific deny
 * (e.g. /profile/update-profile) always wins over a general allow
 * (e.g. /profile or /profile/**).
 *
 * Policy:
 *  1. Admin → always allowed
 *  2. Route has DB permission with access rules → specificity-based resolution
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
    (ua) => ua.role.isAdmin || (ua.role.name ?? "").toLowerCase().includes("admin")
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

  // 4. Specificity-based matching:
  //    Collect ALL matching patterns, pick the most specific one.
  //    If two patterns have equal specificity, deny wins (secure-by-default).
  let bestSpecificity = -1;
  let bestAllowed: boolean | null = null;
  let bestPattern = "";

  for (const rp of dbRoutePermissions) {
    const regex = patternToRegex(rp.pattern);
    if (!regex.test(pathname)) continue;

    console.log(
      `[check-route-perm] MATCHED pattern="${rp.pattern}" roleAccess=${rp.roleAccess.length} userAccess=${rp.userAccess.length}`
    );

    // Route exists in DB but no access rules configured yet → open
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) {
      const spec = patternSpecificity(rp.pattern);
      if (spec > bestSpecificity) {
        bestSpecificity = spec;
        bestAllowed = true;
        bestPattern = rp.pattern;
      }
      continue;
    }

    // Determine if this specific pattern grants or denies access
    let granted = false;

    // User-level override (most specific — if found, it wins for this pattern)
    const userEntry = rp.userAccess.find((ua) => ua.userId === userId);
    if (userEntry) {
      granted = userEntry.granted;
    } else {
      // Role-level check
      const matchingRoles = rp.roleAccess.filter((ra) => roleIds.includes(ra.roleId));
      granted = matchingRoles.some((ra) => ra.granted);
    }

    const spec = patternSpecificity(rp.pattern);

    console.log(
      `[check-route-perm] pattern="${rp.pattern}" specificity=${spec} granted=${granted} bestSoFar=${bestSpecificity}`
    );

    if (granted) {
      // Allow only if this pattern is MORE specific (strict >)
      if (spec > bestSpecificity) {
        bestSpecificity = spec;
        bestAllowed = true;
        bestPattern = rp.pattern;
      }
    } else {
      // Deny wins on tie (>=) — secure-by-default
      if (spec >= bestSpecificity) {
        bestSpecificity = spec;
        bestAllowed = false;
        bestPattern = rp.pattern;
      }
    }
  }

  if (bestAllowed !== null) {
    console.log(
      `[check-route-perm] ${bestAllowed ? "ALLOWED" : "DENIED"} user=${user.email} path=${pathname} reason="specificity match" winningPattern="${bestPattern}" specificity=${bestSpecificity}`
    );
    return { allowed: bestAllowed, isAdmin: false };
  }

  // No DB rule matched → open
  console.log(
    `[check-route-perm] ALLOWED user=${user.email} path=${pathname} reason="no route permission configured (open)"`
  );
  return { allowed: true, isAdmin: false };
}
