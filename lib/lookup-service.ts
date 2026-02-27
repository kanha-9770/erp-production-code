import { prisma } from "@/lib/prisma"

interface LookupOptions {
  search?: string
  limit?: number
  offset?: number
}

interface LookupSourceData {
  id: string
  name: string
  description?: string | null
  type: string
  recordCount: number
  icon: string
  hasIdField?: boolean
  idFieldName?: string
}

const tableMappingCache = new Map<string, string>()

export class LookupService {
  // ──────────────────────────────────────────────────────────────
  // 1. getTableName — now with full visibility
  // ──────────────────────────────────────────────────────────────
  private async getTableName(formId: string): Promise<string | null> {
    console.log(`[getTableName] 🔍 Looking up mapping for formId = ${formId}`);

    if (tableMappingCache.has(formId)) {
      const cached = tableMappingCache.get(formId)!;
      console.log(`[getTableName] ✅ Cache HIT → table = ${cached}`);
      return cached;
    }

    const mapping = await prisma.formTableMapping.findUnique({
      where: { formId },
      select: { storageTable: true },
    });

    console.log(`[getTableName] DB query result → ${mapping ? mapping.storageTable : "NULL (no mapping)"}`);

    if (mapping) {
      tableMappingCache.set(formId, mapping.storageTable);
      console.log(`[getTableName] ✅ Cached new mapping: ${mapping.storageTable}`);
      return mapping.storageTable;
    }

    console.log(`[getTableName] ❌ NO MAPPING FOUND in formTableMapping table for this formId`);
    return null;
  }

  private getTableModel(tableName: string): any {
    const tableMap: Record<string, any> = {
      form_records_1: prisma.formRecord1,
      form_records_2: prisma.formRecord2,
      form_records_3: prisma.formRecord3,
      form_records_4: prisma.formRecord4,
      form_records_5: prisma.formRecord5,
      form_records_6: prisma.formRecord6,
      form_records_7: prisma.formRecord7,
      form_records_8: prisma.formRecord8,
      form_records_9: prisma.formRecord9,
      form_records_10: prisma.formRecord10,
      form_records_11: prisma.formRecord11,
      form_records_12: prisma.formRecord12,
      form_records_13: prisma.formRecord13,
      form_records_14: prisma.formRecord14,
      form_records_15: prisma.formRecord15,
    }
    return tableMap[tableName]
  }

