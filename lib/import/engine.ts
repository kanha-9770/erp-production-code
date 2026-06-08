// lib/import/engine.ts
//
// Background import engine. Drives a single ImportJob to completion by
// claiming PENDING rows from the import_rows table in batches, transforming
// each into the form's structured record shape, then inserting (or upserting
// by a business key) into the form's sharded form_records_* table.
//
// Design goals (see settings/import upgrade):
//  - Durable & resumable: rows are staged in import_rows first, so processing
//    survives a browser tab close, a network drop, or a PM2 restart. Re-running
//    start() simply picks up whatever rows are still PENDING.
//  - Multi-instance safe: batches are claimed with `FOR UPDATE SKIP LOCKED`,
//    so two PM2 workers (or two start() calls) never process the same row.
//  - No schema migration: the upsert key is flagged on the existing
//    ImportFieldMapping.lookupResolutionKey column; per-row status/errors live
//    on the existing ImportRow columns.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "@/lib/database/database-service";
import { transformToStructuredData } from "@/lib/utils/form-utils";
import { v4 as uuidv4 } from "uuid";

// Sentinel stored in ImportFieldMapping.lookupResolutionKey to mark a mapping
// as part of the upsert business key.
export const KEY_MARKER = "KEY";

// Rows claimed and processed per loop iteration. 500 keeps each createMany a
// single efficient SQL statement while bounding memory per batch.
const BATCH_SIZE = 500;

// Per-process guard so a second start()/resume call doesn't spin up a duplicate
// loop in the SAME node process. Cross-process safety comes from SKIP LOCKED.
const runningJobs = new Set<string>();

// ── Prisma delegate per sharded table ───────────────────────────────────────
// Centralizes the form_records_1..15 switch the old route inlined. Acts as the
// table-name whitelist too — anything not here is rejected.
function delegateFor(table: string): any {
  switch (table) {
    case "form_records_1": return prisma.formRecord1;
    case "form_records_2": return prisma.formRecord2;
    case "form_records_3": return prisma.formRecord3;
    case "form_records_4": return prisma.formRecord4;
    case "form_records_5": return prisma.formRecord5;
    case "form_records_6": return prisma.formRecord6;
    case "form_records_7": return prisma.formRecord7;
    case "form_records_8": return prisma.formRecord8;
    case "form_records_9": return prisma.formRecord9;
    case "form_records_10": return prisma.formRecord10;
    case "form_records_11": return prisma.formRecord11;
    case "form_records_12": return prisma.formRecord12;
    case "form_records_13": return prisma.formRecord13;
    case "form_records_14": return prisma.formRecord14;
    case "form_records_15": return prisma.formRecord15;
    default: return null;
  }
}

const normalizeKey = (s: string): string =>
  String(s).replace(/[‘’]/g, "'").trim();

// Extract the business-key string from a structured record by walking the
// sections/subforms for the mapped key field ids. Values are joined with a unit
// separator so multi-column keys can't collide ("ab"+"c" vs "a"+"bc").
function keyFromStructured(recordData: any, keyFieldIds: string[]): string | null {
  if (!keyFieldIds.length || !recordData) return null;
  const parts: string[] = [];
  for (const fid of keyFieldIds) {
    let val: any;
    const sections = recordData.sections || {};
    for (const sid of Object.keys(sections)) {
      const f = sections[sid]?.fields;
      if (f && f[fid] !== undefined) { val = f[fid]; break; }
    }
    if (val === undefined) {
      const subforms = recordData.subforms || {};
      for (const sfid of Object.keys(subforms)) {
        const f = subforms[sfid]?.fields;
        if (f && f[fid] !== undefined) { val = f[fid]; break; }
      }
    }
    if (val === undefined || val === null || String(val).trim() === "") return null; // incomplete key → treat as insert
    parts.push(String(val).trim().toLowerCase());
  }
  return parts.join("␟");
}

