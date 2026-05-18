/**
 * Engagement Team service — single point of truth for team CRUD and the
 * "can this user see other teams' data?" check used by every engagement page.
 *
 * Visibility rule (matches the product requirement):
 *   - Org admins and members of an HR role: see ALL teams' records.
 *   - Everyone else: see only records authored by members of their own team.
 *   - Users with no team assignment fall into a private bucket — they can
 *     create / see only their own records.
 *
 * `(prisma as any)` casts are used for the EngagementTeam model so the route
 * code compiles even when the generated client is briefly out-of-date (e.g.
 * after `prisma db push` but before the dev server has been restarted on
 * Windows where the .dll lock blocks `prisma generate`).
 */

import { prisma } from '@/lib/prisma';
import { isUserAdmin } from '@/lib/api-helpers';

export class EngagementTeamError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'EngagementTeamError';
  }
}

export interface EngagementTeamRow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string | null;
  leadUserId: string | null;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normaliseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) return null;
  // Collapse internal whitespace so "Sales  Team" and "Sales Team" can't both
  // exist — the unique index treats them as equal once stored.
  return trimmed.replace(/\s+/g, ' ');
}

export async function isUserHR(
  userId: string,
  organizationId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const roles = await prisma.$queryRaw<{ role_name: string }[]>`
    SELECT r.name AS role_name
    FROM user_unit_assignments uua
    JOIN roles r ON r.id = uua.role_id
    WHERE uua.user_id = ${userId}
  `;
  return roles.some((r) => (r.role_name ?? '').toLowerCase().includes('hr'));
}

/**
 * Bypass flag for the engagement-page filters. Admins and HR see every team's
 * records; everyone else is scoped to their own team.
 */
export async function canSeeAllEngagementData(
  userId: string,
  organizationId: string | null,
): Promise<boolean> {
  const [admin, hr] = await Promise.all([
    isUserAdmin(userId, organizationId),
    isUserHR(userId, organizationId),
  ]);
  return admin || hr;
}

/** Returns the team id the user's Employee record points at, or null. */
export async function getUserTeamId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const emp = await prisma.employee.findUnique({
    where: { userId },
    select: { engagementTeamId: true } as any,
  });
  return ((emp as any)?.engagementTeamId as string | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

function serializeTeam(t: any, memberCount: number): EngagementTeamRow {
  return {
    id: t.id,
    organizationId: t.organizationId,
    name: t.name,
    description: t.description ?? null,
    color: t.color ?? null,
    leadUserId: t.leadUserId ?? null,
    isActive: !!t.isActive,
    memberCount,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  };
}

export async function listTeams(organizationId: string): Promise<EngagementTeamRow[]> {
  const teams = await (prisma as any).engagementTeam.findMany({
    where: { organizationId },
    orderBy: [{ name: 'asc' }],
  });
  if (teams.length === 0) return [];
  // Bulk-count members per team so we don't N+1 the employee table for big orgs.
  const counts = await prisma.employee.groupBy({
    by: ['engagementTeamId' as any],
    where: {
      engagementTeamId: { in: teams.map((t: any) => t.id) },
    } as any,
    _count: { _all: true },
  });
  const byTeam = new Map<string, number>();
  for (const c of counts as any[]) {
    if (c.engagementTeamId) byTeam.set(c.engagementTeamId, c._count._all);
  }
  return teams.map((t: any) => serializeTeam(t, byTeam.get(t.id) ?? 0));
}

export interface CreateTeamInput {
  organizationId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  leadUserId?: string | null;
}

export async function createTeam(input: CreateTeamInput): Promise<EngagementTeamRow> {
  const name = normaliseName(input.name);
  if (!name) throw new EngagementTeamError('BAD_NAME', 'Team name is required (1–80 chars).');
  const color = input.color ? String(input.color).trim() : null;
  if (color && !HEX_RE.test(color)) {
    throw new EngagementTeamError('BAD_COLOR', "Color must be a #RRGGBB hex string.");
  }

  let team: any;
  try {
    team = await (prisma as any).engagementTeam.create({
      data: {
        organizationId: input.organizationId,
        name,
        description: input.description?.toString().slice(0, 2000) ?? null,
        color,
        leadUserId: input.leadUserId ?? null,
        isActive: true,
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      throw new EngagementTeamError(
        'DUPLICATE',
        `A team named "${name}" already exists in your organization.`,
        409,
      );
    }
    throw e;
  }
  return serializeTeam(team, 0);
}

export interface UpdateTeamInput {
  id: string;
  organizationId: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  leadUserId?: string | null;
  isActive?: boolean;
}

export async function updateTeam(input: UpdateTeamInput): Promise<EngagementTeamRow> {
  const existing = await (prisma as any).engagementTeam.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!existing) throw new EngagementTeamError('NOT_FOUND', 'Team not found.', 404);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = normaliseName(input.name);
    if (!name) throw new EngagementTeamError('BAD_NAME', 'Team name is required (1–80 chars).');
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.toString().slice(0, 2000) ?? null;
  }
  if (input.color !== undefined) {
    const color = input.color ? String(input.color).trim() : null;
    if (color && !HEX_RE.test(color)) {
      throw new EngagementTeamError('BAD_COLOR', "Color must be a #RRGGBB hex string.");
    }
    patch.color = color;
  }
  if (input.leadUserId !== undefined) patch.leadUserId = input.leadUserId;
  if (input.isActive !== undefined) patch.isActive = !!input.isActive;

  let updated: any;
  try {
    updated = await (prisma as any).engagementTeam.update({
      where: { id: input.id },
      data: patch,
    });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      throw new EngagementTeamError(
        'DUPLICATE',
        'Another team already uses that name.',
        409,
      );
    }
    throw e;
  }

  const memberCount = await prisma.employee.count({
    where: { engagementTeamId: input.id } as any,
  });
  return serializeTeam(updated, memberCount);
}

export async function deleteTeam(id: string, organizationId: string): Promise<void> {
  const existing = await (prisma as any).engagementTeam.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw new EngagementTeamError('NOT_FOUND', 'Team not found.', 404);
  // ON DELETE SET NULL on the FK keeps members intact (they'll just lose the
  // assignment), which is the right behavior — losing a team shouldn't lose
  // the employees that were on it.
  await (prisma as any).engagementTeam.delete({ where: { id } });
}