  // ──────────────────────────────────────────────────────────────
  // 2. getFormRecords — heavy logging + safety
  // ──────────────────────────────────────────────────────────────
  private async getFormRecords(formId: string, options: { limit?: number; offset?: number } = {}): Promise<any[]> {
    const { limit = 50, offset = 0 } = options;

    console.log(`[getFormRecords] 🚀 Starting for formId=${formId} | limit=${limit} | offset=${offset}`);

    const tableName = await this.getTableName(formId);
    if (!tableName) {
      console.log(`[getFormRecords] ❌ ABORT: No table mapping → returning []`);
      return [];
    }

    const model = this.getTableModel(tableName);
    if (!model) {
      console.log(`[getFormRecords] ❌ ABORT: No Prisma model for table ${tableName}`);
      return [];
    }

    console.log(`[getFormRecords] Executing query on table ${tableName} where formId=${formId}`);

    const records = await model.findMany({
      where: { formId },
      orderBy: { createdAt: "desc" as const },
      take: limit,
      skip: offset,
      select: {
        id: true,
        recordData: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(`[getFormRecords] ✅ Query done → Found ${records.length} records`);

    if (records.length > 0) {
      console.log(`[getFormRecords] Sample record IDs: ${records.slice(0, 3).map(r => r.id).join(", ")}`);
      console.log(`[getFormRecords] Sample recordData structure:`, 
        Object.keys(records[0].recordData || {}));
    } else {
      console.log(`[getFormRecords] ⚠️ Zero records returned — either no data or wrong formId`);
    }

    return records;
  }

  private async countFormRecords(formId: string): Promise<number> {
    const tableName = await this.getTableName(formId)
    if (!tableName) return 0

    const model = this.getTableModel(tableName)
    if (!model) return 0

    return await model.count({ where: { formId } })
  }

  private transformRecord(record: any, form: any, module?: any): any {
    const recordData = record.recordData as any
    const transformedData: any = {
      record_id: record.id,
      form_id: form.id,
      _recordId: record.id,
      _formId: form.id,
      _formName: form.name,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }

    if (module) {
      transformedData._moduleId = module.id
      transformedData._moduleName = module.name
    }

    // Add top-level fields if they exist
    if (recordData.formId) {
      transformedData.formId = {
        field_id: "formId",
        field_value: recordData.formId,
        field_label: "formId",
        field_type: "text",
        field_section_id: null,
        field_options: null,
        field_validation: null,
      };
    }

    if (recordData.formName) {
      transformedData.formName = {
        field_id: "formName",
        field_value: recordData.formName,
        field_label: "formName",
        field_type: "text",
        field_section_id: null,
        field_options: null,
        field_validation: null,
      };
    }

    if (recordData.metadata) {
      transformedData.metadata = {
        field_id: "metadata",
        field_value: recordData.metadata,
        field_label: "metadata",
        field_type: "object", // or json
        field_section_id: null,
        field_options: null,
        field_validation: null,
      };
    }

    // Traverse sections and extract fields
    const sections = recordData.sections || {};
    for (const [sectionKey, section] of Object.entries(sections)) {
      const fields = (section as any).fields || {};
      for (const [fieldKey, fieldDataAny] of Object.entries(fields)) {
        const fieldData = fieldDataAny as any;
        const fieldType = fieldData?.type || "text";
        let fieldValue = fieldData?.value;

        // Type conversion
        if (fieldType === "number" && fieldValue != null) {
          const num = Number(fieldValue);
          fieldValue = isNaN(num) ? fieldValue : num;
        } else if ((fieldType === "datetime" || fieldType === "date") && fieldValue) {
          try {
            const date = new Date(fieldValue);
            fieldValue = fieldType === "date" ? date.toISOString().split("T")[0] : date.toISOString();
          } catch {
            // Keep original value
          }
        } else if (fieldType === "checkbox") {
          fieldValue = Boolean(fieldValue);
        } else if (["tel", "email", "url"].includes(fieldType)) {
          fieldValue = String(fieldValue);
        }

        // Parse options and validation only if they exist
        let parsedOptions = null;
        let parsedValidation = null;

        if (fieldData?.options != null) {
          try {
            parsedOptions = typeof fieldData.options === "string" ? JSON.parse(fieldData.options) : fieldData.options;
          } catch {
            parsedOptions = [];
          }
        }

        if (fieldData?.validation != null) {
          try {
            parsedValidation = typeof fieldData.validation === "string" ? JSON.parse(fieldData.validation) : fieldData.validation;
          } catch {
            parsedValidation = {};
          }
        }

        // Use label as key if available, else fieldId
        const key = fieldData?.label?.trim() || fieldKey;

        transformedData[key] = {
          field_id: fieldData?.fieldId || fieldKey,
          field_value: fieldValue,
          field_label: fieldData?.label || key,
          field_type: fieldType,
          field_section_id: fieldData?.sectionId || sectionKey,
          field_options: parsedOptions,
          field_validation: parsedValidation,
        };
      }
    }

    // Handle subforms similarly if present
    const subforms = recordData.subforms || {};
    for (const [subformKey, subform] of Object.entries(subforms)) {
      // Assuming subforms have similar structure to sections, adjust if needed
      const fields = (subform as any).fields || {};
      for (const [fieldKey, fieldDataAny] of Object.entries(fields)) {
        const fieldData = fieldDataAny as any;
        const fieldType = fieldData?.type || "text";
        let fieldValue = fieldData?.value;

        // Type conversion (same as above)
        if (fieldType === "number" && fieldValue != null) {
          const num = Number(fieldValue);
          fieldValue = isNaN(num) ? fieldValue : num;
        } else if ((fieldType === "datetime" || fieldType === "date") && fieldValue) {
          try {
            const date = new Date(fieldValue);
            fieldValue = fieldType === "date" ? date.toISOString().split("T")[0] : date.toISOString();
          } catch {
            // Keep original value
          }
        } else if (fieldType === "checkbox") {
          fieldValue = Boolean(fieldValue);
        } else if (["tel", "email", "url"].includes(fieldType)) {
          fieldValue = String(fieldValue);
        }

        // Parse options and validation
        let parsedOptions = null;
        let parsedValidation = null;

        if (fieldData?.options != null) {
          try {
            parsedOptions = typeof fieldData.options === "string" ? JSON.parse(fieldData.options) : fieldData.options;
          } catch {
            parsedOptions = [];
          }
        }

        if (fieldData?.validation != null) {
          try {
            parsedValidation = typeof fieldData.validation === "string" ? JSON.parse(fieldData.validation) : fieldData.validation;
          } catch {
            parsedValidation = {};
          }
        }

        const key = fieldData?.label?.trim() || fieldKey;

        transformedData[key] = {
          field_id: fieldData?.fieldId || fieldKey,
          field_value: fieldValue,
          field_label: fieldData?.label || key,
          field_type: fieldType,
          field_section_id: fieldData?.subformId || subformKey, // or subformId
          field_options: parsedOptions,
          field_validation: parsedValidation,
        };
      }
    }

    return transformedData;
  }

  private matchesSearch(transformedData: any, search: string): boolean {
    const searchLower = search.toLowerCase()
    return Object.values(transformedData).some((field: any) => {
      const value = field?.field_value
      return value != null && typeof value === "string" && value.toLowerCase().includes(searchLower)
    })
  }

  // ──────────────────────────────────────────────────────────────
  // 3. getData — full logging version
  // ──────────────────────────────────────────────────────────────
  async getData(sourceId: string, options: LookupOptions = {}): Promise<any[]> {
    const { search = "", limit = 50, offset = 0 } = options;

    try {
      console.log(`[getData] === START === sourceId=${sourceId} search="${search}" limit=${limit}`);

      const lookupSource = await prisma.lookupSource.findUnique({
        where: { id: sourceId },
        include: {
          sourceModule: true,
          sourceForm: { select: { id: true, name: true } },
        },
      });

      console.log(`[getData] lookupSource → found=${!!lookupSource} | type=${lookupSource?.type} | sourceFormId=${lookupSource?.sourceFormId} | sourceFormLoaded=${!!lookupSource?.sourceForm}`);

      if (!lookupSource) {
        console.log(`[getData] ❌ lookupSource not found`);
        return [];
      }

      // Static
      if (lookupSource.type === "static") {
        console.log(`[getData] Static source → processing ${lookupSource.staticData?.length || 0} items`);
        let data = (lookupSource.staticData || []) as any[];
        if (search) {
          data = data.filter(item =>
            (item.label || "").toLowerCase().includes(search.toLowerCase()) ||
            (item.value || "").toLowerCase().includes(search.toLowerCase())
          );
        }
        const paginated = data.slice(offset, offset + limit);
        console.log(`[getData] Static → returning ${paginated.length} items`);
        return paginated.map(item => ({
          id: item.id,
          label: item.label || item.value,
          value: item.value || item.code,
        }));
      }

      // Form
      if (lookupSource.type === "form" && lookupSource.sourceFormId) {
        const form = lookupSource.sourceForm;
        console.log(`[getData] Form path → form.id=${form?.id} form.name=${form?.name}`);

        if (!form) {
          console.log(`[getData] ❌ sourceForm relation is null — check DB relation`);
          return [];
        }

        const records = await this.getFormRecords(form.id, { limit: limit * 2, offset });
        console.log(`[getData] Raw records from DB: ${records.length}`);

        const transformedRecords = records
          .map((record) => this.transformRecord(record, form))
          .filter((record) => !search || this.matchesSearch(record, search))
          .slice(0, limit);

        console.log(`[getData] After transform + filter → ${transformedRecords.length} records`);
        return transformedRecords;
      }

      // Module
      if (lookupSource.type === "module" && lookupSource.sourceModuleId) {
        console.log(`[getData] Module path → moduleId=${lookupSource.sourceModuleId}`);

        const module = await prisma.formModule.findUnique({
          where: { id: lookupSource.sourceModuleId },
          include: { forms: { select: { id: true, name: true } } },
        });

        if (!module || module.forms.length === 0) {
          console.log(`[getData] ❌ Module has no forms`);
          return [];
        }

        const limitPerForm = Math.ceil((limit * 2) / module.forms.length);

        const allRecordsPromises = module.forms.map((form) =>
          this.getFormRecords(form.id, { limit: limitPerForm }).then((records) => ({ form, records }))
        );

        const allRecordsResults = await Promise.all(allRecordsPromises);
        const transformedRecords: any[] = [];

        for (const { form, records } of allRecordsResults) {
          for (const record of records) {
            const transformed = this.transformRecord(record, form, module);
            if (!search || this.matchesSearch(transformed, search)) {
              transformedRecords.push(transformed);
            }
          }
        }

        const final = transformedRecords.slice(0, limit);
        console.log(`[getData] Module → returning ${final.length} records`);
        return final;
      }

      console.log(`[getData] Unknown source type → returning []`);
      return [];
    } catch (error: any) {
      console.error("[getData] CRITICAL ERROR:", error.message, error.stack);
      throw error;
    }
  }

   async getFields(
    sourceId: string,
    sectionId: string = "all"
  ): Promise<string[] | { fields: string[]; staticData: any[] }> {
    try {
      console.log(`[getFields] === START === sourceId=${sourceId}, sectionId=${sectionId}`);

      const lookupSource = await prisma.lookupSource.findUnique({
        where: { id: sourceId },
        include: {
          sourceForm: {
            include: {
              sections: {
                include: { fields: { select: { id: true, label: true, type: true } } },
                ...(sectionId !== "all" ? { where: { id: sectionId } } : {}),
              },
            },
          },
          sourceModule: {
            include: {
              forms: {
                include: {
                  sections: {
                    include: { fields: { select: { id: true, label: true, type: true } } },
                    ...(sectionId !== "all" ? { where: { id: sectionId } } : {}),
                  },
                },
              },
            },
          },
        },
      });

      if (!lookupSource) {
        console.log(`[getFields] ❌ lookupSource not found for id=${sourceId}`);
        return [];
      }

      console.log(`[getFields] Found source → Type: ${lookupSource.type} | Has Form: ${!!lookupSource.sourceForm} | Has Module: ${!!lookupSource.sourceModule}`);

      // Static source
      if (lookupSource.type === "static") {
        console.log(`[getFields] Static source → ${lookupSource.staticData?.length || 0} items`);
        return {
          fields: [lookupSource.name || "value"],
          staticData: lookupSource.staticData || [],
        };
      }

      const fieldLabels = new Set<string>();

      // 1. Primary: From form definition
      let fromDefinition = 0;

      if (lookupSource.type === "form" && lookupSource.sourceForm) {
        for (const section of lookupSource.sourceForm.sections) {
          for (const field of section.fields) {
            const label = field.label?.trim();
            if (label) {
              fieldLabels.add(label);
              fromDefinition++;
            }
          }
        }
      } else if (lookupSource.type === "module" && lookupSource.sourceModule) {
        for (const form of lookupSource.sourceModule.forms) {
          for (const section of form.sections) {
            for (const field of section.fields) {
              const label = field.label?.trim();
              if (label) {
                fieldLabels.add(label);
                fromDefinition++;
              }
            }
          }
        }
      }

      console.log(`[getFields] From form definition → ${fromDefinition} fields`);

      const finalFields = Array.from(fieldLabels).sort((a, b) => a.localeCompare(b));

      console.log(`[getFields] FINAL RESULT → ${finalFields.length} fields`);
      console.log(`[getFields] Fields:`, finalFields.slice(0, 20));

      return finalFields;

    } catch (error: any) {
      console.error("[getFields] CRITICAL ERROR:", error.message, error.stack);
      return [];
    }
  }
  static async getLookupSources(userId: string, options: { quick?: boolean } = {}): Promise<LookupSourceData[]> {
    const { quick = false } = options

    try {
      const [user, roles] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { organizationId: true },
        }),
        prisma.$queryRaw<{ role_name: string }[]>`
          SELECT r.name AS role_name
          FROM user_unit_assignments uua
          JOIN roles r ON r.id = uua.role_id
          WHERE uua.user_id = ${userId}
        `,
      ])

      if (!user?.organizationId) {
        return []
      }

      const organizationId = user.organizationId
      const isAdmin = roles.some((r) => r.role_name === "ADMIN")

      let modules: any[] = []
      let forms: any[] = []

      if (isAdmin) {
        // ADMIN gets all active modules and published forms for their organization
        [modules, forms] = await Promise.all([
          prisma.$queryRaw`
            SELECT 
              fm.id AS module_id,
              fm.name AS module_name,
              fm.description,
              fm.icon,
              fm.color,
              fm.path,
              fm.parent_id,
              fm.level,
              fm.sort_order,
              fm.module_type
            FROM form_modules fm
            WHERE fm.is_active = TRUE
            AND fm.organization_id = ${organizationId}
            ORDER BY fm.level ASC, fm.sort_order ASC
          `,
          prisma.$queryRaw`
            SELECT 
              f.id AS form_id,
              f.name AS form_name,
              f.description
            FROM forms f
            JOIN form_modules fm ON f.module_id = fm.id
            WHERE f.is_published = TRUE
            AND fm.organization_id = ${organizationId}
            ORDER BY f.name ASC
          `,
        ]) as [any[], any[]]
      } else {
        // Non-admin: role-based and user-based for modules (with hierarchy)
        const [roleBasedModules, userBasedModules] = await Promise.all([
          prisma.$queryRaw`
            SELECT DISTINCT 
              fm.id AS module_id,
              fm.name AS module_name,
              fm.description,
              fm.icon,
              fm.color,
              fm.path,
              fm.parent_id,
              fm.level,
              fm.sort_order,
              fm.module_type
            FROM users u
            JOIN user_unit_assignments uua ON uua.user_id = u.id
            JOIN roles r ON r.id = uua.role_id
            JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = TRUE
            JOIN form_modules fm ON fm.id = rp.module_id AND fm.is_active = TRUE
            WHERE u.id = ${userId}
            AND fm.organization_id = ${organizationId}
          `,
          prisma.$queryRaw`
            SELECT DISTINCT 
              fm.id AS module_id,
              fm.name AS module_name,
              fm.description,
              fm.icon,
              fm.color,
              fm.path,
              fm.parent_id,
              fm.level,
              fm.sort_order,
              fm.module_type
            FROM users u
            JOIN user_permissions up ON up.user_id = u.id AND up.granted = TRUE
            JOIN form_modules fm ON fm.id = up.module_id AND fm.is_active = TRUE
            WHERE u.id = ${userId}
            AND fm.organization_id = ${organizationId}
          `,
        ])

        let finalModules: any[] = []
        const allModules = [...(roleBasedModules as any[]), ...(userBasedModules as any[])]
        const uniqueModulesMap = new Map(allModules.map((m) => [m.module_id, m]))
        const uniqueModules = Array.from(uniqueModulesMap.values())

        const childModuleIds = uniqueModules.map((m) => m.module_id)

        if (childModuleIds.length > 0) {
          const parentModules = await prisma.$queryRaw`
            WITH RECURSIVE parent_hierarchy AS (
              SELECT DISTINCT 
                fm.id AS module_id,
                fm.name AS module_name,
                fm.description,
                fm.icon,
                fm.color,
                fm.path,
                fm.parent_id,
                fm.level,
                fm.sort_order,
                fm.module_type
              FROM form_modules fm
              WHERE fm.id IN (
                SELECT DISTINCT parent_id 
                FROM form_modules 
                WHERE id = ANY(${childModuleIds}::text[]) 
                AND parent_id IS NOT NULL
                AND organization_id = ${organizationId}
              )
              AND fm.is_active = TRUE
              AND fm.organization_id = ${organizationId}
              
              UNION
              SELECT DISTINCT
                fm.id AS module_id,
                fm.name AS module_name,
                fm.description,
                fm.icon,
                fm.color,
                fm.path,
                fm.parent_id,
                fm.level,
                fm.sort_order,
                fm.module_type
              FROM form_modules fm
              INNER JOIN parent_hierarchy ph ON fm.id = ph.parent_id
              WHERE fm.is_active = TRUE
              AND fm.organization_id = ${organizationId}
            )
            SELECT * FROM parent_hierarchy
          `

          const mergedModules = [...uniqueModules, ...(parentModules as any[])]
          const finalModulesMap = new Map(mergedModules.map((m) => [m.module_id, m]))
          finalModules = Array.from(finalModulesMap.values())
        } else {
          finalModules = uniqueModules
        }

        finalModules.sort((a: any, b: any) => a.level - b.level || a.sort_order - b.sort_order)
        modules = finalModules

        // Non-admin: role-based and user-based for forms (no hierarchy)
        const [roleBasedForms, userBasedForms] = await Promise.all([
          prisma.$queryRaw`
            SELECT DISTINCT 
              f.id AS form_id,
              f.name AS form_name,
              f.description
            FROM users u
            JOIN user_unit_assignments uua ON uua.user_id = u.id
            JOIN roles r ON r.id = uua.role_id
            JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = TRUE
            JOIN forms f ON f.id = rp.form_id AND f.is_published = TRUE
            JOIN form_modules fm ON f.module_id = fm.id
            WHERE u.id = ${userId}
            AND fm.organization_id = ${organizationId}
          `,
          prisma.$queryRaw`
            SELECT DISTINCT 
              f.id AS form_id,
              f.name AS form_name,
              f.description
            FROM users u
            JOIN user_permissions up ON up.user_id = u.id AND up.granted = TRUE
            JOIN forms f ON f.id = up.form_id AND f.is_published = TRUE
            JOIN form_modules fm ON f.module_id = fm.id
            WHERE u.id = ${userId}
            AND fm.organization_id = ${organizationId}
          `,
        ])

        const allForms = [...(roleBasedForms as any[]), ...(userBasedForms as any[])]
        const uniqueFormsMap = new Map(allForms.map((f) => [f.form_id, f]))
        forms = Array.from(uniqueFormsMap.values())
        forms.sort((a: any, b: any) => a.form_name.localeCompare(b.form_name))
      }

      const permittedFormIds = forms.map((f: any) => f.form_id)
      const permittedModuleIds = modules.map((m: any) => m.module_id)

      // Fetch static sources based on permissions
      const staticSourcesDB = await prisma.lookupSource.findMany({
        where: {
          type: "static",
          active: true,
          OR: [
            { sourceFormId: { in: permittedFormIds } },
            { sourceModuleId: { in: permittedModuleIds } }
          ]
        },
        select: {
          id: true,
          name: true,
          description: true,
          staticData: true
        }
      })

      const staticSources: LookupSourceData[] = staticSourcesDB.map((ls) => ({
        id: ls.id,
        name: ls.name,
        description: ls.description || "",
        type: "static",
        recordCount: ls.staticData?.length || 0,
        icon: "zap",
        hasIdField: false
      }))

      // Prepare source IDs for counting
      const moduleSourceIds = modules.map((m: any) => `module_${m.module_id}`)
      const formSourceIds = forms.map((f: any) => `form_${f.form_id}`)
      const staticSourceIds = staticSources.map((s) => s.id)

      let moduleCounts: (number | undefined)[] = []
      let formCounts: (number | undefined)[] = []
      let staticCounts: (number | undefined)[] = []

      if (!quick) {
        const serviceInstance = new LookupService()
        const countPromises = [
          ...moduleSourceIds.map((id) => serviceInstance.countFormRecordsForSource(id)),
          ...formSourceIds.map((id) => serviceInstance.countFormRecordsForSource(id)),
          ...staticSourceIds.map((id) => serviceInstance.countFormRecordsForSource(id)),
        ]
        const allCounts = await Promise.all(countPromises)
        moduleCounts = allCounts.slice(0, moduleSourceIds.length)
        formCounts = allCounts.slice(moduleSourceIds.length, moduleSourceIds.length + formSourceIds.length)
        staticCounts = allCounts.slice(moduleSourceIds.length + formSourceIds.length)
      } else {
        moduleCounts = moduleSourceIds.map(() => undefined)
        formCounts = formSourceIds.map(() => undefined)
        staticCounts = staticSourceIds.map(() => undefined)
      }

      // Map to LookupSource format
      const moduleSources = modules.map((m: any, i: number) => ({
        id: `module_${m.module_id}`,
        name: m.module_name,
        description: m.description || "",
        type: "module",
        recordCount: moduleCounts[i] ?? 0,
        icon: "database",
        hasIdField: true,
        idFieldName: "_recordId"
      }))

      const formSources = forms.map((f: any, i: number) => ({
        id: `form_${f.form_id}`,
        name: f.form_name,
        description: f.description || "",
        type: "form",
        recordCount: formCounts[i] ?? 0,
        icon: "file-text",
        hasIdField: true,
        idFieldName: "_recordId"
      }))

      // Override recordCount for static if not quick
      const finalStaticSources = staticSources.map((s, i: number) => ({
        ...s,
        recordCount: staticCounts[i] ?? s.recordCount
      }))

      const sources = [...formSources, ...moduleSources, ...finalStaticSources]

      // Upsert permitted sources (only for form/module)
      Promise.all(
        [...formSources, ...moduleSources].map((source) =>
          prisma.lookupSource.upsert({
            where: { id: source.id },
            update: {
              name: source.name,
              type: source.type,
              description: source.description,
              active: true,
              updatedAt: new Date(),
            },
            create: {
              id: source.id,
              name: source.name,
              type: source.type,
              sourceModuleId: source.type === "module" ? source.id.replace("module_", "") : undefined,
              sourceFormId: source.type === "form" ? source.id.replace("form_", "") : undefined,
              description: source.description,
              active: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }),
        ),
      ).catch((error) => console.error("Background upsert error:", error))

      return sources
    } catch (error) {
      console.error("Error fetching lookup sources:", error)
      return []
    }
  }

