// app/api/import/process/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DatabaseService } from "@/lib/database/database-service";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { v4 as uuidv4 } from "uuid";
import { transformToStructuredData } from "@/lib/utils/form-utils";

// ── Increase body-size limit for this route (Next.js 14+) ──
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for large imports

const normalizeKey = (str: string): string => {
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
};

// ── Batch insert helper ─────────────────────────────────────
// Uses createMany where possible (single SQL), falls back to
// individual creates only for tables that need special handling.
async function batchInsertRecords(
  tableName: string,
  records: Record<string, any>[]
): Promise<{ success: number; failed: number }> {
  if (records.length === 0) return { success: 0, failed: 0 };

  try {
    switch (tableName) {
      case "form_records_1":
        await prisma.formRecord1.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_2":
        await prisma.formRecord2.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_3":
        await prisma.formRecord3.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_4":
        await prisma.formRecord4.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_5":
        await prisma.formRecord5.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_6":
        await prisma.formRecord6.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_7":
        await prisma.formRecord7.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_8":
        await prisma.formRecord8.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_9":
        await prisma.formRecord9.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_10":
        await prisma.formRecord10.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_11":
        await prisma.formRecord11.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_12":
        await prisma.formRecord12.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_13":
        await prisma.formRecord13.createMany({ data: records, skipDuplicates: true });
        break;
      case "form_records_14":
        await prisma.formRecord14.createMany({ data: records as any, skipDuplicates: true });
        break;
      case "form_records_15":
        await prisma.formRecord15.createMany({ data: records as any, skipDuplicates: true });
        break;
      default:
        throw new Error(`Invalid table name: ${tableName}`);
    }
    return { success: records.length, failed: 0 };
  } catch (err: any) {
    // If createMany fails (e.g. constraint violation on one row),
    // fall back to individual inserts so we don't lose the whole batch
    console.warn(`[PROCESS] Batch insert failed for ${tableName}, falling back to individual inserts:`, err.message);
    let success = 0, failed = 0;
    for (const record of records) {
      try {
        switch (tableName) {
          case "form_records_1":  await prisma.formRecord1.create({ data: record }); break;
          case "form_records_2":  await prisma.formRecord2.create({ data: record }); break;
          case "form_records_3":  await prisma.formRecord3.create({ data: record }); break;
          case "form_records_4":  await prisma.formRecord4.create({ data: record }); break;
          case "form_records_5":  await prisma.formRecord5.create({ data: record }); break;
          case "form_records_6":  await prisma.formRecord6.create({ data: record }); break;
          case "form_records_7":  await prisma.formRecord7.create({ data: record }); break;
          case "form_records_8":  await prisma.formRecord8.create({ data: record }); break;
          case "form_records_9":  await prisma.formRecord9.create({ data: record }); break;
          case "form_records_10": await prisma.formRecord10.create({ data: record }); break;
          case "form_records_11": await prisma.formRecord11.create({ data: record }); break;
          case "form_records_12": await prisma.formRecord12.create({ data: record }); break;
          case "form_records_13": await prisma.formRecord13.create({ data: record }); break;
          case "form_records_14": await prisma.formRecord14.create({ data: record as any }); break;
          case "form_records_15": await prisma.formRecord15.create({ data: record as any }); break;
        }
        success++;
      } catch {
        failed++;
      }
    }
    return { success, failed };
  }
}

// ── Batch size for DB inserts ───────────────────────────────
// Prisma createMany can efficiently handle 200+ rows in a single SQL statement.
// Keeping batches at 200 balances memory usage with insert throughput.
const DB_BATCH_SIZE = 200;

