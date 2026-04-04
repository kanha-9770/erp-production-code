import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/forms/[formId]/records
 * Fetches records for a form, optionally filtered by userId or organizationId
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  const { formId } = await params;
  const { searchParams } = new URL(request.url);

  const userId = searchParams.get("userId");
  const organizationId = searchParams.get("organizationId");

  if (!formId) {
    return NextResponse.json(
      { success: false, message: "formId is required" },
      { status: 400 },
    );
  }

  try {
    // ────────────────────────────────────────────────
    // 1. Fetch form structure (unchanged)
    // ────────────────────────────────────────────────
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
    // 2. Collect allowed fields & build lookups (unchanged)
    // ────────────────────────────────────────────────
    const allowedFieldIds = new Set<string>();
    const allowedSubformFields = new Map<string, Set<string>>();

    form.sections.forEach((section: any) => {
      section.fields.forEach((f: any) => allowedFieldIds.add(f.id));
    });

    const collectFromSubform = (subform: any) => {
      const fieldSet = new Set<string>(subform.fields.map((f: any) => f.id));
      allowedSubformFields.set(subform.id, fieldSet);
      subform.fields.forEach((f: any) => allowedFieldIds.add(f.id));
      subform.childSubforms?.forEach((cs: any) => collectFromSubform(cs));
    };

    form.subforms?.forEach((sf: any) => collectFromSubform(sf));

    const fieldLookup: Record<
      string,
      { label: string; sectionTitle: string; type: string; sectionId: string; subformId?: string; subformName?: string }
    > = {};
    const subformLookup: Record<
      string,
      { name: string; sectionTitle: string; fields: any[] }
    > = {};

    form.sections.forEach((section: any) => {
      const sectionTitle = section.title || "Default Section";
      section.fields.forEach((f: any) => {
        fieldLookup[f.id] = {
          label: f.label,
          sectionTitle,
          type: f.type,
          sectionId: section.id,
        };
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
    // 3. Prepare where clause for filtering
    // ────────────────────────────────────────────────
    const whereClause: any = { formId: form.id };

    if (userId) {
      whereClause.userId = userId;
    }

    if (organizationId) {
      whereClause.organizationId = organizationId;
    }

    // You can add more logic here, e.g.:
    // if (!userId && !organizationId) → show all (already default)
    // if (userId && organizationId) → AND condition (current behavior)

    // ────────────────────────────────────────────────
    // 4. Fetch filtered records
    // ────────────────────────────────────────────────
    let records: any[] = [];

    if (form.tableMapping) {
      const match = (form.tableMapping as any).storageTable?.match(/form_records_(\d+)/);
      if (match) {
        const modelName = `formRecord${match[1]}`;
        try {
          // @ts-ignore - dynamic model
          records = await prisma[modelName].findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
          });
        } catch (err) {
          console.error(`Failed to query model ${modelName}:`, err);
        }
      }
    }

    // ────────────────────────────────────────────────
    // 5. Transform records (your existing logic – unchanged)
    // ────────────────────────────────────────────────
    // ── Detect format: slim (fieldId→value) vs legacy (fieldId→{value,label,type,...}) ──
    const isSlimFormat = (recordData: any): boolean => {
      if (!recordData?.sections) return false;
      // In slim format, section fields are direct values, not objects with "value" key
      for (const section of Object.values(recordData.sections) as any[]) {
        if (!section.fields) continue;
        for (const fieldEntry of Object.values(section.fields)) {
          // If any field entry has a "fieldId" property, it's the old bloated format
          if (fieldEntry && typeof fieldEntry === "object" && "fieldId" in fieldEntry) {
            return false;
          }
          return true; // Check first field is enough
        }
      }
      return true; // Empty sections = treat as slim
    };

    const transformRecordData = (recordData: any): Record<string, any> => {
      if (!recordData) return {};

      const transformed: Record<string, any> = {};
      const hasStructuredFormat = recordData.sections || recordData.subforms;

      if (!hasStructuredFormat) {
        return enrichLegacyData(recordData);
      }

      const slim = isSlimFormat(recordData);

      // sections processing
      if (recordData.sections) {
        Object.entries(recordData.sections).forEach(([sectionId, sectionData]: [string, any]) => {
          if (sectionData.fields) {
            Object.entries(sectionData.fields).forEach(([fieldId, fieldEntry]: [string, any]) => {
              if (!allowedFieldIds.has(fieldId)) return;
              const info = fieldLookup[fieldId];

              if (slim) {
                // Slim format: fieldEntry IS the value directly
                transformed[fieldId] = {
                  fieldId,
                  label: info?.label || "Unknown Field",
                  type: info?.type || "text",
                  value: fieldEntry,
                  sectionId,
                  sectionTitle: info?.sectionTitle || "Default Section",
                };
              } else {
                // Legacy bloated format: fieldEntry is {fieldId, label, type, value, ...}
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
          }
        });
      }

      // subforms processing
      if (recordData.subforms) {
        Object.entries(recordData.subforms).forEach(([subformId, subformData]: [string, any]) => {
          const subformInfo = subformLookup[subformId];
          const subformName = subformData.subformName || subformInfo?.name || "Subform";

          if (subformData.fields) {
            Object.entries(subformData.fields).forEach(([fieldId, fieldEntry]: [string, any]) => {
              if (!allowedFieldIds.has(fieldId)) return;
              const info = fieldLookup[fieldId];

              if (slim) {
                transformed[fieldId] = {
                  fieldId,
                  label: info?.label || "Unknown Field",
                  type: info?.type || "text",
                  value: fieldEntry,
                  subformId,
                  subformName,
                  subformTitle: subformName,
                  sectionId: "subform",
                  sectionTitle: subformInfo?.sectionTitle || subformName,
                };
              } else {
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

          if (subformData.rows && Array.isArray(subformData.rows) && subformData.rows.length > 0) {
            const dynamicRowKey = `_dynamicRows_${subformId}`;
            const rowValues = subformData.rows.map((row: any) => {
              const rowData: Record<string, any> = {};
              if (row.fields) {
                Object.entries(row.fields).forEach(([fId, fEntry]: [string, any]) => {
                  // Slim: fEntry is the value; Legacy: fEntry is {value, ...}
                  rowData[fId] = slim ? fEntry : (fEntry as any).value;
                });
              }
              return rowData;
            });

            const fieldDefinitions = subformInfo?.fields?.map((f: any) => ({
              id: f.id,
              label: f.label,
              type: f.type,
            })) || [];

            transformed[dynamicRowKey] = {
              type: "dynamicRows",
              label: subformName,
              value: rowValues,
              subformId,
              subformName,
              subformTitle: subformName,
              sectionTitle: subformInfo?.sectionTitle || "Subforms",
              fieldDefinitions,
            };
          }

          if (subformData.childSubforms) {
            processChildSubforms(subformData.childSubforms, subformName, transformed, slim);
          }
        });
      }

      return transformed;
    };

    const processChildSubforms = (
      childSubforms: Record<string, any>,
      parentPath: string,
      transformed: Record<string, any>,
      slim: boolean
    ) => {
      Object.entries(childSubforms).forEach(([childSubformId, childSubformData]: [string, any]) => {
        const childSubformInfo = subformLookup[childSubformId];
        const childSubformName = childSubformData.subformName || childSubformInfo?.name || "Child Subform";
        const fullPath = `${parentPath} → ${childSubformName}`;

        if (childSubformData.fields) {
          Object.entries(childSubformData.fields).forEach(([fieldId, fieldEntry]: [string, any]) => {
            if (!allowedFieldIds.has(fieldId)) return;
            const info = fieldLookup[fieldId];

            if (slim) {
              transformed[fieldId] = {
                fieldId,
                label: info?.label || "Unknown Field",
                type: info?.type || "text",
                value: fieldEntry,
                subformId: childSubformId,
                subformName: childSubformName,
                subformTitle: fullPath,
                sectionId: "subform",
                sectionTitle: fullPath,
              };
            } else {
              transformed[fieldId] = {
                ...fieldEntry,
                fieldId,
                subformId: childSubformId,
                subformName: childSubformName,
                subformTitle: fullPath,
                sectionId: "subform",
                sectionTitle: fullPath,
                type: info?.type || fieldEntry.type,
                label: fieldEntry.label || info?.label || "Unknown Field",
              };
            }
          });
        }

        if (childSubformData.rows && Array.isArray(childSubformData.rows) && childSubformData.rows.length > 0) {
          const dynamicRowKey = `_dynamicRows_${childSubformId}`;
          const rowValues = childSubformData.rows.map((row: any) => {
            const rowData: Record<string, any> = {};
            if (row.fields) {
              Object.entries(row.fields).forEach(([fId, fEntry]: [string, any]) => {
                rowData[fId] = slim ? fEntry : (fEntry as any).value;
              });
            }
            return rowData;
          });

          const fieldDefinitions = childSubformInfo?.fields?.map((f: any) => ({
            id: f.id,
            label: f.label,
            type: f.type,
          })) || [];

          transformed[dynamicRowKey] = {
            type: "dynamicRows",
            label: childSubformName,
            value: rowValues,
            subformId: childSubformId,
            subformName: childSubformName,
            subformTitle: fullPath,
            sectionTitle: fullPath,
            fieldDefinitions,
          };
        }

        if (childSubformData.childSubforms) {
          processChildSubforms(childSubformData.childSubforms, fullPath, transformed, slim);
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
              id: f.id,
              label: f.label,
              type: f.type,
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

    const processedRecords = records.map((record: any) => {
      const recordData = record.recordData || {};
      const transformedData = transformRecordData(recordData);

      return {
        ...record,
        recordData: transformedData,
        form: {
          id: form.id,
          name: form.name,
          sections: form.sections,
          subforms: form.subforms,
        },
        formName: form.name,
      };
    });

    // ────────────────────────────────────────────────
    // 6. Build formFieldsWithSections (unchanged)
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
    // 7. Response
    // ────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      total: processedRecords.length,
      page: 1,
      limit: 500,
      totalPages: 1,
      filters: { userId: userId || null, organizationId: organizationId || null },
      form: {
        id: form.id,
        name: form.name,
        sections: form.sections,
        subforms: form.subforms,
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