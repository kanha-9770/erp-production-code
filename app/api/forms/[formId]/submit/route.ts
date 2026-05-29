// app/api/forms/[formId]/submit/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import crypto from "crypto";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { DatabaseTransforms } from "@/lib/database/DatabaseTransforms";
import { DatabaseService } from "@/lib/database/database-service";
import { triggerWorkflowsForRecord } from "@/lib/workflow/trigger";
import { runBindings } from "@/lib/functions/bindingRunner";

// ──────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────

interface FormField {
  id: string;
  label: string;
  type: string;
  sectionId?: string | null;
  subformId?: string | null;
  placeholder?: string | null;
  description?: string | null;
  validation?: Record<string, any>;
  options?: any[];
  lookup?: any;
  properties?: Record<string, any> | null;
  order: number;
}

interface FormSection {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  fields: FormField[];
}

interface Subform {
  id: string;
  name: string;
  description?: string | null;
  parentSubformId?: string | null;
  formId: string;
  order: number;
  level: number;
  path?: string | null;
  fields: FormField[];
  childSubforms?: Subform[];
}

interface Form {
  id: string;
  moduleId: string;
  name: string;
  description?: string | null;
  isPublished: boolean;
  requireLogin: boolean;
  maxSubmissions?: number | null;
  submissionMessage?: string | null;
  isEmployeeForm?: boolean;
  isUserForm?: boolean;
  sections: FormSection[];
  subforms: Subform[];
  module: {
    organizationId: string | null;
  } | null;
}

// Optimized: store only fieldId → value (no redundant metadata)
interface StructuredSectionData {
  fields: Record<string, any>; // fieldId → value only
}

interface StructuredSubformData {
  fields: Record<string, any>; // fieldId → value only
  rows?: StructuredSubformRowData[];
  childSubforms?: Record<string, StructuredSubformData>;
}

interface StructuredSubformRowData {
  rowIndex: number;
  instanceId: string;
  fields: Record<string, any>; // fieldId → value only
}

interface StructuredRecordData {
  formId: string;
  formName: string;
  sections: Record<string, StructuredSectionData>;
  subforms: Record<string, StructuredSubformData>;
  metadata: {
    submittedAt: string;
    submittedBy: string;
    totalFields: number;
    totalSections: number;
    totalSubforms: number;
  };
}

function flattenSubformFields(subforms: Subform[]): FormField[] {
  const out: FormField[] = [];
  for (const sf of subforms) {
    if (sf.fields?.length) out.push(...sf.fields);
    if (sf.childSubforms?.length) out.push(...flattenSubformFields(sf.childSubforms));
  }
  return out;
}

// ──────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────

