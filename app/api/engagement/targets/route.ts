/**
 * GET  /api/engagement/targets — team-scoped list.
 * POST /api/engagement/targets — author creates a self-target.
 *   Body: { title, description, targetDate, status?, progress? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { buildScopedWhere } from '@/lib/hr/engagement-scope';
import {
  serializeTarget,
  TARGET_INCLUDE,
} from '@/lib/hr/engagement-serializers';
import { fireWorkflow } from '@/lib/workflow/static-triggers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_STATUS = new Set(['not-started', 'in-progress', 'completed']);

function clampProgress(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const where = await buildScopedWhere(authUser.id, authUser.organizationId);
  const rows = await (prisma as any).engagementTarget.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: TARGET_INCLUDE,
  });
  return NextResponse.json(
    { success: true, targets: rows.map(serializeTarget) },
    { headers: NO_STORE },
  );
}

interface CreateBody {
  title?: string;
  description?: string;
  targetDate?: string;
  status?: string;
  progress?: number;
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
  if (!body.targetDate || !DATE_RE.test(body.targetDate)) return err("'targetDate' must be YYYY-MM-DD");

  const status = body.status && ALLOWED_STATUS.has(body.status) ? body.status : 'not-started';

  const created = await (prisma as any).engagementTarget.create({
    data: {
      organizationId: authUser.organizationId,
      userId: authUser.id,
      title: body.title.trim().slice(0, 200),
      description: body.description.trim().slice(0, 5000),
      targetDate: body.targetDate,
      status,
      progress: clampProgress(body.progress ?? 0),
    },
    include: TARGET_INCLUDE,
  });
  const wire = serializeTarget(created);
  fireWorkflow({
    moduleName: 'Self Target',
    action: 'Create',
    organizationId: authUser.organizationId,
    userId: authUser.id,
    recordId: wire.id,
    recordData: wire as any,
  });
  return NextResponse.json(
    { success: true, target: wire },
    { headers: NO_STORE },
  );
}
