import { prisma } from "@/lib/prisma";
import { matchRoute } from "@/lib/route-permissions";

/**
 * Server-side route permission checker.
 * Used by layouts to perform authoritative DB-backed permission checks.
 */
export async function checkRoutePermission(
  userId: string,
  pathname: string
): Promise<{ allowed: boolean; isAdmin: boolean }> {
  // 1. Get user's role assignments
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
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
    return { allowed: false, isAdmin: false };
  }

  // 2. Check admin status
  const isAdmin = user.unitAssignments.some(
    (ua) => ua.role.isAdmin || ua.role.name.toUpperCase() === "ADMIN"
  );

  // Admin bypasses all checks
  if (isAdmin) {
    return { allowed: true, isAdmin: true };
  }

  // 3. Match pathname against route permission rules
  const rule = matchRoute(pathname);

  // No rule = open by default
  if (!rule) {
    return { allowed: true, isAdmin: false };
  }

  // Admin-only route and user is not admin
  if (rule.requireAdmin) {
    return { allowed: false, isAdmin: false };
  }

  // Check required permissions
  if (rule.requiredPermissions && rule.requiredPermissions.length > 0) {
    const roleIds = user.unitAssignments.map((ua) => ua.role.id);

    // Query role permissions for the user's roles
    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: { in: roleIds },
        granted: true,
        permission: {
          name: { in: rule.requiredPermissions },
        },
      },
      select: {
        permission: { select: { name: true } },
      },
    });

    if (rolePermissions.length > 0) {
      return { allowed: true, isAdmin: false };
    }

    // Check user permission overrides
    const userOverrides = await prisma.userPermissionOverride.findMany({
      where: {
        userId,
        granted: true,
        permission: {
          name: { in: rule.requiredPermissions },
        },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: {
        permission: { select: { name: true } },
      },
    });

    if (userOverrides.length > 0) {
      return { allowed: true, isAdmin: false };
    }

    // No matching permissions found
    return { allowed: false, isAdmin: false };
  }

  // Rule exists but has no specific requirements — allow
  return { allowed: true, isAdmin: false };
}
