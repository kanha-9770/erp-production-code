/**
 * Engagement scope helper — produces the Prisma `where` fragment every
 * engagement read query needs to enforce team isolation.
 *
 * Rules (also enforced client-side via useEngagementVisibility):
 *   - Admin or HR     → see ALL records in the org.
 *   - Team member     → see records whose author currently belongs to the
 *                       same engagement team.
 *   - Unassigned user → see only the records they themselves authored.
 *
 * Every per-module API route calls `buildScopedWhere(authUser)` and spreads
 * the result into its own `where`. The caller's own additional filters
 * (search text, status chips, etc.) layer on top with AND semantics.
 */

import { canSeeAllEngagementData, getUserTeamId } from './engagement-team-service';

export interface ScopedWhere {
  organizationId: string;
  // Either an OR list (team membership) or a direct userId filter (own-only).
  // Both can also be absent when the caller sees everything in the org.
  userId?: string | { in: string[] };
  user?: { employee: { engagementTeamId: string } };
}

/**
 * Returns the Prisma `where` slice for an engagement-table query. Caller
 * must spread, never directly merge — Prisma's TypeScript will flag any
 * conflict at compile time.
 *
 * @param userId           the requesting user's id
 * @param organizationId   the requesting user's org (required for safety)
 */
export async function buildScopedWhere(
  userId: string,
  organizationId: string,
): Promise<ScopedWhere> {
  if (!organizationId) {
    // Defence-in-depth — every route already gates on this, but if a future
    // caller forgets we still won't leak across orgs.
    return { organizationId: '__none__', userId: '__none__' };
  }

  const seeAll = await canSeeAllEngagementData(userId, organizationId);
  if (seeAll) {
    return { organizationId };
  }

  const teamId = await getUserTeamId(userId);
  if (teamId) {
    // Join through user.employee.engagementTeamId. Prisma understands the
    // nested filter and emits the right join.
    return {
      organizationId,
      user: { employee: { engagementTeamId: teamId } },
    };
  }

  // Unassigned → only own records.
  return { organizationId, userId };
}
