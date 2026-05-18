/**
 * GET  /api/engagement/initiatives — team-scoped list.
 * POST /api/engagement/initiatives — author creates a self-initiative.
 *   Body: { title, description, startDate, endDate, category, status? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { buildScopedWhere } from '@/lib/hr/engagement-scope';
import {
  serializeInitiative,
  INITIATIVE_INCLUDE,
} from '@/lib/hr/engagement-serializers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_STATUS = new Set(['planning', 'in-progress', 'completed', 'on-hold']);

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const where = await buildScopedWhere(authUser.id, authUser.organizationId);
  const rows = await (prisma as any).engagementInitiative.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: INITIATIVE_INCLUDE,
  });
  return NextResponse.json(
    { success: true, initiatives: rows.map(serializeInitiative) },
    { headers: NO_STORE },
  );
}

interface CreateBody {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  status?: string;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return err('Invalid JSON body');
  }
  if (!body.title?.trim()) return err("'title' is required");
  if (!body.description?.trim()) return err("'description' is required");
  if (!body.startDate || !DATE_RE.test(body.startDate)) return err("'startDate' must be YYYY-MM-DD");
  if (!body.endDate || !DATE_RE.test(body.endDate)) return err("'endDate' must be YYYY-MM-DD");
  if (body.endDate < body.startDate) return err("'endDate' cannot be before 'startDate'");
  if (!body.category?.trim()) return err("'category' is required");

  const status = body.status && ALLOWED_STATUS.has(body.status) ? body.status : 'planning';

  const created = await (prisma as any).engagementInitiative.create({
    data: {
      organizationId: authUser.organizationId,
      userId: authUser.id,
      title: body.title.trim().slice(0, 200),
      description: body.description.trim().slice(0, 5000),
      startDate: body.startDate,
      endDate: body.endDate,
      category: body.category.trim().slice(0, 80),
      status,
    },
    include: INITIATIVE_INCLUDE,
  });
  return NextResponse.json(
    { success: true, initiative: serializeInitiative(created) },
    { headers: NO_STORE },
  );
}