// Resolve (and lazily assign) the form's storage table, mirroring the old
// process route's least-loaded-table heuristic so behaviour is unchanged.
async function resolveTargetTable(formId: string): Promise<string | null> {
  let mapping = await prisma.formTableMapping.findUnique({ where: { formId } });
  if (mapping) return mapping.storageTable;

  const existing = await prisma.formTableMapping.findMany({ select: { storageTable: true } });
  const counts: Record<string, number> = {};
  existing.forEach((m) => { counts[m.storageTable] = (counts[m.storageTable] || 0) + 1; });

  let minCount = Infinity;
  let best: string | null = null;
  for (let i = 1; i <= 15; i++) {
    const tn = `form_records_${i}`;
    const c = counts[tn] || 0;
    if (c < minCount) { minCount = c; best = tn; }
  }
  if (!best) return null;
  try {
    mapping = await prisma.formTableMapping.create({ data: { formId, storageTable: best } });
    return mapping.storageTable;
  } catch {
    // Lost a race — re-read.
    const again = await prisma.formTableMapping.findUnique({ where: { formId } });
    return again?.storageTable ?? null;
  }
}

// Atomically claim up to `limit` PENDING rows for this job. SKIP LOCKED makes
// this safe under concurrent workers — each gets a disjoint set.
async function claimBatch(
  jobId: string,
  limit: number
): Promise<Array<{ id: string; row_number: number; raw_data: any }>> {
  return prisma.$queryRaw<Array<{ id: string; row_number: number; raw_data: any }>>(Prisma.sql`
    UPDATE import_rows SET status = 'PROCESSING'
    WHERE id IN (
      SELECT id FROM import_rows
      WHERE import_job_id = ${jobId} AND status = 'PENDING'
      ORDER BY row_number ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, row_number, raw_data
  `);
}

// Bulk-set status for a list of import_rows (used for SUCCESS/SKIPPED).
async function markRows(ids: string[], status: string): Promise<void> {
  if (!ids.length) return;
  await prisma.importRow.updateMany({ where: { id: { in: ids } }, data: { status } });
}

interface BatchOutcome { success: number; failed: number; skipped: number }

/**
 * Process a single import job to completion. Safe to call multiple times
 * (idempotent) — a second concurrent call in the same process is a no-op, and
 * across processes only un-claimed PENDING rows are ever touched.
 */
