/**
 * Manual / external trigger for the team-attendance email report.
 *
 *  POST /api/cron/team-attendance
 *    Body : { kind: "daily" | "weekly" | "monthly", organizationId?: string }
 *    Auth : either an admin session OR an `x-cron-secret` header that
 *           matches process.env.CRON_SECRET (for an external scheduler).
 *
 * The same code path runs from the in-process node-cron scheduler — this
 * route exists for two reasons:
 *   1. Admin "send now" buttons in the UI
 *   2. Letting an external scheduler fire if you scale horizontally and
 *      need to avoid the in-process duplicate-fire problem.
 *
 * If neither auth path passes, returns 401. If the kind is invalid or
 * recipients aren't configured, returns 400 / 422 with a precise reason.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { runReport } from '@/lib/hr/attendance-report-scheduler';
import type { ReportKind } from '@/lib/hr/team-attendance-report';

export const dynamic = 'force-dynamic';

const VALID_KINDS: ReportKind[] = ['daily', 'weekly', 'monthly'];

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* allow empty body for cron pings; we'll error on missing kind below */
  }

  const kindRaw = typeof body.kind === 'string' ? body.kind : '';
  if (!VALID_KINDS.includes(kindRaw as ReportKind)) {
    return NextResponse.json(
      {
        success: false,
        error: `\`kind\` must be one of: ${VALID_KINDS.join(', ')}`,
      },
      { status: 400 },
    );
  }
  const kind = kindRaw as ReportKind;

  // Auth path A: external scheduler with CRON_SECRET header.
  const headerSecret = request.headers.get('x-cron-secret') ?? '';
  const expected = process.env.CRON_SECRET ?? '';
  const secretOk = expected.length > 0 && headerSecret === expected;

  // Auth path B: admin session in-app. Required if no secret matched.
  let organizationId: string | null = null;
  if (!secretOk) {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 },
      );
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: 'User is not a member of any organization' },
        { status: 403 },
      );
    }
    const admin = await isUserAdmin(authUser.id, authUser.organizationId);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 },
      );
    }
    // Admins always run the report against their own org — explicit body
    // override is rejected so a tenant can't fire another tenant's report.
    organizationId = authUser.organizationId;
  } else {
    // External scheduler must specify the org explicitly. There's no
    // session to derive it from.
    if (typeof body.organizationId !== 'string' || !body.organizationId) {
      return NextResponse.json(
        { success: false, error: '`organizationId` is required when using x-cron-secret' },
        { status: 400 },
      );
    }
    organizationId = body.organizationId;
  }

  try {
    const result = await runReport(organizationId!, kind);
    if (!result.sent) {
      return NextResponse.json(
        { success: false, error: result.reason ?? 'not sent' },
        { status: 422 },
      );
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[api/cron/team-attendance] failed:', err);
    return NextResponse.json(
      { success: false, error: err?.message ?? 'internal error' },
      { status: 500 },
    );
  }
}