export async function POST(request: NextRequest) {
  try {
    // === 1. Auth ===
    const authUser = await getAuthenticatedUser(request);
    const importingUserId: string | undefined = authUser?.id ?? undefined;

    // === 2. Parse body ===
    const bodyText = await request.text();
    if (!bodyText) {
      return NextResponse.json(
        { success: false, error: "Empty request body" },
        { status: 400 }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { importJobId, rows, chunkIndex, totalChunks } = payload;

    if (!importJobId || !Array.isArray(rows)) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: importJobId and rows[] required" },
        { status: 400 }
      );
    }

    // === 3. Load import job ===
    const job = await prisma.importJob.findUnique({
      where: { id: importJobId },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    // === 4. Resolve target table ===
    let tableMapping = await prisma.formTableMapping.findUnique({
      where: { formId: job.formId },
    });

    if (!tableMapping) {
      const existingMappings = await prisma.formTableMapping.findMany({
        select: { storageTable: true },
      });

      const tableCounts: Record<string, number> = {};
      existingMappings.forEach((m) => {
        tableCounts[m.storageTable] = (tableCounts[m.storageTable] || 0) + 1;
      });

      let minCount = Infinity;
      let bestTable: string | null = null;

      for (let i = 1; i <= 15; i++) {
        const tn = `form_records_${i}`;
        const count = tableCounts[tn] || 0;
        if (count < minCount) {
          minCount = count;
          bestTable = tn;
        }
      }

      if (bestTable) {
        tableMapping = await prisma.formTableMapping.create({
          data: { formId: job.formId, storageTable: bestTable },
        });
      } else {
        return NextResponse.json(
          { success: false, error: "Unable to assign storage table" },
          { status: 500 }
        );
      }
    }

    const targetTable = tableMapping.storageTable;

    // === 5. Load form ===
    const form = await DatabaseService.getForm(job.formId);
    if (!form) {
      return NextResponse.json(
        { success: false, error: "Form not found" },
        { status: 404 }
      );
    }

    // === 6. Resolve organizationId (required for form_records_14) ===
    let organizationId: string | undefined = authUser?.organizationId ?? undefined;
    if (!organizationId && form.moduleId) {
      const mod = await prisma.formModule.findUnique({
        where: { id: form.moduleId },
        select: { organizationId: true },
      });
      organizationId = mod?.organizationId ?? undefined;
    }

    if (targetTable === "form_records_14" && !organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId is required for employee forms but could not be resolved" },
        { status: 400 }
      );
    }

    // === 7. Check submission limits ===
    if (form.maxSubmissions && importingUserId) {
      const currentCount = await DatabaseService.getFormSubmissionCount(
        job.formId,
        importingUserId
      );
      if (currentCount + rows.length > form.maxSubmissions) {
        return NextResponse.json(
          { success: false, error: "Maximum submissions reached for this user" },
          { status: 429 }
        );
      }
    }

    // === 8. Load field mappings ===
    const rawMappings = await prisma.importFieldMapping.findMany({
      where: { importJobId },
    });

    if (rawMappings.length === 0) {
      return NextResponse.json(
        { success: false, error: "No field mappings found" },
        { status: 400 }
      );
    }

    const fieldIdMap = new Map<string, any>();
    const allFields = form.sections?.flatMap((s: any) => s.fields || []) || [];
    allFields.forEach((f: any) => fieldIdMap.set(f.id, f));

    const mappings = rawMappings.map((m) => ({
      sourceColumn: normalizeKey(m.sourceColumn),
      targetFieldId: m.targetFieldId,
      field: fieldIdMap.get(m.targetFieldId),
    }));

    // === 9. Mark job as processing (only on first chunk or non-chunked) ===
    const isFirstChunk = !chunkIndex || chunkIndex === 0;
    if (isFirstChunk) {
      await prisma.importJob.update({
        where: { id: importJobId },
        data: { status: "PROCESSING", startedAt: new Date() },
      });
    }

    // === 10. Transform all rows into insert-ready records ===
    const userAgent = request.headers.get("user-agent") || "Unknown";
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "Unknown";

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Prepare all valid records first (fast in-memory transform)
    const insertBatch: Record<string, any>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Normalize row keys
      const normRow: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => {
        normRow[normalizeKey(k)] = String(v || "").trim();
      });

      // Build field data from mappings
      const recordData: Record<string, any> = {};
      let hasData = false;

      for (const m of mappings) {
        let val = normRow[m.sourceColumn];
        if (val === undefined) {
          const match = Object.keys(normRow).find(
            (k) => k.toLowerCase() === m.sourceColumn.toLowerCase()
          );
          if (match) val = normRow[match];
        }
        if (val) {
          recordData[m.targetFieldId] = val;
          hasData = true;
        }
      }

      if (!hasData) {
        skippedCount++;
        continue;
      }

      try {
        // Transform to structured data matching manual submission format
        const structuredRecordData = transformToStructuredData(form, recordData, "system");

        const recordId = uuidv4();
        const now = new Date();
        const insertData: Record<string, any> = {
          id: recordId,
          formId: job.formId,
          recordData: structuredRecordData,
          submittedBy: "system",
          submittedAt: now,
          status: "submitted",
          userId: importingUserId,
          createdAt: now,
          updatedAt: now,
        };

        // form_records_14 has organizationId column — set it directly
        if (targetTable === "form_records_14" && organizationId) {
          insertData.organizationId = organizationId;
        }

        insertBatch.push(insertData);
      } catch (err: any) {
        failedCount++;
        console.error(`[PROCESS] Row ${i + 1} transform failed:`, err.message);
      }
    }

    // === 11. Batch insert in chunks of DB_BATCH_SIZE ===
    for (let offset = 0; offset < insertBatch.length; offset += DB_BATCH_SIZE) {
      const batch = insertBatch.slice(offset, offset + DB_BATCH_SIZE);
      const result = await batchInsertRecords(targetTable, batch);
      successCount += result.success;
      failedCount += result.failed;
    }

    // === 11b. Dual-write to unified FormRecord table (non-blocking) ===
    // This keeps the unified table in sync for forms that use it.
    // Always set organizationId here — the unified table supports it regardless of sharded table.
    if (insertBatch.length > 0) {
      try {
        const unifiedRecords = insertBatch.map((rec) => ({
          id: rec.id,
          formId: rec.formId,
          recordData: rec.recordData,
          organizationId: organizationId || null,
          submittedBy: rec.submittedBy,
          submittedAt: rec.submittedAt,
          status: rec.status,
          ipAddress: rec.ipAddress || null,
          userAgent: rec.userAgent || null,
          userId: rec.userId || null,
        }));

        for (let offset = 0; offset < unifiedRecords.length; offset += DB_BATCH_SIZE) {
          const batch = unifiedRecords.slice(offset, offset + DB_BATCH_SIZE);
          await prisma.formRecord.createMany({ data: batch, skipDuplicates: true });
        }
      } catch (dualWriteErr) {
        // Non-blocking — log but don't fail the import
        console.error("[PROCESS] Dual-write to unified table failed (non-blocking):", dualWriteErr);
      }
    }

    // === 12. Track events (non-blocking) ===
    DatabaseService.trackFormEvent(
      job.formId,
      "submit",
      {
        userId: importingUserId,
        fieldsCount: mappings.length,
        submissionSource: "import",
        rowsProcessed: successCount,
        rowsFailed: failedCount,
        rowsSkipped: skippedCount,
        chunkIndex: chunkIndex ?? 0,
      },
      undefined,
      userAgent,
      ipAddress
    ).catch(() => {});

    // === 13. Update job progress ===
    const isLastChunk = !totalChunks || (chunkIndex !== undefined && chunkIndex >= totalChunks - 1);

    if (isLastChunk) {
      // Final chunk: mark job as completed
      const finalStatus = successCount > 0 ? "COMPLETED" : "FAILED";
      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
        },
      });
    }

    // Always increment counters atomically
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        processedRows: { increment: rows.length },
        successRows: { increment: successCount },
        failedRows: { increment: failedCount },
      },
    });

    return NextResponse.json({
      success: true,
      successCount,
      failedCount,
      skippedCount,
      chunkIndex: chunkIndex ?? 0,
      isLastChunk,
      message: `Chunk processed: ${successCount} inserted, ${failedCount} failed, ${skippedCount} skipped`,
    });
  } catch (error: any) {
    console.error("[PROCESS] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Import failed", details: error.message },
      { status: 500 }
    );
  }
}