export async function processImportJob(jobId: string): Promise<void> {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const job = await prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const targetTable = await resolveTargetTable(job.formId);
    const delegate = targetTable ? delegateFor(targetTable) : null;
    if (!targetTable || !delegate) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date() },
      });
      return;
    }

    const form = await DatabaseService.getForm(job.formId);
    if (!form) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date() },
      });
      return;
    }

    // organizationId is a required column on form_records_14.
    let organizationId: string | undefined;
    if (form.moduleId) {
      const mod = await prisma.formModule.findUnique({
        where: { id: form.moduleId },
        select: { organizationId: true },
      });
      organizationId = mod?.organizationId ?? undefined;
    }
    if (targetTable === "form_records_14" && !organizationId) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date() },
      });
      return;
    }

    // Field metadata + mappings (+ which mappings form the upsert key).
    const fieldIdMap = new Map<string, any>();
    const allFields = (form.sections || []).flatMap((s: any) => s.fields || []);
    allFields.forEach((f: any) => fieldIdMap.set(f.id, f));

    const rawMappings = await prisma.importFieldMapping.findMany({ where: { importJobId: jobId } });
    if (rawMappings.length === 0) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date() },
      });
      return;
    }
    const mappings = rawMappings.map((m) => ({
      sourceColumn: normalizeKey(m.sourceColumn),
      targetFieldId: m.targetFieldId,
    }));
    const keyFieldIds = rawMappings
      .filter((m) => m.lookupResolutionKey === KEY_MARKER)
      .map((m) => m.targetFieldId);
    const useUpsert = job.duplicateHandling !== "INSERT_ONLY" && keyFieldIds.length > 0;

    // For upsert, build an in-memory index of existing key → recordId once, so
    // we never do a per-row SELECT. Safe for the ≤100k target.
    const keyIndex = new Map<string, string>();
    if (useUpsert) {
      const existing = await delegate.findMany({
        where: { formId: job.formId },
        select: { id: true, recordData: true },
      });
      for (const rec of existing) {
        const k = keyFromStructured(rec.recordData, keyFieldIds);
        if (k && !keyIndex.has(k)) keyIndex.set(k, rec.id);
      }
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", startedAt: job.startedAt ?? new Date() },
    });

    // ── Main drain loop ──────────────────────────────────────────────────────
    for (;;) {
      const claimed = await claimBatch(jobId, BATCH_SIZE);
      if (claimed.length === 0) break;

      const outcome = await processBatch(
        claimed, mappings, form, targetTable, organizationId,
        useUpsert, keyFieldIds, keyIndex, delegate
      );

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          processedRows: { increment: claimed.length },
          successRows: { increment: outcome.success },
          failedRows: { increment: outcome.failed },
        },
      });
    }

    // ── Finalize ─────────────────────────────────────────────────────────────
    const final = await prisma.importJob.findUnique({ where: { id: jobId } });
    const finalStatus =
      (final?.successRows ?? 0) > 0 ? "COMPLETED" : "FAILED";
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: finalStatus, completedAt: new Date() },
    });
  } catch (err) {
    console.error(`[IMPORT-ENGINE] Job ${jobId} crashed:`, err);
    // Leave any rows we hadn't reached as PENDING so a resume can finish them,
    // but flip the job out of PROCESSING so the UI doesn't hang forever.
    try {
      const remaining = await prisma.importRow.count({
        where: { importJobId: jobId, status: { in: ["PENDING", "PROCESSING"] } },
      });
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: remaining > 0 ? "PENDING" : "COMPLETED" },
      });
    } catch { /* best-effort */ }
  } finally {
    runningJobs.delete(jobId);
  }
}

