/**
 * Attendance approval permission resolver.
 *
 * Three groups can approve attendance regularizations + use the manual-
 * punch endpoint:
 *   1. Org admins (single source of truth: lib/api-helpers.isUserAdmin).
 *   2. Users assigned a role whose id sits in the org's
 *      AttendanceConfiguration.attendanceApproverRoleIds list.
 *   3. The org owner (covered by isUserAdmin).
 *
 * The helper is read-mostly — rates of regularization review are low —
 * so we don't cache. Each call does at most two DB hits (admin check +
 * role lookup) and short-circuits on admin success.
 */

import { prisma } from '@/lib/prisma';
import { isUserAdmin } from '@/lib/api-helpers';
import { getAttendanceConfig } from './attendance-config';

export async function canApproveAttendance(
  userId: string,
  organizationId: string | null,
): Promise<boolean> {
  if (!userId || !organizationId) return false;
  if (await isUserAdmin(userId, organizationId)) return true;

  const cfg = await getAttendanceConfig(organizationId);
  if (cfg.attendanceApproverRoleIds.length === 0) return false;

  // Look up every role this user is assigned in the org and intersect with
  // the approver list. user_unit_assignments can carry the same role
  // across multiple units, so we exit on the first hit.
  const roleHit = await prisma.userUnitAssignment.findFirst({
    where: {
      userId,
      roleId: { in: cfg.attendanceApproverRoleIds },
      user: { organizationId },
    },
    select: { id: true },
  });
  return !!roleHit;
}

// Convenience for endpoints that need both bits — saves a second admin
// lookup downstream when both flags are wanted on the same response.
export async function resolveApprovalContext(
  userId: string,
  organizationId: string | null,
): Promise<{ isAdmin: boolean; canApprove: boolean }> {
  if (!userId || !organizationId) return { isAdmin: false, canApprove: false };
  const admin = await isUserAdmin(userId, organizationId);
  if (admin) return { isAdmin: true, canApprove: true };

  const cfg = await getAttendanceConfig(organizationId);
  if (cfg.attendanceApproverRoleIds.length === 0) {
    return { isAdmin: false, canApprove: false };
  }
  const roleHit = await prisma.userUnitAssignment.findFirst({
    where: {
      userId,
      roleId: { in: cfg.attendanceApproverRoleIds },
      user: { organizationId },
    },
    select: { id: true },
  });
  return { isAdmin: false, canApprove: !!roleHit };
}
