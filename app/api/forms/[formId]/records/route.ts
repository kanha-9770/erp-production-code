import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import {
  getCallerRoleContext,
  getInheritedUserIds,
} from "@/lib/database/roles";

// ────────────────────────────────────────────────────────────────────────────
// GET /api/forms/[formId]/records
//
// Auth:       Required — user must be logged in
// Org scope:  Automatic — records are filtered to the caller's organization
// Pagination: ?page=1&limit=50  (defaults: page=1, limit=50, max 200)
// Filters:    ?status=submitted  (optional)
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  const { formId } = await params;

  if (!formId) {
    return NextResponse.json(
      { success: false, message: "formId is required" },
      { status: 400 },
    );
  }

  // ────────────────────────────────────────────────
  // 1. Authentication — no anonymous record access
  // ────────────────────────────────────────────────
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);

  // Parse pagination params
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const skip = (page - 1) * limit;

  // Optional status filter
  const statusFilter = searchParams.get("status") || null;

  try {
    // ────────────────────────────────────────────────
    // 2. Fetch form structure (once — reused for enrichment + field lookup)
    // ────────────────────────────────────────────────
    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        module: { select: { organizationId: true } },
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
                  },
                  orderBy: { order: "asc" },
                },
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
        tableMapping: true,
      },
    });

    if (!form) {
      return NextResponse.json(
        { success: false, message: "Form not found" },
        { status: 404 },
      );
    }

    // ────────────────────────────────────────────────
    // 3. Organization scoping — enforce server-side, never trust client
    // ────────────────────────────────────────────────
    const formOrgId = (form.module as any)?.organizationId || null;
    const userOrgId = authUser.organizationId;

    // If the form belongs to an org, the user must be in that org
    if (formOrgId && userOrgId && formOrgId !== userOrgId) {
      return NextResponse.json(
        { success: false, message: "You do not have access to this form's records" },
        { status: 403 },
      );
    }

    // ────────────────────────────────────────────────
    // 3b. Hierarchical record-inheritance filter
    //
    // Default behavior: a user sees their own records PLUS the records of
    // every user beneath them in the role tree (limited to users they
    // share an organization unit with). The form owner can disable this
    // by setting `Form.settings.inheritsToAncestors = false`, in which
    // case non-admin users see only their own submissions.
    //
    // Admins (`Role.isAdmin = true`) bypass the filter entirely and see
    // every record in the form, regardless of the toggle.
    //
    // The helpers below are cached for ~60s per user, so a dashboard
    // page that fetches records for many forms only pays this cost once.
    // ────────────────────────────────────────────────
    let inheritanceUserIdFilter: string[] | null = null; // null = no filter (admin)
    if (userOrgId) {
      const callerCtx = await getCallerRoleContext(authUser.id, userOrgId);
      if (!callerCtx.isAdmin) {
        const formSettings = (form.settings as any) || {};
        const formInherits = formSettings.inheritsToAncestors !== false; // default true
        if (formInherits) {
          const inheritedUserIds = await getInheritedUserIds(userOrgId, callerCtx);
          // Caller always sees their own records.
          inheritanceUserIdFilter = Array.from(
            new Set([authUser.id, ...(inheritedUserIds ?? [])])
          );
        } else {
          // Sharing disabled — non-admin viewers only see their own.
          inheritanceUserIdFilter = [authUser.id];
        }
      }
    }

    // ────────────────────────────────────────────────
    // 4. Build field & subform lookups for enrichment
    // ────────────────────────────────────────────────
    const allowedFieldIds = new Set<string>();

    const fieldLookup: Record<
      string,
      { label: string; sectionTitle: string; type: string; sectionId: string; subformId?: string; subformName?: string }
    > = {};
    const subformLookup: Record<
      string,
      { name: string; sectionTitle: string; fields: any[] }
    > = {};

    // Field ids that must be stripped from records the caller is viewing
    // through inheritance (i.e. they are not the original creator). The
    // creator always sees the full row regardless of these flags.
    const inheritanceExcludedFieldIds = new Set<string>();

    form.sections.forEach((section: any) => {
      const sectionTitle = section.title || "Default Section";
      section.fields.forEach((f: any) => {
        allowedFieldIds.add(f.id);
        fieldLookup[f.id] = {
          label: f.label,
          sectionTitle,
          type: f.type,
          sectionId: section.id,
        };
        if (section.excludeFromInheritance) {
          inheritanceExcludedFieldIds.add(f.id);
        }
      });
    });

    const buildSubformLookups = (subform: any, parentPath: string = "") => {
      const fullTitle = parentPath ? `${parentPath} → ${subform.name}` : subform.name;
      subformLookup[subform.id] = {
        name: subform.name,
        sectionTitle: fullTitle,
        fields: subform.fields,
      };
      subform.fields.forEach((f: any) => {
        allowedFieldIds.add(f.id);
        fieldLookup[f.id] = {
          label: f.label,
          sectionTitle: fullTitle,
          type: f.type,
          sectionId: "subform",
          subformId: subform.id,
          subformName: subform.name,
        };
      });
      subform.childSubforms?.forEach((cs: any) => buildSubformLookups(cs, fullTitle));
    };

    form.subforms?.forEach((sf: any) => buildSubformLookups(sf));

    // ────────────────────────────────────────────────
    // 5. Build WHERE clause — org-scoped where possible
    // ────────────────────────────────────────────────
    const whereClause: any = { formId: form.id };

    // Only add organizationId filter for tables that actually have the column:
    // - form_records_14 (employee forms) has organizationId
    // - The unified form_records table has organizationId
    // - Tables 1-13, 15 do NOT have organizationId
    const storageTable = (form.tableMapping as any)?.storageTable || "";
    const tableSupportsOrg = storageTable === "form_records_14";

    if (userOrgId && tableSupportsOrg) {
      whereClause.organizationId = userOrgId;
    }

    if (statusFilter) {
      whereClause.status = statusFilter;
    }

    // Apply hierarchical-inheritance filter as a single IN clause. This
    // hits the new `[formId, userId]` composite index on every FormRecord
    // shard. `null` (admin path) means no filter — they see everything.
    if (inheritanceUserIdFilter !== null) {
      whereClause.userId = { in: inheritanceUserIdFilter };
    }

    // ────────────────────────────────────────────────
    // 6. Fetch records with pagination + total count
    // ────────────────────────────────────────────────
    let records: any[] = [];
    let totalCount = 0;

    if (form.tableMapping) {
      const match = (form.tableMapping as any).storageTable?.match(/form_records_(\d+)/);
      if (match) {
        const modelName = `formRecord${match[1]}`;
        try {
          // @ts-ignore - dynamic model access
          [records, totalCount] = await Promise.all([
            (prisma as any)[modelName].findMany({
              where: whereClause,
              orderBy: { createdAt: "desc" },
              skip,
              take: limit,
            }),
            (prisma as any)[modelName].count({ where: whereClause }),
          ]);
        } catch (err) {
          console.error(`Failed to query model ${modelName}:`, err);
        }
      }
    }

    const totalPages = Math.ceil(totalCount / limit) || 1;

    // ────────────────────────────────────────────────
    // 7. Transform/enrich record data (slim → rich for frontend)
    // ────────────────────────────────────────────────
    const isSlimFormat = (recordData: any): boolean => {
      if (!recordData?.sections) return false;
      for (const section of Object.values(recordData.sections) as any[]) {
        if (!section.fields) continue;
        for (const fieldEntry of Object.values(section.fields)) {
          if (fieldEntry && typeof fieldEntry === "object" && "fieldId" in fieldEntry) {
            return false;
          }
          return true;
        }
      }
      return true;
    };

    const enrichField = (fieldId: string, value: any, context: {
      sectionId?: string; subformId?: string; subformName?: string; sectionTitle?: string;
    }) => {
      const info = fieldLookup[fieldId];
      return {
        fieldId,
        label: info?.label || "Unknown Field",
        type: info?.type || "text",
        value,
        sectionId: context.sectionId || info?.sectionId || "other",
        sectionTitle: context.sectionTitle || info?.sectionTitle || "Default Section",
        ...(context.subformId && {
          subformId: context.subformId,
          subformName: context.subformName,
          subformTitle: context.subformName,
        }),
      };
    };

    const transformRecordData = (recordData: any): Record<string, any> => {
      if (!recordData) return {};

      const transformed: Record<string, any> = {};
      const hasStructuredFormat = recordData.sections || recordData.subforms;

      if (!hasStructuredFormat) {
        return enrichLegacyData(recordData);
      }

      const slim = isSlimFormat(recordData);

      // Sections
      if (recordData.sections) {
        Object.entries(recordData.sections).forEach(([sectionId, sectionData]: [string, any]) => {
          if (!sectionData.fields) return;
          Object.entries(sectionData.fields).forEach(([fieldId, fieldEntry]: [string, any]) => {
            if (!allowedFieldIds.has(fieldId)) return;

            if (slim) {
              transformed[fieldId] = enrichField(fieldId, fieldEntry, { sectionId });
            } else {
              const info = fieldLookup[fieldId];
              transformed[fieldId] = {
                ...fieldEntry,
                fieldId,
                sectionId,
                sectionTitle: sectionData.sectionTitle || info?.sectionTitle || "Default Section",
                type: info?.type || fieldEntry.type,
                label: fieldEntry.label || info?.label || "Unknown Field",
              };
            }
          });
        });
      }

      // Subforms
      if (recordData.subforms) {
        Object.entries(recordData.subforms).forEach(([subformId, subformData]: [string, any]) => {
          const subformInfo = subformLookup[subformId];
          const subformName = subformData.subformName || subformInfo?.name || "Subform";

          if (subformData.fields) {
            Object.entries(subformData.fields).forEach(([fieldId, fieldEntry]: [string, any]) => {
              if (!allowedFieldIds.has(fieldId)) return;

              if (slim) {
                transformed[fieldId] = enrichField(fieldId, fieldEntry, {
                  sectionId: "subform",
                  subformId,
                  subformName,
                  sectionTitle: subformInfo?.sectionTitle || subformName,
                });
              } else {
                const info = fieldLookup[fieldId];
                transformed[fieldId] = {
                  ...fieldEntry,
                  fieldId,
                  subformId,
                  subformName,
                  subformTitle: subformName,
                  sectionId: "subform",
                  sectionTitle: subformInfo?.sectionTitle || subformName,
                  type: info?.type || fieldEntry.type,
                  label: fieldEntry.label || info?.label || "Unknown Field",
                };
              }
            });
          }

          if (subformData.rows?.length > 0) {
            const dynamicRowKey = `_dynamicRows_${subformId}`;
            transformed[dynamicRowKey] = buildDynamicRowEntry(
              subformData.rows, subformId, subformName, subformInfo, slim
            );
          }

          if (subformData.childSubforms) {
            processChildSubforms(subformData.childSubforms, subformName, transformed, slim);
          }
        });
      }

      return transformed;
    };

    const buildDynamicRowEntry = (
      rows: any[], subformId: string, subformName: string,
      subformInfo: any, slim: boolean
    ) => {
      const rowValues = rows.map((row: any) => {
        const rowData: Record<string, any> = {};
        if (row.fields) {
          Object.entries(row.fields).forEach(([fId, fEntry]: [string, any]) => {
            rowData[fId] = slim ? fEntry : (fEntry as any).value;
          });
        }
        return rowData;
      });

      return {
        type: "dynamicRows",
        label: subformName,
        value: rowValues,
        subformId,
        subformName,
        subformTitle: subformName,
        sectionTitle: subformInfo?.sectionTitle || "Subforms",
        fieldDefinitions: subformInfo?.fields?.map((f: any) => ({
          id: f.id, label: f.label, type: f.type,
        })) || [],
      };
    };

    const processChildSubforms = (
      childSubforms: Record<string, any>,
      parentPath: string,
      transformed: Record<string, any>,
      slim: boolean
    ) => {
      Object.entries(childSubforms).forEach(([childId, childData]: [string, any]) => {
        const childInfo = subformLookup[childId];
        const childName = childData.subformName || childInfo?.name || "Child Subform";
        const fullPath = `${parentPath} → ${childName}`;

        if (childData.fields) {
          Object.entries(childData.fields).forEach(([fieldId, fieldEntry]: [string, any]) => {
            if (!allowedFieldIds.has(fieldId)) return;

            if (slim) {
              transformed[fieldId] = enrichField(fieldId, fieldEntry, {
                sectionId: "subform",
                subformId: childId,
                subformName: childName,
                sectionTitle: fullPath,
              });
            } else {
              const info = fieldLookup[fieldId];
              transformed[fieldId] = {
                ...fieldEntry,
                fieldId,
                subformId: childId,
                subformName: childName,
                subformTitle: fullPath,
                sectionId: "subform",
                sectionTitle: fullPath,
                type: info?.type || fieldEntry.type,
                label: fieldEntry.label || info?.label || "Unknown Field",
              };
            }
          });
        }

        if (childData.rows?.length > 0) {
          const dynamicRowKey = `_dynamicRows_${childId}`;
          transformed[dynamicRowKey] = buildDynamicRowEntry(
            childData.rows, childId, childName, childInfo, slim
          );
          // Override path for nested subforms
          transformed[dynamicRowKey].subformTitle = fullPath;
          transformed[dynamicRowKey].sectionTitle = fullPath;
        }

        if (childData.childSubforms) {
          processChildSubforms(childData.childSubforms, fullPath, transformed, slim);
        }
      });
    };

    const enrichLegacyData = (recordData: Record<string, any>): Record<string, any> => {
      const enriched: Record<string, any> = {};
      Object.entries(recordData).forEach(([key, entry]: [string, any]) => {
        const newEntry = typeof entry === "object" && entry !== null ? { ...entry } : { value: entry };

        if (key.startsWith("_dynamicRows_")) {
          const subformId = key.replace("_dynamicRows_", "");
          const sfInfo = subformLookup[subformId];
          if (sfInfo) {
            newEntry.label = sfInfo.name;
            newEntry.sectionTitle = sfInfo.sectionTitle;
            newEntry.subformTitle = sfInfo.name;
            newEntry.fieldDefinitions = sfInfo.fields.map((f: any) => ({
              id: f.id, label: f.label, type: f.type,
            }));
          }
        } else if (key.includes("__instance_")) {
          const [fieldId] = key.split("__");
          const info = fieldLookup[fieldId];
          if (info) {
            newEntry.label = info.label;
            newEntry.type = info.type;
            newEntry.sectionTitle = info.sectionTitle;
            if (info.subformId) {
              newEntry.subformId = info.subformId;
              newEntry.subformTitle = info.subformName;
            }
          }
        } else {
          const info = fieldLookup[key];
          if (info) {
            newEntry.label = info.label;
            newEntry.type = info.type;
            newEntry.sectionTitle = info.sectionTitle;
            if (info.subformId) {
              newEntry.subformId = info.subformId;
              newEntry.subformTitle = info.subformName;
            }
          }
        }

        enriched[key] = newEntry;
      });
      return enriched;
    };

    // ────────────────────────────────────────────────
    // 8. Process records — enrich data, DO NOT embed full form structure per record
    //
    // Inheritance redaction: if the caller is viewing a record they did
    // NOT create (and they're not an admin), strip any field that lives
    // in a section flagged `excludeFromInheritance`. The marker fields
    // `_inherited` / `_inheritedFromUserId` let the UI render an
    // "Inherited from {creator}" badge.
    // ────────────────────────────────────────────────
    const callerIsAdminBypass = inheritanceUserIdFilter === null;
    const hasExcludedFields = inheritanceExcludedFieldIds.size > 0;
    const processedRecords = records.map((record: any) => {
      const isInherited =
        !callerIsAdminBypass && record.userId && record.userId !== authUser.id;

      let transformedData = transformRecordData(record.recordData || {});

      if (isInherited && hasExcludedFields) {
        const filtered: Record<string, any> = {};
        for (const [key, value] of Object.entries(transformedData)) {
          // Strip top-level excluded field ids. Dynamic-row keys
          // (`_dynamicRows_<subformId>`) are subform-scoped and not
          // covered by FormSection.excludeFromInheritance, so they pass
          // through untouched.
          if (inheritanceExcludedFieldIds.has(key)) continue;
          filtered[key] = value;
        }
        transformedData = filtered;
      }

      return {
        id: record.id,
        formId: record.formId,
        recordData: transformedData,
        submittedBy: record.submittedBy,
        submittedAt: record.submittedAt,
        status: record.status,
        userId: record.userId,
        employee_id: record.employee_id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        // Inheritance markers — used by the UI to render a badge.
        _inherited: isInherited,
        _inheritedFromUserId: isInherited ? record.userId : null,
      };
    });

    // ────────────────────────────────────────────────
    // 9. Build formFieldsWithSections (field metadata for table columns)
    // ────────────────────────────────────────────────
    const formFieldsWithSections: any[] = [];

    form.sections.forEach((section: any) => {
      section.fields.forEach((field: any) => {
        formFieldsWithSections.push({
          id: field.id,
          originalId: field.id,
          label: field.label,
          type: field.type,
          order: field.order,
          sectionTitle: section.title || "Default Section",
          sectionId: section.id,
          formId: form.id,
          formName: form.name,
          placeholder: field.placeholder,
          description: field.description,
          validation: field.validation,
          options: field.options,
          lookup: field.lookup,
          styling: field.styling || null,
          properties: field.properties || null,
        });
      });
    });

    const addSubformFields = (subform: any, parentPath: string = "") => {
      const fullPath = parentPath ? `${parentPath} → ${subform.name}` : subform.name;

      subform.fields.forEach((field: any) => {
        formFieldsWithSections.push({
          id: field.id,
          originalId: field.id,
          label: field.label,
          type: field.type,
          order: field.order,
          sectionTitle: fullPath,
          sectionId: "subform",
          subformId: subform.id,
          subformTitle: subform.name,
          formId: form.id,
          formName: form.name,
          placeholder: field.placeholder,
          description: field.description,
          validation: field.validation,
          options: field.options,
          lookup: field.lookup,
          styling: field.styling || null,
          properties: field.properties || null,
        });
      });

      formFieldsWithSections.push({
        id: `_dynamicRows_${subform.id}`,
        originalId: `_dynamicRows_${subform.id}`,
        label: subform.name,
        type: "dynamicRows",
        order: 999,
        sectionTitle: fullPath,
        sectionId: "subform",
        subformId: subform.id,
        subformTitle: subform.name,
        formId: form.id,
        formName: form.name,
      });

      subform.childSubforms?.forEach((cs: any) => addSubformFields(cs, fullPath));
    };

    form.subforms?.forEach((sf: any) => addSubformFields(sf));

    // ────────────────────────────────────────────────
    // 10. Response — lean payload, no form structure duplication
    // ────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      total: totalCount,
      page,
      limit,
      totalPages,
      form: {
        id: form.id,
        name: form.name,
      },
      formFieldsWithSections,
      records: processedRecords,
    });
  } catch (error) {
    console.error("GET Records Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}
