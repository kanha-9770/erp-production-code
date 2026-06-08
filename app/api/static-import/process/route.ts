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
export const maxDuration = 300; // long-lived VPS; allow big chunks to finish

/** Run `fn` over `items` with at most `limit` in flight at once. Results are
 *  returned in input order. Used as the fallback for handlers without a
 *  set-based batch path. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

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

  const ctx = { organizationId: user.organizationId, actingUserId: user.id };
  const remappedRows = body.rows.map(remap);

  let outcomes: RowOutcome[];
  if (handler.handleBatch) {
    // Set-based fast path: one chunk → a handful of SQL statements. The
    // handler guarantees one outcome per row in order and never throws, but we
    // still guard so a thrown batch degrades to "whole chunk failed" rather
    // than a 500.
    try {
      outcomes = await handler.handleBatch(remappedRows, ctx);
    } catch (err: any) {
      const msg = err?.message || String(err);
      outcomes = remappedRows.map(() => ({ status: 'failed', error: msg }) as RowOutcome);
    }
  } else {
    // No batch path — process rows with bounded concurrency (much faster than
    // strictly sequential, without overwhelming the connection pool).
    outcomes = await mapWithConcurrency(remappedRows, 12, (row) =>
      handler
        .handle(row, ctx)
        .catch((err: any): RowOutcome => ({ status: 'failed', error: err?.message || String(err) })),
    );
  }

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: Array<{ rowIndex: number; error: string }> = [];

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i] ?? { status: 'failed' as const, error: 'No outcome returned' };
    if (outcome.status === 'success') successCount += 1;
    else if (outcome.status === 'skipped') skippedCount += 1;
    else {
      failedCount += 1;
      // Keep at most 50 detailed errors so the response doesn't grow
      // unbounded on a bad file.
      if (errors.length < 50) {
        errors.push({ rowIndex: i, error: (outcome as any).error || 'Unknown error' });
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
