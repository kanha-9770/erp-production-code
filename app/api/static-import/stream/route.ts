/**
 * POST /api/static-import/stream — bulk-import a WHOLE static-page file in a
 * single request, streaming live progress back as NDJSON.
 *
 * Why a stream instead of the old per-chunk loop: every round-trip to a pooled
 * cloud Postgres costs ~1s+ of latency, so doing 14 sequential chunk requests
 * (each several queries) made a 7k-row import take ~40s. Here the client sends
 * everything ONCE; the handler does one dedup query + bulk inserts/updates, and
 * pushes a `{processed}` event after each internal write batch. The browser
 * animates rows landing in real time from those events.
 *
 * Body:  { formId, mappings: [{sourceColumn, targetCoreKey}], rows: [...] }
 * Stream (application/x-ndjson), one JSON object per line:
 *   { type: "progress", processed, total }
 *   { type: "done", success, failed, skipped, errors? }
 *   { type: "error", error }                      // fatal, before any rows
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getStaticImportHandler, type RowOutcome } from '@/lib/static-imports/handlers';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface Body {
  formId?: string;
  mappings?: { sourceColumn: string; targetCoreKey: string }[];
  rows?: Record<string, string>[];
}

/** Bounded-concurrency map for handlers without a set-based batch path. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onTick?: (done: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      done++;
      if (onTick && done % 25 === 0) onTick(done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  onTick?.(done);
  return results;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Auth up front so we can return a normal JSON error (not a stream) on 401.
  const user = await getAuthenticatedUser(request);
  if (!user || !user.organizationId) {
    return new Response(
      JSON.stringify({ type: 'error', error: 'Not authenticated or no organization context' }),
      { status: user ? 400 : 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ type: 'error', error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.formId || !Array.isArray(body.mappings) || !Array.isArray(body.rows)) {
    return new Response(
      JSON.stringify({ type: 'error', error: 'Missing formId, mappings or rows' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const handler = getStaticImportHandler(body.formId);
  if (!handler) {
    return new Response(
      JSON.stringify({ type: 'error', error: `No import handler for form ${body.formId}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Re-key each raw CSV row by the target coreKey the handler reads.
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
  const remappedRows = body.rows.map(remap);
  const total = remappedRows.length;
  const ctx = { organizationId: user.organizationId, actingUserId: user.id };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      // Throttle progress writes so a fast handler can't flood the socket.
      let lastSent = -1;
      const onProgress = (processed: number) => {
        if (processed === lastSent) return;
        lastSent = processed;
        send({ type: 'progress', processed, total });
      };

      send({ type: 'progress', processed: 0, total });

      try {
        let outcomes: RowOutcome[];
        if (handler.handleBatch) {
          outcomes = await handler.handleBatch(remappedRows, ctx, onProgress);
        } else {
          outcomes = await mapWithConcurrency(
            remappedRows, 12,
            (row) => handler.handle(row, ctx).catch((e: any): RowOutcome => ({ status: 'failed', error: e?.message || String(e) })),
            onProgress,
          );
        }

        let created = 0, updated = 0, failed = 0, skipped = 0;
        // Return EVERY failed row's index + message so the client can let the
        // user fix & retry just those (capped to keep the payload sane).
        const errors: Array<{ rowIndex: number; error: string }> = [];
        const ERROR_CAP = 5000;
        for (let i = 0; i < outcomes.length; i++) {
          const o = outcomes[i] ?? { status: 'failed' as const, error: 'No outcome' };
          if (o.status === 'success') { if ((o as any).action === 'updated') updated++; else created++; }
          else if (o.status === 'skipped') skipped++;
          else {
            failed++;
            if (errors.length < ERROR_CAP) errors.push({ rowIndex: i, error: (o as any).error || 'Unknown error' });
          }
        }

        send({ type: 'progress', processed: total, total });
        send({
          type: 'done',
          created, updated, skipped, failed,
          imported: created + updated,
          total,
          errors: errors.length ? errors : undefined,
        });
      } catch (err: any) {
        send({ type: 'done', success: 0, failed: total, skipped: 0, errors: [{ rowIndex: -1, error: err?.message || 'Import failed' }] });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Tell any nginx in front not to buffer — keeps progress truly live.
      'X-Accel-Buffering': 'no',
    },
  });
}
