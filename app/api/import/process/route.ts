// app/api/import/process/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DatabaseService } from "@/lib/database/database-service";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { v4 as uuidv4 } from "uuid";
import { transformToStructuredData } from "@/lib/utils/form-utils";

const normalizeKey = (str: string): string => {
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
};

// Direct insert into the correct sharded table (avoids per-row getFormRecordTable lookups)
async function insertRecord(tableName: string, data: Record<string, any>): Promise<any> {
  switch (tableName) {
    case "form_records_1":  return prisma.formRecord1.create({ data });
    case "form_records_2":  return prisma.formRecord2.create({ data });
    case "form_records_3":  return prisma.formRecord3.create({ data });
    case "form_records_4":  return prisma.formRecord4.create({ data });
    case "form_records_5":  return prisma.formRecord5.create({ data });
    case "form_records_6":  return prisma.formRecord6.create({ data });
    case "form_records_7":  return prisma.formRecord7.create({ data });
    case "form_records_8":  return prisma.formRecord8.create({ data });
    case "form_records_9":  return prisma.formRecord9.create({ data });
    case "form_records_10": return prisma.formRecord10.create({ data });
    case "form_records_11": return prisma.formRecord11.create({ data });
    case "form_records_12": return prisma.formRecord12.create({ data });
    case "form_records_13": return prisma.formRecord13.create({ data });
    case "form_records_14": return prisma.formRecord14.create({ data: data as any });
    case "form_records_15": return prisma.formRecord15.create({ data: data as any });
    default: throw new Error(`Invalid table name: ${tableName}`);
  }
}

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

    const payload = JSON.parse(bodyText);
    const { importJobId, rows } = payload;

    if (!importJobId || !Array.isArray(rows)) {
      return NextResponse.json(
        { success: false, error: "Invalid payload" },
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

    // === 9. Mark job as processing ===
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: "PROCESSING", totalRows: rows.length, startedAt: new Date() },
    });

    // === 10. Process rows ===
    let successCount = 0,
      failedCount = 0,
      skippedCount = 0;

    const userAgent =
      request.headers.get("user-agent") || "Unknown";
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "Unknown";

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

        // Build insert params
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

        // Add organizationId only for form_records_14
        if (targetTable === "form_records_14" && organizationId) {
          insertData.organizationId = organizationId;
        }

        // Insert directly into the target table (no redundant table lookup per row)
        await insertRecord(targetTable, insertData);

        // Track event (non-blocking — don't let tracking failure break the import)
        DatabaseService.trackFormEvent(
          job.formId,
          "submit",
          {
            recordId,
            userId: importingUserId,
            fieldsCount: Object.keys(structuredRecordData).length,
            submissionSource: "import",
            hasEmployeeId: false,
            hasAmount: false,
            hasDate: false,
          },
          undefined,
          userAgent,
          ipAddress
        ).catch(() => {});

        successCount++;
      } catch (err: any) {
        failedCount++;
        console.error(`[PROCESS] Row ${i + 1} insert failed:`, err.message);
      }
    }

    // === 12. Finalize job ===
    const finalStatus = successCount > 0 ? "COMPLETED" : "FAILED";
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: finalStatus,
        processedRows: rows.length,
        successRows: successCount,
        failedRows: failedCount,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      successCount,
      failedCount,
      skippedCount,
      status: finalStatus,
      message: `Imported ${successCount} records into "${targetTable}"`,
    });
  } catch (error: any) {
    console.error("[PROCESS] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Import failed", details: error.message },
      { status: 500 }
    );
  }
}
