/**
 * Server-side permission resolver.
 *
 * The codebase previously gated sensitive handlers (user create/update/delete)
 * on a binary `isAdmin()` check. That meant the only way to let HR manage
 * users was to promote their role to full admin — which leaks every other
 * admin capability (route bypasses, org settings, role editing, etc).
 *
 * This file introduces a named-permission check so we can grant scoped
 * capabilities like MANAGE_USERS to specific roles without globalising
 * admin powers.
 *
 * Resolution order (first match wins, deny beats grant on overrides):
 *   1. Role isAdmin = true (or owner of the organization) → allow.
 *   2. UserPermissionOverride row for this user + permission:
 *        - granted=false (not expired) → DENY (explicit revoke).
 *        - granted=true  (not expired) → ALLOW.
 *   3. Any RolePermission row tying one of the user's roles to the named
 *      permission with granted=true → ALLOW.
 *   4. Otherwise → DENY.
 *
 * The named permission is scoped per organization (the Permission model has
 * organizationId), so each org owns its own Permission rows.
 */

import { prisma } from "@/lib/prisma";

/**
 * Returns true if the authenticated user has the named permission, either
 * because they are admin, because their role grants it, or because they have
 * an explicit user-level override that grants it (and no deny override).
 */
export async function hasPermission(
  authUserId: string,
  permissionName: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: authUserId },
    select: {
      organizationId: true,
      ownedOrganization: { select: { id: true } },
      unitAssignments: {
        select: {
          roleId: true,
          role: { select: { isAdmin: true, name: true } },
        },
      },
      permissionOverrides: {
        where: {
          permission: { name: permissionName },
        },
        select: {
          granted: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!user) return false;

  // 1. Admin / org owner bypass.
  const isAdmin =
    !!user.ownedOrganization ||
    user.unitAssignments.some(
      (ua) =>
        ua.role?.isAdmin ||
        (ua.role?.name ?? "").toLowerCase().includes("admin")
    );
  if (isAdmin) return true;

  // 2. User-level override. A non-expired explicit row beats role grants
  //    in both directions: explicit deny revokes the role-granted access,
  //    explicit allow grants it even when no role does.
  const now = new Date();
  const liveOverrides = user.permissionOverrides.filter(
    (o) => !o.expiresAt || o.expiresAt > now
  );
  if (liveOverrides.length > 0) {
    if (liveOverrides.some((o) => !o.granted)) return false;
    if (liveOverrides.some((o) => o.granted)) return true;
  }

  // 3. Any role assigned to this user that grants the permission anywhere
  //    (module/form/section/field-scoped or unscoped) is sufficient for an
  //    org-level capability like MANAGE_USERS. We don't require a particular
  //    module scope here because MANAGE_USERS is not module-bound.
  if (!user.organizationId) return false;
  const roleIds = user.unitAssignments.map((ua) => ua.roleId);
  if (roleIds.length === 0) return false;

  const grant = await prisma.rolePermission.findFirst({
    where: {
      roleId: { in: roleIds },
      granted: true,
      permission: {
        name: permissionName,
        organizationId: user.organizationId,
        isActive: true,
      },
    },
    select: { id: true },
  });

  return !!grant;
}

/**
 * True when the user is allowed to create / update / delete users in their
 * organization. Wraps `hasPermission` with the canonical name so call sites
 * stay readable.
 */
export async function canManageUsers(authUserId: string): Promise<boolean> {
  return hasPermission(authUserId, MANAGE_USERS);
}

/**
 * Canonical permission names used by this file. Adding a new capability is
 * one constant here plus call-site updates — the seed/grant script reads
 * these too, so they stay in lockstep.
 */
export const MANAGE_USERS = "MANAGE_USERS";

/**
 * Idempotently create the Permission row for `name` inside `organizationId`.
 * Safe to call on every boot or from a one-off grant script.
 */
export async function ensurePermission(
  organizationId: string,
  name: string,
  description: string,
  resource = "user"
) {
  const existing = await prisma.permission.findFirst({
    where: { name, organizationId },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.permission.create({
    data: {
      name,
      description,
      category: "ADMIN",
      resource,
      organizationId,
      isActive: true,
    },
    select: { id: true },
  });
}