async function processBatch(
  claimed: Array<{ id: string; row_number: number; raw_data: any }>,
  mappings: { sourceColumn: string; targetFieldId: string }[],
  form: any,
  targetTable: string,
  organizationId: string | undefined,
  useUpsert: boolean,
  keyFieldIds: string[],
  keyIndex: Map<string, string>,
  delegate: any
): Promise<BatchOutcome> {
  const successIds: string[] = [];
  const skippedIds: string[] = [];
  const failed: { id: string; error: string }[] = [];

  // Build a structured record for each claimed row up front.
  type Prepared = { importRowId: string; structured: any; keyVal: string | null };
  const prepared: Prepared[] = [];

  for (const cr of claimed) {
    const raw = (cr.raw_data || {}) as Record<string, any>;
    const normRow: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => { normRow[normalizeKey(k)] = String(v ?? "").trim(); });

    const recordData: Record<string, any> = {};
    let hasData = false;
    for (const m of mappings) {
      let val = normRow[m.sourceColumn];
      if (val === undefined) {
        const match = Object.keys(normRow).find((k) => k.toLowerCase() === m.sourceColumn.toLowerCase());
        if (match) val = normRow[match];
      }
      if (val) { recordData[m.targetFieldId] = val; hasData = true; }
    }

    if (!hasData) { skippedIds.push(cr.id); continue; }

    try {
      const structured = transformToStructuredData(form, recordData, "import");
      const keyVal = useUpsert ? keyFromStructured(structured, keyFieldIds) : null;
      prepared.push({ importRowId: cr.id, structured, keyVal });
    } catch (e: any) {
      failed.push({ id: cr.id, error: e?.message || "Transform failed" });
    }
  }

  // Intra-batch dedup by key: a key appearing twice in one batch keeps the LAST
  // occurrence (last-write-wins); earlier ones are skipped as superseded.
  if (useUpsert) {
    const lastIdxForKey = new Map<string, number>();
    prepared.forEach((p, i) => { if (p.keyVal) lastIdxForKey.set(p.keyVal, i); });
    prepared.forEach((p, i) => {
      if (p.keyVal && lastIdxForKey.get(p.keyVal) !== i) {
        skippedIds.push(p.importRowId);
        p.keyVal = "__superseded__";
      }
    });
  }

  // Split into updates (key already known) vs inserts.
  const toInsert: { insertData: Record<string, any>; importRowId: string; keyVal: string | null }[] = [];
  for (const p of prepared) {
    if (p.keyVal === "__superseded__") continue;

    if (useUpsert && p.keyVal && keyIndex.has(p.keyVal)) {
      const existingId = keyIndex.get(p.keyVal)!;
      try {
        await delegate.update({
          where: { id: existingId },
          data: { recordData: p.structured, updatedAt: new Date() },
        });
        // Keep the unified mirror in sync (no-op if the row isn't mirrored).
        await prisma.formRecord.updateMany({
          where: { id: existingId },
          data: { recordData: p.structured, updatedAt: new Date() },
        }).catch(() => {});
        successIds.push(p.importRowId);
      } catch (e: any) {
        failed.push({ id: p.importRowId, error: e?.message || "Update failed" });
      }
      continue;
    }

    const id = uuidv4();
    const now = new Date();
    const insertData: Record<string, any> = {
      id,
      formId: form.id,
      recordData: p.structured,
      submittedBy: "import",
      submittedAt: now,
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    };
    if (targetTable === "form_records_14" && organizationId) insertData.organizationId = organizationId;
    toInsert.push({ insertData, importRowId: p.importRowId, keyVal: p.keyVal });
  }

  // Bulk insert with per-row fallback so one bad row never sinks the batch.
  if (toInsert.length) {
    const records = toInsert.map((t) => t.insertData);
    try {
      await delegate.createMany({ data: records, skipDuplicates: true });
      toInsert.forEach((t) => {
        successIds.push(t.importRowId);
        if (useUpsert && t.keyVal) keyIndex.set(t.keyVal, t.insertData.id);
      });
    } catch {
      for (const t of toInsert) {
        try {
          await delegate.create({ data: t.insertData });
          successIds.push(t.importRowId);
          if (useUpsert && t.keyVal) keyIndex.set(t.keyVal, t.insertData.id);
        } catch (e: any) {
          failed.push({ id: t.importRowId, error: e?.message || "Insert failed" });
        }
      }
    }

    // Dual-write the inserted rows into the unified FormRecord table, mirroring
    // the old route (non-blocking — reads may come from either table).
    try {
      const okIds = new Set(successIds);
      const unified = toInsert
        .filter((t) => okIds.has(t.importRowId))
        .map((t) => ({
          id: t.insertData.id,
          formId: t.insertData.formId,
          recordData: t.insertData.recordData,
          organizationId: organizationId || null,
          submittedBy: t.insertData.submittedBy,
          submittedAt: t.insertData.submittedAt,
          status: t.insertData.status,
          userId: null,
        }));
      if (unified.length) {
        await prisma.formRecord.createMany({ data: unified as any, skipDuplicates: true });
      }
    } catch (e) {
      console.error("[IMPORT-ENGINE] unified dual-write failed (non-blocking):", e);
    }
  }

  // Persist per-row outcomes. Successes/skips are bulk; failures are grouped by
  // identical message so we still do O(distinct-messages) updates, not O(rows).
  await markRows(successIds, "SUCCESS");
  await markRows(skippedIds, "SKIPPED");
  if (failed.length) {
    const byMessage = new Map<string, string[]>();
    for (const f of failed) {
      const list = byMessage.get(f.error) || [];
      list.push(f.id);
      byMessage.set(f.error, list);
    }
    for (const [message, ids] of byMessage) {
      await prisma.importRow.updateMany({
        where: { id: { in: ids } },
        data: { status: "FAILED", errorMessage: message.slice(0, 500) },
      });
    }
  }

  return { success: successIds.length, failed: failed.length, skipped: skippedIds.length };
}