export async function POST(request: NextRequest, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  try {
    const { formId } = params;
    const body = await request.json();

    // ─── 1. Authentication ──────────────────────────────────────
    const authUser = await getAuthenticatedUser(request);
    let currentUserId: string | undefined;
    let currentOrgId: string | undefined;
    let submittedByDisplay = "anonymous";

    if (authUser) {
      currentUserId = authUser.id;
      currentOrgId = authUser.organizationId ?? undefined;
      submittedByDisplay = authUser.email || "user";
    }

    // ─── 2. Fetch form data ─────────────────────────────────────
    const form = await getFormWithStructure(formId);

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    if (!form.isPublished) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    if (form.requireLogin && !authUser) {
      return NextResponse.json(
        { error: "This form requires authentication" },
        { status: 401 }
      );
    }

    // Enforce max submissions per authenticated user
    if (form.requireLogin && form.maxSubmissions !== null && form.maxSubmissions !== undefined) {
      const existingSubmissions = await prisma.formRecord.count({
        where: {
          formId: form.id,
          userId: currentUserId,
        },
      });

      if (existingSubmissions >= form.maxSubmissions) {
        return NextResponse.json(
          { error: "Maximum submissions reached for this user" },
          { status: 429 }
        );
      }
    }

    // ─── 3. Resolve organizationId ──────────────────────────────
    let organizationId = currentOrgId || form.module?.organizationId;

    // Employee forms strictly require organization
    const tableName = await DatabaseTransforms.getFormRecordTable(formId);
    if (tableName === "form_records_14" && !organizationId) {
      return NextResponse.json(
        { error: "Cannot submit employee form: no organization context available" },
        { status: 400 }
      );
    }

    // User forms (table 15) should have userId if possible
    if (tableName === "form_records_15" && !currentUserId) {
      // Optional: return error if you want to enforce
      // return NextResponse.json({ error: "Cannot submit user form: no user context" }, { status: 400 });
    }

    // ─── 4a. Validate leave start date (server-side) ────────────
    // Reject if any date field labeled "Leave Start Date" contains a past date.
    // Uses server date (normalized to midnight) so client clock manipulation is irrelevant.
    {
      const serverToday = new Date();
      serverToday.setHours(0, 0, 0, 0);

      const allFields: FormField[] = [
        ...form.sections.flatMap((s) => s.fields),
        ...flattenSubformFields(form.subforms || []),
      ];

      for (const field of allFields) {
        const labelLower = (field.label || "").toLowerCase();
        const isLeaveDate =
          (labelLower.includes("leave start") || labelLower.includes("leave end")) && field.type === "date";
        const isExplicitlyGuarded =
          (field.properties as Record<string, any> | null)?.disallowPastDates === true &&
          field.type === "date";

        if (isLeaveDate || isExplicitlyGuarded) {
          const submittedValue = body.recordData?.[field.id];
          if (submittedValue) {
            const submittedDate = new Date(submittedValue);
            submittedDate.setHours(0, 0, 0, 0);
            if (submittedDate < serverToday) {
              return NextResponse.json(
                { error: "Leave dates cannot be in the past." },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // ─── 4b. Generate unique IDs ─────────────────────────────────
    const finalRecordData = await generateUniqueIds(form, body.recordData);

    // ─── 5. Build structured record data ────────────────────────
    const structuredRecordData = transformToStructuredData(
      form,
      finalRecordData,
      submittedByDisplay
    );

    // ─── 5b. beforeSubmit FunctionBindings ──────────────────────
    // These bindings run AWAITED before any record is touched. Any binding
    // returning `{ ok: false, error }` short-circuits the submit with 400.
    // Skipped for unauthenticated users (no org/user context to scope).
    if (organizationId && currentUserId) {
      const beforeResults = await runBindings(
        "beforeSubmit",
        { formId: form.id },
        {
          organizationId,
          userId: currentUserId,
          formData: finalRecordData,
        }
      );
      const failed = beforeResults.find((r) => !r.ok);
      if (failed) {
        return NextResponse.json(
          {
            error: failed.error || `Validation failed in ${failed.functionName}`,
            binding: { id: failed.bindingId, functionName: failed.functionName },
          },
          { status: 400 }
        );
      }
    }

    // ─── 6. Client metadata ─────────────────────────────────────
    const headersList = await headers();
    const userAgent = headersList.get("user-agent") || body.userAgent || "Unknown";
    const ipAddress =
      headersList.get("x-forwarded-for") ||
      headersList.get("x-real-ip") ||
      "::1";

    // ─── 7. Create or update record ───────────────────────────────
    const editingRecordId = body.editingRecordId as string | undefined;

    if (editingRecordId) {
      // UPDATE existing record — reuse the same structured data transformation
      const updatedRecord = await DatabaseService.updateFormRecord(editingRecordId, {
        recordData: structuredRecordData,
        status: "submitted",
        submittedBy: submittedByDisplay,
        updatedAt: new Date(),
      });

      // Fire workflow rules attached to "Edit" / "Create or Edit".
      // Awaited so any Field Update / Function-return writes hit the DB
      // BEFORE we return to the client — otherwise the records table (which
      // refetches on the submit response) shows pre-workflow state. Errors
      // are already swallowed inside triggerWorkflowsForRecord, so awaiting
      // it can never break the save.
      //
      // Workflows fire on org alone — anonymous public-form submissions
      // need to trigger Email / System Notification actions too. The trigger
      // skips Function actions internally when there's no acting user.
      if (organizationId) {
        const mod = await prisma.formModule
          .findFirst({ where: { id: form.moduleId }, select: { name: true } })
          .catch(() => null)
        if (mod?.name) {
          await triggerWorkflowsForRecord({
            moduleName: mod.name,
            action: "Edit",
            organizationId: organizationId!,
            userId: currentUserId,
            formId: form.id,
            recordId: updatedRecord.id,
            recordData: structuredRecordData as any,
          })
        }

        // afterUpdate FunctionBindings still need an acting user — keep
        // them gated until that's ready to support anonymous runs.
        if (currentUserId) {
          runBindings(
            "afterUpdate",
            { formId: form.id, moduleId: form.moduleId },
            {
              organizationId,
              userId: currentUserId,
              formData: finalRecordData,
              recordData: structuredRecordData,
              recordId: updatedRecord.id,
            }
          ).catch((err) => console.error("[binding] afterUpdate failed", err));
        }
      }

      return NextResponse.json({
        success: true,
        message: "Record updated successfully!",
        data: {
          id: updatedRecord.id,
          recordData: structuredRecordData,
          submittedAt: updatedRecord.submittedAt,
          form: { id: form.id, name: form.name },
        },
      });
    }

    const record = await createFormRecord(
      formId,
      tableName,
      structuredRecordData,
      submittedByDisplay,
      ipAddress,
      userAgent,
      organizationId || undefined,
      currentUserId
    );

    // Fire workflow rules attached to "Create" / "Create or Edit".
    // See note above on the Edit path — awaited so the submit response
    // reflects any Field Update / Function writes the workflow makes.
    //
    // Workflows fire on org alone so anonymous public-form submissions
    // still dispatch Email / System Notifications.
    if (organizationId) {
      const mod = await prisma.formModule
        .findFirst({ where: { id: form.moduleId }, select: { name: true } })
        .catch(() => null)
      if (mod?.name) {
        await triggerWorkflowsForRecord({
          moduleName: mod.name,
          action: "Create",
          organizationId: organizationId!,
          userId: currentUserId,
          formId: form.id,
          recordId: record.id,
          recordData: structuredRecordData as any,
        })
      }

      // afterCreate FunctionBindings still need an acting user.
      if (currentUserId) {
        runBindings(
          "afterCreate",
          { formId: form.id, moduleId: form.moduleId },
          {
            organizationId,
            userId: currentUserId,
            formData: finalRecordData,
            recordData: structuredRecordData,
            recordId: record.id,
          }
        ).catch((err) => console.error("[binding] afterCreate failed", err));
      }
    }

    return NextResponse.json({
      success: true,
      message: form.submissionMessage || "Form submitted successfully!",
      data: {
        id: record.id,
        recordData: structuredRecordData,
        submittedAt: record.submittedAt,
        form: {
          id: form.id,
          name: form.name,
        },
      },
    });
  } catch (error: any) {
    console.error("[FORM SUBMIT] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to submit form",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function getFormWithStructure(formId: string): Promise<Form | null> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      sections: {
        include: {
          fields: { orderBy: { order: "asc" } },
        },
        orderBy: { order: "asc" },
      },
      subforms: {
        where: { parentSubformId: null },
        include: {
          fields: { orderBy: { order: "asc" } },
          childSubforms: {
            include: {
              fields: { orderBy: { order: "asc" } },
              childSubforms: {
                include: {
                  fields: { orderBy: { order: "asc" } },
                  childSubforms: {
                    include: {
                      fields: { orderBy: { order: "asc" } },
                    },
                    orderBy: { order: "asc" },
                  },
                },
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
      module: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  return form as Form | null;
}

async function generateUniqueIds(form: Form, recordData: Record<string, any>): Promise<Record<string, any>> {
  const finalRecordData = { ...recordData };

  const uniqueIdFields: FormField[] = [];

  form.sections.forEach((section) => {
    section.fields.forEach((field) => {
      if (field.type === "unique-id") uniqueIdFields.push(field);
    });
  });

  const collectFromSubforms = (subforms: Subform[]) => {
    subforms.forEach((subform) => {
      subform.fields.forEach((field) => {
        if (field.type === "unique-id") uniqueIdFields.push(field);
      });
      if (subform.childSubforms) collectFromSubforms(subform.childSubforms);
    });
  };

  if (form.subforms) collectFromSubforms(form.subforms);

  for (const field of uniqueIdFields) {
    const fieldId = field.id;
    if (finalRecordData[fieldId]) continue;

    const properties = field.properties || {};
    const mode = properties.uniqueIdMode || "uuid";
    const prefix = properties.uniqueIdPrefix || "";
    const minDigits = Number(properties.uniqueIdMinDigits) || 6;
    const startFrom = Number(properties.uniqueIdStart) || 1;

    let generatedId: string;

    if (mode === "uuid") {
      generatedId = crypto.randomUUID();
    } else {
      generatedId = await prisma.$transaction(async (tx) => {
        let counter = await tx.uniqueIdCounter.findUnique({ where: { fieldId } });

        if (!counter) {
          counter = await tx.uniqueIdCounter.create({
            data: { fieldId, lastNumber: BigInt(startFrom - 1) },
          });
        }

        counter = await tx.uniqueIdCounter.update({
          where: { id: counter.id },
          data: { lastNumber: { increment: BigInt(1) } },
        });

        const number = Number(counter.lastNumber);
        const padded = number.toString().padStart(minDigits, "0");
        return mode === "prefix" ? `${prefix}${padded}` : padded;
      });
    }

    finalRecordData[fieldId] = generatedId;
  }

  return finalRecordData;
}

function transformToStructuredData(
  form: Form,
  recordData: Record<string, any>,
  submittedBy: string
): StructuredRecordData {
  const structured: StructuredRecordData = {
    formId: form.id,
    formName: form.name,
    sections: {},
    subforms: {},
    metadata: {
      submittedAt: new Date().toISOString(),
      submittedBy,
      totalFields: 0,
      totalSections: form.sections.length,
      totalSubforms: 0,
    },
  };

  let fieldCount = 0;
  let subformCount = 0;

  // Sections — store only fieldId → value
  form.sections.forEach((section) => {
    const sectionData: StructuredSectionData = { fields: {} };

    section.fields.forEach((field) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        sectionData.fields[field.id] = value;
        fieldCount++;
      }
    });

    structured.sections[section.id] = sectionData;
  });

  // Subforms — store only fieldId → value
  const processSubform = (subform: Subform): StructuredSubformData => {
    subformCount++;

    const data: StructuredSubformData = {
      fields: {},
      rows: [],
      childSubforms: {},
    };

    // Static fields
    subform.fields.forEach((field) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        data.fields[field.id] = value;
        fieldCount++;
      }
    });

    // Dynamic rows
    const rowsKey = `_dynamicRows_${subform.id}`;
    const rows = recordData[rowsKey];

    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach((row: any, idx: number) => {
        const rowFields: Record<string, any> = {};

        subform.fields.forEach((field) => {
          const val = row[field.id];
          if (val !== undefined) {
            rowFields[field.id] = val;
            fieldCount++;
          }
        });

        data.rows!.push({
          rowIndex: row._rowIndex || idx + 1,
          instanceId: row._instanceId || `row_${idx}`,
          fields: rowFields,
        });
      });
    }

    // Children
    if (subform.childSubforms?.length) {
      subform.childSubforms.forEach((child) => {
        data.childSubforms![child.id] = processSubform(child);
      });
    }

    return data;
  };

  if (form.subforms) {
    form.subforms.forEach((subform) => {
      structured.subforms[subform.id] = processSubform(subform);
    });
  }

  structured.metadata.totalFields = fieldCount;
  structured.metadata.totalSubforms = subformCount;

  return structured;
}

async function createFormRecord(
  formId: string,
  tableName: string,
  structuredRecordData: StructuredRecordData,
  submittedBy: string,
  ipAddress: string,
  userAgent: string,
  organizationId?: string,
  userId?: string
): Promise<any> {
  const recordId = crypto.randomUUID();
  const now = new Date();

  const baseData = {
    id: recordId,
    formId,
    recordData: structuredRecordData as any,
    submittedBy,
    submittedAt: now,
    status: "submitted",
    ipAddress,
    userAgent,
    createdAt: now,
    updatedAt: now,
  };

  const extra: Record<string, any> = {};

  if (tableName === "form_records_14") {
    if (!organizationId) {
      throw new Error("organizationId is required for employee forms (form_records_14)");
    }
    extra.organizationId = organizationId;
  }

  if (userId) {
    extra.userId = userId;
  }

  const finalData = { ...baseData, ...extra };

  // ─── Write to OLD sharded table (existing behavior) ─────────
  let oldRecord: any;
  switch (tableName) {
    case "form_records_1":  oldRecord = await prisma.formRecord1.create({ data: finalData }); break;
    case "form_records_2":  oldRecord = await prisma.formRecord2.create({ data: finalData }); break;
    case "form_records_3":  oldRecord = await prisma.formRecord3.create({ data: finalData }); break;
    case "form_records_4":  oldRecord = await prisma.formRecord4.create({ data: finalData }); break;
    case "form_records_5":  oldRecord = await prisma.formRecord5.create({ data: finalData }); break;
    case "form_records_6":  oldRecord = await prisma.formRecord6.create({ data: finalData }); break;
    case "form_records_7":  oldRecord = await prisma.formRecord7.create({ data: finalData }); break;
    case "form_records_8":  oldRecord = await prisma.formRecord8.create({ data: finalData }); break;
    case "form_records_9":  oldRecord = await prisma.formRecord9.create({ data: finalData }); break;
    case "form_records_10": oldRecord = await prisma.formRecord10.create({ data: finalData }); break;
    case "form_records_11": oldRecord = await prisma.formRecord11.create({ data: finalData }); break;
    case "form_records_12": oldRecord = await prisma.formRecord12.create({ data: finalData }); break;
    case "form_records_13": oldRecord = await prisma.formRecord13.create({ data: finalData }); break;
    case "form_records_14": oldRecord = await prisma.formRecord14.create({ data: finalData as any }); break;
    case "form_records_15": oldRecord = await prisma.formRecord15.create({ data: finalData as any }); break;
    default:
      throw new Error(`Unsupported table: ${tableName}`);
  }

  // ─── DUAL-WRITE: Also write to unified form_records table ───
  try {
    await prisma.formRecord.create({
      data: {
        id: recordId,
        formId,
        recordData: structuredRecordData as any,
        organizationId: organizationId || null,
        submittedBy,
        submittedAt: now,
        status: "submitted",
        ipAddress,
        userAgent,
        userId: userId || null,
      },
    });

    // Materialize indexed fields into FormRecordField
    await materializeIndexedFields(recordId, formId, structuredRecordData);
  } catch (dualWriteError) {
    // Dual-write failure should NOT block the original submission
    console.error("[DUAL-WRITE] Failed to write to unified table (non-blocking):", dualWriteError);
  }

  return oldRecord;
}

// ──────────────────────────────────────────────
// Materialize indexed fields into FormRecordField
// ──────────────────────────────────────────────

async function materializeIndexedFields(
  recordId: string,
  formId: string,
  structuredData: StructuredRecordData
): Promise<void> {
  // Fetch which fields are marked as indexed
  const indexedFields = await prisma.formField.findMany({
    where: { isIndexed: true },
    include: { section: { select: { formId: true } }, subform: { select: { formId: true } } },
  });

  // Build a set of indexed field IDs that belong to this form
  const indexedFieldIds = new Set(
    indexedFields
      .filter((f) => {
        const fieldFormId = f.section?.formId || f.subform?.formId;
        return fieldFormId === formId;
      })
      .map((f) => f.id)
  );

  if (indexedFieldIds.size === 0) return;

  const fieldRows: Array<{
    recordId: string;
    formId: string;
    fieldId: string;
    subformId: string | null;
    subformRowIndex: number | null;
    value_text: string | null;
    value_number: any;
    value_date: Date | null;
    value_bool: boolean | null;
  }> = [];

  // Helper to determine typed value columns
  const toTypedValue = (value: any, fieldType: string) => {
    const row = {
      value_text: null as string | null,
      value_number: null as any,
      value_date: null as Date | null,
      value_bool: null as boolean | null,
    };

    if (value === null || value === undefined || value === "") return row;

    switch (fieldType) {
      case "number":
      case "currency":
      case "decimal":
        row.value_number = isNaN(Number(value)) ? null : Number(value);
        break;
      case "date":
      case "datetime":
        row.value_date = new Date(value);
        if (isNaN(row.value_date.getTime())) row.value_date = null;
        break;
      case "checkbox":
      case "toggle":
      case "boolean":
        row.value_bool = Boolean(value);
        break;
      default:
        row.value_text = typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    return row;
  };

  // Build a type lookup from indexed fields for typed value conversion
  const fieldTypeLookup = new Map<string, string>();
  indexedFields.forEach((f) => fieldTypeLookup.set(f.id, f.type));

  // Extract from sections (slim format: fieldId → value)
  for (const section of Object.values(structuredData.sections)) {
    for (const [fieldId, value] of Object.entries(section.fields)) {
      if (indexedFieldIds.has(fieldId)) {
        const typed = toTypedValue(value, fieldTypeLookup.get(fieldId) || "text");
        fieldRows.push({
          recordId,
          formId,
          fieldId,
          subformId: null,
          subformRowIndex: null,
          ...typed,
        });
      }
    }
  }

  // Extract from subforms (including rows)
  const processSubformFields = (subformData: Record<string, StructuredSubformData>, parentSubformId?: string) => {
    for (const [subformId, subform] of Object.entries(subformData)) {
      // Static fields
      for (const [fieldId, value] of Object.entries(subform.fields)) {
        if (indexedFieldIds.has(fieldId)) {
          const typed = toTypedValue(value, fieldTypeLookup.get(fieldId) || "text");
          fieldRows.push({
            recordId,
            formId,
            fieldId,
            subformId,
            subformRowIndex: null,
            ...typed,
          });
        }
      }

      // Dynamic rows
      if (subform.rows) {
        for (const row of subform.rows) {
          for (const [fieldId, value] of Object.entries(row.fields)) {
            if (indexedFieldIds.has(fieldId)) {
              const typed = toTypedValue(value, fieldTypeLookup.get(fieldId) || "text");
              fieldRows.push({
                recordId,
                formId,
                fieldId,
                subformId,
                subformRowIndex: row.rowIndex,
                ...typed,
              });
            }
          }
        }
      }

      // Child subforms
      if (subform.childSubforms) {
        processSubformFields(subform.childSubforms, subformId);
      }
    }
  };

  processSubformFields(structuredData.subforms);

  // Batch insert all indexed field values
  if (fieldRows.length > 0) {
    await prisma.formRecordField.createMany({ data: fieldRows });
  }
}
