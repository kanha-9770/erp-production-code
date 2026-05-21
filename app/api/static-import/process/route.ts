/**
 * POST /api/static-import/process — bulk import a chunk of rows into a
 * static-page domain table (Employee Master today, more later).
 *
 * Body:
 *   {
 *     formId: string;          // e.g. "static:employee-master"
 *     mappings: { sourceColumn: string; targetCoreKey: string }[];
 *     rows: Record<string, string>[];   // raw CSV rows keyed by source column
 *   }
 *
 * Response:
 *   { success: true, successCount, failedCount, skippedCount, errors? }
 *
 * Each row is run through the registered handler. Errors are caught
 * per-row so a single bad row doesn't abort the chunk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getStaticImportHandler, type RowOutcome } from '@/lib/static-imports/handlers';

export const dynamic = 'force-dynamic';

interface Body {
  formId?: string;
  mappings?: { sourceColumn: string; targetCoreKey: string }[];
  rows?: Record<string, string>[];
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!user.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization context' },
      { status: 400 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }
  if (!body.formId) {
    return NextResponse.json(
      { success: false, error: 'Missing formId' },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.mappings) || !Array.isArray(body.rows)) {
    return NextResponse.json(
      { success: false, error: 'Missing mappings or rows' },
      { status: 400 },
    );
  }

  const handler = getStaticImportHandler(body.formId);
  if (!handler) {
    return NextResponse.json(
      {
        success: false,
        error: `No import handler registered for form ${body.formId}`,
      },
      { status: 400 },
    );
  }

  // Re-key each CSV row by the target coreKey using the mapping table. The
  // handler reads from coreKey, never from the original column name, so the
  // CSV's column headers don't have to follow any convention.
  const remap = (raw: Record<string, string>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const m of body.mappings!) {
      if (!m.targetCoreKey) continue;
      const v = raw[m.sourceColumn];
      if (v === undefined) continue;
      out[m.targetCoreKey] = v;
    }
    return out;
  };

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: Array<{ rowIndex: number; error: string }> = [];

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i];
    const remapped = remap(raw);
    let outcome: RowOutcome;
    try {
      outcome = await handler.handle(remapped, {
        organizationId: user.organizationId,
        actingUserId: user.id,
      });
    } catch (err: any) {
      // Defensive: handlers are expected to catch their own errors and
      // return `{ status: 'failed' }`, but if one throws anyway we still
      // count it instead of crashing the whole chunk.
      outcome = { status: 'failed', error: err?.message || String(err) };
    }
    if (outcome.status === 'success') successCount += 1;
    else if (outcome.status === 'skipped') skippedCount += 1;
    else {
      failedCount += 1;
      // Keep at most 50 detailed errors so the response doesn't grow
      // unbounded on a bad 5000-row file.
      if (errors.length < 50) {
        errors.push({ rowIndex: i, error: outcome.error });
      }
    }
  }

  return NextResponse.json({
    success: true,
    successCount,
    failedCount,
    skippedCount,
    errors: errors.length ? errors : undefined,
  });
}
