// app/api/import/process/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DatabaseService } from "@/lib/database/database-service";
import { getAuthenticatedUser } from "@/lib/api-helpers";

const normalizeKey = (str: string): string => {
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
};

const generateApiName = (label: string): string => {
  if (!label) return "unnamed_field";
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/^_+|_+$/g, "")
      .substring(0, 50) || "unnamed_field"
  );
};

// Helper function to transform field IDs to structured data with field metadata
async function transformToStructuredData(
  form: any,
  recordData: Record<string, any>
): Promise<Record<string, any>> {
  const structuredData: Record<string, any> = {};

  // Create a mapping of field IDs to field definitions
  const fieldIdToFieldMap: Record<string, any> = {};
  let fieldOrder = 0;

  form.sections.forEach((section: any) => {
    section.fields.forEach((field: any) => {
      fieldIdToFieldMap[field.id] = {
        ...field,
        sectionId: section.id,
        sectionTitle: section.title,
        order: fieldOrder++,
      };
    });
  });

  // Transform the record data to include field metadata
  for (const [fieldId, value] of Object.entries(recordData)) {
    const fieldDef = fieldIdToFieldMap[fieldId];
    if (fieldDef) {
      // Store structured data with field metadata
      structuredData[fieldId] = {
        fieldId: fieldId,
        label: fieldDef.label,
        type: fieldDef.type,
        value: value,
        sectionId: fieldDef.sectionId,
        sectionTitle: fieldDef.sectionTitle,
        order: fieldDef.order,
        placeholder: fieldDef.placeholder,
        description: fieldDef.description,
        validation: fieldDef.validation || {},
        options: fieldDef.options || [],
        lookup: fieldDef.lookup || null,
      };
    } else {
      // If no field definition found, store with minimal metadata
      structuredData[fieldId] = {
        fieldId: fieldId,
        label: fieldId,
        type: "text",
        value: value,
        sectionId: null,
        sectionTitle: "Unknown",
        order: 999,
      };
    }
  }
  return structuredData;
}

export async function POST(request: NextRequest) {
  try {
    // === Extract session from cookie ===
    const authUser = await getAuthenticatedUser(request);

    let importingUserId: string | null = authUser?.id ?? null;

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

    const job = await prisma.importJob.findUnique({
      where: { id: importJobId },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    let tableMapping = await prisma.formTableMapping.findUnique({
      where: { formId: job.formId },
    });

    if (!tableMapping) {
      // Auto-create table mapping by selecting the least-loaded table
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
        const tableName = `form_records_${i}`;
        const count = tableCounts[tableName] || 0;
        if (count < minCount) {
          minCount = count;
          bestTable = tableName;
        }
      }

      if (bestTable) {
        tableMapping = await prisma.formTableMapping.create({
          data: {
            formId: job.formId,
            storageTable: bestTable,
          },
        });
      } else {
        return NextResponse.json(
          { success: false, error: "Unable to assign storage table" },
          { status: 500 }
        );
      }
    }

    const targetTable = tableMapping.storageTable;

    const form = await DatabaseService.getForm(job.formId);
    if (!form) {
      return NextResponse.json(
        { success: false, error: "Form not found" },
        { status: 404 }
      );
    }

    // Check submission limits if configured (per user, once before bulk to avoid partial failures)
    if (form.maxSubmissions && importingUserId) {
      const currentCount = await DatabaseService.getFormSubmissionCount(
        job.formId,
        importingUserId
      );
      if (currentCount + rows.length > form.maxSubmissions) {
        return NextResponse.json(
          {
            success: false,
            error: "Maximum submissions reached for this user",
          },
          { status: 429 }
        );
      }
    }

    const fields = form.sections?.flatMap((s: any) => s.fields || []) || [];
    const fieldMap = new Map<string, any>();
    fields.forEach((f: any) => fieldMap.set(f.id, f));

    const rawMappings = await prisma.importFieldMapping.findMany({
      where: { importJobId },
    });

    if (rawMappings.length === 0) {
      return NextResponse.json(
        { success: false, error: "No field mappings found" },
        { status: 400 }
      );
    }

    const mappings = rawMappings.map((m) => ({
      sourceColumn: normalizeKey(m.sourceColumn),
      targetFieldId: m.targetFieldId,
      field: fieldMap.get(m.targetFieldId),
    }));

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "PROCESSING",
        totalRows: rows.length,
        startedAt: new Date(),
      },
    });

    let success = 0,
      failed = 0,
      skipped = 0;

    const now = new Date();
    const nowIso = now.toISOString();
    const headersList = new Headers(request.headers);
    const userAgent = headersList.get("user-agent") || "Unknown";
    const ipAddress =
      headersList.get("x-forwarded-for") ||
      headersList.get("x-real-ip") ||
      "Unknown";

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const normRow: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => {
        normRow[normalizeKey(k)] = String(v || "").trim();
      });

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
        skipped++;
        continue;
      }

      try {
        // Transform field IDs to structured field data with metadata
        const structuredRecordData = await transformToStructuredData(
          form,
          recordData
        );

        // Create the form record using the same service as submission
        const record = await DatabaseService.createFormRecord(
          job.formId,
          structuredRecordData,
          "system",
          undefined,
          undefined,
          undefined,
          importingUserId ?? undefined
        );

        // Track form submission event (adapted for import)
        await DatabaseService.trackFormEvent(
          job.formId,
          "submit",
          {
            recordId: record.id,
            userId: importingUserId, // Include userId in event tracking (null if anonymous)
            fieldsCount: Object.keys(structuredRecordData).length,
            submissionSource: "import",
            hasEmployeeId: false,
            hasAmount: false,
            hasDate: false,
            originalFieldIds: Object.keys(recordData),
            structuredFields: Object.keys(structuredRecordData),
          },
          undefined,
          userAgent,
          ipAddress
        );

        success++;
      } catch (err: any) {
        failed++;
        console.error(`[PROCESS] Row ${i + 1} insert failed:`, err.message);
        console.error(
          `[PROCESS] Debug context - importingUserId: ${
            importingUserId || "NULL"
          }, targetTable: ${targetTable}`
        );
      }
    }

    const finalStatus = success > 0 ? "COMPLETED" : "FAILED";
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: finalStatus,
        processedRows: rows.length,
        successRows: success,
        failedRows: failed,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      successCount: success,
      failedCount: failed,
      skippedCount: skipped,
      status: finalStatus,
      message: `Imported ${success} records into "${targetTable}" as user ${
        importingUserId || "system"
      }`,
    });
  } catch (error: any) {
    console.error("[PROCESS] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Import failed", details: error.message },
      { status: 500 }
    );
  }
}
