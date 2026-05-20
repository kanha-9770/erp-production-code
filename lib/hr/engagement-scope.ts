/**
 * Engagement scope helper — produces the Prisma `where` fragment every
 * engagement read query needs.
 */

import { prisma } from '@/lib/prisma';
import { isUserAdmin } from '@/lib/api-helpers';

export interface ScopedWhere {
  organizationId: string;
  userId?: string | { in: string[] };
  user?: { employee: { engagementTeamId: string | null } };
}

/**
 * Returns the Prisma `where` slice for an engagement-table query.
 *
 * @param userId           the requesting user's id
 * @param organizationId   the requesting user's org
 */
export async function buildScopedWhere(
  userId: string,
  organizationId: string,
): Promise<ScopedWhere> {
  if (!organizationId) {
    return { organizationId: '__none__', userId: '__none__' };
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { engagementTeamId: true, department: true } } },
  });

  const dept = userRecord?.employee?.department?.toLowerCase() || '';
  const isHR = dept.includes('hr') || dept.includes('human resource');
  const isAdmin = await isUserAdmin(userId, organizationId);

  // Admins and HR see all submissions across the organisation
  if (isAdmin || isHR) {
    return { organizationId };
  }

  // Regular users see submissions from their own team
  const teamId = userRecord?.employee?.engagementTeamId;
  if (teamId) {
    return {
      organizationId,
      user: { employee: { engagementTeamId: teamId } },
    };
  }

  // Fallback: if not on a team, they only see their own
  return { organizationId, userId };
}