  private async countFormRecordsForSource(sourceId: string): Promise<number> {
    const lookupSource = await prisma.lookupSource.findUnique({
      where: { id: sourceId },
      select: { type: true, staticData: true }
    })

    if (lookupSource?.type === "static") {
      return lookupSource.staticData?.length || 0
    }

    if (sourceId.startsWith("form_")) {
      const formId = sourceId.replace("form_", "")
      return await this.countFormRecords(formId)
    }

    if (sourceId.startsWith("module_")) {
      const moduleId = sourceId.replace("module_", "")
      try {
        const module = await prisma.formModule.findUnique({
          where: { id: moduleId },
          select: { organizationId: true }
        })

        if (!module?.organizationId) return 0

        // Get descendant module IDs including self
        const descendantResult = await prisma.$queryRaw<{ id: string }[]>` 
          WITH RECURSIVE module_hierarchy AS (
            SELECT id FROM "form_modules" WHERE id = ${moduleId}
            UNION ALL
            SELECT fm.id FROM "form_modules" fm
            INNER JOIN module_hierarchy mh ON fm.parent_id = mh.id
            WHERE fm.organization_id = ${module.organizationId} AND fm."is_active" = true
          )
          SELECT id FROM module_hierarchy
        `

        const descendantModuleIds: string[] = descendantResult.map((r) => r.id)

        // Get published forms in those modules
        const forms = await prisma.form.findMany({
          where: {
            moduleId: { in: descendantModuleIds },
            isPublished: true
          },
          select: { id: true }
        })

        const formIds = forms.map((f) => f.id)

        if (formIds.length === 0) return 0

        // Get counts for each form
        const counts = await Promise.all(formIds.map(id => this.countFormRecords(id)))

        return counts.reduce((sum, count) => sum + count, 0)
      } catch (error) {
        console.error(`Error counting records for module ${moduleId}:`, error)
        return 0
      }
    }

    return 0
  }
}